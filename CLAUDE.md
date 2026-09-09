# Working notes for this repo

`green-list-waste-alpha-api` is the backend for the Green List Waste alpha:
a Hapi/Node/Mongo REST API. It has two distinct halves living in the same
deployed service - the alpha's own domain API, and a bundled emulator for
DIWASS (the EU's real cross-border waste shipment system).

The alpha's stakeholder readout site (`green-list-waste-alpha`, a sibling
repo) documents the DIWASS spec in detail - see its `diwass-deep-dive.html`
and `diwass-data-contracts.html` pages. The raw spec pack itself (WSDLs'
worth of sample XML, parameter mapping PDFs, onboarding docs) lives as
`DIWASS API SPEC.zip` in that sibling repo's root. Go there for anything not
covered below.

## The DIWASS integration plan

DIWASS has no reachable test environment for Green List Waste yet, so real
integration testing isn't possible today. Rather than wait, the plan is to
build a **DIWASS emulator to DIWASS's own published spec** - a stand-in that
accepts the same SOAP/XML requests, applies the same validation rules, and
returns the same response and error shapes DIWASS itself documents. Getting
that field-level contract right is what makes the emulator a fair rehearsal
of the real integration, not a guess.

Architecture principle, given directly by the project owner: the emulator
**must deploy as routes on this same API** - same infra, same pipeline -
rather than as a separate service. Swapping from the emulator to real
DIWASS later should be a `DIWASS_BASE_URL` config change, not a redeploy.

The other half of the plan: the alpha's own `/annexvii` route receives a
shipment as JSON, persists it, then **builds a real SOAP payload** from that
JSON and submits it to whatever `DIWASS_BASE_URL` points at (the bundled
emulator today, real DIWASS once GB has credentials). This lets the
JSON-in/SOAP-out integration path be exercised end to end well before real
DIWASS access exists.

Green List Waste only ever uses DIWASS's **Annex VII** flow (the simple
green-list control procedure for non-hazardous waste on the OECD/Basel
Annex IX lists). The prior-consent notification procedure, movement
documents, and related CA-side tooling are for amber/hazardous waste and
are out of scope here by definition - see "Explicitly out of scope" below.

## Phases

**Phase 1 - MVP (built)**
Operator registration and Annex VII submission: enough to prove the "first
UK export journey" - register or find the exporter, submit the Annex VII.

