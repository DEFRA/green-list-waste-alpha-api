/*
[Rule set]
Layer 4 of the /v2 validation pipeline. Reads the whole body together.
Each function returns a list of { path, message } problems; an empty list
means the request passes. Rules that only apply when DWT submits to DIWASS
are not applied: DIWASS submission is not built yet, so every call runs the
DWT-only route.
*/
export const KINDS = {
  NATIONAL: 'NATIONAL',
  EXPORT: 'EXPORT',
  IMPORT: 'IMPORT'
}
const HOME = 'GB'
const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const problem = (path, message) => ({ path, message })

// Kind is derived from origin and destination, never sent.
export function deriveKind(originCountry, destinationCountry) {
  if (originCountry === HOME) {
    return destinationCountry === HOME ? KINDS.NATIONAL : KINDS.EXPORT
  }
  return destinationCountry === HOME ? KINDS.IMPORT : null
}

const withRole = (parties, role) =>
  parties.filter((p) => p.roles.includes(role))

const KIND_REFUSALS = {
  [KINDS.IMPORT]: problem(
    'destinationCountry',
    'Imports are not supported in the proof of concept'
  )
}
const NO_KIND = problem(
  'originCountry',
  'Either the origin or the destination must be GB. A movement with neither is not supported'
)

function exportProblems({ parties, wasteItems }) {
  const arrangers = withRole(parties, 'ARRANGER')
  const found = []
  if (arrangers.length !== 1) {
    found.push(problem('parties', 'An export needs exactly one ARRANGER'))
  }
  if (withRole(parties, 'RECEIVER').length !== 1) {
    found.push(problem('parties', 'An export needs exactly one RECEIVER'))
  }
  const hasProducer =
    withRole(parties, 'PRODUCER').length > 0 ||
    arrangers.some((a) => a.roles.includes('PRODUCER'))
  if (!hasProducer) {
    found.push(
      problem(
        'parties',
        'A PRODUCER is required unless the arranger also holds that role'
      )
    )
  }
  if (wasteItems.length !== 1) {
    found.push(problem('wasteItems', 'An export takes exactly one waste item'))
  }
  wasteItems.forEach((w, i) => {
    if (w.treatments.length !== 1) {
      found.push(
        problem(
          `wasteItems[${i}].treatments`,
          'An export takes one treatment for now'
        )
      )
    }
  })
  return found
}

function nationalProblems({ parties, legs }) {
  const found = []
  if (withRole(parties, 'ARRANGER').length > 1) {
    found.push(
      problem('parties', 'A national movement has at most one ARRANGER')
    )
  }
  const everyone = [
    ...parties.map((p, i) => [`parties[${i}]`, p]),
    ...legs.map((l, i) => [`legs[${i}].carrier`, l.carrier])
  ]
  for (const [path, p] of everyone) {
    if (
      p.address.countryCode === HOME &&
      !UK_POSTCODE.test(p.address.postcode)
    ) {
      found.push(problem(`${path}.address.postcode`, 'Not a UK postcode'))
    }
  }
  return found
}

function identifierProblems(parties) {
  const found = []
  parties.forEach((p, i) => {
    p.identifiers.forEach((id, j) => {
      if (id.scheme === 'DIWASS_UUID' && !GUID.test(id.value)) {
        found.push(
          problem(
            `parties[${i}].identifiers[${j}].value`,
            'A DIWASS_UUID must be a UUID'
          )
        )
      }
    })
    if (p.identifiers.filter((id) => id.main).length > 1) {
      found.push(
        problem(
          `parties[${i}].identifiers`,
          'main can be true on one identifier at most'
        )
      )
    }
  })
  return found
}

function roleProblems(parties) {
  const found = []
  parties.forEach((p, i) => {
    if (p.roles.includes('CARRIER')) {
      found.push(
        problem(`parties[${i}].roles`, 'Carriers go in legs[], not parties[]')
      )
    }
    if (p.roles.includes('ARRANGER') && !p.arrangerType) {
      found.push(
        problem(
          `parties[${i}].arrangerType`,
          'arrangerType is needed on the ARRANGER'
        )
      )
    }
  })
  return found
}

