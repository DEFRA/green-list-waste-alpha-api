import { readFileSync } from 'node:fs'

const example = JSON.parse(
  readFileSync(
    new URL('../../examples/annexvii-create-request.json', import.meta.url),
    'utf8'
  )
)

// A complete Annex VII, with a document number unique to each test.
function complete(documentNo) {
  return { ...structuredClone(example), annexVIIDocumentNo: documentNo }
}

// What an operator knows before the load: no carrier, quantity or date yet.
function earlyDraft(documentNo) {
  const draft = complete(documentNo)
  delete draft.carriers
  delete draft.shipment.actualDateOfShipment
  draft.shipment.actualQuantity = { tonnes: null, metersCubed: null }
  return draft
}

// DIWASS's replies, as the live acceptance environment sends them.
function diwassReply(root, statusCode, { documentNo, errorCode } = {}) {
  const errors = errorCode
    ? `<ns4:errors><ns4:code>${errorCode}</ns4:code><ns4:description languageID="en">refused</ns4:description></ns4:errors>`
    : ''
  const number = documentNo
    ? `<ns3:annexVIIDocumentNo>${documentNo}</ns3:annexVIIDocumentNo>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header><Message xmlns="http://ec.europa.eu/sanco/tracesnt/message/v1"><ID>WS_REQUEST_ID</ID><Message>req-1</Message></Message></S:Header>
  <S:Body>
    <ns3:${root} xmlns:ns3="http://ec.europa.eu/tracesnt/waste/annex7/v1" xmlns:ns4="http://ec.europa.eu/tracesnt/waste/notification/v1">
      <ns3:response><ns4:statusCode>${statusCode}</ns4:statusCode>${errors}</ns3:response>
      ${number}
    </ns3:${root}>
  </S:Body>
</S:Envelope>`
}
const documentReply = (statusCode, options) =>
  diwassReply('Annex7DocumentTypeResponse', statusCode, options)
const signalReply = (statusCode) =>
  diwassReply('Annex7MovementDocumentTypeResponse', statusCode)

