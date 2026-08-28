import { WASTE_REFERENCE_CODES_COLLECTION } from '#/common/helpers/seed-reference-codes.js'

/*
[Waste Code Type Paths]
maps each URL path segment to the codeType seeded into the
waste-reference-codes collection by seed-reference-codes.js
*/
const codeTypesByPath = {
  ewc: 'EWC',
  'basel-annex-ix': 'BASEL_ANNEX_IX',
  'oecd-green-list': 'OECD_GREEN_LIST'
}

export const wasteCodes = Object.entries(codeTypesByPath).map(
  ([path, codeType]) => ({
    method: 'GET',
    path: `/waste-codes/${path}`,
    handler: async (request, _h) => {
      return request.db
        .collection(WASTE_REFERENCE_CODES_COLLECTION)
        .find(
          { codeType },
          { projection: { _id: 0, codeType: 0, normalizedCode: 0 } }
        )
        .sort({ code: 1 })
        .toArray()
    }
  })
)
