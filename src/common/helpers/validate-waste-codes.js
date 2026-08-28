import {
  normalizeCode,
  WASTE_REFERENCE_CODES_COLLECTION
} from '#/common/helpers/seed-reference-codes.js'

/*
[Waste Code Field Types]
which seeded codeType(s) each wasteIdentification field is checked against.
oecd accepts either a Basel Annex IX (List B) code or an OECD-specific green
list code, since the OECD green list is Basel Annex IX plus a handful of
extra entries, not a standalone code system.
*/
const fieldCodeTypes = {
  ecListOfWastes: ['EWC'],
  baselAnnexIX: ['BASEL_ANNEX_IX'],
  oecd: ['BASEL_ANNEX_IX', 'OECD_GREEN_LIST']
}

export async function findInvalidWasteCodes(db, wasteIdentification = {}) {
  const collection = db.collection(WASTE_REFERENCE_CODES_COLLECTION)
  const invalid = []

  for (const [field, codeTypes] of Object.entries(fieldCodeTypes)) {
    const value = wasteIdentification[field]
    if (!value) {
      continue
    }

    const match = await collection.findOne({
      codeType: { $in: codeTypes },
      normalizedCode: normalizeCode(value)
    })

    if (!match) {
      invalid.push({ field, value })
    }
  }

  return invalid
}
