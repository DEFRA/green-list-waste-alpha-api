#!/usr/bin/env node
/*
 * Builds the CreateAnnex7DocumentTypeRequest body for every happy-path
 * payload with the same builder the API uses for outbound DIWASS calls,
 * then validates each one against the live DIWASS schema in ../live-schema
 * with xmllint. Makes no network calls.
 *
 * Usage (from the repo root): node test-payloads/annex-vii/scripts/validate-live-schema.mjs
 * Needs xmllint (libxml2) on the PATH.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCreateAnnex7RequestBody,
  ANNEX_VII_REQUEST_NAMESPACES
} from '#/diwass-emulator/annex-vii/mapping.js'

const packRoot = fileURLToPath(new URL('../', import.meta.url))
const schema = join(packRoot, 'live-schema', 'x3.xsd')
const happyPath = join(packRoot, 'happy-path')
const outDir = mkdtempSync(join(tmpdir(), 'annex7-live-schema-'))

const nsAttrs = Object.entries(ANNEX_VII_REQUEST_NAMESPACES)
  .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
  .join(' ')

let failures = 0
for (const file of readdirSync(happyPath).filter((f) => f.endsWith('.json'))) {
  const payload = JSON.parse(readFileSync(join(happyPath, file), 'utf8'))
  const body = buildCreateAnnex7RequestBody(payload).replace(
    '<v1:CreateAnnex7DocumentTypeRequest>',
    `<v1:CreateAnnex7DocumentTypeRequest ${nsAttrs}>`
  )
  const xmlPath = join(outDir, file.replace('.json', '.xml'))
  writeFileSync(xmlPath, body)
  try {
    execFileSync('xmllint', ['--noout', '--schema', schema, xmlPath], {
      stdio: 'pipe'
    })
    console.log(`valid    ${file}`)
  } catch (error) {
    failures += 1
    console.log(`INVALID  ${file}\n${error.stderr.toString().trim()}`)
  }
}

console.log(
  `\n${failures === 0 ? 'All valid' : `${failures} invalid`} (XML in ${outDir})`
)
process.exit(failures === 0 ? 0 : 1)
