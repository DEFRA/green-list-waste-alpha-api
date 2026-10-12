import { soapRoute } from '#/diwass-emulator/soapRoute.js'
import { escapeXml } from '#/diwass-emulator/xml/build.js'
import {
  annex7DocumentFromXml,
  Annex7RejectedError
} from '#/diwass-emulator/annex-vii/mapping.js'
import {
  addAnnexViiSignal,
  createAnnexViiDocument,
  updateAnnexViiDocument
} from '#/diwass-emulator/annex-vii/store.js'
import { textOf } from '#/diwass-emulator/xml/parse.js'
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

const notFound = (annexVIIDocumentNo) =>
  annex7Response({
    statusCode: 'NOTOK',
    annexVIIDocumentNo,
    errors: [{ code: 'GREEN-LISTED-DOCUMENT-NOT-FOUND', description: '' }]
  })

/*
[Check an Annex VII]
The same checks for a create and an update. Returns the document to store,
or the NOTOK response DIWASS would give. Schema problems are thrown and
become SOAP Faults.
*/
async function checkedDocument(payload, db) {
  let document
  try {
    document = annex7DocumentFromXml(payload)
  } catch (error) {
    // A business rule: HTTP 200, NOTOK, coded errors, no document number.
    if (error instanceof Annex7RejectedError) {
      return {
        rejection: annex7Response({
          statusCode: 'NOTOK',
          annexVIIDocumentNo: 'UNKNOWN',
          errors: error.errors
        })
      }
    }
    throw error
  }

  const operatorErrors = await unknownOperatorErrors(db, document)
  if (operatorErrors.length) {
    return {
      rejection: annex7Response({
        statusCode: 'NOTOK',
        annexVIIDocumentNo: 'UNKNOWN',
        errors: operatorErrors
      })
    }
  }
  return { document }
}

export const diwassAnnexVii = soapRoute({
  path: '/diwass/annex-vii',
  operations: {
    // Announces the Annex VII: DIWASS shows a created document as Announced.
    CreateAnnex7DocumentTypeRequest: async (payload, request) => {
      const { document, rejection } = await checkedDocument(payload, request.db)
      if (rejection) {
        return rejection
      }
      const created = await createAnnexViiDocument(request.db, document)
      return annex7Response(created)
    },

    /*
    Replaces an announced Annex VII with the whole document again. Live
    DIWASS accepted changes to quantity, date, carrier, consignee, facility,
    waste code and import country, and still accepted an update after the
    Annex7Cancelled signal (12 October 2026), so neither is restricted here.
    An unknown number is NOTOK GREEN-LISTED-DOCUMENT-NOT-FOUND, echoing it.
    */
    UpdateAnnex7DocumentTypeRequest: async (payload, request) => {
      const annexVIIDocumentNo = textOf(payload.annexVIIDocumentNo)
      const { document, rejection } = await checkedDocument(payload, request.db)
      if (rejection) {
        return rejection
      }
      const updated = await updateAnnexViiDocument(
        request.db,
        annexVIIDocumentNo,
        document
      )
      return updated
        ? annex7Response({ statusCode: 'OK', annexVIIDocumentNo })
        : notFound(annexVIIDocumentNo)
    },

    /*
    A signal about an Annex VII, such as Annex7Cancelled. Live DIWASS answers
    with Annex7MovementDocumentTypeResponse. The code for an unknown number
    is assumed to match the update's; it has not been seen live.
    */
    CreateAnnex7SignalTypeRequest: async (payload, request) => {
      const annexVIIDocumentNo = textOf(payload.annexVIIDocumentNo)
      const recorded = await addAnnexViiSignal(
        request.db,
        annexVIIDocumentNo,
        textOf(payload.statement?.signal?.typeCode)
      )
      if (!recorded) {
        return notFound(annexVIIDocumentNo)
      }
      return `<ns4:Annex7MovementDocumentTypeResponse xmlns:ns4="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns5="http://ec.europa.eu/tracesnt/waste/notification/v1">
        <ns4:response>
          <ns5:statusCode>OK</ns5:statusCode>
        </ns4:response>
      </ns4:Annex7MovementDocumentTypeResponse>`
    }
  }
})
