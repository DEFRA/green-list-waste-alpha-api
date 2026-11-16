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
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'

/*
[Errors]
One shape for every refusal: statusCode, error, message and, for a fact
that fails a check, details[] listing every problem rather than the first.
*/
const NAMES = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  412: 'Precondition Failed',
  422: 'Unprocessable Entity',
  428: 'Precondition Required'
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
  return refuse(h, 400, 'The request body is not valid', details).takeover()
}

const validate = (extra) => ({ ...extra, failAction: failShape })

const SCHEME_FIELDS = {
  EWC: 'ecListOfWastes',
  BASEL_ANNEX_IX: 'baselAnnexIX',
  OECD: 'oecd'
}

// Layer 3: waste codes against the seeded code lists.
async function wasteCodeProblems(db, wasteItems) {
  const problems = []
  for (const [i, item] of wasteItems.entries()) {
    for (const [j, code] of item.classification.codes.entries()) {
      const field = SCHEME_FIELDS[code.scheme]
      if (!field) {
        continue
      }
      const bad = await findInvalidWasteCodes(db, { [field]: code.value })
      if (bad.length) {
        problems.push({
          path: `wasteItems[${i}].classification.codes[${j}].value`,
          message: `"${code.value}" is not in the ${code.scheme} list`
        })
      }
    }
  }
  return problems
}

const duplicate = (error) => error.code === 11000

function parseRevision(header) {
  const n = Number(String(header).replaceAll('"', ''))
  return Number.isInteger(n) ? n : null
}

const moved = (h) =>
  refuse(
    h,
    409,
    'The movement was changed by another request. Read it and try again'
  )

