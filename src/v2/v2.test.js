const party = (roles, name, extra = {}) => ({
  roles,
  name,
  identifiers: [{ scheme: 'EORI', value: 'GB123456789000', main: true }],
  contact: {
    email: `${name.toLowerCase().replaceAll(' ', '.')}@example.co.uk`,
    phone: '+441170000000'
  },
  address: {
    fullAddress: '1 Dock Road, Bristol',
    postcode: 'BS1 4XX',
    countryCode: 'GB'
  },
  ...extra
})

const german = (roles, name) =>
  party(roles, name, {
    address: {
      fullAddress: 'Hafenstrasse 4, Hamburg',
      postcode: '20457',
      countryCode: 'DE'
    }
  })

const exportBody = (extra = {}) => ({
  originCountry: 'GB',
  destinationCountry: 'DE',
  transitCountries: ['NL'],
  parties: [
    party(['ARRANGER', 'PRODUCER'], 'Example Exporter Ltd', {
      arrangerType: 'OTHER'
    }),
    german(['RECEIVER'], 'Example Recovery GmbH'),
    german(['FACILITY'], 'Example Recovery GmbH Plant')
  ],
  legs: [
    {
      order: 1,
      carrier: party(['CARRIER'], 'Example Haulage Ltd'),
      meansOfTransport: 'ROAD'
    }
  ],
  wasteItems: [
    {
      classification: {
        wasteDescription: 'Baled waste paper',
        codes: [
          { scheme: 'EWC', value: '15 01 01' },
          { scheme: 'BASEL_ANNEX_IX', value: 'B3020' }
        ]
      },
      quantity: { tonnes: 24, isEstimate: true },
      treatments: [{ code: 'R3' }]
    }
  ],
  ...extra
})

const declaredBy = {
  name: 'Alice Johnson',
  email: 'alice.johnson@example.co.uk',
  roleInOrganisation: 'Logistics Manager',
  timestamp: '2026-12-01T08:25:00Z',
  uuid: '550e8400-e29b-41d4-a716-4466554400aa'
}

