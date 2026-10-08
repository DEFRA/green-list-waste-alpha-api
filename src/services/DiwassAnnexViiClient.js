import { config } from '#/config.js'
import { buildSoapRequest } from '#/diwass-emulator/xml/build.js'
import { parseSoapMessage, textOf } from '#/diwass-emulator/xml/parse.js'
import {
  buildCreateAnnex7RequestBody,
  ANNEX_VII_REQUEST_NAMESPACES
} from '#/diwass-emulator/annex-vii/mapping.js'

export class DiwassRequestError extends Error {}

/*
[DIWASS Base URL]
Defaults to nothing so callers fall back to this same server's own address
(the bundled emulator) - see the fallback below. Set DIWASS_BASE_URL to
point at a different emulator instance, or at the real DIWASS gateway once
GB has credentials for it; nothing else about this client changes either way.
*/
function resolveBaseUrl(fallbackBaseUrl) {
  return config.get('diwass.baseUrl') ?? fallbackBaseUrl
}

/*
[Live DIWASS or emulator]
Credentials are what mark a real DIWASS target: the emulator has no auth
layer. With DIWASS_USERNAME and DIWASS_AUTH_KEY set, calls go to the WSDL
service path (DIWASS_BASE_URL is then the .../ws base, for example
https://webgate.acceptance.ec.europa.eu/tracesnt-alpha/ws) with a
WS-Security header; without them, to the emulator's route.
*/
function liveCredentials() {
  const username = config.get('diwass.username')
  const authKey = config.get('diwass.authKey')
  return username && authKey ? { username, authKey } : null
}

/*
[Submit Annex VII to DIWASS]
Takes the same JSON payload the alpha's own /annexvii route already
validated and persisted, builds the CreateAnnex7DocumentTypeRequest SOAP
envelope DIWASS's own spec pack documents, and posts it to whichever base
URL DIWASS/its emulator is reachable at. `fallbackBaseUrl` should be the
calling request's own server address (request.server.info.uri) so this
works self-contained with zero config against the bundled emulator.
*/
export async function submitAnnexViiToDiwass(
  payload,
  { fallbackBaseUrl, fetchImpl = fetch } = {}
) {
  const baseUrl = resolveBaseUrl(fallbackBaseUrl)
  const security = liveCredentials()
  const path = security ? '/WasteAnnex7V1' : '/diwass/annex-vii'
  const requestXml = buildSoapRequest(buildCreateAnnex7RequestBody(payload), {
    namespaces: ANNEX_VII_REQUEST_NAMESPACES,
    webServiceClientId: config.get('diwass.webServiceClientId'),
    security,
    // The arranger submits for itself, so the call acts as the arranger.
    operatorAccessId: payload.shipmentArranger.operatorId
  })

  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: requestXml,
    signal: AbortSignal.timeout(config.get('diwass.timeoutMs'))
  })

  const responseText = await response.text()
  const { operation, payload: responsePayload } = parseSoapMessage(responseText)

  if (operation !== 'Annex7DocumentTypeResponse') {
    throw new DiwassRequestError(
      `Unexpected DIWASS response operation "${operation}"`
    )
  }

  const statusCode = textOf(responsePayload.response?.statusCode)
  if (statusCode !== 'OK') {
    throw new DiwassRequestError(`DIWASS returned status "${statusCode}"`)
  }

  return {
    status: statusCode,
    annexViiDocumentNo: textOf(responsePayload.annexVIIDocumentNo)
  }
}
