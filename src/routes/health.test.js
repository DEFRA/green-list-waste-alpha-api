describe('#health', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('GET /health returns a success message', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(statusCode).toBe(200)
    expect(result).toEqual({ message: 'success' })
  })
})
