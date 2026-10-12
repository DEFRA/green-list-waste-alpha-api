// Verbatim from the spec pack's [Samples]/4.Annex VII/Submit_annex7_request.xml -
// this is DIWASS's own sample payload, not one this emulator generated itself,
// so a pass here means the emulator can actually parse what DIWASS documents.
const submitAnnex7RequestXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:v11="http://ec.europa.eu/tracesnt/waste/model/v1" xmlns:v3="http://ec.europa.eu/tracesnt/body/v3" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4">
   <soapenv:Header>
      <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      <v1:CreateAnnex7DocumentTypeRequest>
         <v1:takeBackIndication>false</v1:takeBackIndication>
         <v1:illegalActivityIndication>false</v1:illegalActivityIndication>
         <v1:referenceAnnexVIIDocumentNo>GLW.BE260000000012i</v1:referenceAnnexVIIDocumentNo>
         <v1:shipmentArrangerIsAlsoProducerOrCollector>false</v1:shipmentArrangerIsAlsoProducerOrCollector>
         <v1:transportAnnouncement>
            <v11:arranger>
               <v11:PartyUUID>00000000-0000-0000-0000-000000000001</v11:PartyUUID>
               <v11:Contact>
                  <v11:Name>GREEN Test Arranger</v11:Name>
                  <v11:TelephoneCompleteNumber>123456</v11:TelephoneCompleteNumber>
                  <v11:EmailURI>asdf@asdf.com</v11:EmailURI>
               </v11:Contact>
               <v11:OperatorInternalID>237674</v11:OperatorInternalID>
            </v11:arranger>
            <v11:consignee>
               <v11:PartyUUID>00000000-0000-0000-0000-000000000002</v11:PartyUUID>
               <v11:Contact>
                  <v11:Name>Waste DK Consignee</v11:Name>
                  <v11:TelephoneCompleteNumber>12345</v11:TelephoneCompleteNumber>
                  <v11:EmailURI>asdf@asdf.com</v11:EmailURI>
               </v11:Contact>
               <v11:OperatorInternalID>237238</v11:OperatorInternalID>
            </v11:consignee>
            <v11:actualQuantity>
               <v11:MassMeasure>
                  <v11:tonnes>4500.0</v11:tonnes>
               </v11:MassMeasure>
               <v11:VolumeMeasure>
                  <v11:volume>250.00</v11:volume>
               </v11:VolumeMeasure>
            </v11:actualQuantity>
            <v11:actualDateOfShipment>2025-06-23</v11:actualDateOfShipment>
            <v11:containerIdentification>45A</v11:containerIdentification>
            <v11:shipmentOriginLocation>
               <v11:AddressDetails>Test Address</v11:AddressDetails>
            </v11:shipmentOriginLocation>
            <v11:shipmentLocationResponsiblePerson>
               <v11:Name>ShipmentLocationResponsiblePerson</v11:Name>
               <v11:TelephoneCompleteNumber>56789</v11:TelephoneCompleteNumber>
               <v11:EmailURI>asdf@asdf.com</v11:EmailURI>
            </v11:shipmentLocationResponsiblePerson>
            <v11:carrier>
               <v11:PartyUUID>00000000-0000-0000-0000-000000000004</v11:PartyUUID>
               <v11:Contact>
                  <v11:Name>WASTE FR Test Carrier 1</v11:Name>
                  <v11:TelephoneCompleteNumber>56789</v11:TelephoneCompleteNumber>
                  <v11:EmailURI>asdf@asdf.com</v11:EmailURI>
               </v11:Contact>
               <v11:OperatorInternalID>235939</v11:OperatorInternalID>
               <v11:MeansOfTransportCode>A</v11:MeansOfTransportCode>
            </v11:carrier>
            <v11:wasteProducer>
               <v11:PartyUUID>00000000-0000-0000-0000-000000000003</v11:PartyUUID>
               <v11:Contact>
                  <v11:Name>WASTE BE Test Producer</v11:Name>
                  <v11:TelephoneCompleteNumber>56789</v11:TelephoneCompleteNumber>
                  <v11:EmailURI>asdf@asdf.com</v11:EmailURI>
               </v11:Contact>
               <v11:OperatorInternalID>237256</v11:OperatorInternalID>
            </v11:wasteProducer>
            <v11:recoveryLaboratoryFacility>
               <v11:PartyUUID>00000000-0000-0000-0000-000000000005</v11:PartyUUID>
               <v11:Contact>
                  <v11:Name>WASTE DE Tets Facility 1</v11:Name>
                  <v11:TelephoneCompleteNumber>56789</v11:TelephoneCompleteNumber>
                  <v11:EmailURI>test@gmail.com</v11:EmailURI>
               </v11:Contact>
               <v11:OperatorInternalID>235977</v11:OperatorInternalID>
               <v11:operationalIndicators>
                  <v11:InterimFacility>true</v11:InterimFacility>
                  <v11:NextSubsequentInterimOrNonInterimFacilityInAnotherCountry>false</v11:NextSubsequentInterimOrNonInterimFacilityInAnotherCountry>
                  <v11:NextSubsequentInterimOrNonInterimFacilityInSameCountry>false</v11:NextSubsequentInterimOrNonInterimFacilityInSameCountry>
               </v11:operationalIndicators>
               <v11:wasteFacilityNameConfidential>false</v11:wasteFacilityNameConfidential>
               <v11:confidentialityLegalExplanation>
                  <v11:Description languageID="en">Test description confidentialityLegalExplanation</v11:Description>
               </v11:confidentialityLegalExplanation>
               <v11:facilityLaboratoryTypeCode>R</v11:facilityLaboratoryTypeCode>
            </v11:recoveryLaboratoryFacility>
            <v11:recoveryDisposalTypeCode>R1</v11:recoveryDisposalTypeCode>
            <v11:usualDescriptionOfTheWaste>
               <v11:Description languageID="en">usualDescriptionOfTheWaste</v11:Description>
            </v11:usualDescriptionOfTheWaste>
            <v11:wasteClassification>
               <v11:WasteTypeCode listID="BASEL">European Waste List</v11:WasteTypeCode>
            </v11:wasteClassification>
            <v11:commodityCode>2</v11:commodityCode>
            <v11:exportCountry>
               <v11:countryID>056</v11:countryID>
            </v11:exportCountry>
            <v11:importCountry>
               <v11:countryID>276</v11:countryID>
            </v11:importCountry>
            <v11:transitCountry>
               <v11:countryID>250</v11:countryID>
            </v11:transitCountry>
         </v1:transportAnnouncement>
         <v1:declarationArranger>
            <v11:PartyUUID>00000000-0000-0000-0000-000000000001</v11:PartyUUID>
            <v11:Signature>
               <v11:name>DeclarationAnnex7Arranger</v11:name>
               <v11:organizationRole>DeclarationAnnex7ArrangerRole</v11:organizationRole>
               <v11:timestamp>2025-12-26T08:30:00.000+02:00</v11:timestamp>
               <v11:signature>DeclarationAnnex7Arranger</v11:signature>
            </v11:Signature>
         </v1:declarationArranger>
         <v1:declarationProducer>
            <v11:PartyUUID>00000000-0000-0000-0000-000000000003</v11:PartyUUID>
            <v11:Signature>
               <v11:name>DeclarationAnnex7Producer</v11:name>
               <v11:organizationRole>DeclarationAnnex7ProducerRole</v11:organizationRole>
               <v11:timestamp>2025-12-26T08:30:00.000+02:00</v11:timestamp>
               <v11:signature>DeclarationAnnex7Producer</v11:signature>
            </v11:Signature>
         </v1:declarationProducer>
      </v1:CreateAnnex7DocumentTypeRequest>
   </soapenv:Body>