describe('#v2 common model endpoints', () => {
  let server
  const call = (method, url, payload, headers) =>
    server.inject({ method, url, payload, headers })

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  async function arrange(extra) {
    const res = await call('POST', '/v2/movement', exportBody(extra))
    expect(res.statusCode, JSON.stringify(res.result)).toBe(201)
    return res.result
  }

  test('runs the whole export: arrange, collect, deliver, receive, facility receipt', async () => {
    const movement = await arrange()
    expect(movement).toMatchObject({
      kind: 'EXPORT',
      status: 'ARRANGED',
      revision: 1,
      externalSubmissions: [{ system: 'DIWASS', status: 'NOT_ENABLED' }]
    })
    const { movementId } = movement

    const collected = await call('POST', '/v2/collection', {
      movementId,
      legOrder: 1,
      collectedAt: '2026-12-01T08:30:00Z',
      quantity: { tonnes: 23.4 },
      declaredBy
    })
    expect(collected.statusCode).toBe(201)
    expect(collected.result.status).toBe('COLLECTED')
    expect(collected.result.revision).toBe(2)

    const delivered = await call('POST', '/v2/delivery', {
      movementIds: [movementId],
      deliveredAt: '2026-12-03T10:00:00Z',
      deliverySite: {
        name: 'Example Recovery GmbH',
        address: {
          fullAddress: 'Hafenstrasse 4, Hamburg',
          postcode: '20457',
          countryCode: 'DE'
        }
      }
    })
    expect(delivered.statusCode).toBe(201)
    const { deliveryId } = delivered.result.deliveries[0]
    expect(delivered.result.movements[0].status).toBe('DELIVERED')

    const received = await call('POST', '/v2/receipt', {
      deliveryId,
      receivedBy: 'RECEIVER',
      receivedAt: '2026-12-03T10:20:00Z',
      outcome: { status: 'ACCEPTED', acceptedQuantity: { tonnes: 23.4 } }
    })
    expect(received.statusCode).toBe(201)
    expect(received.result.movements[0].status).toBe('RECEIVED')
    expect(received.result.warnings).toBeUndefined()

    const facility = await call('POST', '/v2/receipt', {
      deliveryId,
      receivedBy: 'FACILITY',
      receivedAt: '2026-12-03T14:00:00Z',
      outcome: {
        status: 'PART_ACCEPTED',
        acceptedQuantity: { tonnes: 23 },
        rejectedQuantity: { tonnes: 0.4 },
        reason: { languageCode: 'en', value: 'Contaminated bales removed' }
      },
      treatments: [{ code: 'R3', weight: { tonnes: 23 } }]
    })
    expect(facility.statusCode).toBe(201)

    const read = await call('GET', `/v2/movement/${movementId}`)
    expect(read.statusCode).toBe(200)
    expect(read.result.status).toBe('RECEIVED')
    expect(read.result.facts.map((f) => f.type)).toEqual([
      'ARRANGED',
      'COLLECTED',
      'DELIVERED',
      'RECEIVED',
      'RECEIVED'
    ])
  })

  test('reports a quantity that differs from what was collected, without refusing it', async () => {
    const { movementId } = await arrange()
    await call('POST', '/v2/collection', {
      movementId,
      legOrder: 1,
      collectedAt: '2026-12-01T08:30:00Z',
      quantity: { tonnes: 20 }
    })
    const delivered = await call('POST', '/v2/delivery', {
      movementIds: [movementId],
      deliveredAt: '2026-12-02T10:00:00Z',
      deliverySite: {
        address: { fullAddress: 'x', postcode: '20457', countryCode: 'DE' }
      }
    })
    const received = await call('POST', '/v2/receipt', {
      deliveryId: delivered.result.deliveries[0].deliveryId,
      receivedBy: 'RECEIVER',
      receivedAt: '2026-12-02T11:00:00Z',
      outcome: { status: 'ACCEPTED', acceptedQuantity: { tonnes: 19 } }
    })
    expect(received.statusCode).toBe(201)
    expect(received.result.warnings[0].code).toBe('QUANTITY_DIFFERS')
  })

  describe('POST /v2/movement', () => {
    test('lists every shape problem in details', async () => {
      const res = await call('POST', '/v2/movement', { originCountry: 'GB' })
      expect(res.statusCode).toBe(400)
      expect(res.result.details.length).toBeGreaterThan(1)
      expect(res.result.details[0]).toHaveProperty('path')
    })

    test('requires tonnes or metersCubed, and accepts either', async () => {
      const body = exportBody()
      body.wasteItems[0].quantity = { isEstimate: true }
      expect((await call('POST', '/v2/movement', body)).statusCode).toBe(400)
      body.wasteItems[0].quantity = { metersCubed: 30 }
      expect((await call('POST', '/v2/movement', body)).statusCode).toBe(201)
    })

    test('rejects a waste code that is not in its list with 400', async () => {
      const body = exportBody()
      body.wasteItems[0].classification.codes = [
        { scheme: 'EWC', value: '99 99 99' }
      ]
      const res = await call('POST', '/v2/movement', body)
      expect(res.statusCode).toBe(400)
      expect(res.result.details[0].path).toContain('codes[0]')
    })

    test('refuses an import with 422', async () => {
      const res = await call(
        'POST',
        '/v2/movement',
        exportBody({ originCountry: 'DE', destinationCountry: 'GB' })
      )
      expect(res.statusCode).toBe(422)
    })

    test('an export needs exactly one receiver and a producer', async () => {
      const body = exportBody()
      body.parties[0].roles = ['ARRANGER']
      body.parties.pop()
      body.parties.push(german(['RECEIVER'], 'Second Receiver'))
      const res = await call('POST', '/v2/movement', body)
      expect(res.statusCode).toBe(422)
      expect(res.result.details.map((d) => d.message).join(' ')).toMatch(
        /RECEIVER/
      )
      expect(res.result.details.map((d) => d.message).join(' ')).toMatch(
        /PRODUCER/
      )
    })

    test('derives a national movement and checks UK postcodes', async () => {
      const national = exportBody({
        destinationCountry: 'GB',
        transitCountries: undefined
      })
      national.parties = [
        party(['ARRANGER'], 'Arranger Ltd', { arrangerType: 'OTHER' }),
        party(['RECEIVER'], 'Receiver Ltd')
      ]
      expect((await call('POST', '/v2/movement', national)).result.kind).toBe(
        'NATIONAL'
      )
      national.parties[1].address.postcode = 'NOT A POSTCODE'
      expect((await call('POST', '/v2/movement', national)).statusCode).toBe(
        422
      )
    })

    test('rejects a reused annexViiNumber with 409', async () => {
      const body = exportBody({ annexViiNumber: 'GLW.GB26000000000999i' })
      expect((await call('POST', '/v2/movement', body)).statusCode).toBe(201)
      expect((await call('POST', '/v2/movement', body)).statusCode).toBe(409)
    })
  })

  describe('PUT /v2/movement/{id}', () => {
    test('needs If-Match, checks it, and changes the plan', async () => {
      const { movementId } = await arrange()
      const url = `/v2/movement/${movementId}`
      expect((await call('PUT', url, exportBody())).statusCode).toBe(428)
      expect(
        (await call('PUT', url, exportBody(), { 'if-match': '7' })).statusCode
      ).toBe(412)
      const changed = exportBody({ destinationCountry: 'FR' })
      const res = await call('PUT', url, changed, { 'if-match': '1' })
      expect(res.statusCode).toBe(200)
      expect(res.result.revision).toBe(2)
      expect(res.result.destinationCountry).toBe('FR')
      expect(res.result.status).toBe('ARRANGED')
    })

    test('cancels with status CANCELLED, then refuses further change', async () => {
      const { movementId } = await arrange()
      const url = `/v2/movement/${movementId}`
      const res = await call(
        'PUT',
        url,
        {
          status: 'CANCELLED',
          cancellation: {
            reason: 'Buyer withdrew',
            cancelledBy: { name: 'John Doe', roleInOrganisation: 'Director' }
          }
        },
        { 'if-match': '1' }
      )
      expect(res.statusCode).toBe(200)
      expect(res.result.status).toBe('CANCELLED')
      expect(
        (await call('PUT', url, exportBody(), { 'if-match': '2' })).statusCode
      ).toBe(409)
      const collect = await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      expect(collect.statusCode).toBe(409)
    })

    test('cannot change the plan once a collection is recorded', async () => {
      const { movementId } = await arrange()
      await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      const res = await call(
        'PUT',
        `/v2/movement/${movementId}`,
        exportBody(),
        { 'if-match': '2' }
      )
      expect(res.statusCode).toBe(409)
    })
  })

  describe('POST /v2/collection', () => {
    test('422 for an unknown movement, a missing first quantity and a skipped leg', async () => {
      const unknown = await call('POST', '/v2/collection', {
        movementId: '7d1c4e0a-3b52-4c1e-9a77-2f0c1d6b8e11',
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      expect(unknown.statusCode).toBe(422)
      const { movementId } = await arrange()
      const noQty = await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z'
      })
      expect(noQty.statusCode).toBe(422)
      const skipped = await call('POST', '/v2/collection', {
        movementId,
        legOrder: 2,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      expect(skipped.statusCode).toBe(422)
    })

    test('a second leg is HANDED_OVER and needs a carrier beyond the plan', async () => {
      const { movementId } = await arrange()
      await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      const noCarrier = await call('POST', '/v2/collection', {
        movementId,
        legOrder: 2,
        collectedAt: '2026-12-01T12:00:00Z'
      })
      expect(noCarrier.statusCode).toBe(422)
      const res = await call('POST', '/v2/collection', {
        movementId,
        legOrder: 2,
        collectedAt: '2026-12-01T12:00:00Z',
        carrier: party(['CARRIER'], 'Second Haulier Ltd'),
        meansOfTransport: 'ROAD'
      })
      expect(res.statusCode).toBe(201)
      expect(res.result.facts.at(-1)).toMatchObject({
        type: 'HANDED_OVER',
        receivedFromLeg: 1
      })
      expect(res.result.legs[1].intended).toBe(false)
    })
  })

  describe('POST /v2/delivery and /v2/receipt', () => {
    test('a delivery needs a collection and an in-country site', async () => {
      const { movementId } = await arrange()
      const site = {
        address: { fullAddress: 'x', postcode: '20457', countryCode: 'DE' }
      }
      const early = await call('POST', '/v2/delivery', {
        movementIds: [movementId],
        deliveredAt: '2026-12-02T10:00:00Z',
        deliverySite: site
      })
      expect(early.statusCode).toBe(422)
      await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      const wrongCountry = await call('POST', '/v2/delivery', {
        movementIds: [movementId],
        deliveredAt: '2026-12-02T10:00:00Z',
        deliverySite: { address: { ...site.address, countryCode: 'FR' } }
      })
      expect(wrongCountry.statusCode).toBe(422)
    })

    test('receipt rules: outcome, role order, one per role, unknown delivery', async () => {
      const { movementId } = await arrange()
      await call('POST', '/v2/collection', {
        movementId,
        legOrder: 1,
        collectedAt: '2026-12-01T08:30:00Z',
        quantity: { tonnes: 1 }
      })
      const delivered = await call('POST', '/v2/delivery', {
        movementIds: [movementId],
        deliveredAt: '2026-12-02T10:00:00Z',
        deliverySite: {
          address: { fullAddress: 'x', postcode: '20457', countryCode: 'DE' }
        }
      })
      const { deliveryId } = delivered.result.deliveries[0]
      const base = { deliveryId, receivedAt: '2026-12-02T11:00:00Z' }

      const rejectedNoReason = await call('POST', '/v2/receipt', {
        ...base,
        receivedBy: 'RECEIVER',
        outcome: { status: 'REJECTED', rejectedQuantity: { tonnes: 1 } }
      })
      expect(rejectedNoReason.statusCode).toBe(422)

      const facilityFirst = await call('POST', '/v2/receipt', {
        ...base,
        receivedBy: 'FACILITY',
        outcome: { status: 'ACCEPTED', acceptedQuantity: { tonnes: 1 } },
        treatments: [{ code: 'R3' }]
      })
      expect(facilityFirst.statusCode).toBe(422)

      const ok = {
        ...base,
        receivedBy: 'RECEIVER',
        outcome: { status: 'ACCEPTED', acceptedQuantity: { tonnes: 1 } }
      }
      expect((await call('POST', '/v2/receipt', ok)).statusCode).toBe(201)
      expect((await call('POST', '/v2/receipt', ok)).statusCode).toBe(409)

      const unknown = await call('POST', '/v2/receipt', {
        ...ok,
        deliveryId: '7d1c4e0a-3b52-4c1e-9a77-2f0c1d6b8e11'
      })
      expect(unknown.statusCode).toBe(422)
    })
  })

  test('GET /v2/movement/{id} is 404 for an unknown movement and 400 for a bad id', async () => {
    expect(
      (await call('GET', '/v2/movement/7d1c4e0a-3b52-4c1e-9a77-2f0c1d6b8e11'))
        .statusCode
    ).toBe(404)
    expect((await call('GET', '/v2/movement/nope')).statusCode).toBe(400)
  })

  test('the existing /annexvii endpoints are still registered', () => {
    const routes = server
      .table()
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
    expect(routes).toContain('POST /annexvii')
    expect(routes).toContain('POST /v2/movement')
  })
})
