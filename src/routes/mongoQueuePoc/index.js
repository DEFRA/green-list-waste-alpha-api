const createFakeRequests = {
  method: 'POST',
  path: '/create-fake-requests/{count}',
  handler: async (request, h) => {
    const count = request.params.count

    console.log('count', count)

    return h.response({})
  }
}

export const mongoQueueRoutes = [createFakeRequests]
