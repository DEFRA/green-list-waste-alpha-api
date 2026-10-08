import { readFileSync } from 'node:fs'
import { buildCreateAnnex7RequestBody } from '#/diwass-emulator/annex-vii/mapping.js'

// Happy-path 07 exercises a confidential interim facility, a transit country
// and commodity codes - most of the optional branches in one payload.
const payload = JSON.parse(
  readFileSync(
    new URL(
      '../../../test-payloads/annex-vii/happy-path/07-confidential-interim-facility-with-transit.json',
      import.meta.url
    ),
    'utf8'
  )
)

const squash = (xml) => xml.replace(/>\s+</g, '><')

describe('buildCreateAnnex7RequestBody (live WasteAnnex7V1 schema)', () => {
  const xml = squash(buildCreateAnnex7RequestBody(payload))

  test('Should send arrangerIsProducer and shipmentDestination, not the spec-pack gate', () => {
    expect(xml).toContain(
      '<v1:arrangerIsProducer>true</v1:arrangerIsProducer><v1:shipmentDestination>R</v1:shipmentDestination>'
    )
    expect(xml).not.toContain('shipmentArrangerIsAlsoProducerOrCollector')
  })

  test('Should send the facility indicators, confidentiality reason and type code', () => {
    expect(xml).toContain(
      '<v11:operationalIndicators><v11:InterimFacility>true</v11:InterimFacility></v11:operationalIndicators><v11:wasteFacilityNameConfidential>true</v11:wasteFacilityNameConfidential><v11:confidentialityLegalExplanation><v11:Description languageID="en">Facility identity withheld'
    )
    expect(xml).toContain(
      '<v11:facilityLaboratoryTypeCode>R</v11:facilityLaboratoryTypeCode></v11:recoveryLaboratoryFacility>'
    )
  })

  test('Should use the live API waste list names', () => {
    expect(xml).toContain(
      '<v11:WasteTypeCode listID="LoW">15 01 04</v11:WasteTypeCode>'
    )
    const basel = squash(
      buildCreateAnnex7RequestBody({
        ...payload,
        wasteIdentification: { baselAnnexIX: 'B3020' }
      })
    )
    expect(basel).toContain(
      '<v11:WasteTypeCode listID="Basel_B">B3020</v11:WasteTypeCode>'
    )
  })

  test('Should wrap commodity codes, and omit the element when there are none', () => {
    expect(xml).toContain(
      '<v11:commodityCode><v11:commodityCodes>7602 00 00</v11:commodityCodes></v11:commodityCode>'
    )
    const none = buildCreateAnnex7RequestBody({
      ...payload,
      shipment: { ...payload.shipment, commodityCodes: [] }
    })
    expect(none).not.toContain('commodityCode')
  })

  test('Should send three-digit numeric country codes', () => {
    expect(xml).toContain(
      '<v11:exportCountry><v11:countryID>826</v11:countryID></v11:exportCountry><v11:importCountry><v11:countryID>724</v11:countryID></v11:importCountry><v11:transitCountry><v11:countryID>250</v11:countryID></v11:transitCountry>'
    )
  })

  test('Should reject a country with no numeric mapping', () => {
    expect(() =>
      buildCreateAnnex7RequestBody({
        ...payload,
        countriesStatesConcerned: {
          ...payload.countriesStatesConcerned,
          importDestinationCountry: 'ZZ'
        }
      })
    ).toThrow('No DIWASS numeric country code for "ZZ"')
  })

  test('Should include the signatory email in the arranger declaration', () => {
    expect(xml).toContain(
      `<v11:emailURI>${payload.declarationOfShipmentArranger.authenticatedBy.email}</v11:emailURI></v11:Signature></v1:declarationArranger>`
    )
  })
})
