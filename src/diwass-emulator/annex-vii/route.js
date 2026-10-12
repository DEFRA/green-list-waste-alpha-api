import { soapRoute } from '#/diwass-emulator/soapRoute.js'
import { escapeXml } from '#/diwass-emulator/xml/build.js'
import {
  annex7DocumentFromXml,
  Annex7RejectedError
} from '#/diwass-emulator/annex-vii/mapping.js'
import { createAnnexViiDocument } from '#/diwass-emulator/annex-vii/store.js'
import { findUnknownOperatorIds } from '#/diwass-emulator/operators/store.js'

/*
[Unknown operators]
Live DIWASS answers an unknown consignee with two codes, in this order
(12 October 2026). Only the consignee case has been seen live, so other
roles get OPERATOR-ID-NOT-FOUND alone.
*/
async function unknownOperatorErrors(db, document) {
  const unknown = await findUnknownOperatorIds(db, [
    document.arrangerOperatorInternalId,
    document.consigneeOperatorInternalId,
    ...document.carrierOperatorInternalIds,
    ...document.facilityOperatorInternalIds
  ])
  const errors = []
  if (unknown.includes(document.consigneeOperatorInternalId)) {
    errors.push({
      code: 'CONSIGNEE-OPERATOR-IS-REQUIRED',
      description: 'Consignee is mandatory.'
    })
  }
  unknown.forEach((id) =>
    errors.push({
      code: 'OPERATOR-ID-NOT-FOUND',
      description: `Operator ${id} not found`
    })
  )
  return errors
}

function annex7Response({ statusCode, annexVIIDocumentNo, errors = [] }) {
  const errorsXml = errors
    .map(
      (error) =>
        `<ns5:errors><ns5:code>${escapeXml(error.code)}</ns5:code><ns5:description languageID="en">${escapeXml(error.description)}</ns5:description></ns5:errors>`
    )
    .join('')
  return `<ns4:Annex7DocumentTypeResponse xmlns:ns4="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns5="http://ec.europa.eu/tracesnt/waste/notification/v1">
        <ns4:response>
          <ns5:statusCode>${statusCode}</ns5:statusCode>${errorsXml}
        </ns4:response>
        <ns4:annexVIIDocumentNo>${annexVIIDocumentNo}</ns4:annexVIIDocumentNo>
      </ns4:Annex7DocumentTypeResponse>`
}

export const diwassAnnexVii = soapRoute({
  path: '/diwass/annex-vii',
  operations: {
    CreateAnnex7DocumentTypeRequest: async (payload, request) => {
      let document
      try {
        document = annex7DocumentFromXml(payload)
      } catch (error) {
        // A business rule: HTTP 200, NOTOK, coded errors, no document number.
        if (error instanceof Annex7RejectedError) {
          return annex7Response({
            statusCode: 'NOTOK',
            annexVIIDocumentNo: 'UNKNOWN',
            errors: error.errors
          })
        }
        throw error
      }

      const operatorErrors = await unknownOperatorErrors(request.db, document)
      if (operatorErrors.length) {
        return annex7Response({
          statusCode: 'NOTOK',
          annexVIIDocumentNo: 'UNKNOWN',
          errors: operatorErrors
        })
      }

      const created = await createAnnexViiDocument(request.db, document)
      return annex7Response(created)
    }
  }
})
