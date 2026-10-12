const COLLECTION = 'annex-vii'

/*
[Annex VII record]
Stores the shipment as received, keyed by an ID this API assigns
(submissionId). DIWASS assigns the real Annex VII document number, so a
caller's annexVIIDocumentNo is optional and kept only as their own reference.

status is DRAFT while an operator is still preparing the Annex VII, and
SUBMITTED once it has been sent to DIWASS. DIWASS's API has no draft stage
(drafts exist only in its web UI), so a draft lives here alone until the
shipment starts moving. The DIWASS outcome is in diwass: PENDING until the
call returns, then OK, NOTOK or ERROR.
*/
export const DRAFT = 'DRAFT'
export const SUBMITTED = 'SUBMITTED'

// After these outcomes the record can be edited and sent again.
const RETRYABLE_DIWASS_STATUSES = ['NOTOK', 'ERROR']

// Fields this API sets; everything else on a record is the caller's content.
const RECORD_FIELDS = [
  '_id',
  'submissionId',
  'receivedAt',
  'updatedAt',
  'status',
  'diwass'
]

export function contentOf(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !RECORD_FIELDS.includes(key))
  )
}

function withoutId({ _id, ...record }) {
  return record
}

export async function createAnnexVii(
  db,
  annexVii,
  { submissionId, receivedAt, status = SUBMITTED }
) {
  const record = {
    submissionId,
    receivedAt,
    status,
    ...annexVii,
    ...(status === SUBMITTED && { diwass: { status: 'PENDING' } })
  }
  await db.collection(COLLECTION).insertOne({ ...record })

  return record
}

export async function getAnnexVii(db, submissionId) {
  const record = await db.collection(COLLECTION).findOne({ submissionId })
  return record ? withoutId(record) : null
}

// A record can change only while it is a draft or DIWASS has refused it.
const EDITABLE = {
  $or: [
    { status: DRAFT },
    { 'diwass.status': { $in: RETRYABLE_DIWASS_STATUSES } }
  ]
}

/*
[Replace a draft]
Replaces the caller's content and puts the record back to DRAFT. Allowed
for a draft, or for a submission DIWASS refused (NOTOK) or never received
(ERROR), so it can be fixed before being sent again. Returns null when the
record does not exist or is not editable.
*/
export async function replaceDraft(db, submissionId, annexVii) {
  const existing = await db
    .collection(COLLECTION)
    .findOne({ submissionId, ...EDITABLE })
  if (!existing) {
    return null
  }
  const record = {
    submissionId,
    receivedAt: existing.receivedAt,
    updatedAt: new Date(),
    status: DRAFT,
    ...annexVii,
    ...(existing.diwass && { diwass: existing.diwass })
  }
  await db
    .collection(COLLECTION)
    .replaceOne({ _id: existing._id }, { ...record })

  return record
}

/*
[Claim for submission]
Moves an editable record to SUBMITTED with diwass PENDING in one atomic
update, so two submit requests for the same draft cannot both reach DIWASS.
The validated content is written at the same time, so what is stored is
exactly what was sent. Returns null when the record is not editable.
*/
export async function claimForSubmission(db, submissionId, annexVii) {
  const claimed = await db.collection(COLLECTION).findOneAndUpdate(
    { submissionId, ...EDITABLE },
    {
      $set: {
        ...annexVii,
        status: SUBMITTED,
        updatedAt: new Date(),
        diwass: { status: 'PENDING' }
      }
    },
    { returnDocument: 'after' }
  )
  return claimed ? withoutId(claimed) : null
}

export async function recordDiwassResult(db, submissionId, diwass) {
  await db
    .collection(COLLECTION)
    .updateOne({ submissionId }, { $set: { diwass } })

  return diwass
}
