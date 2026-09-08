import { asArray, textOf } from '#/diwass-emulator/xml/parse.js'
import { escapeXml } from '#/diwass-emulator/xml/build.js'

/*
[Operator From XML]
Maps a parsed <Operator> element (from create_operator.xml) onto the plain
object stored by operators/store.js. Field names follow the operator
parameters mapping PDF: OperatorAddress[main] holds the only address a WSR
operator is allowed, Identifier[main] the identifying EORI/VAT.
*/
export function operatorFromXml(operatorXml) {
  const addresses = asArray(operatorXml.OperatorAddress)
  const mainAddress =
    addresses.find((address) => address['@_main'] === 'true') ?? addresses[0]

  const contactDetails = asArray(operatorXml.OperatorContactDetail).map(
    (entry) => ({
      type: entry.ContactDetail?.['@_type'],
      value: textOf(entry.ContactDetail)
    })
  )

  const identifiers = asArray(operatorXml.Identifier).map((entry) => ({
    type: entry['@_type'],
    name: entry['@_name'],
    value: textOf(entry),
    main: entry['@_main'] === 'true'
  }))

  const activity = operatorXml.Activity ?? {}
  const activityType = activity.ActivityType?.Type
  const activityTypeCode =
    typeof activityType === 'object' ? textOf(activityType) : activityType

  return {
    name: textOf(operatorXml.Name),
    address: mainAddress
      ? {
          street: textOf(mainAddress.Address?.Street),
          city: textOf(mainAddress.Address?.City?.Name),
          postalCode: textOf(mainAddress.Address?.City?.PostalCode),
          countryId: textOf(mainAddress.Address?.City?.CountryID)
        }
      : null,
    contactDetails,
    identifiers,
    activityType: activityTypeCode,
    responsibleAuthorityActivityCode: textOf(
      activity.ResponsibleAuthorityActivityCode
    ),
    linkedOperatorInternalId:
      textOf(operatorXml.LinkedOperatorInternalID) ?? null
  }
}

export function operatorToXml(operator) {
  const identifiers = operator.identifiers
    .map(
      (identifier) =>
        `<v1:Identifier type="${escapeXml(identifier.type)}" name="${escapeXml(identifier.name)}" main="${identifier.main}">${escapeXml(identifier.value)}</v1:Identifier>`
    )
    .join('')

  return `<v2:Operator xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2" xmlns:v1="http://ec.europa.eu/tracesnt/directory/operator/base/v1">
    <v1:OperatorInternalID>${operator.operatorInternalId}</v1:OperatorInternalID>
    <v1:Name>${escapeXml(operator.name)}</v1:Name>
    ${identifiers}
    <v1:Activity>
      <v1:Status>${operator.activityStatus}</v1:Status>
      <v1:ResponsibleAuthorityActivityCode>${escapeXml(operator.responsibleAuthorityActivityCode ?? '')}</v1:ResponsibleAuthorityActivityCode>
    </v1:Activity>
  </v2:Operator>`
}
