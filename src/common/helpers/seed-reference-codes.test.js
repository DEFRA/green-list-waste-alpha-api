import { LockManager } from 'mongo-locks'

import {
  seedReferenceCodes,
  WASTE_REFERENCE_CODES_COLLECTION
} from '#/common/helpers/seed-reference-codes.js'

describe('#seedReferenceCodes', () => {
  let db, locker

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')

    const server = await createServer()
    await server.initialize()
    db = server.db
    locker = new LockManager(db.collection('mongo-locks'))
  })

  test('seeds EWC, Basel Annex IX and OECD green list codes on first run', async () => {
    await seedReferenceCodes(db, locker, undefined)

    const collection = db.collection(WASTE_REFERENCE_CODES_COLLECTION)
    const ewcCount = await collection.countDocuments({ codeType: 'EWC' })
    const baselCount = await collection.countDocuments({
      codeType: 'BASEL_ANNEX_IX'
    })
    const oecdCount = await collection.countDocuments({
      codeType: 'OECD_GREEN_LIST'
    })

    expect(ewcCount).toBeGreaterThan(0)
    expect(baselCount).toBeGreaterThan(0)
    expect(oecdCount).toBeGreaterThan(0)

    const sample = await collection.findOne({
      codeType: 'EWC',
      code: '20 03 01'
    })
    expect(sample).toMatchObject({
      codeType: 'EWC',
      code: '20 03 01',
      description: 'mixed municipal waste',
      hazardous: false
    })
  })

  test('running seeding again does not duplicate documents', async () => {
    const collection = db.collection(WASTE_REFERENCE_CODES_COLLECTION)
    const countBefore = await collection.countDocuments({ codeType: 'EWC' })

    await seedReferenceCodes(db, locker, undefined)

    const countAfter = await collection.countDocuments({ codeType: 'EWC' })
    expect(countAfter).toBe(countBefore)
  })
})
