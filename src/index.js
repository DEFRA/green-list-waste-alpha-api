import process from 'node:process'

import { createLogger } from '#/common/helpers/logging/logger.js'
import { startServer } from '#/common/helpers/start-server.js'
import { startWorker } from '#/routes/mongoQueuePoc/backgroundProcessor.js'

await startServer()

startWorker()

process.on('unhandledRejection', (error) => {
  const logger = createLogger()
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})
