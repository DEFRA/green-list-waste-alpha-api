import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { annexViiSchema, validateDraft } from '#/schemas/annex-vii.js'
import {
  CANCELLED,
  DRAFT,
  cancelLocally,
  claimForAnnouncement,
  contentOf,
  createAnnexVii,
  finishCancellation,
  finishUpdate,
  getAnnexVii,
  isInDiwass,
  lockAnnounced,
  recordDiwassResult,
  replaceDraft
} from '#/services/AnnexViiCreate.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'
import {
  cancelAnnexViiInDiwass,
  submitAnnexViiToDiwass,
  updateAnnexViiInDiwass
} from '#/services/DiwassAnnexViiClient.js'

const submissionIdParams = Joi.object({
  submissionId: Joi.string().guid().required()
})

const cancelPayload = Joi.object({
  reason: Joi.string(),
  cancelledBy: Joi.object({
    name: Joi.string().required(),
    roleInOrganisation: Joi.string().required(),
    email: Joi.string().email()
  })
})
  .allow(null)
  .default({})

const NOT_FOUND = 'Annex VII not found'

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

// Anything sent to DIWASS must pass the full schema and the waste code lists.
async function completeAnnexVii(request, content, notReadyPrefix) {
  const { value, error } = annexViiSchema.validate(content, {
    abortEarly: false
  })
  if (error) {
    return {
      problem: Boom.badRequest(
        `${notReadyPrefix}: ${error.details.map((detail) => detail.message).join('; ')}`
      )
    }
  }
  const codesError = await invalidWasteCodesError(
    request.db,
    value.wasteIdentification
  )
  return codesError ? { problem: codesError } : { annexVii: value }
}

function duplicateDocumentNo(error, annexVIIDocumentNo) {
  return error.code === 11000
    ? Boom.conflict(`Annex VII document ${annexVIIDocumentNo} already exists`)
    : null
}

// server.info.uri reflects the bind address (0.0.0.0 by default), which
// isn't a connectable destination - loop back over localhost instead.
function diwassOptions(request) {
  return { fallbackBaseUrl: `http://127.0.0.1:${request.server.info.port}` }
}

/*
[Call DIWASS]
The UK-side record is the source of truth for this API. A DIWASS call that
fails outright is kept as an ERROR outcome rather than thrown, with the
time it was sent and answered, so it can be seen and retried.
*/
async function callDiwass(request, call) {
  const submittedAt = new Date()
  let outcome
  try {
    outcome = await call(diwassOptions(request))
  } catch (error) {
    request.log(['error', 'diwass'], error)
    outcome = { status: 'ERROR', error: error.message }
  }
  return { ...outcome, submittedAt, respondedAt: new Date() }
}

async function announce(request, submissionId, annexVii) {
  const diwass = await callDiwass(request, (options) =>
    submitAnnexViiToDiwass(annexVii, options)
  )
  await recordDiwassResult(request.db, submissionId, diwass)
  return diwass
}

/*
[Refused or unreachable]
An update or cancel DIWASS refused is 422 with DIWASS's own codes; one that
never reached DIWASS is 502. Either way the record keeps the version DIWASS
holds, and the attempt is stored on it.
*/
function diwassFailure(h, action, outcome, record) {
  const refused = outcome.status === 'NOTOK'
  return h
    .response({
      statusCode: refused ? 422 : 502,
      error: refused ? 'Unprocessable Entity' : 'Bad Gateway',
      message: refused
        ? `DIWASS refused the ${action}`
        : `The ${action} did not reach DIWASS: ${outcome.error}`,
      diwass: outcome,
      record
    })
    .code(refused ? 422 : 502)
}

// Why a record cannot change, for a 404 or 409.
async function notChangeable(request, submissionId) {
  const record = await getAnnexVii(request.db, submissionId)
  if (!record) {
    return Boom.notFound(NOT_FOUND)
  }
  if (record.status === CANCELLED) {
    return Boom.conflict('Annex VII has been cancelled')
  }
  return Boom.conflict(
    'Annex VII is being changed in DIWASS by another request; try again'
  )
}