describe('#annexVii lifecycle: draft, announce, update, cancel', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  beforeEach(() => {
    global.fetchMock.resetMocks()
  })

  const inject = (method, url, payload) =>
    server.inject({ method, url, payload })
  const stored = (submissionId) =>
    server.db.collection('annex-vii').findOne({ submissionId })
  const sentToDiwass = () =>
    global.fetchMock.mock.calls.map(([, init]) => init.body)

  async function announced(documentNo, dwtNo) {
    const { result } = await inject('POST', '/annexvii/drafts', complete(dwtNo))
    global.fetchMock.mockResponseOnce(documentReply('OK', { documentNo }))
    await inject('POST', `/annexvii/${result.submissionId}/announce`)
    global.fetchMock.resetMocks()
    return result.submissionId
  }

  test('POST /annexvii/drafts saves an incomplete Annex VII without calling DIWASS', async () => {
    const { statusCode, result } = await inject(
      'POST',
      '/annexvii/drafts',
      earlyDraft('AX-LC-001')
    )

    expect(statusCode).toBe(201)
    expect(result.status).toBe('DRAFT')
    expect(result.diwass).toBeUndefined()
    expect(sentToDiwass()).toHaveLength(0)
    expect((await stored(result.submissionId)).status).toBe('DRAFT')
  })

  test('POST /annexvii/drafts still rejects what is filled in wrongly', async () => {
    const draft = earlyDraft('AX-LC-002')
    draft.importerConsignee.contactDetails.email = 'not-an-email'

    const { statusCode, result } = await inject(
      'POST',
      '/annexvii/drafts',
      draft
    )

    expect(statusCode).toBe(400)
    expect(result.message).toContain('must be a valid email')
  })

  test('POST /annexvii/drafts rejects an unrecognised waste code', async () => {
    const draft = earlyDraft('AX-LC-003')
    draft.wasteIdentification = { ecListOfWastes: '99 99 99' }

    expect((await inject('POST', '/annexvii/drafts', draft)).statusCode).toBe(
      400
    )
  })

  test('a draft is completed, then announced in DIWASS', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      earlyDraft('AX-LC-004')
    )
    const url = `/annexvii/${draft.submissionId}`

    const early = await inject('POST', `${url}/announce`)
    expect(early.statusCode).toBe(400)
    expect(early.result.message).toContain('not ready to announce')
    expect(early.result.message).toContain('"carriers" is required')

    const updated = await inject('PUT', url, complete('AX-LC-004'))
    expect(updated.statusCode).toBe(200)
    expect(updated.result.status).toBe('DRAFT')
    expect(sentToDiwass()).toHaveLength(0)

    global.fetchMock.mockResponseOnce(
      documentReply('OK', { documentNo: 'GLW.GB260000000101i' })
    )
    const result = await inject('POST', `${url}/announce`)
    expect(result.statusCode).toBe(200)
    expect(result.result.status).toBe('ANNOUNCED')
    expect(result.result.diwass.annexViiDocumentNo).toBe('GLW.GB260000000101i')
    expect(sentToDiwass()[0]).toContain('<v1:CreateAnnex7DocumentTypeRequest>')

    const record = await stored(draft.submissionId)
    expect(record.status).toBe('ANNOUNCED')
    expect(record.shipment.actualDateOfShipment).toBeInstanceOf(Date)

    expect((await inject('POST', `${url}/announce`)).statusCode).toBe(409)
  })

  test('PUT on an announced Annex VII sends the whole document to DIWASS as an update', async () => {
    const id = await announced('GLW.GB260000000102i', 'AX-LC-005')
    const loaded = complete('AX-LC-005')
    loaded.shipment.actualQuantity = { tonnes: 21.5, metersCubed: null }
    delete loaded.wasteProducer
    loaded.shipmentArranger.isAlsoWasteProducer = true

    global.fetchMock.mockResponseOnce(
      documentReply('OK', { documentNo: 'GLW.GB260000000102i' })
    )
    const { statusCode, result } = await inject(
      'PUT',
      `/annexvii/${id}`,
      loaded
    )

    expect(statusCode).toBe(200)
    expect(result.status).toBe('ANNOUNCED')
    expect(result.diwass.lastUpdate.status).toBe('OK')
    const sent = sentToDiwass()[0]
    expect(sent).toContain('<v1:UpdateAnnex7DocumentTypeRequest>')
    expect(sent).toContain(
      '<v1:annexVIIDocumentNo>GLW.GB260000000102i</v1:annexVIIDocumentNo>'
    )
    const record = await stored(id)
    expect(record.shipment.actualQuantity.tonnes).toBe(21.5)
    expect(record.wasteProducer).toBeUndefined()
    expect(record.diwass.busy).toBeUndefined()
  })

  test('an update DIWASS refuses is 422 and leaves the record as DIWASS holds it', async () => {
    const id = await announced('GLW.GB260000000103i', 'AX-LC-006')
    const changed = complete('AX-LC-006')
    changed.shipment.actualQuantity = { tonnes: 99, metersCubed: null }

    global.fetchMock.mockResponseOnce(
      documentReply('NOTOK', { errorCode: 'GREEN-LISTED-DOCUMENT-NOT-FOUND' })
    )
    const { statusCode, result } = await inject(
      'PUT',
      `/annexvii/${id}`,
      changed
    )

    expect(statusCode).toBe(422)
    expect(result.diwass.errors[0].code).toBe('GREEN-LISTED-DOCUMENT-NOT-FOUND')
    const record = await stored(id)
    expect(record.shipment.actualQuantity.tonnes).not.toBe(99)
    expect(record.diwass.lastUpdate.status).toBe('NOTOK')
    expect(record.diwass.busy).toBeUndefined()
  })

  test('an update that cannot reach DIWASS is 502', async () => {
    const id = await announced('GLW.GB260000000104i', 'AX-LC-007')
    global.fetchMock.mockRejectOnce(new Error('connect ECONNREFUSED'))

    const { statusCode } = await inject(
      'PUT',
      `/annexvii/${id}`,
      complete('AX-LC-007')
    )

    expect(statusCode).toBe(502)
    expect((await stored(id)).diwass.lastUpdate.status).toBe('ERROR')
  })

  test('an announced Annex VII must stay complete', async () => {
    const id = await announced('GLW.GB260000000105i', 'AX-LC-008')

    const { statusCode, result } = await inject(
      'PUT',
      `/annexvii/${id}`,
      earlyDraft('AX-LC-008')
    )

    expect(statusCode).toBe(400)
    expect(result.message).toContain('must stay complete')
    expect(sentToDiwass()).toHaveLength(0)
  })

  test('cancelling an announced Annex VII sends Annex7Cancelled, signed by the arranger', async () => {
    const id = await announced('GLW.GB260000000106i', 'AX-LC-009')
    global.fetchMock.mockResponseOnce(signalReply('OK'))

    const { statusCode, result } = await inject(
      'POST',
      `/annexvii/${id}/cancel`,
      { reason: 'Buyer withdrew' }
    )

    expect(statusCode).toBe(200)
    expect(result.status).toBe('CANCELLED')
    expect(result.diwass.cancellation.status).toBe('OK')
    const sent = sentToDiwass()[0]
    expect(sent).toContain('<v1:CreateAnnex7SignalTypeRequest>')
    expect(sent).toContain('<n:typeCode>Annex7Cancelled</n:typeCode>')
    expect(sent).toContain('Buyer withdrew')
    expect(sent).toContain(
      example.declarationOfShipmentArranger.authenticatedBy.name
    )

    for (const [method, path] of [
      ['PUT', ''],
      ['POST', '/announce'],
      ['POST', '/cancel']
    ]) {
      const response = await inject(
        method,
        `/annexvii/${id}${path}`,
        method === 'PUT' ? complete('AX-LC-009') : undefined
      )
      expect(response.statusCode).toBe(409)
    }
  })

  test('cancelling a draft needs no DIWASS call', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      earlyDraft('AX-LC-010')
    )

    const { statusCode, result } = await inject(
      'POST',
      `/annexvii/${draft.submissionId}/cancel`
    )

    expect(statusCode).toBe(200)
    expect(result.status).toBe('CANCELLED')
    expect(sentToDiwass()).toHaveLength(0)
  })

  test('an announcement DIWASS never received goes back to DRAFT when edited', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      complete('AX-LC-011')
    )
    global.fetchMock.mockRejectOnce(new Error('connect ECONNREFUSED'))
    const failed = await inject(
      'POST',
      `/annexvii/${draft.submissionId}/announce`
    )
    expect(failed.result.diwass.status).toBe('ERROR')

    const updated = await inject(
      'PUT',
      `/annexvii/${draft.submissionId}`,
      complete('AX-LC-011')
    )

    expect(updated.statusCode).toBe(200)
    expect(updated.result.status).toBe('DRAFT')
  })

  test('older SUBMITTED records become ANNOUNCED', async () => {
    const { migrateAnnexViiStatuses } =
      await import('#/services/AnnexViiCreate.js')
    await server.db
      .collection('annex-vii')
      .insertOne({ submissionId: 'legacy-1', status: 'SUBMITTED' })

    await migrateAnnexViiStatuses(server.db)

    expect((await stored('legacy-1')).status).toBe('ANNOUNCED')
  })

  test('unknown submission IDs are 404', async () => {
    const url = '/annexvii/00000000-0000-4000-8000-000000000000'

    expect((await inject('GET', url)).statusCode).toBe(404)
    expect((await inject('PUT', url, complete('AX-LC-012'))).statusCode).toBe(
      404
    )
    expect((await inject('POST', `${url}/announce`)).statusCode).toBe(404)
    expect((await inject('POST', `${url}/cancel`)).statusCode).toBe(404)
  })
})