function legProblems(legs) {
  const found = []
  legs.forEach((l, i) => {
    if (!l.carrier.roles.includes('CARRIER')) {
      found.push(
        problem(
          `legs[${i}].carrier.roles`,
          'A leg carrier must hold the CARRIER role'
        )
      )
    }
    if (l.order !== i + 1) {
      found.push(
        problem(
          `legs[${i}].order`,
          `Legs must be numbered from 1 with no gaps: expected ${i + 1}`
        )
      )
    }
  })
  return found
}

export function movementProblems(body) {
  const kind = deriveKind(body.originCountry, body.destinationCountry)
  const refusal = kind ? KIND_REFUSALS[kind] : NO_KIND
  if (refusal) {
    return { kind, problems: [refusal] }
  }
  const byKind =
    kind === KINDS.EXPORT ? exportProblems(body) : nationalProblems(body)
  const everyParty = [...body.parties, ...body.legs.map((l) => l.carrier)]
  return {
    kind,
    problems: [
      ...byKind,
      ...identifierProblems(everyParty),
      ...roleProblems(body.parties),
      ...legProblems(body.legs)
    ]
  }
}

export function collectionProblems(body, movement) {
  const found = []
  if (body.legOrder === 1 && !body.quantity) {
    found.push(problem('quantity', 'quantity is required on the first leg'))
  }
  if (!movement) {
    return found
  }
  const done = movement.collections.length
  if (body.legOrder !== done + 1) {
    found.push(
      problem('legOrder', `legOrder must be the next leg: expected ${done + 1}`)
    )
  } else if (body.legOrder > movement.legs.length && !body.carrier) {
    found.push(
      problem(
        'legOrder',
        `The plan has ${movement.legs.length} leg(s). Give a carrier to add another`
      )
    )
  }
  const last = movement.collections.at(-1)
  if (last && new Date(body.collectedAt) < new Date(last.collectedAt)) {
    found.push(
      problem('collectedAt', 'collectedAt is before the previous collection')
    )
  }
  return found
}

export function deliveryProblems(body, movements) {
  const found = []
  const exports = movements.filter((m) => m.kind === KINDS.EXPORT)
  if (exports.length > 0 && movements.length > 1) {
    found.push(
      problem(
        'movementIds',
        'An export takes exactly one movement per delivery'
      )
    )
  }
  for (const m of exports) {
    if (body.deliverySite.address.countryCode !== m.destinationCountry) {
      found.push(
        problem(
          'deliverySite.address.countryCode',
          `The site must be in the destination country, ${m.destinationCountry}`
        )
      )
    }
  }
  for (const m of movements) {
    const last = m.collections.at(-1)
    if (last && new Date(body.deliveredAt) < new Date(last.collectedAt)) {
      found.push(
        problem('deliveredAt', 'deliveredAt is before the last collection')
      )
    }
  }
  return found
}

// What each outcome status needs, and what it must not carry.
const OUTCOME_RULES = {
  ACCEPTED: { need: ['acceptedQuantity'], forbid: ['rejectedQuantity'] },
  REJECTED: { need: ['rejectedQuantity', 'reason'], forbid: [] },
  PART_ACCEPTED: {
    need: ['acceptedQuantity', 'rejectedQuantity', 'reason'],
    forbid: []
  }
}

export function receiptProblems(body) {
  const { outcome } = body
  const rule = OUTCOME_RULES[outcome.status]
  const found = [
    ...rule.need
      .filter((field) => !outcome[field])
      .map((field) =>
        problem(`outcome.${field}`, `${outcome.status} needs ${field}`)
      ),
    ...rule.forbid
      .filter((field) => outcome[field])
      .map((field) =>
        problem(`outcome.${field}`, `${outcome.status} takes no ${field}`)
      )
  ]
  if (body.receivedBy === 'FACILITY' && !body.treatments?.length) {
    found.push(
      problem('treatments', 'A facility receipt needs at least one treatment')
    )
  }
  return found
}
