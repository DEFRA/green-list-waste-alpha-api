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

describe('#validateDiwassCredentials', () => {
  test('accepts both credentials set (live DIWASS)', async () => {
    const { validateDiwassCredentials } = await import('#/config.js')

    expect(() =>
      validateDiwassCredentials({ username: 'n00o3ge6', authKey: 'key' })
    ).not.toThrow()
  })

  test('accepts neither credential set (bundled emulator)', async () => {
    const { validateDiwassCredentials } = await import('#/config.js')

    expect(() =>
      validateDiwassCredentials({ username: null, authKey: null })
    ).not.toThrow()
  })

  test('rejects a username without an authentication key', async () => {
    const { validateDiwassCredentials } = await import('#/config.js')

    expect(() =>
      validateDiwassCredentials({ username: 'n00o3ge6', authKey: '' })
    ).toThrow('DIWASS_AUTH_KEY is not set')
  })

  test('rejects an authentication key without a username', async () => {
    const { validateDiwassCredentials } = await import('#/config.js')

    expect(() =>
      validateDiwassCredentials({ username: null, authKey: 'key' })
    ).toThrow('DIWASS_USERNAME is not set')
  })
})