export const v2Routes = [
  {
    method: 'POST',
    path: '/v2/movement',
    options: { validate: validate({ payload: movementBody }) },
    handler: async (request, h) => {
      const { db, payload } = request
      const codes = await wasteCodeProblems(db, payload.wasteItems)
      if (codes.length) {
        return refuse(h, 400, 'A waste code is not in its code list', codes)
      }
      const { kind, problems } = movementProblems(payload)
      if (problems.length) {
        return refuse(
          h,
          422,
          'The movement breaks the rules for this kind',
          problems
        )
      }
      try {
        const doc = await createMovement(db, payload, kind)
        return h.response(doc).code(201)
      } catch (error) {
        if (duplicate(error)) {
          return refuse(
            h,
            409,
            `annexViiNumber ${payload.annexViiNumber} is already used`
          )
        }
        throw error
      }
    }
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
    handler: async (request, h) => {
      const { db, payload, params, headers } = request
      const ifMatch = headers['if-match']
      if (ifMatch === undefined) {
        return refuse(
          h,
          428,
          'If-Match is required: send the revision you read'
        )
      }
      const existing = await getMovement(db, params.movementId)
      if (!existing) {
        return refuse(h, 404, 'Movement not found')
      }
      if (parseRevision(ifMatch) !== existing.revision) {
        return refuse(
          h,
          412,
          `If-Match is not the current revision, ${existing.revision}`
        )
      }
      if (existing.status === CANCELLED) {
        return refuse(h, 409, 'The movement has been cancelled')
      }
      if (existing.collections.length > 0) {
        return refuse(
          h,
          409,
          'A collection has been recorded. The plan can no longer be changed or cancelled'
        )
      }

      if (payload.status) {
        const { reason, cancelledBy } = payload.cancellation
        const updated = await cancel(db, existing, { reason }, cancelledBy)
        return updated || moved(h)
      }

      const codes = await wasteCodeProblems(db, payload.wasteItems)
      if (codes.length) {
        return refuse(h, 400, 'A waste code is not in its code list', codes)
      }
      const { kind, problems } = movementProblems(payload)
      if (problems.length) {
        return refuse(
          h,
          422,
          'The movement breaks the rules for this kind',
          problems
        )
      }
      try {
        const updated = await replacePlan(db, existing, payload, kind)
        return updated || moved(h)
      } catch (error) {
        if (duplicate(error)) {
          return refuse(
            h,
            409,
            `annexViiNumber ${payload.annexViiNumber} is already used`
          )
        }
        throw error
      }
    }
  },
  {
    method: 'GET',
    path: '/v2/movement/{movementId}',
    options: { validate: validate({ params: idParams }) },
    handler: async (request, h) => {
      const movement = await getMovement(request.db, request.params.movementId)
      return movement || refuse(h, 404, 'Movement not found')
    }
  },
  {
    method: 'POST',
    path: '/v2/collection',
    options: { validate: validate({ payload: collectionBody }) },
    handler: async (request, h) => {
      const { db, payload } = request
      const movement = await getMovement(db, payload.movementId)
      const problems = collectionProblems(payload, movement)
      if (!movement) {
        return refuse(h, 422, 'The movementId does not exist', [
          { path: 'movementId', message: 'No such movement' },
          ...problems
        ])
      }
      if (movement.status === CANCELLED) {
        return refuse(h, 409, 'The movement has been cancelled')
      }
      if (movement.deliveryId) {
        return refuse(
          h,
          409,
          'The movement is already on a delivery. No further collections'
        )
      }
      if (problems.length) {
        return refuse(h, 422, 'The collection breaks the rules', problems)
      }
      const updated = await recordCollection(db, movement, payload)
      return updated ? h.response(updated).code(201) : moved(h)
    }
  },
  {
    method: 'POST',
    path: '/v2/delivery',
    options: { validate: validate({ payload: deliveryBody }) },
    handler: async (request, h) => {
      const { db, payload } = request
      const movements = await getMovements(db, payload.movementIds)
      const missing = payload.movementIds.filter(
        (id) => !movements.some((m) => m.movementId === id)
      )
      if (missing.length) {
        return refuse(
          h,
          422,
          'A movementId does not exist',
          missing.map((id) => ({
            path: 'movementIds',
            message: `No such movement: ${id}`
          }))
        )
      }
      const cancelled = movements.filter((m) => m.status === CANCELLED)
      if (cancelled.length) {
        return refuse(
          h,
          409,
          `Cancelled: ${cancelled.map((m) => m.movementId).join(', ')}`
        )
      }
      const onDelivery = movements.filter((m) => m.deliveryId)
      if (onDelivery.length) {
        return refuse(
          h,
          409,
          `Already on a delivery: ${onDelivery.map((m) => m.movementId).join(', ')}`
        )
      }
      const uncollected = movements.filter((m) => m.collections.length === 0)
      if (uncollected.length) {
        return refuse(
          h,
          422,
          'A movement has no collection yet',
          uncollected.map((m) => ({
            path: 'movementIds',
            message: m.movementId
          }))
        )
      }
      const problems = deliveryProblems(payload, movements)
      if (problems.length) {
        return refuse(h, 422, 'The delivery breaks the rules', problems)
      }

      const delivery = await createDelivery(db, payload)
      const updated = []
      for (const movement of movements) {
        const next = await attachDelivery(
          db,
          movement,
          delivery.deliveryId,
          payload.deliveredAt
        )
        if (!next) {
          return moved(h)
        }
        updated.push(next)
      }
      return h
        .response({
          deliveries: [
            {
              deliveryId: delivery.deliveryId,
              movementIds: delivery.movementIds
            }
          ],
          movements: updated.map(summary),
          externalSubmissions: notEnabled()
        })
        .code(201)
    }
  },
  {
    method: 'POST',
    path: '/v2/receipt',
    options: { validate: validate({ payload: receiptBody }) },
    handler: async (request, h) => {
      const { db, payload } = request
      const delivery = await getDelivery(db, payload.deliveryId)
      if (!delivery) {
        return refuse(h, 422, 'The deliveryId does not exist', [
          { path: 'deliveryId', message: 'No such delivery' }
        ])
      }
      const movements = await getMovements(db, delivery.movementIds)
      if (movements.some((m) => m.status === CANCELLED)) {
        return refuse(h, 409, 'A movement on this delivery has been cancelled')
      }
      if (delivery.receipts.some((r) => r.receivedBy === payload.receivedBy)) {
        return refuse(
          h,
          409,
          `${payload.receivedBy} has already recorded a receipt`
        )
      }
      const problems = receiptProblems(payload)
      if (payload.receivedBy === 'FACILITY') {
        if (movements.some((m) => m.kind === KINDS.NATIONAL)) {
          problems.push({
            path: 'receivedBy',
            message: 'A national movement only takes a RECEIVER receipt'
          })
        }
        if (!delivery.receipts.some((r) => r.receivedBy === 'RECEIVER')) {
          problems.push({
            path: 'receivedBy',
            message:
              'The consignee (RECEIVER) receipt comes before the FACILITY receipt'
          })
        }
      }
      if (new Date(payload.receivedAt) < new Date(delivery.deliveredAt)) {
        problems.push({
          path: 'receivedAt',
          message: 'receivedAt is before the delivery'
        })
      }
      if (problems.length) {
        return refuse(h, 422, 'The receipt breaks the rules', problems)
      }

      const { deliveryId: _d, ...receipt } = payload
      if (!(await addReceipt(db, delivery, receipt))) {
        return refuse(
          h,
          409,
          `${payload.receivedBy} has already recorded a receipt`
        )
      }
      const updated = []
      for (const movement of movements) {
        const next =
          payload.receivedBy === 'RECEIVER'
            ? await markReceived(db, movement, receipt, delivery.deliveryId)
            : await recordFurtherReceipt(
                db,
                movement,
                receipt,
                delivery.deliveryId
              )
        if (!next) {
          return moved(h)
        }
        updated.push(next)
      }

      // A difference from what was collected is reported, never refused.
      const collected = movements[0].collections[0]?.quantity?.tonnes
      const received =
        (payload.outcome.acceptedQuantity?.tonnes ?? 0) +
        (payload.outcome.rejectedQuantity?.tonnes ?? 0)
      const differs =
        collected !== undefined &&
        payload.receivedBy === 'RECEIVER' &&
        received !== collected
      return h
        .response({
          deliveryId: delivery.deliveryId,
          fact: { type: RECEIVED, receivedBy: payload.receivedBy },
          movements: updated.map(summary),
          ...(differs && {
            warnings: [
              {
                code: 'QUANTITY_DIFFERS',
                message: `Collected ${collected} tonnes, receipt accounts for ${received}`
              }
            ]
          }),
          externalSubmissions: notEnabled()
        })
        .code(201)
    }
  }
]
