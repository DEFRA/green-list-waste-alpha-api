import { faker } from '@faker-js/faker'
import { scheduleProcessor } from '#/plugins/sqs.js'

export async function createRandomAnnexVii(request) {
  await scheduleProcessor(request, 'createAnnexVii', createRandomData())
}

export const createRandomData = () => ({
  annexVIIDocumentNo: `AX-${faker.number.int({ min: 2000, max: 2030 })}-${createPaddedNumber()}`,
  shipmentArranger: {
    operatorId: `OP-${createPaddedNumber()}`,
    uuid: faker.string.uuid(),
    contactDetails: createRandomPerson().contactDetails,
    isAlsoWasteProducer: faker.datatype.boolean()
  },
  importerConsignee: {
    operatorId: `OP-${createPaddedNumber()}`,
    uuid: faker.string.uuid(),
    contactDetails: createRandomPerson().contactDetails
  },
  shipment: {
    actualQuantity: {
      tonnes: faker.number.int({ min: 1, max: 999 }),
      metersCubed: faker.number.int({ min: 1, max: 999 })
    },
    actualDateOfShipment: faker.date.past(),
    createdDueToTakeBack: faker.datatype.boolean(),
    createdDueToIllegalActivity: faker.datatype.boolean(),
    commodityCodes: [
      `${faker.number.int({ min: 1000, max: 9999 })} ${faker.number.int({ min: 10, max: 99 })} ${faker.number.int({ min: 10, max: 99 })}`
    ]
  },
  carriers: [
    {
      operatorId: `OP-${createPaddedNumber()}`,
      uuid: faker.string.uuid(),
      contactDetails: createRandomPerson().contactDetails,
      meansOfTransportCode: 'R',
      transferDate: faker.date.recent(),
      declaration: {
        authenticatedBy: createRandomPerson().authenticatedBy
      }
    }
  ],
  recoveryFacility: {
    operatorId: `OP-${createPaddedNumber()}`,
    uuid: faker.string.uuid(),
    facilityType: 'recoveryFacility',
    isInterimFacility: false,
    contactDetails: createRandomPerson().contactDetails
  },
  recoveryOperation: { rCodeDCode: 'R1' },
  usualDescriptionOfWaste: 'Description of the waste being shipped',
  wasteIdentification: { baselAnnexIX: 'B1010', ecListOfWastes: '150101' },
  countriesStatesConcerned: {
    exportDispatchCountry: 'GB',
    importDestinationCountry: 'DE',
    transitCountries: ['FR', 'BE']
  },
  declarationOfShipmentArranger: {
    authenticatedBy: createRandomPerson().authenticatedBy
  }
})

const createPaddedNumber = (igits) => {
  return faker.number.int({ min: 1, max: 999999 }).toString().padStart(6, '0')
}

const createRandomPerson = () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({
    firstName,
    lastName,
    provider: faker.internet.domainName()
  })
  return {
    authenticatedBy: {
      name: `${firstName} ${lastName}`,
      email,
      roleInOrganisation: faker.person.jobTitle(),
      authenticationTimestamp: faker.date.past(),
      uuid: faker.string.uuid()
    },
    contactDetails: {
      contactPerson: `${firstName} ${lastName}`,
      phone: faker.phone.number({ style: 'international' }),
      email
    }
  }
}
