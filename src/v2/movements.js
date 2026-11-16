import { randomUUID } from 'node:crypto'

/*
[Movement store]
A movement is one document holding the plan as posted plus what has
happened since. Status is the furthest fact reached; every change adds a
fact and bumps the revision. Writes are conditional on the revision the
caller read, so two requests cannot both change the same revision.

DIWASS submission is not built yet. Every response says so in
externalSubmissions, and the shape is there so it can be switched on later.
*/
export const MOVEMENTS = 'v2-movements'
export const DELIVERIES = 'v2-deliveries'

export const ARRANGED = 'ARRANGED'
export const COLLECTED = 'COLLECTED'
export const DELIVERED = 'DELIVERED'
export const RECEIVED = 'RECEIVED'
export const CANCELLED = 'CANCELLED'

export const notEnabled = () => [{ system: 'DIWASS', status: 'NOT_ENABLED' }]

export async function createV2Indexes(db) {
  await db
    .collection(MOVEMENTS)
    .createIndex({ movementId: 1 }, { unique: true })
  await db.collection(MOVEMENTS).createIndex(
    { annexViiNumber: 1 },
    {
      unique: true,
      partialFilterExpression: { annexViiNumber: { $type: 'string' } },
      name: 'v2_annexViiNumber_unique_when_set'
    }
  )
  await db
    .collection(DELIVERIES)
    .createIndex({ deliveryId: 1 }, { unique: true })
}

const strip = ({ _id, ...rest }) => rest

export function present(doc) {
  return doc ? strip(doc) : null
}

export const summary = ({ movementId, status, revision }) => ({
  movementId,
  status,
  revision
})

const fact = (type, revision, extra = {}) => ({
  type,
  revision,
  recordedAt: new Date(),
  ...extra
})

export async function createMovement(db, body, kind) {
  const now = new Date()
  const doc = {
    movementId: randomUUID(),
    kind,
    status: ARRANGED,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...body,
    collections: [],
    facts: [fact('ARRANGED', 1)],
    externalSubmissions: notEnabled()
  }
  await db.collection(MOVEMENTS).insertOne({ ...doc })
  return doc
}

export async function getMovement(db, movementId) {
  return present(await db.collection(MOVEMENTS).findOne({ movementId }))
}

export async function getMovements(db, movementIds) {
  const found = await db
    .collection(MOVEMENTS)
    .find({ movementId: { $in: movementIds } })
    .toArray()
  return found.map(strip)
}

/*
[Revise]
Applies a change only if the stored revision is still the one the caller
read. Returns the new document, or null if the revision moved on.
*/
export async function revise(db, existing, set, newFact, unset = {}) {
  const revision = existing.revision + 1
  const update = {
    $set: { ...set, revision, updatedAt: new Date() },
    $push: { facts: { ...newFact, revision } }
  }
  if (Object.keys(unset).length) {
    update.$unset = unset
  }
  return present(
    await db
      .collection(MOVEMENTS)
      .findOneAndUpdate(
        { movementId: existing.movementId, revision: existing.revision },
        update,
        { returnDocument: 'after' }
      )
  )
}

// Replaces the plan (form A of PUT). Keeps everything the plan does not own.
export async function replacePlan(db, existing, body, kind) {
  const revision = existing.revision + 1
  const next = {
    movementId: existing.movementId,
    kind,
    status: ARRANGED,
    revision,
    createdAt: existing.createdAt,
    updatedAt: new Date(),
    ...body,
    collections: existing.collections,
    facts: [
      ...existing.facts,
      fact('ARRANGED', revision, { changes: Object.keys(body) })
    ],
    externalSubmissions: notEnabled()
  }
  const replaced = await db
    .collection(MOVEMENTS)
    .findOneAndReplace(
      { movementId: existing.movementId, revision: existing.revision },
      next,
      { returnDocument: 'after' }
    )
  return present(replaced)
}

export function cancel(db, existing, cancellation, signer) {
  return revise(
    db,
    existing,
    {
      status: CANCELLED,
      cancellation: {
        ...cancellation,
        cancelledBy: signer,
        cancelledAt: new Date()
      }
    },
    fact('CANCELLED')
  )
}

export function recordCollection(db, existing, body) {
  const { movementId: _id, legOrder, ...details } = body
  const index = legOrder - 1
  const planned = existing.legs[index]
  const carrierChanged = Boolean(body.carrier)
  const collection = { legOrder, ...details }
  delete collection.carrier
  const leg = carrierChanged
    ? {
        order: legOrder,
        intended: false,
        carrier: body.carrier,
        meansOfTransport:
          body.meansOfTransport ?? planned?.meansOfTransport ?? 'OTHER'
      }
    : null
  const legs = leg
    ? Object.assign([...existing.legs], { [index]: leg })
    : existing.legs
  const first = legOrder === 1
  return revise(
    db,
    existing,
    {
      status: COLLECTED,
      legs,
      collections: [...existing.collections, collection]
    },
    fact(first ? 'COLLECTED' : 'HANDED_OVER', 0, {
      legOrder,
      ...(first ? {} : { receivedFromLeg: legOrder - 1 })
    })
  )
}

export async function createDelivery(db, body) {
  const doc = {
    deliveryId: randomUUID(),
    movementIds: body.movementIds,
    deliveredAt: body.deliveredAt,
    deliverySite: body.deliverySite,
    ...(body.declaredBy && { declaredBy: body.declaredBy }),
    ...(body.evidence && { evidence: body.evidence }),
    receipts: [],
    createdAt: new Date()
  }
  await db.collection(DELIVERIES).insertOne({ ...doc })
  return doc
}

export async function getDelivery(db, deliveryId) {
  return present(await db.collection(DELIVERIES).findOne({ deliveryId }))
}

export async function addReceipt(db, delivery, receipt) {
  const result = await db.collection(DELIVERIES).updateOne(
    {
      deliveryId: delivery.deliveryId,
      'receipts.receivedBy': { $ne: receipt.receivedBy }
    },
    { $push: { receipts: receipt } }
  )
  return result.modifiedCount === 1
}

export function attachDelivery(db, existing, deliveryId, deliveredAt) {
  return revise(
    db,
    existing,
    { status: DELIVERED, deliveryId },
    fact('DELIVERED', 0, { deliveryId, deliveredAt })
  )
}

export function markReceived(db, existing, receipt, deliveryId) {
  return revise(
    db,
    existing,
    { status: RECEIVED },
    fact('RECEIVED', 0, { deliveryId, receivedBy: receipt.receivedBy })
  )
}

export function recordFurtherReceipt(db, existing, receipt, deliveryId) {
  return revise(
    db,
    existing,
    {},
    fact('RECEIVED', 0, { deliveryId, receivedBy: receipt.receivedBy })
  )
}
