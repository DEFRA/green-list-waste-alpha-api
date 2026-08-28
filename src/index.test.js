vi.mock('#/common/helpers/start-server.js', () => ({
  startServer: vi.fn()
}))

describe('#index', () => {
  const originalExitCode = process.exitCode
  let startServerCallCount

  beforeAll(async () => {
    await import('#/index.js')

    const { startServer } = await import('#/common/helpers/start-server.js')
    // read the call count now - clearMocks resets it before the first test runs
    startServerCallCount = startServer.mock.calls.length
  })

  afterEach(() => {
    process.exitCode = originalExitCode
  })

  afterAll(() => {
    process.removeAllListeners('unhandledRejection')
  })

  test('starts the server on import', () => {
    expect(startServerCallCount).toBe(1)
  })

  test('logs and sets exit code on an unhandled rejection', () => {
    process.emit('unhandledRejection', new Error('boom'))

    expect(process.exitCode).toBe(1)
  })
})
