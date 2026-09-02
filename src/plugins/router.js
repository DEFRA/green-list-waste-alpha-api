import { health } from '#/routes/health.js'
import { annexVii } from '#/routes/annexVii.js'
import { wasteCodes } from '#/routes/wasteCodes.js'
import { mongoQueueRoutes } from '#/routes/mongoQueuePoc/index.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, ...mongoQueueRoutes].concat(annexVii, wasteCodes))
    }
  }
}
