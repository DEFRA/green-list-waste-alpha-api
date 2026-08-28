import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { acquireLock } from '#/common/helpers/mongo-lock.js'

const seedDataUrl = new URL('../../seed-data/', import.meta.url)

function readSeedFile(fileName) {
  const filePath = fileURLToPath(new URL(fileName, seedDataUrl))
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export const WASTE_REFERENCE_CODES_COLLECTION = 'waste-reference-codes'

export function normalizeCode(code) {
  return code.replace(/\s+/g, '').toUpperCase()
}

const codeSets = [
  { codeType: 'EWC', codes: readSeedFile('ewc-codes.json') },
  {
    codeType: 'BASEL_ANNEX_IX',
    codes: readSeedFile('basel-annex-ix-codes.json')
  },
  {
    codeType: 'OECD_GREEN_LIST',
    codes: readSeedFile('oecd-green-list-codes.json')
  }
]

export async function seedReferenceCodes(db, locker, logger) {
  const collection = db.collection(WASTE_REFERENCE_CODES_COLLECTION)

  await collection.createIndex(
    { codeType: 1, code: 1 },
    { unique: true, name: 'codeType_code_unique' }
  )

  await collection.createIndex(
    { codeType: 1, normalizedCode: 1 },
    { unique: true, name: 'codeType_normalizedCode_unique' }
  )

  const lock = await acquireLock(locker, 'seed-reference-codes', logger)
  if (!lock) {
    logger?.info(
      'Reference code seeding already in progress elsewhere, skipping'
    )
    return
  }

  try {
    for (const { codeType, codes } of codeSets) {
      const existingCount = await collection.countDocuments({ codeType })
      if (existingCount > 0) {
        logger?.info(
          `Reference codes for ${codeType} already seeded (${existingCount}), skipping`
        )
        continue
      }

      const documents = codes.map((code) => ({
        codeType,
        ...code,
        normalizedCode: normalizeCode(code.code)
      }))
      await collection.insertMany(documents)
      logger?.info(`Seeded ${documents.length} reference codes for ${codeType}`)
    }
  } finally {
    await lock.free()
  }
}
