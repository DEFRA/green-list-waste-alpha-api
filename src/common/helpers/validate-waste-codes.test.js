import { seedReferenceCodes } from '#/common/helpers/seed-reference-codes.js'
import { findInvalidWasteCodes } from '#/common/helpers/validate-waste-codes.js'
import { LockManager } from 'mongo-locks'

describe('#findInvalidWasteCodes', () => {
  let db

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')

    const server = await createServer()
    await server.initialize()
    db = server.db
    await seedReferenceCodes(db, new LockManager(db.collection('mongo-locks')))
  })

  test('returns no invalid codes when all fields are valid, ignoring whitespace and case', async () => {
    const invalid = await findInvalidWasteCodes(db, {
      ecListOfWastes: '150101',
      baselAnnexIX: 'b1010'
    })

    expect(invalid).toEqual([])
  })

  test('accepts an OECD field value that is either a Basel Annex IX or OECD green list code', async () => {
    const invalid = await findInvalidWasteCodes(db, { oecd: 'GC010' })

    expect(invalid).toEqual([])
  })

  test('flags codes that are not in the seeded reference lists', async () => {
    const invalid = await findInvalidWasteCodes(db, {
      ecListOfWastes: '999999',
      baselAnnexIX: 'B9999'
    })

    expect(invalid).toEqual([
      { field: 'ecListOfWastes', value: '999999' },
      { field: 'baselAnnexIX', value: 'B9999' }
    ])
  })

  test('ignores fields that are not present', async () => {
    const invalid = await findInvalidWasteCodes(db, {
      ecListOfWastes: '150101'
    })

    expect(invalid).toEqual([])
  })
})