export const annexVii = [
  {
    // Create and announce in DIWASS in one step.
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

      const diwass = await announce(
        request,
        created.submissionId,
        request.payload
      )
      return h.response({ ...created, diwass }).code(201)
    }
  },
  {
    /*
    Save a draft, held in DWT only. Optional: an operator can announce as
    soon as the export is planned and update it once the load is known.
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
      return record ?? Boom.notFound(NOT_FOUND)
    }
  },
  {
    /*
    Replace an Annex VII. Not yet in DIWASS (a draft, or an announcement
    that did not go through): saved here as a DRAFT. Announced: the whole
    document is sent to DIWASS as an update, and stored only if DIWASS
    accepts it.
    */
    method: 'PUT',
    path: '/annexvii/{submissionId}',
    options: {
      validate: {
        params: submissionIdParams,
        payload: Joi.object().required()
      }
    },
    handler: async (request, h) => {
      const { submissionId } = request.params
      const existing = await getAnnexVii(request.db, submissionId)
      if (!existing) {
        return Boom.notFound(NOT_FOUND)
      }

      if (isInDiwass(existing)) {
        const { annexVii, problem } = await completeAnnexVii(
          request,
          request.payload,
          'An announced Annex VII must stay complete'
        )
        if (problem) {
          return problem
        }
        const locked = await lockAnnounced(request.db, submissionId)
        if (!locked) {
          return notChangeable(request, submissionId)
        }
        const outcome = await callDiwass(request, (options) =>
          updateAnnexViiInDiwass(
            annexVii,
            locked.diwass.annexViiDocumentNo,
            options
          )
        )
        const record = await finishUpdate(request.db, submissionId, {
          previous: locked,
          annexVii,
          outcome
        })
        return outcome.status === 'OK'
          ? record
          : diwassFailure(h, 'update', outcome, record)
      }

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
      return updated ?? notChangeable(request, submissionId)
    }
  },
  {
    /*
    Announce a draft in DIWASS: full checks, then create. Also resends an
    announcement DIWASS refused (NOTOK) or never received (ERROR).
    */
    method: 'POST',
    path: '/annexvii/{submissionId}/announce',
    options: {
      validate: { params: submissionIdParams }
    },
    handler: async (request) => {
      const { submissionId } = request.params
      const record = await getAnnexVii(request.db, submissionId)
      if (!record) {
        return Boom.notFound(NOT_FOUND)
      }

      const { annexVii, problem } = await completeAnnexVii(
        request,
        contentOf(record),
        'Annex VII is not ready to announce'
      )
      if (problem) {
        return problem
      }

      const claimed = await claimForAnnouncement(
        request.db,
        submissionId,
        annexVii
      )
      if (!claimed) {
        return record.status === CANCELLED
          ? Boom.conflict('Annex VII has been cancelled')
          : Boom.conflict(
              'Annex VII is already announced in DIWASS; send changes with PUT'
            )
      }

      const diwass = await announce(request, submissionId, annexVii)
      return { ...claimed, diwass }
    }
  },
  {
    /*
    The export will not happen. Announced: withdrawn in DIWASS with the
    Annex7Cancelled signal, signed by cancelledBy or, if not given, by the
    arranger's declared signatory. Not yet in DIWASS: cancelled here only.
    */
    method: 'POST',
    path: '/annexvii/{submissionId}/cancel',
    options: {
      validate: {
        params: submissionIdParams,
        payload: cancelPayload
      }
    },
    handler: async (request, h) => {
      const { submissionId } = request.params
      const { reason, cancelledBy } = request.payload ?? {}
      const existing = await getAnnexVii(request.db, submissionId)
      if (!existing) {
        return Boom.notFound(NOT_FOUND)
      }

      if (!isInDiwass(existing)) {
        return (
          (await cancelLocally(request.db, submissionId)) ??
          notChangeable(request, submissionId)
        )
      }

      const locked = await lockAnnounced(request.db, submissionId)
      if (!locked) {
        return notChangeable(request, submissionId)
      }
      const signatory =
        locked.declarationOfShipmentArranger?.authenticatedBy ?? {}
      const signer = cancelledBy ?? {
        name: signatory.name,
        roleInOrganisation: signatory.roleInOrganisation,
        email: signatory.email
      }
      const outcome = await callDiwass(request, (options) =>
        cancelAnnexViiInDiwass(
          {
            annexVIIDocumentNo: locked.diwass.annexViiDocumentNo,
            operatorAccessId: locked.shipmentArranger.operatorId,
            reason,
            signature: signer.name && {
              name: signer.name,
              organizationRole: signer.roleInOrganisation,
              timestamp: new Date(),
              emailURI: signer.email
            }
          },
          options
        )
      )
      const record = await finishCancellation(request.db, submissionId, outcome)
      return outcome.status === 'OK'
        ? record
        : diwassFailure(h, 'cancellation', outcome, record)
    }
  }
]
