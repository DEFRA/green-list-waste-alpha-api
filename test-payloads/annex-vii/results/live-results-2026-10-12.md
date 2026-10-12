# Payload pack against live DIWASS, 12 October 2026

The pack run against the Commission's DIWASS acceptance environment for the
first time, with `scripts/run-live.mjs`. One DIWASS operator user, acting as
DEFRA-ALPHA-TEST (248482); every party is a team test operator
(`live/operators-live.json`). Raw results: `live-results-2026-10-12.json`
(run 1, 10:11 UTC) and `live-results-2026-10-12-partial-no-commodity.json`
(run 2, 10:12 UTC).

- **Happy path and json cases** went through the API's `POST /annexvii`, with
  only the operator IDs changed from the emulator's seeded ones.
- **SOAP cases** were rebuilt as single changes to the SOAP body DIWASS
  accepted earlier that day (`live/evidence/2026-10-12-captured-run`),
  because the pack's own XML files follow the spec pack's sample shape,
  which the live schema has since changed. Sent straight to DIWASS.

## Happy path

| ID | Scenario | Run 1, as written | Run 2, commodity code left out |
| --- | --- | --- | --- |
| hp-01 | Baseline, GB to DE, EWC 15 01 04, code 7602 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001567i |
| hp-02 | Two carriers (road, then water), mass and volume, transit NL, code 4707 10 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001568i |
| hp-03 | Separate waste producer, Basel B1010, code 7204 49 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001569i |
| hp-04 | Volume only, EWC 19 12 04, code 3915 20 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001570i |
| hp-05 | Basel B1010 only, code 7404 00 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001571i |
| hp-06 | OECD GC010, code 8549 21 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001572i |
| hp-07 | Interim, name-confidential facility, GB to ES, transit FR, code 7602 00 00 | NOTOK: WASTE-CUSTOMS-INVALID-CODE | OK, GLW.GB260000001573i |

In run 1 the customs code was the only error on every payload. Run 2 sent the
same payloads without it (`STRIP_COMMODITY=1 DOC_SUFFIX=-R2`) and all seven
were accepted first time.

## Error and edge cases

| ID | What was sent | Emulator expected | Live DIWASS | Match |
| --- | --- | --- | --- | --- |
| err-json-01 | actualDateOfShipment missing | 400 | 400, caught by the API | Yes |
| err-json-02 | EWC "99 99 99" | 400 | 400, caught by the API | Yes |
| err-json-03 | No carriers | 400 | 400, caught by the API | Yes |
| err-json-04 | Bad consignee email | 400 | 400, caught by the API | Yes |
| err-json-05 | Neither mass nor volume | 201, DIWASS rejects | 201, NOTOK: MASS-VOLUME-NOT-FOUND (and the customs code) | Yes (A1 confirmed) |
| err-json-06 | Duplicate annexVIIDocumentNo | 409 | 409, caught by the API | Yes |
| err-soap-01 | Malformed XML | 400 | HTTP 500 SOAP Fault "Failed to copy a message" | Differs |
| err-soap-02 | Empty actualQuantity | 400 | HTTP 200, NOTOK: MASS-VOLUME-NOT-FOUND | Differs in shape |
| err-soap-03 | No carrier | 400 | HTTP 500 SOAP Fault: XSD, carrier expected | Differs in shape |
| err-soap-04 | No wasteClassification | 400 | HTTP 500 SOAP Fault: XSD, wasteClassification expected | Differs in shape |
| err-soap-05 | exportCountry "GB" instead of 826 | 200 (not checked) | HTTP 500 SOAP Fault: XSD, pattern \d\d\d | Differs, stricter (A2 resolved) |
| err-soap-06 | createOperator with an existing EORI | 409 | HTTP 500 SOAP Fault "Some business rules are not met" | Differs; reason not given |
| err-soap-07 | Consignee 999999 | 200 (not checked) | HTTP 200, NOTOK: OPERATOR-ID-NOT-FOUND, CONSIGNEE-OPERATOR-IS-REQUIRED | Differs, stricter (A3 resolved) |
| err-soap-08 | arrangerIsProducer false, no producer | 200 (DIWASS expected to reject) | HTTP 200, OK, GLW.GB260000001566i | DIWASS accepts it (A4 resolved) |

