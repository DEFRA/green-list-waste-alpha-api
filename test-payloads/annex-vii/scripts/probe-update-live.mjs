#!/usr/bin/env node
/*
 * Probes what live DIWASS lets an operator change on an announced Annex VII,
 * and how it treats cancellation. Each probe sends the whole document again
 * (as UpdateAnnex7DocumentTypeRequest) with one change from the current
 * state, so probes do not build on each other. Every body is checked against
 * the live XSD with xmllint before it is sent. Calls are one at a time.
 *
 * The cancel probe withdraws the test document, so it runs last but one; the
 * final probe checks an update is refused after cancelling.
 *
 * Usage, from the repo root:
 *   node --env-file=.env test-payloads/annex-vii/scripts/probe-update-live.mjs
 * DRY=1 checks every body against the schema and sends nothing.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from '#/config.js'
import { buildSoapRequest } from '#/diwass-emulator/xml/build.js'
import {
  ANNEX_VII_REQUEST_NAMESPACES,
  buildAnnex7SignalRequestBody,
  buildUpdateAnnex7RequestBody
} from '#/diwass-emulator/annex-vii/mapping.js'

const packRoot = new URL('../', import.meta.url)
const packPath = (p) => fileURLToPath(new URL(p, packRoot))
const schema = packPath('live-schema/x3.xsd')
const scratch = mkdtempSync(join(tmpdir(), 'annex7-probe-'))

const DOC = 'GLW.GB260000001574i' // announced and updated on 12 October 2026
const OTHER_OPERATORS_DOC = 'GLW.GB260000001552i' // arranged by 248540
const UNKNOWN_DOC = 'GLW.GB269999999999i'

const read = (p) => JSON.parse(readFileSync(packPath(p), 'utf8'))
// The document's current state: payload 01 as updated on 12 October 2026.
const current = read('live/01-defra-alpha-test.json')
current.shipment.actualQuantity.tonnes = 1.35
current.shipment.actualDateOfShipment = '2026-10-13'

function changed(fn) {
  const payload = structuredClone(current)
  fn(payload)
  return payload
}

const update = (payload, docNo = DOC) => ({
  body: buildUpdateAnnex7RequestBody(payload, docNo),
  actAs: payload.shipmentArranger.operatorId
})

const probes = [
  {
    id: 'upd-carrier',
    change: 'Carrier 248626 replaced by 248625',
    ...update(
      changed((p) => {
        p.carriers[0].operatorId = '248625'
      })
    )
  },
  {
    id: 'upd-consignee-facility',
    change: 'Consignee and recovery facility 248540 replaced by 248625',
    ...update(
      changed((p) => {
        p.importerConsignee.operatorId = '248625'
        p.recoveryFacility.operatorId = '248625'
      })
    )
  },
  {
    id: 'upd-waste-code',
    change: 'Waste code Basel B3020 replaced by B1010',
    ...update(
      changed((p) => {
        p.wasteIdentification = { baselAnnexIX: 'B1010' }
      })
    )
  },
  {
    id: 'upd-import-country',
    change: 'Import country GB replaced by DE',
    ...update(
      changed((p) => {
        p.countriesStatesConcerned.importDestinationCountry = 'DE'
      })
    )
  },
  {
    id: 'upd-restore',
    change: 'Back to the current state (no change)',
    ...update(current)
  },
  {
    id: 'upd-other-operators-doc',
    change: `Update ${OTHER_OPERATORS_DOC} (arranger 248540) while acting as 248482`,
    body: buildUpdateAnnex7RequestBody(
      read('live/02-defra-alpha-test-b.json'),
      OTHER_OPERATORS_DOC
    ),
    actAs: '248482'
  },
  {
    id: 'upd-unknown-doc',
    change: `Update ${UNKNOWN_DOC}, which does not exist`,
    ...update(current, UNKNOWN_DOC)
  },
  {
    id: 'cancel',
    change: `Annex7Cancelled signal for ${DOC}`,
    body: buildAnnex7SignalRequestBody({
      annexVIIDocumentNo: DOC,
      typeCode: 'Annex7Cancelled',
      description: 'TEST ONLY - DEFRA-ALPHA-TEST: export not going ahead',
      signature: {
        name: 'Test Signatory (DEFRA-ALPHA-TEST)',
        organizationRole: 'Director (test)',
        timestamp: new Date().toISOString(),
        emailURI: 'craig.taylor@equalexperts.com'
      }
    }),
    actAs: '248482'
  },
  {
    id: 'upd-after-cancel',
    change: `Update ${DOC} after cancelling it`,
    ...update(current)
  }
]

const tags = (xml, tag) =>
  [
    ...xml.matchAll(
      new RegExp(`<[\\w:]*${tag}[^>]*>([^<]*)</[\\w:]*${tag}>`, 'g')
    )
  ].map((m) => m[1])

function schemaCheck(id, body) {
  const nsAttrs = Object.entries(ANNEX_VII_REQUEST_NAMESPACES)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(' ')
  const file = join(scratch, `${id}.xml`)
  writeFileSync(file, body.replace(/^(\s*<v1:\w+)>/, `$1 ${nsAttrs}>`))
  execFileSync('xmllint', ['--noout', '--schema', schema, file], {
    stdio: ['ignore', 'ignore', 'pipe']
  })
}

const security = {
  username: config.get('diwass.username'),
  authKey: config.get('diwass.authKey')
}
const results = []
for (const probe of probes) {
  try {
    schemaCheck(probe.id, probe.body)
  } catch (error) {
    results.push({
      id: probe.id,
      change: probe.change,
      schemaError: String(error.stderr ?? error.message)
    })
    console.log(`${probe.id.padEnd(24)} SCHEMA FAILED, not sent`)
    continue
  }
  if (process.env.DRY === '1') {
    console.log(`${probe.id.padEnd(24)} schema valid`)
    continue
  }
  const xml = buildSoapRequest(probe.body, {
    namespaces: ANNEX_VII_REQUEST_NAMESPACES,
    webServiceClientId: config.get('diwass.webServiceClientId'),
    security,
    operatorAccessId: probe.actAs
  })
  const response = await fetch(
    `${config.get('diwass.baseUrl')}/WasteAnnex7V1`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: xml
    }
  )
  const text = await response.text()
  const fault = tags(text, 'faultstring')[0] ?? null
  const codes = tags(text, 'code')
  const descriptions = tags(text, 'description')
  const result = {
    id: probe.id,
    change: probe.change,
    actingAs: probe.actAs,
    httpStatus: response.status,
    statusCode: tags(text, 'statusCode')[0] ?? (fault ? 'SOAP Fault' : null),
    annexVIIDocumentNo: tags(text, 'annexVIIDocumentNo')[0] ?? null,
    requestId:
      (text.match(/WS_REQUEST_ID<\/ID>\s*<Message>([^<]+)/) ?? [])[1] ?? null,
    errors: fault
      ? [fault]
      : codes.map((c, i) => `${c}: ${descriptions[i] ?? ''}`.trim()),
    responseRoot: (text.match(/<S:Body>\s*<([\w:]+)/) ?? [])[1] ?? null
  }
  results.push(result)
  console.log(
    `${probe.id.padEnd(24)} HTTP ${result.httpStatus} ${result.statusCode} ${result.annexVIIDocumentNo ?? ''} ${result.errors.join(' | ')}`
  )
}

if (process.env.DRY === '1') process.exit(0)
const out = packPath(
  `results/live-update-probes-${new Date().toISOString().slice(0, 10)}.json`
)
writeFileSync(
  out,
  JSON.stringify(
    { ranAt: new Date().toISOString(), document: DOC, results },
    null,
    2
  ) + '\n'
)
console.log(`\nwrote ${out}`)
