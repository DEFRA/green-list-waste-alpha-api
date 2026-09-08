export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/*
[Request Envelope]
Shape taken from the spec pack's own samples (find_operator.xml,
create_operator.xml, Submit_annex7_request.xml): soapenv: prefix, a
WebServiceClientId header, and an empty WS-Security block. `namespaces` is a
map of prefix -> URI for whatever the body actually uses.
*/
export function buildSoapRequest(bodyXml, { namespaces, webServiceClientId }) {
  const nsAttrs = Object.entries(namespaces)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(' ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ${nsAttrs}>
   <soapenv:Header>
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
