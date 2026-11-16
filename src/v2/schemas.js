import Joi from 'joi'

/*
[Common model schemas]
Layer 2 of the /v2 validation pipeline: shape only. Every problem is
reported, not just the first. Rules that need several fields to be read
together (layer 4) live in rules.js.
*/
export const MEANS_OF_TRANSPORT = [
  'ROAD',
  'RAIL',
  'SEA',
  'AIR',
  'INLAND_WATERWAYS',
  'OTHER'
]
export const CODE_SCHEMES = [
  'EWC',
  'BASEL_ANNEX_IX',
  'OECD',
  'ANNEX_IIIA',
  'ANNEX_IIIB',
  'NATIONAL'
]
export const PARTY_ROLES = [
  'PRODUCER',
  'ARRANGER',
  'COLLECTION_SITE',
  'CARRIER',
  'RECEIVER',
  'FACILITY',
  'LABORATORY'
]
const IDENTIFIER_SCHEMES = [
  'CARRIER_REGISTRATION',
  'ENVIRONMENTAL_PERMIT',
  'DIWASS_OPERATOR_ID',
  'DIWASS_UUID',
  'EORI',
  'VAT'
]
const EVIDENCE_REFERENCE_TYPES = [
  'NOTIFICATION_NO',
  'MOVEMENT_DOC_NO',
  'ANNEX_VII_NO',
  'CONTAINER_ID'
]
const EVIDENCE_DOCUMENT_TYPES = ['DOCUMENT', 'CERTIFICATE']

const country = Joi.string().pattern(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2')
const treatmentCode = Joi.string().pattern(
  /^(R(1[0-3]|[1-9])|D(1[0-5]|[1-9]))$/
)
const timestamp = Joi.date().iso()

export const quantity = Joi.object({
  tonnes: Joi.number().min(0),
  metersCubed: Joi.number().min(0),
  isEstimate: Joi.boolean().default(false)
})
  .or('tonnes', 'metersCubed')
  .messages({
    'object.missing': '{{#label}} must give tonnes, metersCubed or both'
  })

export const declaration = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  roleInOrganisation: Joi.string().required(),
  timestamp: timestamp.required(),
  uuid: Joi.string().guid().required(),
  additionalAuthenticationString: Joi.string().allow(null)
})

const codeEntry = Joi.object({
  scheme: Joi.string()
    .valid(...CODE_SCHEMES)
    .required(),
  value: Joi.string().required()
})

const address = Joi.object({
  fullAddress: Joi.string().required(),
  postcode: Joi.string().required(),
  countryCode: country.required(),
  cityName: Joi.string(),
  latitude: Joi.number(),
  longitude: Joi.number()
})

const identifier = Joi.object({
  scheme: Joi.string()
    .valid(...IDENTIFIER_SCHEMES)
    .required(),
  value: Joi.string().required(),
  main: Joi.boolean()
})

const contact = Joi.object({
  contactPerson: Joi.string(),
  email: Joi.string().email(),
  phone: Joi.string(),
  fax: Joi.string(),
  websiteUrl: Joi.string().uri()
}).or('email', 'phone')

export const evidence = Joi.object({
  type: Joi.string()
    .valid(...EVIDENCE_REFERENCE_TYPES, ...EVIDENCE_DOCUMENT_TYPES)
    .required(),
  reference: Joi.string(),
  file: Joi.object({
    filename: Joi.string().required(),
    mediaType: Joi.string().required(),
    url: Joi.string().uri().required()
  })
}).xor('reference', 'file')

export const party = Joi.object({
  roles: Joi.array()
    .items(Joi.string().valid(...PARTY_ROLES))
    .min(1)
    .unique()
    .required(),
  arrangerType: Joi.string().valid('BROKER', 'DEALER', 'OTHER'),
  name: Joi.string().required(),
  intended: Joi.boolean(),
  reasonForNoIdentifier: Joi.string(),
  identifiers: Joi.array().items(identifier).min(1).required(),
  contact: contact.required(),
  address: address.required(),
  facilityType: Joi.string(),
  isInterimFacility: Joi.boolean(),
  nameIsConfidential: Joi.boolean(),
  confidentialityExplanation: Joi.string(),
  responsiblePerson: Joi.object({
    name: Joi.string().required(),
    phone: Joi.string(),
    email: Joi.string().email()
  })
})

