// An ephemeral port so this file's server can really listen - the outbound
// DIWASS client self-references request.server.info.uri, which only
// resolves to a reachable address once the server has actually started.
process.env.PORT = '0'

const validPayload = {
  annexVIIDocumentNo: 'AX-2024-DIWASS-001',
  shipmentArranger: {
    operatorId: '237674',
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    contactDetails: {
      contactPerson: 'Smith & Sons',
      phone: '+1234567890',
      email: 'john.doe@somecompany.co.uk'
    },
    isAlsoWasteProducer: true
  },
  importerConsignee: {
    operatorId: '237238',
    uuid: '550e8400-e29b-41d4-a716-446655440001',
    contactDetails: {
      contactPerson: 'Jane Smith',
      phone: '+0987654321',
      email: 'jane.smith@somecompany.co.uk'
    }
  },
  shipment: {
    actualQuantity: { tonnes: 100, metersCubed: null },
    actualDateOfShipment: '2024-06-01',
    createdDueToTakeBack: false,
    createdDueToIllegalActivity: false,
    commodityCodes: ['4707 10 00'],
    shipmentOriginLocation: { addressDetails: '1 Mill Lane, Leeds, LS1 1AA' },
    shipmentLocationResponsiblePerson: {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john.doe@somecompany.co.uk'
    }
  },
  carriers: [
    {
      operatorId: '235939',
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      contactDetails: {
        contactPerson: 'Alice Johnson',
        phone: '+1122334455',
        email: 'alice.johnson@carrierone.co.uk'
      },
      meansOfTransportCode: 'R',
      transferDate: '2024-06-02',
      declaration: {
        authenticatedBy: {
          name: 'Alice Johnson',
          email: 'alice.johnson@carrierone.co.uk',
          roleInOrganisation: 'Logistics Manager',
          authenticationTimestamp: '2024-06-02T08:00:00Z',
          uuid: '550e8400-e29b-41d4-a716-446655440010'
        }
      }
    }
  ],
  recoveryFacility: {
    operatorId: '235977',
    uuid: '550e8400-e29b-41d4-a716-446655440005',
    facilityType: 'recoveryFacility',
    isInterimFacility: false,
    contactDetails: {
      contactPerson: 'Michael Brown',
      phone: '+0987654323',
      email: 'michael.brown@recoveryfacility.co.uk'
    }
  },
  recoveryOperation: { rCodeDCode: 'R1' },
  usualDescriptionOfWaste: 'Mixed paper <and> "board" offcuts',
  wasteIdentification: { baselAnnexIX: 'B1010', ecListOfWastes: '150101' },
  countriesStatesConcerned: {
    exportDispatchCountry: 'GB',
    importDestinationCountry: 'DE',
    transitCountries: ['FR', 'BE']
  },
  declarationOfShipmentArranger: {
    authenticatedBy: {
      name: 'John Doe',
      email: 'john.doe@somecompany.co.uk',
      roleInOrganisation: 'Director',
      authenticationTimestamp: '2024-06-01T11:00:00Z',
      uuid: '550e8400-e29b-41d4-a716-446655440013'
    }
  }
}

describe('#DiwassAnnexViiClient (end-to-end via the bundled emulator)', () => {
  let server

  beforeAll(async () => {
    // The repo's global test setup (.vite/setup-files.js) replaces fetch
    // with vitest-fetch-mock for every test file, which would swallow both
    // this test's own request and the DIWASS client's inner one. This file
    // is specifically testing that a real HTTP round trip works end to end,
    // so it opts back out of the mock.
    global.fetchMock.disableMocks()

    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.start()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
    global.fetchMock.enableMocks()
  })

  test('POST /annexvii submits a real SOAP payload to the emulator and gets a DIWASS document number back', async () => {
    // server.info.uri reflects the 0.0.0.0 bind address, not a connectable
    // destination - loop back over localhost instead, same as the route does.
    const response = await fetch(
      `http://127.0.0.1:${server.info.port}/annexvii`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload)
      }
    )
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.annexVIIDocumentNo).toBe(validPayload.annexVIIDocumentNo)
    expect(result.diwass.status).toBe('OK')
    expect(result.diwass.annexViiDocumentNo).toMatch(/^GLW\.GB\d+i$/)
  })
})

