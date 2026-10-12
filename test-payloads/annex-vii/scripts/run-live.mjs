#!/usr/bin/env node
/*
 * Runs the payload pack against live DIWASS (the Commission's acceptance
 * environment) and records what DIWASS actually does with each case.
 *
 * - Happy-path and json-level cases go through this API's POST /annexvii,
 *   exactly as the emulator run did. The only change to each payload is the
 *   operator IDs: the emulator's seeded IDs (200001...) are swapped for the
 *   team's live test operators (live/operators-live.json). Countries,
 *   commodity codes and dates are sent as written, to see how DIWASS treats
 *   them.
 * - SOAP-level cases can't use the pack's own XML files: those follow the
 *   spec pack's sample shape, which the live schema has since changed. Each
 *   is rebuilt here instead as one targeted change to the SOAP body DIWASS
 *   accepted on 12 October 2026 (live/evidence/2026-10-12-captured-run), and
 *   sent straight to DIWASS with a WS-Security header.
 *
 * Calls are strictly one at a time (DIWASS forbids concurrent calls).
 *
 * Usage, from the repo root, with the API running against live DIWASS:
 *   node --env-file=.env test-payloads/annex-vii/scripts/run-live.mjs
 * Optional: BASE_URL (default http://127.0.0.1:3055), ONLY=hp-01,err-soap-05
 * Variants: STRIP_COMMODITY=1 removes commodityCodes from json payloads;
 * DOC_SUFFIX=-R2 appends to annexVIIDocumentNo so a re-run isn't a local 409.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { config } from '#/config.js'
import { buildSoapRequest } from '#/diwass-emulator/xml/build.js'
import { ANNEX_VII_REQUEST_NAMESPACES } from '#/diwass-emulator/annex-vii/mapping.js'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3055'
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const STRIP_COMMODITY = process.env.STRIP_COMMODITY === '1'
const DOC_SUFFIX = process.env.DOC_SUFFIX ?? ''
const packRoot = new URL('../', import.meta.url)
const packPath = (p) => fileURLToPath(new URL(p, packRoot))
const read = (p) => readFileSync(packPath(p), 'utf8')

const manifest = JSON.parse(read('manifest.json'))
const operatorMap = JSON.parse(read('live/operators-live.json')).map

const diwassBase = config.get('diwass.baseUrl')
const security = {
  username: config.get('diwass.username'),
  authKey: config.get('diwass.authKey')
}
if (!diwassBase || !security.username || !security.authKey) {
  throw new Error('Set DIWASS_BASE_URL, DIWASS_USERNAME and DIWASS_AUTH_KEY')
}
const ACT_AS = operatorMap['200001']

// ---- happy path and json cases: swap operator IDs, post to /annexvii ----
function livePayload(text) {
  const payload = JSON.parse(
    text.replace(
      /("(?:operatorId|carrierOperatorId)": ")(\d+)(")/g,
      (all, pre, id, post) =>
        operatorMap[id] ? pre + operatorMap[id] + post : all
    )
  )
  if (STRIP_COMMODITY && payload.shipment) {
    delete payload.shipment.commodityCodes
  }
  if (DOC_SUFFIX && payload.annexVIIDocumentNo) {
    payload.annexVIIDocumentNo += DOC_SUFFIX
  }
  return JSON.stringify(payload)
}

async function runJsonCase(entry) {
  const body = livePayload(read(entry.file))
  const started = Date.now()
  const response = await fetch(`${BASE_URL}/annexvii`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
  const parsed = await response.json().catch(() => ({}))
  return {
    httpStatus: response.status,
    diwassStatus: parsed?.diwass?.status ?? null,
    documentNo: parsed?.diwass?.annexViiDocumentNo ?? null,
    requestId: parsed?.diwass?.requestId ?? null,
    errors: (parsed?.diwass?.errors ?? []).map(
      (e) => `${e.code}: ${e.description}`
    ),
    message: parsed?.message ?? parsed?.diwass?.error ?? null,
    ms: Date.now() - started
  }
}

// ---- soap cases: one change each to the accepted baseline body ----
const capturedRequest = read(
  'live/evidence/2026-10-12-captured-run/2-soap-request-to-diwass.xml'
)
const BASELINE_BODY = capturedRequest
  .match(/<soapenv:Body>([\s\S]*)<\/soapenv:Body>/)[1]
  .trim()

const OPERATOR_NAMESPACES = {
  op: 'http://ec.europa.eu/tracesnt/directory/operator/v2',
  opb: 'http://ec.europa.eu/tracesnt/directory/operator/base/v1',
  v3: 'http://ec.europa.eu/tracesnt/body/v3',
  v4: 'http://ec.europa.eu/sanco/tracesnt/base/v4'
}

// Same EORI as DEFRA-ALPHA-TEST (248482), so DIWASS should refuse it.
const DUPLICATE_OPERATOR_BODY = `<op:CreateOperatorRequest><op:Operator>
  <opb:Name>DEFRA-ALPHA-TEST-DUPLICATE</opb:Name>
  <opb:OperatorAddress main="true"><opb:Address>
    <opb:Street>Tate Modern, Bankside</opb:Street>
    <opb:City><opb:Name>London</opb:Name><opb:PostalCode>SE1 9TG</opb:PostalCode><opb:CountryID>GB</opb:CountryID></opb:City>
  </opb:Address></opb:OperatorAddress>
  <opb:OperatorContactDetail><opb:ContactDetail type="phone">+442078878888</opb:ContactDetail></opb:OperatorContactDetail>
  <opb:OperatorContactDetail><opb:ContactDetail type="contact_person_name">Craig Taylor</opb:ContactDetail></opb:OperatorContactDetail>
  <opb:OperatorContactDetail><opb:ContactDetail type="email">craig.taylor@equalexperts.com</opb:ContactDetail></opb:OperatorContactDetail>
  <opb:Identifier type="eori" name="EORI" main="true">XI343558638334</opb:Identifier>
  <opb:Activity>
    <opb:ActivityType>
      <opb:Chapter name="Wasteshipment Regulation">wsr</opb:Chapter>
      <opb:Section name="Wasteshipment Regulation">WSR</opb:Section>
      <opb:Type name="WSR Operator">waste_operator</opb:Type>
    </opb:ActivityType>
  </opb:Activity>
</op:Operator></op:CreateOperatorRequest>`

function mutate(body, from, to) {
  const found = from instanceof RegExp ? from.test(body) : body.includes(from)
  if (!found) {
    throw new Error(`Baseline body has no ${from}`)
  }
  return body.replace(from, to)
}

const SOAP_CASES = {
  'err-soap-01': {
    change: 'Unclosed <v1:illegalActivityIndication> element',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        '<v1:illegalActivityIndication>false</v1:illegalActivityIndication>',
        '<v1:illegalActivityIndication>false'
      )
  },
  'err-soap-02': {
    change: 'Empty actualQuantity (no MassMeasure or VolumeMeasure)',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        /<v11:actualQuantity>[\s\S]*?<\/v11:actualQuantity>/,
        '<v11:actualQuantity></v11:actualQuantity>'
      )
  },
  'err-soap-03': {
    change: 'No <carrier> element',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(BASELINE_BODY, /<v11:carrier>[\s\S]*?<\/v11:carrier>/, '')
  },
  'err-soap-04': {
    change: 'No <wasteClassification> element',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        /<v11:wasteClassification>[\s\S]*?<\/v11:wasteClassification>/,
        ''
      )
  },
  'err-soap-05': {
    change: 'exportCountry countryID "GB" (alpha-2) instead of 826',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        /<v11:exportCountry>\s*<v11:countryID>826<\/v11:countryID>/,
        '<v11:exportCountry><v11:countryID>GB</v11:countryID>'
      )
  },
  'err-soap-06': {
    change:
      'createOperator reusing the EORI of DEFRA-ALPHA-TEST (XI343558638334)',
    service: 'OperatorDirectoryServiceV2',
    namespaces: OPERATOR_NAMESPACES,
    body: () => DUPLICATE_OPERATOR_BODY
  },
  'err-soap-07': {
    change: 'consignee OperatorInternalID 999999 (does not exist)',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        /(<v11:consignee>[\s\S]*?<v11:OperatorInternalID>)248540(<\/v11:OperatorInternalID>)/,
        '$1999999$2'
      )
  },
  'err-soap-08': {
    change: 'arrangerIsProducer false, with no producer or declarationProducer',
    service: 'WasteAnnex7V1',
    body: () =>
      mutate(
        BASELINE_BODY,
        '<v1:arrangerIsProducer>true</v1:arrangerIsProducer>',
        '<v1:arrangerIsProducer>false</v1:arrangerIsProducer>'
      )
  }
}

function tags(xml, tag) {
  return [
    ...xml.matchAll(
      new RegExp(`<[\\w:]*${tag}[^>]*>([^<]*)</[\\w:]*${tag}>`, 'g')
    )
  ].map((m) => m[1])
}

async function runSoapCase(entry) {
  const spec = SOAP_CASES[entry.id]
  const requestXml = buildSoapRequest(spec.body(), {
    namespaces: spec.namespaces ?? ANNEX_VII_REQUEST_NAMESPACES,
    webServiceClientId: config.get('diwass.webServiceClientId'),
    security,
    operatorAccessId: ACT_AS
  })
  const started = Date.now()
  const response = await fetch(
    `${diwassBase.replace(/\/$/, '')}/${spec.service}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: requestXml
    }
  )
  const text = await response.text()
  const codes = tags(text, 'code')
  const descriptions = tags(text, 'description')
  const fault = tags(text, 'faultstring')[0] ?? null
  return {
    change: spec.change,
    httpStatus: response.status,
    diwassStatus: tags(text, 'statusCode')[0] ?? (fault ? 'SOAP Fault' : null),
    documentNo: tags(text, 'annexVIIDocumentNo')[0] ?? null,
    requestId:
      (text.match(/WS_REQUEST_ID<\/ID>\s*<Message>([^<]+)/) ?? [])[1] ?? null,
    errors: fault
      ? [fault]
      : codes.map((c, i) => `${c}: ${descriptions[i] ?? ''}`.trim()),
    operatorIds: tags(text, 'OperatorInternalID'),
    ms: Date.now() - started
  }
}

// ---- run in manifest order, one at a time ----
const entries = [...manifest.happyPath, ...manifest.errorCases].filter(
  (e) => !ONLY || ONLY.includes(e.id)
)
const results = []
for (const entry of entries) {
  const isSoap = entry.type === 'soap'
  let actual
  try {
    actual = isSoap ? await runSoapCase(entry) : await runJsonCase(entry)
  } catch (error) {
    actual = { error: error.message }
  }
  results.push({
    id: entry.id,
    description: entry.description,
    expected: entry.expected,
    actual
  })
  console.log(
    `${entry.id.padEnd(12)} HTTP ${actual.httpStatus ?? '-'} ${actual.diwassStatus ?? ''} ${actual.documentNo ?? ''} ${(actual.errors ?? []).join(' | ')} ${actual.message ?? actual.error ?? ''}`
  )
}

const stamp = new Date().toISOString()
const variant = [ONLY && 'partial', STRIP_COMMODITY && 'no-commodity']
  .filter(Boolean)
  .join('-')
const outFile = `results/live-results-${stamp.slice(0, 10)}${variant ? '-' + variant : ''}.json`
writeFileSync(
  packPath(outFile),
  JSON.stringify(
    {
      ranAt: stamp,
      diwassBase,
      actingAs: ACT_AS,
      operatorMap,
      stripCommodity: STRIP_COMMODITY,
      docSuffix: DOC_SUFFIX,
      results
    },
    null,
    2
  ) + '\n'
)
console.log(`\nwrote ${outFile}`)
