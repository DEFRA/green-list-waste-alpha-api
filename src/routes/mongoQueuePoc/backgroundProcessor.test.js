import {
  ReceiveMessageCommand,
  DeleteMessageCommand
} from '@aws-sdk/client-sqs'
import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

describe('background processor', () => {
  test('delete sqs message', async () => {
    const { deleteMessage } = await import('./backgroundProcessor.js')
    let sideEffect = {}

    await deleteMessage(
      {
        send: async (cmd) => {
          sideEffect = cmd
        }
      },
      'http://example.com/queue',
      'handle',
      logger
    )
    expect(sideEffect.input.QueueUrl).toEqual('http://example.com/queue')
    expect(sideEffect.input.ReceiptHandle).toEqual('handle')
  })

  test('delete sqs message should handle error', async () => {
    const { deleteMessage } = await import('./backgroundProcessor.js')

    const response = await deleteMessage(
      {
        send: async (_) => {
          throw new Error('Error')
        }
      },
      'http://example.com/queue',
      'handle',
      logger
    )

    expect(response).toBeUndefined()
  })

  test('poll queue happy path - only processes one message at a time', async () => {
    const { pollQueue } = await import('./backgroundProcessor.js')
    const testData = [
      { test: 'data1', ReceiptHandle: 'handle1' },
      { test: 'data2', ReceiptHandle: 'handle2' }
    ]
    const sideEffect = { processedMessages: [], deletedMessages: [] }
    await pollQueue({
      sqsClient: {
        send: async (cmd) => {
          if (cmd instanceof ReceiveMessageCommand) {
            return {
              Messages: testData
            }
          } else if (cmd instanceof DeleteMessageCommand) {
            sideEffect.deletedMessages.push(cmd.input.ReceiptHandle)
          }
        }
      },
      QueueUrl: 'http://example.com/queue',
      action: async (message) => {
        sideEffect.processedMessages.push(message.test)
        return { logger }
      }
    })
    expect(sideEffect.deletedMessages.length).toEqual(1)
    expect(sideEffect.processedMessages.length).toEqual(1)
    const { test, ReceiptHandle } = testData[0]
    expect(sideEffect.deletedMessages).toContain(ReceiptHandle)
    expect(sideEffect.processedMessages).toContain(test)
  })
})
