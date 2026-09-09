// Adapted from the spec pack's [Samples]/2. Operators/create_operator 3.xml
const createOperatorXml = (eori) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:oas="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2" xmlns:v1="http://ec.europa.eu/tracesnt/directory/operator/base/v1">
   <soapenv:Header>
      <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      <v2:CreateOperatorRequest>
         <v2:Operator>
            <v1:Name>Green List Exports Ltd</v1:Name>
            <v1:OperatorAddress main="true">
               <v1:Address>
                  <v1:Street>12 Harbour Road</v1:Street>
                  <v1:City>
                     <v1:Name>Southampton</v1:Name>
                     <v1:PostalCode>SO14 3XB</v1:PostalCode>
                     <v1:CountryID>GB</v1:CountryID>
                  </v1:City>
               </v1:Address>
            </v1:OperatorAddress>
            <v1:OperatorContactDetail>
               <v1:ContactDetail type="phone">+441234567890</v1:ContactDetail>
            </v1:OperatorContactDetail>
            <v1:OperatorContactDetail>
               <v1:ContactDetail type="contact_person_name">Jane Smith</v1:ContactDetail>
            </v1:OperatorContactDetail>
            <v1:OperatorContactDetail>
               <v1:ContactDetail type="email">jane.smith@example.co.uk</v1:ContactDetail>
            </v1:OperatorContactDetail>
            <v1:Identifier type="eori" name="EORI" main="true">${eori}</v1:Identifier>
            <v1:Activity>
               <v1:ActivityType>
                  <v1:Chapter name="Waste Shipment Regulation">wsr</v1:Chapter>
                  <v1:Section name="Waste Shipment Regulation">WSR</v1:Section>
                  <v1:Type name="WSR Operator">waste_operator</v1:Type>
               </v1:ActivityType>
               <v1:ResponsibleAuthorityActivityCode>DE002</v1:ResponsibleAuthorityActivityCode>
            </v1:Activity>
         </v2:Operator>
      </v2:CreateOperatorRequest>
   </soapenv:Body>
</soapenv:Envelope>`

const findOperatorXml = (eori) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2" xmlns:v1="http://ec.europa.eu/tracesnt/directory/operator/base/v1">
   <soapenv:Header>
      <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      <v2:FindOperatorRequest pageSize="100" offset="0">
         <v1:CountryID>GB</v1:CountryID>
         <v1:Identifier type="eori" name="EORI">${eori}</v1:Identifier>
      </v2:FindOperatorRequest>
   </soapenv:Body>
</soapenv:Envelope>`

const getOperatorXml = (
  operatorInternalId
) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2" xmlns:v1="http://ec.europa.eu/tracesnt/directory/operator/base/v1">
   <soapenv:Header>
      <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      <v2:GetOperatorRequest>
         <v1:ID>${operatorInternalId}</v1:ID>
      </v2:GetOperatorRequest>
   </soapenv:Body>
</soapenv:Envelope>`

const approveOperatorXml = (
  operatorInternalId
) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
   <soapenv:Header><v4:WebServiceClientId>wsr-system</v4:WebServiceClientId></soapenv:Header>
   <soapenv:Body>
      <v2:ApproveOperatorRequest>
         <v2:OperatorInternalID>${operatorInternalId}</v2:OperatorInternalID>
      </v2:ApproveOperatorRequest>
   </soapenv:Body>
</soapenv:Envelope>`

describe('#diwassOperators', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('POST /diwass/operators creates an operator with status New', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000001000')
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:CreateOperatorResponse')
    expect(payload).toMatch(
      /<v2:OperatorInternalID>\d+<\/v2:OperatorInternalID>/
    )
  })

  test('POST /diwass/operators rejects a duplicate EORI with a SOAP fault', async () => {
    await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000002000')
    })

    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000002000')
    })

    expect(statusCode).toBe(409)
    expect(payload).toContain('<soapenv:Fault>')
    expect(payload).toContain('already registered')
  })

  test('POST /diwass/operators finds a previously created operator by EORI', async () => {
    await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000003000')
    })

    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: findOperatorXml('GB999000003000')
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:FindOperatorResponse')
    expect(payload).toContain('Green List Exports Ltd')
    expect(payload).toContain('GB999000003000')
  })

  test('an approved operator moves from New to Valid', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000004000')
    })
    const [, operatorInternalId] = created.payload.match(
      /<v2:OperatorInternalID>(\d+)<\/v2:OperatorInternalID>/
    )

    const approveXml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
      <soapenv:Header><v4:WebServiceClientId>wsr-system</v4:WebServiceClientId></soapenv:Header>
      <soapenv:Body>
        <v2:ApproveOperatorRequest>
          <v2:OperatorInternalID>${operatorInternalId}</v2:OperatorInternalID>
        </v2:ApproveOperatorRequest>
      </soapenv:Body>
    </soapenv:Envelope>`

    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: approveXml
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:Status>Valid</v2:Status>')
  })

  test('POST /diwass/operators returns no matches when checking for an operator that was never registered', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: findOperatorXml('GB999000009999')
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:FindOperatorResponse')
    expect(payload).not.toContain('<v2:Operator ')
    expect(payload).not.toContain('GB999000009999')
  })

  test('POST /diwass/operators gets a previously created operator by OperatorInternalID', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: createOperatorXml('GB999000005000')
    })
    const [, operatorInternalId] = created.payload.match(
      /<v2:OperatorInternalID>(\d+)<\/v2:OperatorInternalID>/
    )

    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: getOperatorXml(operatorInternalId)
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:GetOperatorResponse')
    expect(payload).toContain('GB999000005000')
  })

  test('POST /diwass/operators returns no matches when getting an unknown OperatorInternalID', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: getOperatorXml('999999999')
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<v2:GetOperatorResponse')
    expect(payload).not.toContain('<v2:Operator ')
  })

  test('POST /diwass/operators rejects approving an operator that does not exist with a 404 SOAP fault', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: approveOperatorXml('999999999')
    })

    expect(statusCode).toBe(404)
    expect(payload).toContain('<soapenv:Fault>')
    expect(payload).toContain(
      'No operator found with OperatorInternalID 999999999'
    )
  })

  test('POST /diwass/operators rejects an operation it does not implement with a 400 SOAP fault', async () => {
    const deleteOperatorXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
   <soapenv:Header><v4:WebServiceClientId>wsr-system</v4:WebServiceClientId></soapenv:Header>
   <soapenv:Body>
      <v2:DeleteOperatorRequest>
         <v2:OperatorInternalID>238897</v2:OperatorInternalID>
      </v2:DeleteOperatorRequest>
   </soapenv:Body>
</soapenv:Envelope>`

    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: deleteOperatorXml
    })

    expect(statusCode).toBe(400)
    expect(payload).toContain('<soapenv:Fault>')
    expect(payload).toContain(
      'Unsupported operation &quot;DeleteOperatorRequest&quot;'
    )
  })

  test('POST /diwass/operators rejects a payload that is not a SOAP envelope with a 400 SOAP fault', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/operators',
      headers: { 'content-type': 'text/xml' },
      payload: '<NotSoap>hello</NotSoap>'
    })

    expect(statusCode).toBe(400)
    expect(payload).toContain('<soapenv:Fault>')
    expect(payload).toContain('Not a SOAP envelope')
  })
})
