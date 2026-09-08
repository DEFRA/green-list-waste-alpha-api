// Verbatim from the spec pack's own [Samples]/1. Ping/test_connection_request.xml
const pingRequestXml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
	xmlns:v3="http://ec.europa.eu/tracesnt/body/v3"
	xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4"
	xmlns:iam="http://ec.europa.eu/tracesnt/waste/iamalive">
   <soapenv:Header>
      <v3:BodyIdentity>
      </v3:BodyIdentity>
      <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      <iam:IamAliveRequest>
         <iam:query>Hello</iam:query>
      </iam:IamAliveRequest>
   </soapenv:Body>
</soapenv:Envelope>`

describe('#diwassPing', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('POST /diwass/ping echoes the query back inside IamAliveResponse', async () => {
    const { statusCode, payload } = await server.inject({
      method: 'POST',
      url: '/diwass/ping',
      headers: { 'content-type': 'text/xml' },
      payload: pingRequestXml
    })

    expect(statusCode).toBe(200)
    expect(payload).toContain('<ns3:IamAliveResponse')
    expect(payload).toContain('Query: Hello Status: we are alive')
  })
})
