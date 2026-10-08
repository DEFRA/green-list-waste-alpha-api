import { createHash, randomBytes } from 'node:crypto'

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const WSSE_NS =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd'
const WSU_NS =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd'
const PASSWORD_DIGEST =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest'
const BASE64_BINARY =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary'

// DIWASS wants millisecond precision: 2026-10-08T21:01:27.688Z
const wsuTime = (date) => date.toISOString()

/*
[WS-Security header]
UsernameToken with a PasswordDigest, as the spec's onboarding notes describe
and as accepted by the live acceptance environment (8 October 2026):
digest = Base64(SHA-1(nonce bytes + Created + authentication key)). The
Timestamp must expire within a minute of Created. `now` and `nonce` are
injectable so tests can check the digest.
*/
export function buildSecurityHeader({
  username,
  authKey,
  now = new Date(),
  nonce = randomBytes(16),
  lifetimeSeconds = 55
}) {
  const created = wsuTime(now)
  const expires = wsuTime(new Date(now.getTime() + lifetimeSeconds * 1000))
  const digest = createHash('sha1')
    .update(Buffer.concat([nonce, Buffer.from(created + authKey, 'utf8')]))
    .digest('base64')

  return `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}" soapenv:mustUnderstand="1">
         <wsse:UsernameToken wsu:Id="UsernameToken-1">
            <wsse:Username>${escapeXml(username)}</wsse:Username>
            <wsse:Password Type="${PASSWORD_DIGEST}">${digest}</wsse:Password>
            <wsse:Nonce EncodingType="${BASE64_BINARY}">${nonce.toString('base64')}</wsse:Nonce>
            <wsu:Created>${created}</wsu:Created>
         </wsse:UsernameToken>
         <wsu:Timestamp wsu:Id="TS-1"><wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires></wsu:Timestamp>
      </wsse:Security>`
}

/*
[Request Envelope]
Shape taken from the spec pack's own samples (find_operator.xml,
create_operator.xml, Submit_annex7_request.xml) and the header order the
live environment accepted: WS-Security (only when `security` credentials are
given - the emulator has no auth layer), BodyIdentity, LanguageCode, then
WebServiceClientId. `operatorAccessId` is the OperatorInternalID of the
operator the call acts for: one DIWASS user and key can hold several operator
authorisations, and this header picks one per call. `namespaces` is a map of
prefix -> URI for whatever the body uses; it must include the body/v3 (v3)
and base/v4 (v4) namespaces.
*/
export function buildSoapRequest(
  bodyXml,
  { namespaces, webServiceClientId, security, operatorAccessId }
) {
  const nsAttrs = Object.entries(namespaces)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(' ')
  const securityXml = security ? buildSecurityHeader(security) : ''
  const bodyIdentityXml = operatorAccessId
    ? `<v3:BodyIdentity><v3:OperatorAccessIdentifier>${escapeXml(operatorAccessId)}</v3:OperatorAccessIdentifier></v3:BodyIdentity>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ${nsAttrs}>
   <soapenv:Header>
      ${securityXml}
      ${bodyIdentityXml}
      <v4:LanguageCode>en</v4:LanguageCode>
      <v4:WebServiceClientId>${escapeXml(webServiceClientId)}</v4:WebServiceClientId>
   </soapenv:Header>
   <soapenv:Body>
      ${bodyXml}
   </soapenv:Body>
</soapenv:Envelope>`
}

/*
[Response Envelope]
Shape taken from test_connection_response.xml / updateOperatorResponse.xml /
Submit_annex7_response.xml: S: prefix, a WS-Security Timestamp header, no
WebServiceClientId. The real service also echoes a request-tracing
Message/ID/Message header block on Annex VII responses - omitted here since
nothing in this emulator's callers reads it yet.
*/
export function buildSoapResponse(bodyXml) {
  const created = new Date()
  const expires = new Date(created.getTime() + 5000)

  return `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
   <S:Header>
      <ns0:Security xmlns:ns1="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" xmlns:ns0="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
         <ns1:Timestamp>
            <ns1:Created>${created.toISOString()}</ns1:Created>
            <ns1:Expires>${expires.toISOString()}</ns1:Expires>
         </ns1:Timestamp>
      </ns0:Security>
   </S:Header>
   <S:Body>
      ${bodyXml}
   </S:Body>
</S:Envelope>`
}

/*
[Fault]
Real DIWASS fault shape isn't in the spec pack's samples - this follows
plain SOAP 1.1 fault structure (soapenv:Fault / faultcode / faultstring),
which any SOAP client already knows how to recognise as an error.
*/
export function buildSoapFault({ code = 'soapenv:Server', reason }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
   <soapenv:Body>
      <soapenv:Fault>
         <faultcode>${escapeXml(code)}</faultcode>
         <faultstring>${escapeXml(reason)}</faultstring>
      </soapenv:Fault>
   </soapenv:Body>
</soapenv:Envelope>`
}
