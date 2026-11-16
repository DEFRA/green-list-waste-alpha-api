import Joi from 'joi'
import {
  collectionBody,
  deliveryBody,
  idParams,
  movementBody,
  putBody,
  receiptBody
} from '#/v2/schemas.js'
import {
  KINDS,
  collectionProblems,
  deliveryProblems,
  movementProblems,
  receiptProblems
} from '#/v2/rules.js'
import {
  CANCELLED,
  RECEIVED,
  addReceipt,
  attachDelivery,
  cancel,
  createDelivery,
  createMovement,
  getDelivery,
  getMovement,
  getMovements,
  markReceived,
  notEnabled,
  recordCollection,
  recordFurtherReceipt,
  replacePlan,
  summary
} from '#/v2/movements.js'
import { HTTP, MONGO_DUPLICATE_KEY } from '#/v2/http.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'

/*
[Errors]
One shape for every refusal: statusCode, error, message and, for a request
that fails a check, details[] listing every problem rather than the first.
*/
const NAMES = {
  [HTTP.BAD_REQUEST]: 'Bad Request',
  [HTTP.NOT_FOUND]: 'Not Found',
  [HTTP.CONFLICT]: 'Conflict',
  [HTTP.PRECONDITION_FAILED]: 'Precondition Failed',
  [HTTP.UNPROCESSABLE]: 'Unprocessable Entity',
  [HTTP.PRECONDITION_REQUIRED]: 'Precondition Required'
}

function refuse(h, statusCode, message, details = []) {
  return h
    .response({
      statusCode,
      error: NAMES[statusCode],
      message,
      ...(details.length && { details })
    })
    .code(statusCode)
}

// Layer 2: every shape problem, with its path.
function failShape(_request, h, error) {
  const details = (error.details ?? []).map((d) => ({
    path: d.path.join('.'),
    message: d.message
  }))
  return refuse(
    h,
    HTTP.BAD_REQUEST,
    'The request body is not valid',
    details
  ).takeover()
}

const validate = (extra) => ({ ...extra, failAction: failShape })

const SCHEME_FIELDS = {
  EWC: 'ecListOfWastes',
  BASEL_ANNEX_IX: 'baselAnnexIX',
  OECD: 'oecd'
}

// Layer 3: waste codes against the seeded code lists.
async function wasteCodeProblems(db, wasteItems) {
  const checks = wasteItems.flatMap((item, i) =>
    item.classification.codes.map(async (code, j) => {
      const field = SCHEME_FIELDS[code.scheme]
      const bad = field
        ? await findInvalidWasteCodes(db, { [field]: code.value })
        : []
      return bad.length
        ? {
            path: `wasteItems[${i}].classification.codes[${j}].value`,
            message: `"${code.value}" is not in the ${code.scheme} list`
          }
        : null
    })
  )
  return (await Promise.all(checks)).filter(Boolean)
}

/*
[Check a plan]
Layers 3 and 4 for a movement body, used by POST and by PUT form A. Returns
the kind to store, or the refusal to send.
*/
async function checkPlan(h, db, payload) {
  const codes = await wasteCodeProblems(db, payload.wasteItems)
  if (codes.length) {
    return {
      refusal: refuse(
        h,
        HTTP.BAD_REQUEST,
        'A waste code is not in its code list',
        codes
      )
    }
  }
  const { kind, problems } = movementProblems(payload)
  return problems.length
    ? {
        refusal: refuse(
          h,
          HTTP.UNPROCESSABLE,
          'The movement breaks the rules for this kind',
          problems
        )
      }
    : { kind }
}

const duplicateNumber = (h, payload) =>
  refuse(
    h,
    HTTP.CONFLICT,
    `annexViiNumber ${payload.annexViiNumber} is already used`
  )

const moved = (h) =>
  refuse(
    h,
    HTTP.CONFLICT,
    'The movement was changed by another request. Read it and try again'
  )

function parseRevision(header) {
  const n = Number(String(header).replaceAll('"', ''))
  return Number.isInteger(n) ? n : null
}

// Why a movement cannot be changed by PUT, or null if it can.
function notChangeable(h, existing, ifMatch) {
  if (parseRevision(ifMatch) !== existing.revision) {
    return refuse(
      h,
      HTTP.PRECONDITION_FAILED,
      `If-Match is not the current revision, ${existing.revision}`
    )
  }
  if (existing.status === CANCELLED) {
    return refuse(h, HTTP.CONFLICT, 'The movement has been cancelled')
  }
  if (existing.collections.length > 0) {
    return refuse(
      h,
      HTTP.CONFLICT,
      'A collection has been recorded. The plan can no longer be changed or cancelled'
    )
  }
  return null
}