</soapenv:Envelope>`

describe('#diwassAnnexVii', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test("POST /diwass/annex-vii accepts DIWASS's own sample request and assigns a document number", async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/annex-vii',
      headers: { 'content-type': 'text/xml' },
      payload: submitAnnex7RequestXml
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<ns4:Annex7DocumentTypeResponse')
    expect(payload).toContain('<ns5:statusCode>OK</ns5:statusCode>')
    expect(payload).toMatch(
      /<ns4:annexVIIDocumentNo>GLW\.GB\d+i<\/ns4:annexVIIDocumentNo>/
    )
  })

  function submit(xml) {
    return server.inject({
      method: 'POST',
      url: '/diwass/annex-vii',
      headers: { 'content-type': 'text/xml' },
      payload: xml
    })
  }

  test('POST /diwass/annex-vii rejects a request missing a carrier with a schema SOAP fault, as live DIWASS does', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(/<v11:carrier>[\s\S]*?<\/v11:carrier>/, '')
    )

    expect(statusCode).toBe(500)
    expect(payload).toContain('<soapenv:Fault>')
    expect(payload).toContain('cvc-complex-type.2.4.a')
    expect(payload).toContain(':carrier}')
  })

  test('POST /diwass/annex-vii rejects a missing waste classification with a schema SOAP fault', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        /<v11:wasteClassification>[\s\S]*?<\/v11:wasteClassification>/,
        ''
      )
    )

    expect(statusCode).toBe(500)
    expect(payload).toContain(':wasteClassification}')
  })

  test('POST /diwass/annex-vii rejects an alpha-2 country code with a schema SOAP fault', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        /(<v11:exportCountry>\s*<v11:countryID>)\d+/,
        '$1GB'
      )
    )

    expect(statusCode).toBe(500)
    expect(payload).toContain('is not facet-valid')
    expect(payload).toContain('CountryCodeType')
  })

  test('POST /diwass/annex-vii rejects malformed XML with a SOAP fault', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        '<v1:illegalActivityIndication>false</v1:illegalActivityIndication>',
        '<v1:illegalActivityIndication>false'
      )
    )

    expect(statusCode).toBe(500)
    expect(payload).toContain('Failed to copy a message')
  })

  test('POST /diwass/annex-vii answers a missing mass and volume with NOTOK, not a fault', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        /<v11:actualQuantity>[\s\S]*?<\/v11:actualQuantity>/,
        '<v11:actualQuantity></v11:actualQuantity>'
      )
    )

    expect(statusCode).toBe(200)
    expect(payload).toContain('<ns5:statusCode>NOTOK</ns5:statusCode>')
    expect(payload).toContain('<ns5:code>MASS-VOLUME-NOT-FOUND</ns5:code>')
    expect(payload).toContain(
      '<ns4:annexVIIDocumentNo>UNKNOWN</ns4:annexVIIDocumentNo>'
    )
  })

  test('POST /diwass/annex-vii answers an unknown operator with NOTOK, as live DIWASS does', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        /(<v11:consignee>[\s\S]*?<v11:OperatorInternalID>)\d+/,
        '$1999999'
      )
    )

    expect(statusCode).toBe(200)
    expect(payload).toContain('<ns5:statusCode>NOTOK</ns5:statusCode>')
    expect(payload).toContain(
      '<ns5:code>CONSIGNEE-OPERATOR-IS-REQUIRED</ns5:code>'
    )
    expect(payload).toContain('<ns5:code>OPERATOR-ID-NOT-FOUND</ns5:code>')
    expect(payload).toContain('Operator 999999 not found')
  })

  test('POST /diwass/annex-vii accepts a missing waste producer, as live DIWASS does', async () => {
    const { statusCode, payload } = await submit(
      submitAnnex7RequestXml.replace(
        /<v1:declarationProducer>[\s\S]*?<\/v1:declarationProducer>/,
        ''
      )
    )

    expect(statusCode).toBe(200)
    expect(payload).toContain('<ns5:statusCode>OK</ns5:statusCode>')
  })

  test('POST /diwass/annex-vii updates an announced document, and refuses an unknown one', async () => {
    const created = await submit(submitAnnex7RequestXml)
    const documentNo = created.payload.match(
      /<ns4:annexVIIDocumentNo>([^<]+)</
    )[1]
    const asUpdate = (number) =>
      submitAnnex7RequestXml
        .replace(
          /CreateAnnex7DocumentTypeRequest/g,
          'UpdateAnnex7DocumentTypeRequest'
        )
        .replace(
          '<v1:UpdateAnnex7DocumentTypeRequest>',
          `<v1:UpdateAnnex7DocumentTypeRequest><v1:annexVIIDocumentNo>${number}</v1:annexVIIDocumentNo>`
        )

    const updated = await submit(asUpdate(documentNo))
    expect(updated.statusCode).toBe(200)
    expect(updated.payload).toContain('<ns5:statusCode>OK</ns5:statusCode>')
    expect(updated.payload).toContain(documentNo)

    const unknown = await submit(asUpdate('GLW.GB269999999999i'))
    expect(unknown.payload).toContain('<ns5:statusCode>NOTOK</ns5:statusCode>')
    expect(unknown.payload).toContain('GREEN-LISTED-DOCUMENT-NOT-FOUND')
  })

  test('POST /diwass/annex-vii accepts an Annex7Cancelled signal with a movement response', async () => {
    const created = await submit(submitAnnex7RequestXml)
    const documentNo = created.payload.match(
      /<ns4:annexVIIDocumentNo>([^<]+)</
    )[1]
    const signal = (number) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:n="http://ec.europa.eu/tracesnt/waste/notification/v1">
  <soapenv:Header/>
  <soapenv:Body>
    <v1:CreateAnnex7SignalTypeRequest>
      <v1:annexVIIDocumentNo>${number}</v1:annexVIIDocumentNo>
      <v1:statement><n:signal><n:typeCode>Annex7Cancelled</n:typeCode></n:signal></v1:statement>
    </v1:CreateAnnex7SignalTypeRequest>
  </soapenv:Body>
</soapenv:Envelope>`

    const cancelled = await submit(signal(documentNo))
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.payload).toContain('Annex7MovementDocumentTypeResponse')
    expect(cancelled.payload).toContain('<ns5:statusCode>OK</ns5:statusCode>')

    const unknown = await submit(signal('GLW.GB269999999999i'))
    expect(unknown.payload).toContain('GREEN-LISTED-DOCUMENT-NOT-FOUND')
  })
})
