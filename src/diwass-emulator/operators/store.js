export const OPERATORS_COLLECTION = 'diwass-operators'
const COUNTERS_COLLECTION = 'diwass-counters'

/*
[Operator Internal ID]
Real DIWASS returns a small numeric OperatorInternalID (the spec pack's
samples use values like 235939, 237674). A Mongo counter document keeps the
emulator's IDs in that same numeric shape rather than leaking ObjectIds into
a field that downstream Annex VII calls treat as an opaque DIWASS reference.
*/
async function nextOperatorInternalId(db) {
  const result = await db
    .collection(COUNTERS_COLLECTION)
    .findOneAndUpdate(
      { _id: 'operatorInternalId' },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
  return 200000 + result.value
}

export class DuplicateOperatorError extends Error {
  constructor(identifier) {
    super(
      `An operator with ${identifier.type.toUpperCase()} identifier "${identifier.value}" is already registered`
    )
    this.faultCode = 'soapenv:Client'
    this.httpStatus = 409
  }
}

export async function createOperator(db, operator) {
  const mainIdentifier =
    operator.identifiers.find((identifier) => identifier.main) ??
    operator.identifiers[0]

  if (mainIdentifier) {
    const existing = await db.collection(OPERATORS_COLLECTION).findOne({
      'identifiers.type': mainIdentifier.type,
      'identifiers.value': mainIdentifier.value
    })
    if (existing) {
      throw new DuplicateOperatorError(mainIdentifier)
    }
  }

  const operatorInternalId = await nextOperatorInternalId(db)
  const record = {
    operatorInternalId,
    ...operator,
    activityStatus: 'New'
  }

  await db.collection(OPERATORS_COLLECTION).insertOne(record)
  return record
}

export async function findOperators(db, filters) {
  const query = {}

  if (filters.countryId) {
    query['address.countryId'] = filters.countryId
  }
  if (filters.activityStatus) {
    query.activityStatus = filters.activityStatus
  }
  if (filters.identifierType && filters.identifierValue) {
    query['identifiers.type'] = filters.identifierType
    query['identifiers.value'] = filters.identifierValue
  }

  return db
    .collection(OPERATORS_COLLECTION)
    .find(query)
    .skip(filters.offset ?? 0)
    .limit(filters.pageSize ?? 100)
    .toArray()
}

export async function getOperatorByInternalId(db, operatorInternalId) {
  return db
    .collection(OPERATORS_COLLECTION)
    .findOne({ operatorInternalId: Number(operatorInternalId) })
}

/*
[Pre-registered operators]
Live DIWASS refuses an Annex VII that names an operator it does not know
(OPERATOR-ID-NOT-FOUND, payload pack err-soap-07, 12 October 2026), and so
does this emulator. These IDs count as registered without a createOperator
call, so the published example request (examples/annexvii-create-request.json)
and the spec pack's own sample request keep working as they always have.
*/
export const PRE_REGISTERED_OPERATOR_IDS = new Set([
  // examples/annexvii-create-request.json
  'OP-12345',
  'OP-67890',
  'OP-11111',
  'OP-33333',
  'OP-44444',
  // The spec pack's Submit_annex7_request.xml sample
  '235939',
  '235977',
  '237238',
  '237256',
  '237674'
])

export async function findUnknownOperatorIds(db, operatorInternalIds) {
  const candidates = [...new Set(operatorInternalIds)].filter(
    (id) => id && !PRE_REGISTERED_OPERATOR_IDS.has(String(id))
  )
  const numeric = candidates.map(Number).filter(Number.isFinite)
  const registered = await db
    .collection(OPERATORS_COLLECTION)
    .find({ operatorInternalId: { $in: numeric } })
    .project({ operatorInternalId: 1 })
    .toArray()
  const known = new Set(registered.map((op) => String(op.operatorInternalId)))
  return candidates.filter((id) => !known.has(String(id)))
}

/*
[Approve - Emulator Only]
Real DIWASS never exposes an operator-side API call that flips status from
New to Valid - only a competent authority does that through DIWASS's own web
interface. Without some way to simulate that here, every Annex VII test
would be permanently stuck behind an operator stuck at New, so this endpoint
exists purely to unblock local/CI testing and has no equivalent operation
name in the real spec.
*/
export async function approveOperator(db, operatorInternalId) {
  const result = await db
    .collection(OPERATORS_COLLECTION)
    .findOneAndUpdate(
      { operatorInternalId: Number(operatorInternalId) },
      { $set: { activityStatus: 'Valid' } },
      { returnDocument: 'after' }
    )
  return result
}
