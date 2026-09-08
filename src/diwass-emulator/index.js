import { diwassPing } from '#/diwass-emulator/ping/route.js'
import { diwassOperators } from '#/diwass-emulator/operators/route.js'
import { diwassAnnexVii } from '#/diwass-emulator/annex-vii/route.js'

/*
[DIWASS Emulator]
A stand-in for the real DIWASS SOAP service, built to the same field-level
contract documented in the alpha's spec pack review (see green-list-waste-
alpha's diwass-data-contracts page). It deploys as routes on this same API -
same infra, same pipeline - rather than as a separate service, so pointing
the real integration at real DIWASS later is a base-URL config change, not
a redeploy. See DiwassAnnexViiClient.js for the outbound side that calls it.
*/
export const diwassEmulator = [diwassPing, diwassOperators, diwassAnnexVii]
