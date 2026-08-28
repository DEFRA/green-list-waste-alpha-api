vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: vi.fn()
}))

import { getTraceId } from '@defra/hapi-tracing'
import { loggerOptions } from '#/plugins/logger-options.js'

describe('#loggerOptions', () => {
  test('mixin returns an empty object when there is no trace id', () => {
    getTraceId.mockReturnValue(undefined)

    expect(loggerOptions.mixin()).toEqual({})
  })

  test('mixin includes the trace id when one is present', () => {
    getTraceId.mockReturnValue('abc-123')

    expect(loggerOptions.mixin()).toEqual({ trace: { id: 'abc-123' } })
  })
})
