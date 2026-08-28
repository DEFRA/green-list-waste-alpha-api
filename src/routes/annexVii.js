import Boom from '@hapi/boom'
import { annexViiSchema } from '#/schemas/annex-vii.js'
import { createAnnexVii } from '#/services/AnnexViiCreate.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'

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

      try {
        const created = await createAnnexVii(request.db, request.payload)
        return h.response(created).code(201)
      } catch (error) {
        if (error.code === 11000) {
          return Boom.conflict(
            `Annex VII document ${request.payload.annexVIIDocumentNo} already exists`
          )
        }

        throw error
      }
    }
  }
]
