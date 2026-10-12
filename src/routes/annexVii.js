import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { annexViiSchema, validateDraft } from '#/schemas/annex-vii.js'
import {
  claimForSubmission,
  contentOf,
  createAnnexVii,
  DRAFT,
  getAnnexVii,
  recordDiwassResult,
  replaceDraft
} from '#/services/AnnexViiCreate.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'
import { submitAnnexViiToDiwass } from '#/services/DiwassAnnexViiClient.js'

const submissionIdParams = Joi.object({
  submissionId: Joi.string().guid().required()
})

async function invalidWasteCodesError(db, wasteIdentification) {
  const invalidCodes = await findInvalidWasteCodes(db, wasteIdentification)
  if (invalidCodes.length === 0) {
    return null
  }
  const details = invalidCodes
    .map(({ field, value }) => `${field}: "${value}"`)
    .join(', ')
  return Boom.badRequest(`Invalid waste classification code(s): ${details}`)
}

// A draft may be incomplete, but what is filled in must be valid.
async function draftProblems(request) {
  const problems = validateDraft(request.payload)
  if (problems) {
    return Boom.badRequest(problems)
  }
  return request.payload.wasteIdentification
    ? invalidWasteCodesError(request.db, request.payload.wasteIdentification)
    : null
}

function duplicateDocumentNo(error, annexVIIDocumentNo) {
  return error.code === 11000
    ? Boom.conflict(`Annex VII document ${annexVIIDocumentNo} already exists`)
    : null
}

/*
[Send to DIWASS]
The UK-side record is the source of truth for this API - the DIWASS
submission is a downstream call, built as a real SOAP payload against the
emulator (or real DIWASS, once DIWASS_BASE_URL points there). A failure here
doesn't undo the local write; it's stored on the record and surfaced on the
response for the caller to see and retry.
*/
async function sendToDiwass(request, submissionId, annexVii) {
  const submittedAt = new Date()
  let diwass
  try {
    // server.info.uri reflects the configured bind address (0.0.0.0 by
    // default), which isn't a connectable destination - loop back to
    // this same process over localhost instead.
    diwass = await submitAnnexViiToDiwass(annexVii, {
      fallbackBaseUrl: `http://127.0.0.1:${request.server.info.port}`
    })
  } catch (error) {
    request.log(['error', 'diwass'], error)
    diwass = { status: 'ERROR', error: error.message }
  }

  // Stored on the record, so a NOTOK or ERROR can be seen and retried later.
  await recordDiwassResult(request.db, submissionId, {
    ...diwass,
    submittedAt,
    respondedAt: new Date()
  })
  return diwass
}

export const annexVii = [
  {
    // Create and send to DIWASS in one step.
    method: 'POST',
    path: '/annexvii',
    options: {
      validate: {
        payload: annexViiSchema
      }
    },
    handler: async (request, h) => {
      const codesError = await invalidWasteCodesError(
        request.db,
        request.payload.wasteIdentification
      )
      if (codesError) {
        return codesError
      }

      let created
      try {
        created = await createAnnexVii(request.db, request.payload, {
          submissionId: randomUUID(),
          receivedAt: new Date()
        })
      } catch (error) {
        const conflict = duplicateDocumentNo(
          error,
          request.payload.annexVIIDocumentNo
        )
        if (conflict) {
          return conflict
        }
        throw error
      }

      const diwass = await sendToDiwass(
        request,
        created.submissionId,
        request.payload
      )
      return h.response({ ...created, diwass }).code(201)
    }
  },
  {
    /*
    Save a draft. DIWASS's API cannot hold one (its drafts exist only in the
    web UI), so it stays here, unsent, until the shipment starts moving and
    the operator submits it.
    */
    method: 'POST',
    path: '/annexvii/drafts',
    options: {
      validate: {
        payload: Joi.object().required()
      }
    },
    handler: async (request, h) => {
      const problems = await draftProblems(request)
      if (problems) {
        return problems
      }

      try {
        const created = await createAnnexVii(request.db, request.payload, {
          submissionId: randomUUID(),
          receivedAt: new Date(),
          status: DRAFT
        })
        return h.response(created).code(201)
      } catch (error) {
        const conflict = duplicateDocumentNo(
          error,
          request.payload.annexVIIDocumentNo
        )
        if (conflict) {
          return conflict
        }
        throw error
      }
    }
  },
  {
    method: 'GET',
    path: '/annexvii/{submissionId}',
    options: {
      validate: { params: submissionIdParams }
    },
    handler: async (request) => {
      const record = await getAnnexVii(request.db, request.params.submissionId)
      return record ?? Boom.notFound('Annex VII not found')
    }
  },
  {
    // Replace a draft, or a submission DIWASS refused, before sending it.
    method: 'PUT',
    path: '/annexvii/{submissionId}',
    options: {
      validate: {
        params: submissionIdParams,
        payload: Joi.object().required()
      }
    },
    handler: async (request) => {
      const { submissionId } = request.params
      const problems = await draftProblems(request)
      if (problems) {
        return problems
      }

      let updated
      try {
        updated = await replaceDraft(request.db, submissionId, request.payload)
      } catch (error) {
        const conflict = duplicateDocumentNo(
          error,
          request.payload.annexVIIDocumentNo
        )
        if (conflict) {
          return conflict
        }
        throw error
      }
      if (updated) {
        return updated
      }
      return (await getAnnexVii(request.db, submissionId))
        ? Boom.conflict(
            'Annex VII has been submitted to DIWASS and can no longer be edited here'
          )
        : Boom.notFound('Annex VII not found')
    }
  },
  {
    /*
    The shipment has started moving: run the full checks on the draft and
    send it to DIWASS. Also resends a submission DIWASS refused (NOTOK) or
    never received (ERROR).
    */
    method: 'POST',
    path: '/annexvii/{submissionId}/submit',
    options: {
      validate: { params: submissionIdParams }
    },
    handler: async (request, h) => {
      const { submissionId } = request.params
      const record = await getAnnexVii(request.db, submissionId)
      if (!record) {
        return Boom.notFound('Annex VII not found')
      }

      const { value: annexVii, error } = annexViiSchema.validate(
        contentOf(record),
        { abortEarly: false }
      )
      if (error) {
        return Boom.badRequest(
          `Annex VII is not ready to submit: ${error.details.map((detail) => detail.message).join('; ')}`
        )
      }
      const codesError = await invalidWasteCodesError(
        request.db,
        annexVii.wasteIdentification
      )
      if (codesError) {
        return codesError
      }

      const claimed = await claimForSubmission(
        request.db,
        submissionId,
        annexVii
      )
      if (!claimed) {
        return Boom.conflict('Annex VII has already been submitted to DIWASS')
      }

      const diwass = await sendToDiwass(request, submissionId, annexVii)
      return h.response({ ...claimed, diwass }).code(200)
    }
  }
]
