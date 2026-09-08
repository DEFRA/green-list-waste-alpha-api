export const ANNEX_VII_COLLECTION = 'diwass-annex-vii'
const COUNTERS_COLLECTION = 'diwass-counters'

/*
[Annex VII Document Number]
Real DIWASS assigns this on create in the shape seen in the spec pack's
samples, e.g. GLW.BE260000000019i - country of the assigning competent
authority, two-digit year, a sequential number, a trailing letter. GB isn't
a real DIWASS country code for this (see the "assigned responsible
authority" note on the data contracts page), so this is illustrative only:
close enough in shape for the main API's client code to parse and store,
not a guess at the exact algorithm DIWASS uses.
*/
async function nextAnnexViiDocumentNo(db) {
  const result = await db
    .collection(COUNTERS_COLLECTION)
    .findOneAndUpdate(
      { _id: 'annexViiDocumentNo' },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
  const year = new Date().getFullYear().toString().slice(-2)
  const sequence = String(result.value).padStart(12, '0')
  return `GLW.GB${year}${sequence}i`
}

export async function createAnnexViiDocument(db, document) {
  const annexVIIDocumentNo = await nextAnnexViiDocumentNo(db)
  const record = { annexVIIDocumentNo, ...document }
  await db.collection(ANNEX_VII_COLLECTION).insertOne(record)
  return record
}

export async function getAnnexViiDocument(db, annexVIIDocumentNo) {
  return db.collection(ANNEX_VII_COLLECTION).findOne({ annexVIIDocumentNo })
}
