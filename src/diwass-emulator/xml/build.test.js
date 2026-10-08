import {
  buildSecurityHeader,
  buildSoapRequest
} from '#/diwass-emulator/xml/build.js'

const namespaces = {
  v3: 'http://ec.europa.eu/tracesnt/body/v3',
  v4: 'http://ec.europa.eu/sanco/tracesnt/base/v4'
}

describe('#buildSecurityHeader', () => {
  const header = buildSecurityHeader({
    username: 'n00test1',
    authKey: 'test-key',
    now: new Date('2026-10-08T21:01:27.688Z'),
    nonce: Buffer.from([...Array(16).keys()])
  })

  test('Should digest nonce + Created + key the way DIWASS checks it', () => {
    // Expected value computed independently with the Python test script's
    // algorithm (tools/diwass in green-list-waste-alpha), which DIWASS accepts.
    expect(header).toContain('>0LrdSOv+OXbCeV+aO1EmamS0PIY=</wsse:Password>')
    expect(header).toContain(
      '<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">AAECAwQFBgcICQoLDA0ODw==</wsse:Nonce>'
    )
    expect(header).toContain('<wsse:Username>n00test1</wsse:Username>')
  })

  test('Should expire the timestamp within a minute', () => {
    expect(header).toContain(
      '<wsu:Created>2026-10-08T21:01:27.688Z</wsu:Created><wsu:Expires>2026-10-08T21:02:22.688Z</wsu:Expires>'
    )
  })
})

describe('#buildSoapRequest', () => {
  test('Should leave out WS-Security and BodyIdentity for the emulator', () => {
    const xml = buildSoapRequest('<x/>', {
      namespaces,
      webServiceClientId: 'wsr-system'
    })
    expect(xml).not.toContain('wsse:Security')
    expect(xml).not.toContain('BodyIdentity')
    expect(xml).toContain(
      '<v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>'
    )
  })

  test('Should send WS-Security, then the operator identity, for live DIWASS', () => {
    const xml = buildSoapRequest('<x/>', {
      namespaces,
      webServiceClientId: 'wsr-system',
      security: { username: 'n00test1', authKey: 'test-key' },
      operatorAccessId: '248482'
    })
    expect(xml.indexOf('wsse:Security')).toBeLessThan(
      xml.indexOf('v3:BodyIdentity')
    )
    expect(xml).toContain(
      '<v3:BodyIdentity><v3:OperatorAccessIdentifier>248482</v3:OperatorAccessIdentifier></v3:BodyIdentity>'
    )
    expect(xml).not.toContain('test-key')
  })
})
