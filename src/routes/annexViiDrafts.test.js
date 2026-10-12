import { readFileSync } from 'node:fs'

const example = JSON.parse(
  readFileSync(
    new URL('../../examples/annexvii-create-request.json', import.meta.url),
    'utf8'
  )
)

// A complete Annex VII, with a document number unique to this test file.
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

describe('#annexVii drafts', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  const inject = (method, url, payload) =>
    server.inject({ method, url, payload })

  test('POST /annexvii/drafts saves an incomplete Annex VII without sending it to DIWASS', async () => {
    const { statusCode, result } = await inject(
      'POST',
      '/annexvii/drafts',
      earlyDraft('AX-DRAFT-001')
    )

    expect(statusCode).toBe(201)
    expect(result.status).toBe('DRAFT')
    expect(result.diwass).toBeUndefined()

    const stored = await server.db
      .collection('annex-vii')
      .findOne({ submissionId: result.submissionId })
    expect(stored.status).toBe('DRAFT')
    expect(stored.diwass).toBeUndefined()
  })

  test('POST /annexvii/drafts still rejects what is filled in wrongly', async () => {
    const draft = earlyDraft('AX-DRAFT-002')
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
    const draft = earlyDraft('AX-DRAFT-003')
    draft.wasteIdentification = { ecListOfWastes: '99 99 99' }

    const { statusCode } = await inject('POST', '/annexvii/drafts', draft)

    expect(statusCode).toBe(400)
  })

  test('a draft can be read, completed and then submitted to DIWASS', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      earlyDraft('AX-DRAFT-004')
    )
    const url = `/annexvii/${draft.submissionId}`

    const read = await inject('GET', url)
    expect(read.statusCode).toBe(200)
    expect(read.result.status).toBe('DRAFT')

    const incomplete = await inject('POST', `${url}/submit`)
    expect(incomplete.statusCode).toBe(400)
    expect(incomplete.result.message).toContain('not ready to submit')
    expect(incomplete.result.message).toContain('"carriers" is required')

    const updated = await inject('PUT', url, complete('AX-DRAFT-004'))
    expect(updated.statusCode).toBe(200)
    expect(updated.result.status).toBe('DRAFT')

    const submitted = await inject('POST', `${url}/submit`)
    expect(submitted.statusCode).toBe(200)
    expect(submitted.result.status).toBe('SUBMITTED')
    expect(submitted.result.diwass.status).not.toBe('PENDING')

    const stored = await server.db
      .collection('annex-vii')
      .findOne({ submissionId: draft.submissionId })
    expect(stored.status).toBe('SUBMITTED')
    expect(stored.diwass.submittedAt).toBeInstanceOf(Date)
    expect(stored.shipment.actualDateOfShipment).toBeInstanceOf(Date)
  })

  test('a submission DIWASS accepted cannot be edited or sent again', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      complete('AX-DRAFT-005')
    )
    const url = `/annexvii/${draft.submissionId}`
    await server.db
      .collection('annex-vii')
      .updateOne(
        { submissionId: draft.submissionId },
        { $set: { status: 'SUBMITTED', diwass: { status: 'OK' } } }
      )

    expect(
      (await inject('PUT', url, complete('AX-DRAFT-005'))).statusCode
    ).toBe(409)
    expect((await inject('POST', `${url}/submit`)).statusCode).toBe(409)
  })

  test('a submission DIWASS refused goes back to DRAFT when edited', async () => {
    const { result: draft } = await inject(
      'POST',
      '/annexvii/drafts',
      complete('AX-DRAFT-006')
    )
    const url = `/annexvii/${draft.submissionId}`
    await server.db.collection('annex-vii').updateOne(
      { submissionId: draft.submissionId },
      {
        $set: {
          status: 'SUBMITTED',
          diwass: { status: 'NOTOK', errors: [{ code: 'X' }] }
        }
      }
    )

    const updated = await inject('PUT', url, complete('AX-DRAFT-006'))

    expect(updated.statusCode).toBe(200)
    expect(updated.result.status).toBe('DRAFT')
    expect(updated.result.diwass.status).toBe('NOTOK')
  })

  test('unknown submission IDs are 404', async () => {
    const url = '/annexvii/00000000-0000-4000-8000-000000000000'

    expect((await inject('GET', url)).statusCode).toBe(404)
    expect(
      (await inject('PUT', url, complete('AX-DRAFT-007'))).statusCode
    ).toBe(404)
    expect((await inject('POST', `${url}/submit`)).statusCode).toBe(404)
  })
})
