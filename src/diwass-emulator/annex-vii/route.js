import { soapRoute } from '#/diwass-emulator/soapRoute.js'
import { annex7DocumentFromXml } from '#/diwass-emulator/annex-vii/mapping.js'
import { createAnnexViiDocument } from '#/diwass-emulator/annex-vii/store.js'

export const diwassAnnexVii = soapRoute({
  path: '/diwass/annex-vii',
  operations: {
    CreateAnnex7DocumentTypeRequest: async (payload, request) => {
      const document = annex7DocumentFromXml(payload)
      const created = await createAnnexViiDocument(request.db, document)

      return `<ns4:Annex7DocumentTypeResponse xmlns:ns4="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns5="http://ec.europa.eu/tracesnt/waste/notification/v1">
        <ns4:response>
          <ns5:statusCode>${created.statusCode}</ns5:statusCode>
        </ns4:response>
        <ns4:annexVIIDocumentNo>${created.annexVIIDocumentNo}</ns4:annexVIIDocumentNo>
      </ns4:Annex7DocumentTypeResponse>`
    }
  }
})