const carrierParty = party.keys({
  roles: Joi.array().items(Joi.string().valid('CARRIER')).min(1).required()
})

const leg = Joi.object({
  order: Joi.number().integer().min(1).required(),
  intended: Joi.boolean(),
  carrier: party.required(),
  meansOfTransport: Joi.string()
    .valid(...MEANS_OF_TRANSPORT)
    .required(),
  otherMeansOfTransport: Joi.string().when('meansOfTransport', {
    is: 'OTHER',
    then: Joi.required()
  }),
  vehicleRegistration: Joi.string()
})

const wasteItem = Joi.object({
  classification: Joi.object({
    wasteDescription: Joi.string().required(),
    codes: Joi.array().items(codeEntry).min(1).required(),
    commodityCodes: Joi.array().items(Joi.string())
  }).required(),
  physicalDetails: Joi.object({
    form: Joi.string(),
    containerType: Joi.string(),
    containerCount: Joi.number().integer().min(0)
  }),
  quantity: quantity.required(),
  treatments: Joi.array()
    .items(
      Joi.object({
        code: treatmentCode.required(),
        weight: quantity
      })
    )
    .min(1)
    .required()
})

export const movementBody = Joi.object({
  annexViiNumber: Joi.string(),
  yourUniqueReference: Joi.string(),
  originCountry: country.required(),
  destinationCountry: country.required(),
  transitCountries: Joi.array().items(country),
  plannedCollectionAt: timestamp,
  parties: Joi.array().items(party).required(),
  legs: Joi.array().items(leg).min(1).required(),
  wasteItems: Joi.array().items(wasteItem).min(1).required(),
  wasteSource: Joi.string().valid('HOUSEHOLD', 'COMMERCIAL', 'MUNICIPAL'),
  specialHandlingRequirements: Joi.string(),
  consignmentNote: Joi.object({
    code: Joi.string(),
    reasonForNoCode: Joi.string()
  }),
  createdDueToTakeBack: Joi.boolean(),
  createdDueToIllegalActivity: Joi.boolean(),
  evidence: Joi.array().items(evidence),
  declaredBy: declaration
})

export const cancelBody = Joi.object({
  status: Joi.string().valid('CANCELLED').required(),
  cancellation: Joi.object({
    reason: Joi.string().required(),
    cancelledBy: Joi.object({
      name: Joi.string().required(),
      roleInOrganisation: Joi.string().required(),
      email: Joi.string().email()
    }).required()
  }).required()
})

// PUT /v2/movement/{id} takes either the plan (form A) or a cancellation (form B).
export const putBody = Joi.alternatives().conditional(
  Joi.object({ status: Joi.exist() }).unknown(),
  { then: cancelBody, otherwise: movementBody }
)

export const collectionBody = Joi.object({
  movementId: Joi.string().guid().required(),
  legOrder: Joi.number().integer().min(1).required(),
  collectedAt: timestamp.required(),
  quantity,
  carrier: carrierParty,
  meansOfTransport: Joi.string().valid(...MEANS_OF_TRANSPORT),
  vehicleRegistration: Joi.string(),
  evidence: Joi.array().items(evidence),
  declaredBy: declaration
})

export const deliveryBody = Joi.object({
  movementIds: Joi.array()
    .items(Joi.string().guid())
    .min(1)
    .unique()
    .required(),
  deliveredAt: timestamp.required(),
  deliverySite: Joi.object({
    name: Joi.string(),
    address: address.required()
  }).required(),
  declaredBy: declaration,
  evidence: Joi.array().items(evidence)
})

export const receiptBody = Joi.object({
  deliveryId: Joi.string().guid().required(),
  receivedBy: Joi.string().valid('RECEIVER', 'FACILITY').required(),
  receivedAt: timestamp.required(),
  outcome: Joi.object({
    status: Joi.string()
      .valid('ACCEPTED', 'REJECTED', 'PART_ACCEPTED')
      .required(),
    acceptedQuantity: quantity,
    rejectedQuantity: quantity,
    reason: Joi.object({
      languageCode: Joi.string().required(),
      value: Joi.string().required()
    })
  }).required(),
  treatments: Joi.array().items(
    Joi.object({ code: treatmentCode.required(), weight: quantity })
  ),
  evidence: Joi.array().items(evidence),
  declaredBy: declaration
})

export const idParams = Joi.object({
  movementId: Joi.string().guid().required()
})
