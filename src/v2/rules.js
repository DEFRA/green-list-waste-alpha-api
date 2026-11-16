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

// Kind is derived from origin and destination, never sent.
export function deriveKind(originCountry, destinationCountry) {
  if (originCountry === HOME && destinationCountry === HOME) {
    return KINDS.NATIONAL
  }
  if (originCountry === HOME) {
    return KINDS.EXPORT
  }
  if (destinationCountry === HOME) {
    return KINDS.IMPORT
  }
  return null
}

const withRole = (parties, role) =>
  parties.filter((p) => p.roles.includes(role))

const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/

export function movementProblems(body) {
  const kind = deriveKind(body.originCountry, body.destinationCountry)
  if (!kind) {
    return {
      kind,
      problems: [
        {
          path: 'originCountry',
          message:
            'Either the origin or the destination must be GB. A movement with neither is not supported'
        }
      ]
    }
  }
  if (kind === KINDS.IMPORT) {
    return {
      kind,
      problems: [
        {
          path: 'destinationCountry',
          message: 'Imports are not supported in the proof of concept'
        }
      ]
    }
  }

  const problems = []
  const add = (path, message) => problems.push({ path, message })
  const { parties, legs, wasteItems } = body

  const arrangers = withRole(parties, 'ARRANGER')
  const producers = withRole(parties, 'PRODUCER')
  const receivers = withRole(parties, 'RECEIVER')

  if (kind === KINDS.EXPORT) {
    if (arrangers.length !== 1) {
      add('parties', 'An export needs exactly one ARRANGER')
    }
    if (receivers.length !== 1) {
      add('parties', 'An export needs exactly one RECEIVER')
    }
    if (
      producers.length === 0 &&
      arrangers[0] &&
      !arrangers[0].roles.includes('PRODUCER')
    ) {
      add(
        'parties',
        'A PRODUCER is required unless the arranger also holds that role'
      )
    }
    if (wasteItems.length !== 1) {
      add('wasteItems', 'An export takes exactly one waste item')
    }
  } else if (arrangers.length > 1) {
    add('parties', 'A national movement has at most one ARRANGER')
  }

  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const everyParty = [...parties, ...legs.map((l) => l.carrier)]
  everyParty.forEach((p, i) => {
    p.identifiers.forEach((id, j) => {
      if (id.scheme === 'DIWASS_UUID' && !GUID.test(id.value)) {
        add(
          `parties[${i}].identifiers[${j}].value`,
          'A DIWASS_UUID must be a UUID'
        )
      }
    })
    if (p.identifiers.filter((id) => id.main).length > 1) {
      add(
        `parties[${i}].identifiers`,
        'main can be true on one identifier at most'
      )
    }
  })

  parties.forEach((p, i) => {
    if (p.roles.includes('CARRIER')) {
      add(`parties[${i}].roles`, 'Carriers go in legs[], not parties[]')
    }
    if (p.roles.includes('ARRANGER') && !p.arrangerType) {
      add(
        `parties[${i}].arrangerType`,
        'arrangerType is needed on the ARRANGER'
      )
    }
  })

  const everyone = [
    ...parties.map((p, i) => [`parties[${i}]`, p]),
    ...legs.map((l, i) => [`legs[${i}].carrier`, l.carrier])
  ]
  if (kind === KINDS.NATIONAL) {
    everyone.forEach(([path, p]) => {
      if (
        p.address.countryCode === HOME &&
        !UK_POSTCODE.test(p.address.postcode)
      ) {
        add(`${path}.address.postcode`, 'Not a UK postcode')
      }
    })
  }

  legs.forEach((l, i) => {
    if (!l.carrier.roles.includes('CARRIER')) {
      add(
        `legs[${i}].carrier.roles`,
        'A leg carrier must hold the CARRIER role'
      )
    }
    if (l.order !== i + 1) {
      add(
        `legs[${i}].order`,
        `Legs must be numbered from 1 with no gaps: expected ${i + 1}`
      )
    }
  })

  if (kind === KINDS.EXPORT) {
    wasteItems.forEach((w, i) => {
      if (w.treatments.length !== 1) {
        add(
          `wasteItems[${i}].treatments`,
          'An export takes one treatment for now'
        )
      }
    })
  }

  return { kind, problems }
}

export function collectionProblems(body, movement) {
  const problems = []
  if (body.legOrder === 1 && !body.quantity) {
    problems.push({
      path: 'quantity',
      message: 'quantity is required on the first leg'
    })
  }
  if (!movement) {
    return problems
  }
  const done = movement.collections.length
  if (body.legOrder !== done + 1) {
    problems.push({
      path: 'legOrder',
      message: `legOrder must be the next leg: expected ${done + 1}`
    })
  } else if (body.legOrder > movement.legs.length && !body.carrier) {
    problems.push({
      path: 'legOrder',
      message: `The plan has ${movement.legs.length} leg(s). Give a carrier to add another`
    })
  }
  const last = movement.collections.at(-1)
  if (last && new Date(body.collectedAt) < new Date(last.collectedAt)) {
    problems.push({
      path: 'collectedAt',
      message: 'collectedAt is before the previous collection'
    })
  }
  return problems
}

export function deliveryProblems(body, movements) {
  const problems = []
  if (movements.some((m) => m.kind === KINDS.EXPORT)) {
    if (movements.length > 1) {
      problems.push({
        path: 'movementIds',
        message: 'An export takes exactly one movement per delivery'
      })
    }
    movements.forEach((m) => {
      if (body.deliverySite.address.countryCode !== m.destinationCountry) {
        problems.push({
          path: 'deliverySite.address.countryCode',
          message: `The site must be in the destination country, ${m.destinationCountry}`
        })
      }
    })
  }
  movements.forEach((m) => {
    const last = m.collections.at(-1)
    if (last && new Date(body.deliveredAt) < new Date(last.collectedAt)) {
      problems.push({
        path: 'deliveredAt',
        message: 'deliveredAt is before the last collection'
      })
    }
  })
  return problems
}

export function receiptProblems(body) {
  const problems = []
  const { outcome } = body
  const need = (cond, path, message) => cond && problems.push({ path, message })
  if (outcome.status === 'ACCEPTED') {
    need(
      !outcome.acceptedQuantity,
      'outcome.acceptedQuantity',
      'ACCEPTED needs acceptedQuantity'
    )
    need(
      outcome.rejectedQuantity,
      'outcome.rejectedQuantity',
      'ACCEPTED takes no rejectedQuantity'
    )
  } else if (outcome.status === 'REJECTED') {
    need(
      !outcome.rejectedQuantity,
      'outcome.rejectedQuantity',
      'REJECTED needs rejectedQuantity'
    )
    need(!outcome.reason, 'outcome.reason', 'REJECTED needs a reason')
  } else {
    need(
      !outcome.acceptedQuantity,
      'outcome.acceptedQuantity',
      'PART_ACCEPTED needs acceptedQuantity'
    )
    need(
      !outcome.rejectedQuantity,
      'outcome.rejectedQuantity',
      'PART_ACCEPTED needs rejectedQuantity'
    )
    need(!outcome.reason, 'outcome.reason', 'PART_ACCEPTED needs a reason')
  }
  need(
    body.receivedBy === 'FACILITY' && !body.treatments?.length,
    'treatments',
    'A facility receipt needs at least one treatment'
  )
  return problems
}
