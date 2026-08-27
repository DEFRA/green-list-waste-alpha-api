import Boom from '@hapi/boom'
import { annexViiSchema } from '#/schemas/annex-vii.js'
import { createAnnexVii } from '#/services/AnnexViiCreate.js'

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
