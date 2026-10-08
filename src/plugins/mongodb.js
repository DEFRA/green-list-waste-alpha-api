import { MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

import { seedReferenceCodes } from '#/common/helpers/seed-reference-codes.js'

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: async function (server, options) {
      server.logger.info('Setting up MongoDb')

      const client = await MongoClient.connect(options.mongoUrl, {
        ...options.mongoOptions
      })

      const databaseName = options.databaseName
      const db = client.db(databaseName)
      const locker = new LockManager(db.collection('mongo-locks'))

      await createIndexes(db)
      await seedReferenceCodes(db, locker, server.logger)

      server.logger.info(`MongoDb connected to ${databaseName}`)

      server.decorate('server', 'mongoClient', client)
      server.decorate('server', 'db', db)
      server.decorate('server', 'locker', locker)
      server.decorate('request', 'db', () => db, { apply: true })
      server.decorate('request', 'locker', () => locker, { apply: true })

      server.events.on('stop', async () => {
        server.logger.info('Closing Mongo client')
        try {
          await client.close(true)
        } catch (e) {
          server.logger.error(e, 'failed to close mongo client')
        }
      })
    }
  }
}

async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })

  const annexVii = db.collection('annex-vii')
  await annexVii.createIndex({ submissionId: 1 }, { unique: true })
  // annexVIIDocumentNo is optional now that DIWASS assigns the real number,
  // so uniqueness only applies where a caller supplied one. This replaces the
  // earlier unconditional index of the same key.
  await annexVii.dropIndex('annexVIIDocumentNo_1').catch(() => {})
  await annexVii.createIndex(
    { annexVIIDocumentNo: 1 },
    {
      unique: true,
      partialFilterExpression: { annexVIIDocumentNo: { $type: 'string' } },
      name: 'annexVIIDocumentNo_unique_when_set'
    }
  )

  await db
    .collection('diwass-operators')
    .createIndex({ operatorInternalId: 1 }, { unique: true })
  await db
    .collection('diwass-operators')
    .createIndex({ 'identifiers.type': 1, 'identifiers.value': 1 })

  await db
    .collection('diwass-annex-vii')
    .createIndex({ annexVIIDocumentNo: 1 }, { unique: true })
}
