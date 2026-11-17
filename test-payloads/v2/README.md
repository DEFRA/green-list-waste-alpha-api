# /v2 test payload pack

Payloads and a runner for the four common model endpoints (`/v2/movement`,
`/v2/collection`, `/v2/delivery`, `/v2/receipt`). Run it end to end against
the deployed API before asking software providers to try it, and give it to
them afterwards as worked examples.

The pack runs in this repo's own test suite (`src/v2/pack.test.js`), so it is
proven against the code on every build.

## Running it

```bash
# against a local API (no token needed)
node test-payloads/v2/scripts/run.mjs

# against ext-test
BASE_URL=https://green-list-waste-alpha-api.api.ext-test.cdp.defra.gov.uk \
TOKEN=<bearer token> node test-payloads/v2/scripts/run.mjs
```

`TOKEN` comes from the Cognito client-credentials request in the API spec. It
is read from the environment and never written to a file.

| Option         | Effect                    |
| -------------- | ------------------------- |
| `--only H1,E9` | Run just those scenarios  |
| `--verbose`    | Print every response body |

Each line says `ok` or `FAIL`. On a failure it names the step, what was
expected and the response received. Exit code is 1 if anything differs, so it
can run in a pipeline. It can be run repeatedly against the same database:
each run gets its own `{{runId}}`, used for references and the duplicate
`annexViiNumber` test.

## Contents

```
manifest.json     Every scenario: its calls in order, expected status, values to check and save
happy-path/       Request bodies for the journeys
error-cases/      Request bodies that should be refused, numbered to match the scenarios
scripts/run.mjs   The runner (also importable: runPack(send))
```

Inside a request body or path, `{{movementId}}`, `{{deliveryId}}` and
`{{runId}}` are replaced by the runner. `If-Match` takes `{{revision}}`, the
revision from the previous response.

## Happy paths

| Id  | Scenario                                                              | Calls |
| --- | --------------------------------------------------------------------- | ----- |
| H1  | Export, the whole journey, with the facility receipt                  | 6     |
| H2  | Export measured in cubic metres only                                  | 4     |
| H3  | Export with two carriers (second leg is a hand-over)                  | 5     |
| H4  | Change the plan, then cancel                                          | 3     |
| H5  | National movement, the whole journey                                  | 4     |
| H6  | Receipt quantity differs from the collection (warning, not a refusal) | 4     |

## Refusals

Each sets up whatever state it needs, then sends one bad request and checks
the status and, where it matters, the first problem named in `details[]`.

| Id  | Scenario                                                  | Calls |
| --- | --------------------------------------------------------- | ----- |
| E1  | Required fields missing: 400 with every problem listed    | 1     |
| E2  | Waste code not in its list: 400                           | 1     |
| E3  | Neither tonnes nor cubic metres: 400                      | 1     |
| E4  | Invalid email: 400                                        | 1     |
| E5  | Import: 422                                               | 1     |
| E6  | Two receivers: 422                                        | 1     |
| E7  | No producer when the arranger is not one: 422             | 1     |
| E8  | National movement with a bad postcode: 422                | 1     |
| E9  | Same annexViiNumber twice: 409                            | 2     |
| E10 | Carrier listed in parties[]: 422                          | 1     |
| E11 | Legs not numbered from 1: 422                             | 1     |
| E12 | Collection skips a leg: 422                               | 2     |
| E13 | First collection has no quantity: 422                     | 2     |
| E14 | Collection for a movement that does not exist: 422        | 1     |
| E15 | Delivery before any collection: 422                       | 2     |
| E16 | Delivery site in the wrong country: 422                   | 3     |
| E17 | Rejected receipt with no reason: 422                      | 4     |
| E18 | Accepted receipt that also gives a rejected quantity: 422 | 4     |
| E19 | Facility receipt before the consignee receipt: 422        | 4     |
| E20 | Facility receipt with no treatments: 422                  | 5     |
| E21 | The consignee records a receipt twice: 409                | 5     |
| E22 | Receipt for a delivery that does not exist: 422           | 1     |
| E23 | Change the plan without If-Match: 428                     | 2     |
| E24 | Change the plan with an old revision: 412                 | 2     |
| E25 | Change the plan after a collection: 409                   | 3     |
| E26 | Collect after cancelling: 409                             | 3     |
| E27 | Read a movement that does not exist: 404                  | 1     |
| E28 | Read with an id that is not a UUID: 400                   | 1     |

## What the pack covers, and does not

Covers: all six endpoints and operations (arrange, change plan, cancel, read,
collection, delivery, receipt), national and export, tonnes or cubic metres,
two carriers, the optional facility receipt, `If-Match`, and every refusal
status (400, 409, 412, 422, 428, 404).

Does not cover:

- **DIWASS.** Submission is not built. Every response is expected to carry
  `externalSubmissions[0].status` of `NOT_ENABLED`, and H1 checks it.
- **Auth.** The runner sends the token if given. A missing or bad token is
  refused by the gateway, not by this code, so there is no scenario for 401.
- **Amounts of data.** Single movements only, no volume or concurrency.
- **Hazardous national waste** and national delivery splitting.