describe('#DiwassAnnexViiClient (live DIWASS settings)', () => {
  // Imported here, not at the top, so PORT is set before config loads.
  let config
  let submitAnnexViiToDiwass

  beforeAll(async () => {
    ;({ config } = await import('#/config.js'))
    ;({ submitAnnexViiToDiwass } =
      await import('#/services/DiwassAnnexViiClient.js'))
  })

  // Trimmed from the live acceptance environment's response to the first
  // accepted Annex VII (8 October 2026).
  const liveOkResponse = `<?xml version='1.0' encoding='UTF-8'?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Header><Message xmlns="http://ec.europa.eu/sanco/tracesnt/message/v1" severity="debugging"><ID>WS_REQUEST_ID</ID><Message>48eb8014-ef13-4a71-8c3a-a357f28f11d6</Message></Message></S:Header><S:Body><ns3:Annex7DocumentTypeResponse xmlns:ns3="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns4="http://ec.europa.eu/tracesnt/waste/notification/v1"><ns3:response><ns4:statusCode>OK</ns4:statusCode></ns3:response><ns3:annexVIIDocumentNo>GLW.GB260000001490i</ns3:annexVIIDocumentNo></ns3:Annex7DocumentTypeResponse></S:Body></S:Envelope>`

  beforeEach(() => {
    config.set('diwass.baseUrl', 'https://diwass.example/tracesnt-alpha/ws/')
    config.set('diwass.username', 'n00test1')
    config.set('diwass.authKey', 'test-key')
  })

  afterEach(() => {
    config.set('diwass.baseUrl', null)
    config.set('diwass.username', null)
    config.set('diwass.authKey', null)
  })

  test('Should post to the WSDL service path with WS-Security, acting as the arranger', async () => {
    const fetchImpl = vi.fn(async () => new Response(liveOkResponse))

    const result = await submitAnnexViiToDiwass(validPayload, { fetchImpl })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://diwass.example/tracesnt-alpha/ws/WasteAnnex7V1')
    expect(init.body).toContain('<wsse:Username>n00test1</wsse:Username>')
    expect(init.body).toContain(
      `<v3:OperatorAccessIdentifier>${validPayload.shipmentArranger.operatorId}</v3:OperatorAccessIdentifier>`
    )
    expect(init.body).not.toContain('test-key')
    expect(result).toEqual({
      status: 'OK',
      annexViiDocumentNo: 'GLW.GB260000001490i',
      requestId: '48eb8014-ef13-4a71-8c3a-a357f28f11d6',
      errors: [],
      target: 'diwass'
    })
  })

  test('Should return a NOTOK with DIWASS error codes rather than throw', async () => {
    // Shape of the live response to a rejected customs code (8 October 2026).
    const notOk = `<?xml version='1.0' encoding='UTF-8'?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Header><Message xmlns="http://ec.europa.eu/sanco/tracesnt/message/v1" severity="debugging"><ID>WS_REQUEST_ID</ID><Message>11111111-2222-3333-4444-555555555555</Message></Message></S:Header><S:Body><ns3:Annex7DocumentTypeResponse xmlns:ns3="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns4="http://ec.europa.eu/tracesnt/waste/notification/v1"><ns3:response><ns4:statusCode>NOTOK</ns4:statusCode><ns4:errors><ns4:code>WASTE-CUSTOMS-INVALID-CODE</ns4:code><ns4:description languageID="en">[en] waste.customs.invalid.code</ns4:description></ns4:errors></ns3:response><ns3:annexVIIDocumentNo>UNKNOWN</ns3:annexVIIDocumentNo></ns3:Annex7DocumentTypeResponse></S:Body></S:Envelope>`
    const fetchImpl = vi.fn(async () => new Response(notOk))

    const result = await submitAnnexViiToDiwass(validPayload, { fetchImpl })

    expect(result).toEqual({
      status: 'NOTOK',
      annexViiDocumentNo: null,
      requestId: '11111111-2222-3333-4444-555555555555',
      errors: [
        {
          code: 'WASTE-CUSTOMS-INVALID-CODE',
          description: '[en] waste.customs.invalid.code'
        }
      ],
      target: 'diwass'
    })
  })

  test('Should go to the emulator route when no credentials are set', async () => {
    config.set('diwass.authKey', null)
    const fetchImpl = vi.fn(async () => new Response(liveOkResponse))

    await submitAnnexViiToDiwass(validPayload, { fetchImpl })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(
      'https://diwass.example/tracesnt-alpha/ws/diwass/annex-vii'
    )
    expect(init.body).not.toContain('wsse:Security')
  })
})
