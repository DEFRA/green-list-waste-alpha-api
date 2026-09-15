import { createRandomData } from './helpers'
import { annexViiSchema } from '#/schemas/annex-vii.js'

describe('POC Mongo Queue helpers', () => {
  test('should create random data that matches the schema', () => {
    const data = createRandomData()
    const { error } = annexViiSchema.validate(data)

    console.log('data', data)
    expect(error).toBe(undefined)
  })
})
