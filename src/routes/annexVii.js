import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { annexViiSchema } from '#/schemas/annex-vii.js'
import {
  createAnnexVii,
  recordDiwassResult
} from '#/services/AnnexViiCreate.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'
import { submitAnnexViiToDiwass } from '#/services/DiwassAnnexViiClient.js'

export const annexVii = [
  {
    method: 'POST',
    path: '/annexvii',
    options: {
      validate: {
        payload: annexViiSchema
      }
    },
    handler: async (request, h) => {
      const invalidCodes = await findInvalidWasteCodes(
        request.db,
        request.payload.wasteIdentification
      )

      if (invalidCodes.length > 0) {
        const details = invalidCodes
          .map(({ field, value }) => `${field}: "${value}"`)
          .join(', ')
        return Boom.badRequest(
          `Invalid waste classification code(s): ${details}`
        )
      }

      let created
      try {
        created = await createAnnexVii(request.db, request.payload, {
          submissionId: randomUUID(),
          receivedAt: new Date()
        })
      } catch (error) {
        if (error.code === 11000) {
          return Boom.conflict(
            `Annex VII document ${request.payload.annexVIIDocumentNo} already exists`
          )
        }

        throw error
      }

      /*
       * The UK-side record above is the source of truth for this API - the
       * DIWASS submission below is a best-effort downstream call, built as
       * a real SOAP payload against the emulator (or real DIWASS, once
       * DIWASS_BASE_URL points there). A failure here doesn't undo the
       * local write; it's surfaced on the response for the caller to see
       * and, eventually, retry.
       */
      const submittedAt = new Date()
      let diwass
      try {
        // server.info.uri reflects the configured bind address (0.0.0.0 by
        // default), which isn't a connectable destination - loop back to
        // this same process over localhost instead.
        diwass = await submitAnnexViiToDiwass(request.payload, {
          fallbackBaseUrl: `http://127.0.0.1:${request.server.info.port}`
        })
      } catch (error) {
        request.log(['error', 'diwass'], error)
        diwass = { status: 'ERROR', error: error.message }
      }

      // Stored on the record, so a NOTOK or ERROR can be seen and retried later.
      await recordDiwassResult(request.db, created.submissionId, {
        ...diwass,
        submittedAt,
        respondedAt: new Date()
      })

      return h.response({ ...created, diwass }).code(201)
    }
  }
]
