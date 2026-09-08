import { XMLParser } from 'fast-xml-parser'

/*
[SOAP Parsing]
DIWASS namespaces every element (soapenv:, v1:, v4:, ns3: ...) and the prefix
itself is arbitrary per message - the samples in the spec pack use different
prefixes for the same element on the request vs the response side. Stripping
namespaces on parse lets both sides of this emulator dispatch on local element
names alone, which is what the spec's own operation names already are.
*/
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '#text',
  trimValues: true
})

export class SoapFormatError extends Error {}

export function parseSoapMessage(rawXml) {
  const doc = parser.parse(rawXml)
  const envelope = doc.Envelope

  if (!envelope?.Body) {
    throw new SoapFormatError('Not a SOAP envelope')
  }

  if (envelope.Body.Fault) {
    const fault = envelope.Body.Fault
    const error = new SoapFormatError(textOf(fault.faultstring) ?? 'SOAP fault')
    error.faultCode = textOf(fault.faultcode)
    throw error
  }

  const bodyEntries = Object.entries(envelope.Body).filter(
    ([key]) => key !== '@_' && !key.startsWith('@_')
  )

  if (bodyEntries.length === 0) {
    throw new SoapFormatError('SOAP body is empty')
  }

  const [operation, payload] = bodyEntries[0]
  return { header: envelope.Header ?? {}, operation, payload }
}

/*
[Text Of]
fast-xml-parser only wraps a leaf element's value in { '#text': ... } when it
also carries attributes (e.g. <Identifier type="eori">GB123</Identifier>);
a plain leaf with no attributes parses straight to the string. Callers that
don't care about attributes can go through this to get the value either way.
*/
export function textOf(node) {
  if (node === undefined || node === null) {
    return node
  }
  return typeof node === 'object' ? node['#text'] : node
}

export function asArray(value) {
  if (value === undefined || value === null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}
