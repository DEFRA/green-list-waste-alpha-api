import { parseSoapMessage } from '#/diwass-emulator/xml/parse.js'
import {
  buildSoapResponse,
  buildSoapFault
} from '#/diwass-emulator/xml/build.js'

/*
[SOAP Route]
One Hapi route per DIWASS WSDL service (Ping, OperatorDirectoryServiceV2,
WasteAnnex7V1), matching how DIWASS itself exposes one endpoint per service
and dispatches operations by the SOAP body's root element - not by URL path.
`operations` maps that root element name (e.g. 'CreateOperatorRequest') to a
handler returning the response body XML (without the envelope).
*/
export function soapRoute({ path, operations }) {
  return {
    method: 'POST',
    path,
    options: {
      payload: {
        parse: false,
        output: 'data'
      }
    },
    handler: async (request, h) => {
      let operation
      let payload

      try {
        ;({ operation, payload } = parseSoapMessage(
          request.payload.toString('utf8')
        ))
      } catch (error) {
        return h
          .response(
            buildSoapFault({
              code: 'soapenv:Client',
              reason: error.message
            })
          )
          .type('text/xml')
          .code(400)
      }

      const operationHandler = operations[operation]
      if (!operationHandler) {
        return h
          .response(
            buildSoapFault({
              code: 'soapenv:Client',
              reason: `Unsupported operation "${operation}" - this emulator only implements ${Object.keys(operations).join(', ')}`
            })
          )
          .type('text/xml')
          .code(400)
      }

      try {
        const bodyXml = await operationHandler(payload, request)
        return h.response(buildSoapResponse(bodyXml)).type('text/xml')
      } catch (error) {
        return h
          .response(
            buildSoapFault({
              code: error.faultCode ?? 'soapenv:Server',
              reason: error.message
            })
          )
          .type('text/xml')
          .code(error.httpStatus ?? 500)
      }
    }
  }
}