async function arrangeMovement(request, h) {
  const { db, payload } = request
  const { kind, refusal } = await checkPlan(h, db, payload)
  if (refusal) {
    return refusal
  }
  try {
    const doc = await createMovement(db, payload, kind)
    return h.response(doc).code(HTTP.CREATED)
  } catch (error) {
    if (error.code === MONGO_DUPLICATE_KEY) {
      return duplicateNumber(h, payload)
    }
    throw error
  }
}

async function changeMovement(request, h) {
  const { db, payload, params, headers } = request
  const ifMatch = headers['if-match']
  if (ifMatch === undefined) {
    return refuse(
      h,
      HTTP.PRECONDITION_REQUIRED,
      'If-Match is required: send the revision you read'
    )
  }
  const existing = await getMovement(db, params.movementId)
  if (!existing) {
    return refuse(h, HTTP.NOT_FOUND, 'Movement not found')
  }
  const blocked = notChangeable(h, existing, ifMatch)
  if (blocked) {
    return blocked
  }

  if (payload.status) {
    const { reason, cancelledBy } = payload.cancellation
    return (await cancel(db, existing, { reason }, cancelledBy)) || moved(h)
  }

  const { kind, refusal } = await checkPlan(h, db, payload)
  if (refusal) {
    return refusal
  }
  try {
    return (await replacePlan(db, existing, payload, kind)) || moved(h)
  } catch (error) {
    if (error.code === MONGO_DUPLICATE_KEY) {
      return duplicateNumber(h, payload)
    }
    throw error
  }
}

async function readMovement(request, h) {
  const movement = await getMovement(request.db, request.params.movementId)
  return movement || refuse(h, HTTP.NOT_FOUND, 'Movement not found')
}

async function collect(request, h) {
  const { db, payload } = request
  const movement = await getMovement(db, payload.movementId)
  const problems = collectionProblems(payload, movement)
  if (!movement) {
    return refuse(h, HTTP.UNPROCESSABLE, 'The movementId does not exist', [
      { path: 'movementId', message: 'No such movement' },
      ...problems
    ])
  }
  if (movement.status === CANCELLED) {
    return refuse(h, HTTP.CONFLICT, 'The movement has been cancelled')
  }
  if (movement.deliveryId) {
    return refuse(
      h,
      HTTP.CONFLICT,
      'The movement is already on a delivery. No further collections'
    )
  }
  if (problems.length) {
    return refuse(
      h,
      HTTP.UNPROCESSABLE,
      'The collection breaks the rules',
      problems
    )
  }
  const updated = await recordCollection(db, movement, payload)
  return updated ? h.response(updated).code(HTTP.CREATED) : moved(h)
}

const ids = (list) => list.map((m) => m.movementId).join(', ')

/*
[Movements a delivery can take]
Each check is a refusal when any movement fails it, in the order the
Schema validation page lists them.
*/
function deliveryStateRefusal(h, movementIds, movements) {
  const missing = movementIds.filter(
    (id) => !movements.some((m) => m.movementId === id)
  )
  const cancelled = movements.filter((m) => m.status === CANCELLED)
  const onDelivery = movements.filter((m) => m.deliveryId)
  const uncollected = movements.filter((m) => m.collections.length === 0)
  const asProblems = (list) =>
    list.map((m) => ({ path: 'movementIds', message: m.movementId }))
  if (missing.length) {
    return refuse(
      h,
      HTTP.UNPROCESSABLE,
      'A movementId does not exist',
      missing.map((id) => ({
        path: 'movementIds',
        message: `No such movement: ${id}`
      }))
    )
  }
  if (cancelled.length) {
    return refuse(h, HTTP.CONFLICT, `Cancelled: ${ids(cancelled)}`)
  }
  if (onDelivery.length) {
    return refuse(h, HTTP.CONFLICT, `Already on a delivery: ${ids(onDelivery)}`)
  }
  return uncollected.length
    ? refuse(
        h,
        HTTP.UNPROCESSABLE,
        'A movement has no collection yet',
        asProblems(uncollected)
      )
    : null
}

async function deliver(request, h) {
  const { db, payload } = request
  const movements = await getMovements(db, payload.movementIds)
  const refusal = deliveryStateRefusal(h, payload.movementIds, movements)
  if (refusal) {
    return refusal
  }
  const problems = deliveryProblems(payload, movements)
  if (problems.length) {
    return refuse(
      h,
      HTTP.UNPROCESSABLE,
      'The delivery breaks the rules',
      problems
    )
  }
  const delivery = await createDelivery(db, payload)
  const updated = await Promise.all(
    movements.map((m) =>
      attachDelivery(db, m, delivery.deliveryId, payload.deliveredAt)
    )
  )
  if (updated.includes(null)) {
    return moved(h)
  }
  return h
    .response({
      deliveries: [
        { deliveryId: delivery.deliveryId, movementIds: delivery.movementIds }
      ],
      movements: updated.map(summary),
      externalSubmissions: notEnabled()
    })
    .code(HTTP.CREATED)
}