**Phase 1.5 - built, emulator-only**
A way to flip a registered operator from `New` to `Valid` for testing. Real
DIWASS never exposes this to an operator-side caller (only a competent
authority can approve, through DIWASS's own web UI) - without it, every
downstream test would be permanently stuck behind an unapproved operator.

**Phase 2 - not built yet**
The rest of the Annex VII document lifecycle: `updateAnnex7Document`, the
four certificate types (carrier transfer, consignee receipt, facility
receipt, facility completion), take-back requests, and signals
(`ProperlyCarriedOut`, `NotificationCancelled`, etc).

**Phase 3 - partially built**
Low-effort supporting operations. Ping is done. Still open: the attachments
service (`submitAttach`/`getAttach`) and `updateOperator`.

**Explicitly out of scope**
DIWASS's Notification service (`WasteSubmissionWebServiceV1`), Movement
documents service, Users' authorisations service, and Tools service
(pre-consented facilities etc). These all belong to the prior-consent
notification procedure for amber/hazardous waste, which Green List Waste's
Annex VII route never touches.

## Endpoints

Two distinct surfaces, one deployed service.

### The alpha's own domain API (JSON)

| Method | Path                           | Purpose                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                      | liveness check                                                                                                                                                                                                                                                                                                                         |
| POST   | `/annexvii`                    | Validate and persist an Annex VII document, then submit a SOAP payload built from it to DIWASS (see `src/services/DiwassAnnexViiClient.js`). The DIWASS submission is best-effort: a failure there doesn't undo the local write, it's surfaced as a `diwass: { status, error }` field on the response for the caller to see and retry. |
| GET    | `/waste-codes/ewc`             | List EWC codes                                                                                                                                                                                                                                                                                                                         |
| GET    | `/waste-codes/basel-annex-ix`  | List Basel Annex IX (List B) codes                                                                                                                                                                                                                                                                                                     |
| GET    | `/waste-codes/oecd-green-list` | List OECD green list codes not already covered by Basel Annex IX                                                                                                                                                                                                                                                                       |

### The DIWASS emulator (SOAP/XML)

DIWASS itself exposes one endpoint per WSDL service and dispatches
operations by the SOAP body's root element, not by URL - this emulator
mirrors that (see `src/diwass-emulator/soapRoute.js`). An operation not
listed below returns a proper SOAP fault (`soapenv:Fault`), not a 404.

| Method | Path                | Operations                                                                                     | Notes                                                                                                                                                                                                                                            |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/diwass/ping`      | `IamAliveRequest`                                                                              | Connectivity/auth check, mirrors `WasteV1`                                                                                                                                                                                                       |
| POST   | `/diwass/operators` | `CreateOperatorRequest`, `FindOperatorRequest`, `GetOperatorRequest`, `ApproveOperatorRequest` | Mirrors `OperatorDirectoryServiceV2`. `ApproveOperatorRequest` is emulator-only (see Phase 1.5). Duplicate EORI/VAT is rejected with a 409 fault, matching DIWASS's own "cannot be two or more operators with the same VAT or EORI number" rule. |
| POST   | `/diwass/annex-vii` | `CreateAnnex7DocumentTypeRequest`                                                              | Mirrors `WasteAnnex7V1`. Validates that at least one carrier, one recovery facility, one waste classification code, and a mass or volume measure are present before accepting.                                                                   |

## Implementation notes worth knowing before touching this

- **Self-referencing calls must use `127.0.0.1`, not `server.info.uri`.**
  The service binds `0.0.0.0` by default, and `server.info.uri` reflects
  that bind address - fetching `http://0.0.0.0:<port>` from within the same
  process does not reliably reach the server. `src/routes/annexVii.js`
  builds `http://127.0.0.1:${request.server.info.port}` explicitly as the
  fallback DIWASS base URL for this reason.
- **`vitest-fetch-mock` replaces `global.fetch` in every test file** (see
  `.vite/setup-files.js`). Tests using `server.inject()` are unaffected
  (that bypasses the network entirely), but any test that wants a _real_
  HTTP round trip - like `src/services/DiwassAnnexViiClient.test.js` - has
  to call `global.fetchMock.disableMocks()` in its own `beforeAll` and
  `global.fetchMock.enableMocks()` in `afterAll`.
- **Generated reference numbers are illustrative, not exact.** DIWASS's own
  `annexVIIDocumentNo` format looks like `GLW.BE260000000019i` (country of
  the assigning competent authority + year + sequence + a trailing letter).
  GB isn't actually a valid DIWASS country code for this - see the "assigned
  responsible authority" note on the alpha site's data contracts page - so
  the emulator generates `GLW.GB<year><sequence>i` as something
  structurally close enough for client code to parse, not a guess at
  DIWASS's real algorithm. Same caveat for `OperatorInternalID` (real
  DIWASS's are opaque; the emulator just increments a counter).
- **No cross-referencing between operators and Annex VII documents yet.**
  The emulator doesn't check that a submitted Annex VII's arranger/
  consignee/carrier/facility `OperatorInternalID`s exist or are `Valid` in
  its own operator store. Deliberate simplification for Phase 1 - worth
  adding once Phase 2 work starts, but shouldn't block it.
- **Namespaces and envelope shapes are copied from the spec pack's actual
  sample XML**, not invented - see `src/diwass-emulator/xml/build.js` for
  where each namespace URI and header shape came from. Adding a new
  operation should mean reading the matching sample in the spec pack first,
  not improvising a shape.
