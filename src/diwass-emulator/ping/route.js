import { soapRoute } from '#/diwass-emulator/soapRoute.js'
import { textOf } from '#/diwass-emulator/xml/parse.js'
import { escapeXml } from '#/diwass-emulator/xml/build.js'

export const diwassPing = soapRoute({
  path: '/diwass/ping',
  operations: {
    IamAliveRequest: (payload) => {
      const query = textOf(payload?.query) ?? ''
      return `<ns3:IamAliveResponse xmlns:ns3="http://ec.europa.eu/tracesnt/waste/iamalive">
        <ns3:status>Query: ${escapeXml(query)} Status: we are alive</ns3:status>
      </ns3:IamAliveResponse>`
    }
  }
})
