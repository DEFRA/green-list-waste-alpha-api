import { runPack } from '../../test-payloads/v2/scripts/run.mjs'

/*
 * Runs the whole test-payloads/v2 pack through the real server, so the pack
 * given to software providers is proven to behave as its manifest says.
 */
describe('#v2 test pack', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('every scenario in the pack gives the result the manifest expects', async () => {
    const lines = []
    const send = async (method, url, payload, headers) => {
      const res = await server.inject({ method, url, payload, headers })
      return { status: res.statusCode, body: res.result }
    }
    const { ok, results } = await runPack(send, { log: (l) => lines.push(l) })
    expect(lines.filter((l) => l.startsWith('FAIL')).join('\n')).toBe('')
    expect(results.length).toBeGreaterThan(30)
    expect(ok).toBe(true)
  })
})
