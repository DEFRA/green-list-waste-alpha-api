const COLLECTION = 'annex-vii'

/*
[Annex VII record]
Stores the shipment as received, keyed by an ID this API assigns
(submissionId), with the DIWASS outcome PENDING until the downstream call
returns. DIWASS assigns the real Annex VII document number, so a caller's
annexVIIDocumentNo is optional and kept only as their own reference.
*/
export async function createAnnexVii(
  db,
  annexVii,
  { submissionId, receivedAt }
) {
  const record = {
    submissionId,
    receivedAt,
    ...annexVii,
    diwass: { status: 'PENDING' }
  }
  await db.collection(COLLECTION).insertOne({ ...record })

  return record
}

export async function recordDiwassResult(db, submissionId, diwass) {
  await db
    .collection(COLLECTION)
    .updateOne({ submissionId }, { $set: { diwass } })

  return diwass
}
