import { health } from '#/routes/health.js'
import { annexVii } from '#/routes/annexVii.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health].concat(annexVii))
    }
  }
}