// Receipt checks that need the delivery and its movements.
function receiptStateProblems(payload, delivery, movements) {
  const found = []
  if (payload.receivedBy === 'FACILITY') {
    if (movements.some((m) => m.kind === KINDS.NATIONAL)) {
      found.push({
        path: 'receivedBy',
        message: 'A national movement only takes a RECEIVER receipt'
      })
    }
    if (!delivery.receipts.some((r) => r.receivedBy === 'RECEIVER')) {
      found.push({
        path: 'receivedBy',
        message:
          'The consignee (RECEIVER) receipt comes before the FACILITY receipt'
      })
    }
  }
  if (new Date(payload.receivedAt) < new Date(delivery.deliveredAt)) {
    found.push({
      path: 'receivedAt',
      message: 'receivedAt is before the delivery'
    })
  }
  return found
}

// A difference from what was collected is reported, never refused.
function quantityWarnings(payload, movements) {
  const collected = movements[0].collections[0]?.quantity?.tonnes
  const received =
    (payload.outcome.acceptedQuantity?.tonnes ?? 0) +
    (payload.outcome.rejectedQuantity?.tonnes ?? 0)
  const differs =
    collected !== undefined &&
    payload.receivedBy === 'RECEIVER' &&
    received !== collected
  return differs
    ? [
        {
          code: 'QUANTITY_DIFFERS',
          message: `Collected ${collected} tonnes, receipt accounts for ${received}`
        }
      ]
    : []
}

const alreadyReceived = (h, role) =>
  refuse(h, HTTP.CONFLICT, `${role} has already recorded a receipt`)

async function receive(request, h) {
  const { db, payload } = request
  const delivery = await getDelivery(db, payload.deliveryId)
  if (!delivery) {
    return refuse(h, HTTP.UNPROCESSABLE, 'The deliveryId does not exist', [
      { path: 'deliveryId', message: 'No such delivery' }
    ])
  }
  const movements = await getMovements(db, delivery.movementIds)
  if (movements.some((m) => m.status === CANCELLED)) {
    return refuse(
      h,
      HTTP.CONFLICT,
      'A movement on this delivery has been cancelled'
    )
  }
  if (delivery.receipts.some((r) => r.receivedBy === payload.receivedBy)) {
    return alreadyReceived(h, payload.receivedBy)
  }
  const problems = [
    ...receiptProblems(payload),
    ...receiptStateProblems(payload, delivery, movements)
  ]
  if (problems.length) {
    return refuse(
      h,
      HTTP.UNPROCESSABLE,
      'The receipt breaks the rules',
      problems
    )
  }

  const receipt = { ...payload }
  delete receipt.deliveryId
  if (!(await addReceipt(db, delivery, receipt))) {
    return alreadyReceived(h, payload.receivedBy)
  }
  const record =
    payload.receivedBy === 'RECEIVER' ? markReceived : recordFurtherReceipt
  const updated = await Promise.all(
    movements.map((m) => record(db, m, receipt, delivery.deliveryId))
  )
  if (updated.includes(null)) {
    return moved(h)
  }
  const warnings = quantityWarnings(payload, movements)
  return h
    .response({
      deliveryId: delivery.deliveryId,
      fact: { type: RECEIVED, receivedBy: payload.receivedBy },
      movements: updated.map(summary),
      ...(warnings.length && { warnings }),
      externalSubmissions: notEnabled()
    })
    .code(HTTP.CREATED)
}

export const v2Routes = [
  {
    method: 'POST',
    path: '/v2/movement',
    options: { validate: validate({ payload: movementBody }) },
    handler: arrangeMovement
  },
  {
    method: 'PUT',
    path: '/v2/movement/{movementId}',
    options: {
      validate: validate({
        params: idParams,
        headers: Joi.object({ 'if-match': Joi.string() }).unknown(),
        payload: putBody
      })
    },
    handler: changeMovement
  },
  {
    method: 'GET',
    path: '/v2/movement/{movementId}',
    options: { validate: validate({ params: idParams }) },
    handler: readMovement
  },
  {
    method: 'POST',
    path: '/v2/collection',
    options: { validate: validate({ payload: collectionBody }) },
    handler: collect
  },
  {
    method: 'POST',
    path: '/v2/delivery',
    options: { validate: validate({ payload: deliveryBody }) },
    handler: deliver
  },
  {
    method: 'POST',
    path: '/v2/receipt',
    options: { validate: validate({ payload: receiptBody }) },
    handler: receive
  }
]
