describe('#wasteCodes', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('GET /waste-codes/ewc returns the seeded EWC codes', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/waste-codes/ewc'
    })

    expect(statusCode).toBe(200)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContainEqual({
      code: '15 01 01',
      description: 'paper and cardboard packaging',
      hazardous: false
    })
  })

  test('GET /waste-codes/basel-annex-ix returns the seeded Basel Annex IX codes', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/waste-codes/basel-annex-ix'
    })

    expect(statusCode).toBe(200)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(({ code }) => code.startsWith('B'))).toBe(true)
  })

  test('GET /waste-codes/oecd-green-list returns the seeded OECD green list codes', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/waste-codes/oecd-green-list'
    })

    expect(statusCode).toBe(200)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(({ code }) => code.startsWith('G'))).toBe(true)
  })
})