## What it shows

1. **The happy path works for real GB to EU shipments.** Once the customs
   code is left out, all seven scenarios were accepted: GB to Germany and
   Spain, transits through the Netherlands and France, two carriers, a
   separate producer, mass and volume together, volume only, EWC, Basel and
   OECD codes, and an interim, name-confidential facility.
2. **The customs code is the one blocker, and it is not a format problem.**
   Seven more codes were refused (4, 8 and spaced 8 digits), on top of the
   five formats tried on 6 and 8 October. The live schema types it as a "Waste
   TARIC goods classification" with no pattern. Leaving it out was accepted
   even for GB to EU shipments, where the regulation makes it mandatory, so
   the test environment does not enforce it. The question stays with the
   helpdesk (G7), and production may behave differently.
3. **DIWASS rejects in two different ways.** Anything that breaks the XSD
   (missing carrier or waste classification, alpha-2 country, malformed XML)
   is an HTTP 500 SOAP Fault with a validator message. Business rule failures
   are HTTP 200 with statusCode NOTOK and coded errors. The API's client
   already handles both: a fault is stored as ERROR with the fault text, a
   NOTOK with DIWASS's error codes.
4. **DIWASS checks operator IDs exist** (err-soap-07), which the emulator does not.
5. **DIWASS does not enforce the waste producer rule** (err-soap-08): it
   accepted an Annex VII with arrangerIsProducer false and no producer at all.
   DWT has to enforce that itself.
6. **DIWASS does not check the consignee's country against the import
   country**: every happy path had a Northern Ireland-registered consignee
   (248540) with Germany or Spain as the import country, and was accepted.
7. **Operator creation by an operator user is refused without a reason**
   (err-soap-06): the duplicate EORI may or may not be why.
8. **Shipment dates in the past are accepted** (hp-01 to hp-07 were dated
   25 September to 10 October 2026).

## After the fixes (same day)

The API's JSON schema now enforces the two rules DIWASS showed it must:
`shipment.actualQuantity` needs tonnes, metersCubed or both, and
`wasteProducer` is required when the arranger is not the producer. Re-run
through the live-configured API (`live-results-2026-10-12-api-validation.json`),
both now stop at the API with a 400 and never reach DIWASS:

| ID | Result |
| --- | --- |
| err-json-05 | 400: "shipment.actualQuantity" must give tonnes, metersCubed or both |
| err-json-07 (new) | 400: "wasteProducer" is required |

The emulator was also changed to reject the way live DIWASS does (schema
faults as HTTP 500, business rules as NOTOK, unknown operator IDs refused).
The pack, now 22 cases, matches 22 of 22 against it (`validation-results.md`).

## Announce, update, cancel (same day)

A software provider said their users announce an Annex VII in DIWASS as soon
as an export is planned, and update it once the truck is loaded; DIWASS's
own drafts exist only in its web UI. The live schema agrees: the create type
is documented as "Announcement Document", and the web UI shows an API-created
Annex VII as Announced. An update through the API was applied (the web UI
showed the new 1.35 tonnes; `live/evidence/2026-10-12-update-after-announce`).

`scripts/probe-update-live.mjs` then probed GLW.GB260000001574i, one change
at a time, sending the whole document each time
(`live-update-probes-2026-10-12.json`):

| Probe | Result |
| --- | --- |
| Change the carrier | OK |
| Change the consignee and recovery facility | OK |
| Change the waste code (B3020 to B1010) | OK |
| Change the import country (GB to DE) | OK |
| Update GLW.GB260000001552i (arranger 248540) acting as 248482 | OK. Not conclusive: the one DIWASS user holds authorisations for both operators |
| Update a number that does not exist | NOTOK, GREEN-LISTED-DOCUMENT-NOT-FOUND (no description) |
| Annex7Cancelled signal | OK, answered with Annex7MovementDocumentTypeResponse |
| Update after the cancel | OK. DIWASS does not lock a cancelled Annex VII against updates: the same signal did cancel GLW.GB260000001576i (confirmed in the web UI, 12 October 2026) |

So everything on an announced Annex VII can change, including its parties and
waste code. The API now follows this lifecycle (draft, announce, update,
cancel), proven end to end in `live/evidence/2026-10-12-lifecycle`.
