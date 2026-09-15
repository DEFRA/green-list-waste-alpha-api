import { createRandomAnnexVii } from './helpers.js'

const createFakeRequests = {
  method: 'POST',
  path: '/create-fake-requests/{count}',
  handler: async (request, h) => {
    const count = request.params.count

    for (let index = 0; index < count; index++) {
      await createRandomAnnexVii(request)
    }

    return h
      .response({
        message: `create ${count} Annex VII requests`
      })
      .code(201)
  }
}

export const mongoQueueRoutes = [createFakeRequests]
