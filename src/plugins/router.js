import { health } from '#/routes/health.js'
import { annexVii } from '#/routes/annexVii.js'
import { wasteCodes } from '#/routes/wasteCodes.js'
import { diwassEmulator } from '#/diwass-emulator/index.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health].concat(annexVii, wasteCodes, diwassEmulator))
    }
  }
}
