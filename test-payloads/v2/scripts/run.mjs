#!/usr/bin/env node
/*
 * Runs the /v2 test pack against a running API, end to end.
 *
 *   BASE_URL=https://... TOKEN=<bearer token> node test-payloads/v2/scripts/run.mjs
 *
 * BASE_URL defaults to http://127.0.0.1:3055 (a local run, no token needed).
 * TOKEN is read from the environment and never written anywhere. Get one
 * with the client-credentials request in the API spec.
 *
 * Options:  --only H1,E9   run only these scenarios
 *           --verbose      print each response body
 *
 * Each scenario in manifest.json is a short sequence of calls. A call may
 * save values from its response ({{movementId}}, {{deliveryId}}, {{revision}})
 * for the next call to use. {{runId}} is new on every run, so the pack can be
 * run again against the same database. Exit code 1 if anything differs from
 * what the manifest expects.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packRoot = new URL('../', import.meta.url)
const manifest = JSON.parse(
  readFileSync(new URL('manifest.json', packRoot), 'utf8')
)

const fill = (text, vars) =>
  text.replace(/\{\{(\w+)\}\}/g, (whole, name) => vars[name] ?? whole)

function dig(value, path) {
  return path
    .split('.')
    .reduce((node, key) => (node == null ? undefined : node[key]), value)
}

/*
 * send(method, path, body, headers) -> { status, body }. The CLI sends over
 * HTTP; the pack's own test sends through server.inject.
 */
export async function runPack(
  send,
  { only, verbose = false, log = console.log } = {}
) {
  const runId = String(Date.now()).slice(-9) + Math.floor(Math.random() * 10)
  const results = []
  for (const scenario of manifest.scenarios) {
    if (only && !only.includes(scenario.id)) {
      continue
    }
    const vars = { runId }
    let failed = null
    for (const [i, step] of scenario.steps.entries()) {
      Object.assign(vars, step.vars)
      const body = step.file
        ? JSON.parse(
            fill(readFileSync(new URL(step.file, packRoot), 'utf8'), vars)
          )
        : undefined
      const headers = Object.fromEntries(
        Object.entries(step.headers ?? {}).map(([k, v]) => [k, fill(v, vars)])
      )
      const res = await send(step.method, fill(step.path, vars), body, headers)
      if (verbose) {
        log(`    ${step.method} ${step.path} -> ${res.status}`)
        log(JSON.stringify(res.body, null, 2).replace(/^/gm, '      '))
      }
      const problems = []
      if (res.status !== step.expect) {
        problems.push(`expected ${step.expect}, got ${res.status}`)
      }
      for (const [path, want] of Object.entries(step.check ?? {})) {
        const got = dig(res.body, path)
        if (got !== want) {
          problems.push(
            `${path}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
          )
        }
      }
      for (const [name, path] of Object.entries(step.save ?? {})) {
        vars[name] = String(dig(res.body, path))
      }
      if (problems.length) {
        failed = { step: i + 1, name: step.name, problems, body: res.body }
        break
      }
    }
    results.push({
      id: scenario.id,
      title: scenario.title,
      steps: scenario.steps.length,
      failed
    })
    log(
      `${failed ? 'FAIL' : 'ok  '}  ${scenario.id.padEnd(4)} ${scenario.title}` +
        (failed
          ? `\n        step ${failed.step} (${failed.name}): ${failed.problems.join('; ')}\n        ${JSON.stringify(failed.body)}`
          : '')
    )
  }
  const bad = results.filter((r) => r.failed).length
  log(`\n${results.length - bad} of ${results.length} scenarios as expected`)
  return { results, ok: bad === 0 }
}

async function main() {
  const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:3055').replace(
    /\/$/,
    ''
  )
  const token = process.env.TOKEN
  const args = process.argv.slice(2)
  const onlyArg = args.indexOf('--only')
  const only = onlyArg >= 0 ? args[onlyArg + 1].split(',') : undefined
  const send = async (method, path, body, headers) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
    return { status: res.status, body: parsed }
  }
  console.log(`Running the /v2 pack against ${baseUrl}\n`)
  const { ok } = await runPack(send, {
    only,
    verbose: args.includes('--verbose')
  })
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
