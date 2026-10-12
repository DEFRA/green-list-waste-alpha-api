const COLLECTION = 'annex-vii'

/*
[Annex VII record]
Stores the shipment, keyed by an ID this API assigns (submissionId). DIWASS
assigns the real Annex VII document number, so a caller's annexVIIDocumentNo
is optional and kept only as their own reference.

The lifecycle follows DIWASS's own:
- DRAFT: being prepared in DWT only. DIWASS's API cannot hold a draft (its
  drafts exist only in its web UI), so nothing has been sent.
- ANNOUNCED: created in DIWASS, which shows it as Announced. An operator
  announces as soon as the export is planned and updates it once the load is
  known (the way software providers already work; confirmed live on 12
  October 2026). diwass holds the announcement outcome; diwass.lastUpdate the
  latest update.
- CANCELLED: the export will not happen. An announced one is withdrawn in
  DIWASS with the Annex7Cancelled signal (diwass.cancellation).
*/
export const DRAFT = 'DRAFT'
export const ANNOUNCED = 'ANNOUNCED'
export const CANCELLED = 'CANCELLED'

// An announcement DIWASS refused or never received can be fixed and resent.
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

function withoutId(record) {
  if (!record) {
    return null
  }
  const { _id, ...rest } = record
  return rest
}

// Not yet in DIWASS: a draft, or an announcement that did not go through.
const NOT_IN_DIWASS = {
  $or: [
    { status: DRAFT },
    {
      status: ANNOUNCED,
      'diwass.status': { $in: RETRYABLE_DIWASS_STATUSES }
    }
  ]
}

// In DIWASS, with a document number, and no other change in flight.
const IN_DIWASS_AND_FREE = {
  status: ANNOUNCED,
  'diwass.status': 'OK',
  'diwass.busy': { $ne: true }
}

export function isInDiwass(record) {
  return record.status === ANNOUNCED && record.diwass?.status === 'OK'
}

export async function createAnnexVii(
  db,
  annexVii,
  { submissionId, receivedAt, status = ANNOUNCED }
) {
  const record = {
    submissionId,
    receivedAt,
    status,
    ...annexVii,
    ...(status === ANNOUNCED && { diwass: { status: 'PENDING' } })
  }
  await db.collection(COLLECTION).insertOne({ ...record })

  return record
}

export async function getAnnexVii(db, submissionId) {
  return withoutId(await db.collection(COLLECTION).findOne({ submissionId }))
}

/*
[Replace a draft]
Replaces the caller's content and puts the record back to DRAFT. Allowed
while the record is not in DIWASS. Returns null otherwise.
*/
export async function replaceDraft(db, submissionId, annexVii) {
  const existing = await db
    .collection(COLLECTION)
    .findOne({ submissionId, ...NOT_IN_DIWASS })
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
[Claim for announcement]
Moves a record that is not yet in DIWASS to ANNOUNCED with diwass PENDING in
one atomic update, so two requests cannot both create it in DIWASS. The
validated content is written at the same time. Returns null when the record
is already in DIWASS or cancelled.
*/
export async function claimForAnnouncement(db, submissionId, annexVii) {
  return withoutId(
    await db.collection(COLLECTION).findOneAndUpdate(
      { submissionId, ...NOT_IN_DIWASS },
      {
        $set: {
          ...annexVii,
          status: ANNOUNCED,
          updatedAt: new Date(),
          diwass: { status: 'PENDING' }
        }
      },
      { returnDocument: 'after' }
    )
  )
}

export async function recordDiwassResult(db, submissionId, diwass) {
  await db
    .collection(COLLECTION)
    .updateOne({ submissionId }, { $set: { diwass } })

  return diwass
}

/*
[Lock an announced record]
DIWASS forbids concurrent calls, and an update racing a cancel would leave
the record unclear, so an update or cancel first takes this flag. Returns
the record, or null when it is not in DIWASS or already busy.
*/
export async function lockAnnounced(db, submissionId) {
  return withoutId(
    await db
      .collection(COLLECTION)
      .findOneAndUpdate(
        { submissionId, ...IN_DIWASS_AND_FREE },
        { $set: { 'diwass.busy': true } },
        { returnDocument: 'after' }
      )
  )
}

/*
[Finish an update]
Releases the lock and records the update's outcome. The caller's content is
replaced only when DIWASS accepted the update, so the record always matches
what DIWASS holds.
*/
export async function finishUpdate(
  db,
  submissionId,
  { previous, annexVii, outcome }
) {
  const accepted = outcome.status === 'OK'
  // Fields the new version leaves out are removed, as DIWASS's copy is replaced whole.
  const dropped = accepted
    ? Object.keys(contentOf(previous)).filter((key) => !(key in annexVii))
    : []
  return withoutId(
    await db.collection(COLLECTION).findOneAndUpdate(
      { submissionId },
      {
        $set: {
          ...(accepted && annexVii),
          ...(accepted && { updatedAt: new Date() }),
          'diwass.lastUpdate': outcome
        },
        $unset: {
          'diwass.busy': '',
          ...Object.fromEntries(dropped.map((key) => [key, '']))
        }
      },
      { returnDocument: 'after' }
    )
  )
}

/*
[Cancel]
Not yet in DIWASS: just marked CANCELLED here. In DIWASS: called after the
Annex7Cancelled signal, and marked CANCELLED only if DIWASS accepted it.
*/
export async function cancelLocally(db, submissionId) {
  return withoutId(
    await db
      .collection(COLLECTION)
      .findOneAndUpdate(
        { submissionId, ...NOT_IN_DIWASS },
        { $set: { status: CANCELLED, updatedAt: new Date() } },
        { returnDocument: 'after' }
      )
  )
}

export async function finishCancellation(db, submissionId, outcome) {
  const accepted = outcome.status === 'OK'
  return withoutId(
    await db.collection(COLLECTION).findOneAndUpdate(
      { submissionId },
      {
        $set: {
          ...(accepted && { status: CANCELLED, updatedAt: new Date() }),
          'diwass.cancellation': outcome
        },
        $unset: { 'diwass.busy': '' }
      },
      { returnDocument: 'after' }
    )
  )
}

/*
[Older records]
Records from before the lifecycle was named have no status, or SUBMITTED.
Both were sent to DIWASS on create, so they are ANNOUNCED.
*/
export async function migrateAnnexViiStatuses(db) {
  await db
    .collection(COLLECTION)
    .updateMany(
      { $or: [{ status: { $exists: false } }, { status: 'SUBMITTED' }] },
      { $set: { status: ANNOUNCED } }
    )
}
