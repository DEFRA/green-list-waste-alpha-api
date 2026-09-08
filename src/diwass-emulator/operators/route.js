import { soapRoute } from '#/diwass-emulator/soapRoute.js'
import { textOf } from '#/diwass-emulator/xml/parse.js'
import {
  operatorFromXml,
  operatorToXml
} from '#/diwass-emulator/operators/mapping.js'
import {
  createOperator,
  findOperators,
  getOperatorByInternalId,
  approveOperator
} from '#/diwass-emulator/operators/store.js'

export const diwassOperators = soapRoute({
  path: '/diwass/operators',
  operations: {
    CreateOperatorRequest: async (payload, request) => {
      const operator = operatorFromXml(payload.Operator)
      const created = await createOperator(request.db, operator)
      return `<v2:CreateOperatorResponse xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
        <v2:OperatorInternalID>${created.operatorInternalId}</v2:OperatorInternalID>
      </v2:CreateOperatorResponse>`
    },

    FindOperatorRequest: async (payload, request) => {
      const operators = await findOperators(request.db, {
        countryId: textOf(payload.CountryID),
        activityStatus: textOf(payload.ActivityStatus),
        identifierType: payload.Identifier?.['@_type'],
        identifierValue: textOf(payload.Identifier),
        pageSize: Number(payload['@_pageSize']) || undefined,
        offset: Number(payload['@_offset']) || undefined
      })
      return `<v2:FindOperatorResponse xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
        ${operators.map(operatorToXml).join('')}
      </v2:FindOperatorResponse>`
    },

    GetOperatorRequest: async (payload, request) => {
      const ids = Array.isArray(payload.ID) ? payload.ID : [payload.ID]
      const operators = await Promise.all(
        ids.map((id) => getOperatorByInternalId(request.db, textOf(id)))
      )
      return `<v2:GetOperatorResponse xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
        ${operators.filter(Boolean).map(operatorToXml).join('')}
      </v2:GetOperatorResponse>`
    },

    /*
     * Emulator-only operation - see the comment on approveOperator in
     * operators/store.js for why this has no real DIWASS equivalent.
     */
    ApproveOperatorRequest: async (payload, request) => {
      const operatorInternalId = textOf(payload.OperatorInternalID)
      const approved = await approveOperator(request.db, operatorInternalId)
      if (!approved) {
        const error = new Error(
          `No operator found with OperatorInternalID ${operatorInternalId}`
        )
        error.faultCode = 'soapenv:Client'
        error.httpStatus = 404
        throw error
      }
      return `<v2:ApproveOperatorResponse xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
        <v2:OperatorInternalID>${approved.operatorInternalId}</v2:OperatorInternalID>
        <v2:Status>${approved.activityStatus}</v2:Status>
      </v2:ApproveOperatorResponse>`
    }
  }
})
