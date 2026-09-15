import {
  ReceiveMessageCommand,
  DeleteMessageCommand
} from '@aws-sdk/client-sqs'

import { createLogger } from '#/common/helpers/logging/logger.js'
import { constructSqsClient } from '#/plugins/sqs.js'
import { config } from '#/config.js'

const defaultLogger = createLogger()

export const deleteMessage = async (
  client,
  QueueUrl,
  receiptHandle,
  logger
) => {
  const params = {
    QueueUrl,
    ReceiptHandle: receiptHandle
  }

  try {
    const command = new DeleteMessageCommand(params)
    await client.send(command)
    // logger.info(`Message deleted from queue with handle ${receiptHandle}`)
  } catch (err) {
    logger.error(`Error deleting message: ${err}`)
  }
}

const processMessage = async (message, sqsClient, action, QueueUrl) => {
  try {
    const result = await action(message)
    const lg = result?.logger || defaultLogger
    if (result?.skipDeleteMessage) {
      lg.info(`Skipping deleting message ${message.ReceiptHandle}`)
    } else {
      // Delete message after successful processing
      await deleteMessage(sqsClient, QueueUrl, message.ReceiptHandle, lg)
    }
  } catch (err) {
    // Message will become visible again after VisibilityTimeout
    defaultLogger.error(`Error processing message: ${err.stack}`)
  }
}

export const pollQueue = async ({ sqsClient, QueueUrl, action }) => {
  const params = {
    QueueUrl,
    MaxNumberOfMessages: 1, // Process 1 messages at once
    WaitTimeSeconds: 20, // Long polling to reduce empty responses
    VisibilityTimeout: 300 // Hide message while processing
  }

  try {
    const command = new ReceiveMessageCommand(params)
    const data = await sqsClient.send(command)
    if (data.Messages && data.Messages.length > 0) {
      // defaultLogger.info(`Received ${data.Messages.length} message(s)`)
      await processMessage(data.Messages[0], sqsClient, action, QueueUrl) // Assumes batch size is 1 - see MaxNumberOfMessages above
    } else {
      defaultLogger.debug('No messages in queue')
    }
  } catch (err) {
    defaultLogger.error(`Error polling queue: ${err}`)
  }
}

export const startWorker = async () => {
  defaultLogger.info('Worker started. Polling for jobs...')
  const QueueUrl = config.get('aws.backgroundProcessQueue')
  const sqsClient = constructSqsClient({
    region: config.get('aws.region'),
    endpoint: config.get('aws.sqsEndpoint')
  })
  // prettier-ignore
  while (true) {  // NOSONAR
    await pollQueue({
      sqsClient,
      QueueUrl,
      action: async (message) => {
        defaultLogger.info('Message receved from queue')
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
