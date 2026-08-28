describe('#config', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  test('uses ecs log format and production redact paths when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production'

    const { config } = await import('#/config.js')

    expect(config.get('log.format')).toBe('ecs')
    expect(config.get('log.redact')).toEqual([
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers'
    ])
  })
})
