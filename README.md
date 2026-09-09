# Green List Waste - Alpha API

The backend for the Green List Waste alpha. It's a Node/Hapi/MongoDB REST
API with two distinct halves living in the same deployed service:

1. **The alpha's own domain API** - validates and stores Annex VII export
   shipment documents, and serves the waste classification code lists those
   documents are checked against.
2. **A bundled emulator for DIWASS** - the EU's real cross-border waste
   shipment system. DIWASS has no reachable test environment for Green List
   Waste yet, so rather than wait, this repo hosts a SOAP/XML stand-in built
   to DIWASS's own published spec. `POST /annexvii` builds a real SOAP
   payload from the JSON it receives and submits it downstream to whichever
   base URL DIWASS (or its emulator) is reachable at - so the integration
   can be exercised end to end today, and pointed at the real DIWASS later
   with nothing more than a config change.

For the full integration plan, the phase breakdown, and why specific design
choices were made, see **[CLAUDE.md](./CLAUDE.md)**.

## Contents

- [Requirements](#requirements)
- [Running it locally](#running-it-locally)
  - [Option A: Docker Compose (recommended)](#option-a-docker-compose-recommended)
  - [Option B: Node directly, against a local Mongo](#option-b-node-directly-against-a-local-mongo)
  - [Production mode, locally](#production-mode-locally)
  - [Port clashes with other local Defra stacks](#port-clashes-with-other-local-defra-stacks)
- [Configuration](#configuration)
- [Testing](#testing)
  - [Other quality checks](#other-quality-checks)
- [API endpoints](#api-endpoints)
  - [The alpha's own domain API (JSON)](#the-alphas-own-domain-api-json)
  - [The DIWASS emulator (SOAP/XML)](#the-diwass-emulator-soapxml)
- [Trying it out](#trying-it-out)
  - [Submitting an Annex VII document](#submitting-an-annex-vii-document)
  - [Talking to the DIWASS emulator directly](#talking-to-the-diwass-emulator-directly)
- [Waste classification codes](#waste-classification-codes)
- [Inspecting MongoDB](#inspecting-mongodb)
- [Project structure](#project-structure)

## Requirements

- [Node.js](https://nodejs.org/) `>= 24` and npm (use
  [nvm](https://github.com/nvm-sh/nvm) and run `nvm use` in this directory
  to pick up the right version automatically)
- [Docker](https://www.docker.com/) and Docker Compose, if you want the
  full local stack rather than running Node directly against your own Mongo

## Running it locally

Install dependencies first, either way:

```bash
npm install
```

### Option A: Docker Compose (recommended)

Brings up this service alongside MongoDB, Redis, and
[floci](https://floci.io) (a local AWS emulator for S3/SQS/SNS etc):

```bash
docker compose up
```

The API is then available at `http://localhost:3001`.

### Option B: Node directly, against a local Mongo

Useful for faster iteration with `--watch`. Start a Mongo instance
yourself first (e.g. `docker run -p 27017:27017 mongo:7.0.28`), then:

```bash
npm run dev
```

This runs in `development` mode with file-watching enabled
(`node --watch`), reading any `.env` file in the project root if present.
To also attach a debugger:

```bash
npm run dev:debug
```

### Production mode, locally

To mimic how the service runs when deployed:

```bash
npm start
```

### Port clashes with other local Defra stacks

`compose.yml` publishes MongoDB on `27017` and Redis on `6379`. If you run
other Defra stacks locally (e.g. `waste-organisation-frontend`) that also
bind those ports, `docker compose up` fails with "port is already
allocated".

Redis and floci aren't used by `src/config.js`, so the simplest fix is to
remap MongoDB to a free host port and disable Redis. Create a
`compose.override.yml` (gitignored, so this only affects your machine) next
to `compose.yml`:

```yaml
services:
  redis:
    profiles: ['disabled']

  mongodb:
    ports: !override
      - '27018:27017'
```

`ports` is a merged list in the Compose spec, so the `!override` tag is
required - without it the original `27017` binding is kept alongside the
new one. Docker Compose loads `compose.override.yml` automatically, so the
run command doesn't change:

```bash
docker compose up
```

## Configuration

Everything is read from environment variables via `src/config.js`
(convict). Defaults are set for local development, so nothing below is
required to get started - override only what you need to change.

| Variable                       | Default                       | Purpose                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                         | `3001`                        | Port the server binds to                                                                                                                                                                                                           |
| `HOST`                         | `0.0.0.0`                     | Address the server binds to                                                                                                                                                                                                        |
| `MONGO_URI`                    | `mongodb://127.0.0.1:27017/`  | MongoDB connection string                                                                                                                                                                                                          |
| `MONGO_DATABASE`               | `green-list-waste-alpha-api`  | MongoDB database name                                                                                                                                                                                                              |
| `LOG_LEVEL`                    | `info`                        | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent`                                                                                                                                                           |
| `LOG_FORMAT`                   | `pino-pretty` (`ecs` in prod) | Log output format                                                                                                                                                                                                                  |
| `DIWASS_BASE_URL`              | _unset_                       | Where `/annexvii` submits its SOAP payload. Unset means "this service's own address" - i.e. the bundled emulator. Point it at a different emulator, or the real DIWASS gateway once GB has credentials, without changing any code. |
| `DIWASS_WEB_SERVICE_CLIENT_ID` | `wsr-system`                  | `WebServiceClientId` SOAP header value sent on every DIWASS call                                                                                                                                                                   |
| `HTTP_PROXY`                   | _unset_                       | Outbound proxy, if required                                                                                                                                                                                                        |
| `ENVIRONMENT`                  | `local`                       | Which CDP environment this is running in                                                                                                                                                                                           |

## Testing

Run the full suite with coverage:

```bash
npm test
```

This runs `vitest run --coverage` (v8 provider): a text summary prints to
the terminal, and an `lcov` report is written to `./coverage/lcov.info` for
CI/SonarCloud.

Re-run on file changes instead:

```bash
npm run test:watch
```

Run a single test file directly:

```bash
npx vitest run src/routes/annexVii.test.js
```

A couple of things worth knowing before writing new tests here:

- **`global.fetch` is mocked in every test file** by
  `.vite/setup-files.js` (`vitest-fetch-mock`). Tests that use
  `server.inject()` are unaffected - that bypasses the network entirely -
  but a test that needs a real HTTP round trip (like
  `src/services/DiwassAnnexViiClient.test.js`) has to call
  `global.fetchMock.disableMocks()` in its own `beforeAll` and
  `global.fetchMock.enableMocks()` in `afterAll`.
- **MongoDB is provided in-memory** via `vitest-mongodb`
  (`.vite/mongo-memory-server.js`) - no real database needed to run tests.

### Other quality checks

```bash
npm run lint          # eslint
npm run lint:fix       # eslint --fix
npm run format:check   # prettier --check
npm run format         # prettier --write
npm run security-audit # npm audit, fails only on critical
```

All of the above run together as the pre-commit hook
(`npm run git:pre-commit-hook`), installed via `npm run setup:husky`.

## API endpoints

### The alpha's own domain API (JSON)

| Method | Path                           | Description                                                                                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`                      | Liveness check                                                                                                                 |
| POST   | `/annexvii`                    | Validate and persist an Annex VII shipment document, then submit it to DIWASS (see [below](#submitting-an-annex-vii-document)) |
| GET    | `/waste-codes/ewc`             | List EWC (European Waste Catalogue) codes                                                                                      |
| GET    | `/waste-codes/basel-annex-ix`  | List Basel Annex IX (List B) codes                                                                                             |
| GET    | `/waste-codes/oecd-green-list` | List OECD green list codes not already covered by Basel Annex IX                                                               |

### The DIWASS emulator (SOAP/XML)

DIWASS itself exposes one endpoint per WSDL service and dispatches
operations by the SOAP body's root element, not by URL - this emulator
mirrors that. Sending an operation that isn't listed returns a proper SOAP
fault (`soapenv:Fault`), not a 404.

| Method | Path                | Operations                                                                                       |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| POST   | `/diwass/ping`      | `IamAliveRequest`                                                                                |
| POST   | `/diwass/operators` | `CreateOperatorRequest`, `FindOperatorRequest`, `GetOperatorRequest`, `ApproveOperatorRequest`\* |
| POST   | `/diwass/annex-vii` | `CreateAnnex7DocumentTypeRequest`                                                                |

\* `ApproveOperatorRequest` is emulator-only - real DIWASS never lets an
operator-side caller flip an operator from `New` to `Valid`, only a
competent authority can, through DIWASS's own web UI. Without some
equivalent here, every test would be permanently stuck behind an
unapproved operator.

See [CLAUDE.md](./CLAUDE.md) for the full phase plan (what's built, what's
next, and what's deliberately out of scope).

## Trying it out

### Submitting an Annex VII document

`examples/annexvii-create-request.json` is a complete, valid Annex VII
document. With the stack running:

```bash
curl -X POST http://localhost:3001/annexvii \
  -H 'Content-Type: application/json' \
  -d @examples/annexvii-create-request.json
```

A successful create returns `201` and the stored document, plus a `diwass`
field showing the result of the downstream SOAP submission, e.g.:

```json
{
  "diwass": {
    "status": "OK",
    "annexViiDocumentNo": "GLW.GB26000000000001i"
  }
}
```

If the DIWASS submission fails, the local record is still created - the
failure is surfaced as `"diwass": { "status": "ERROR", "error": "..." }`
rather than rolling back the write.

Posting the same example a second time returns `409`, because
`annexVIIDocumentNo` is unique - either change that field or clear the
collection (see [Inspecting MongoDB](#inspecting-mongodb)) before sending
it again.

### Talking to the DIWASS emulator directly

The emulator speaks SOAP/XML, not JSON. A minimal `IamAliveRequest` against
it:

```bash
curl -X POST http://localhost:3001/diwass/ping \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:iam="http://ec.europa.eu/tracesnt/waste/iamalive">
        <soapenv:Body>
          <iam:IamAliveRequest><iam:query>Hello</iam:query></iam:IamAliveRequest>
        </soapenv:Body>
      </soapenv:Envelope>'
```

For real request/response shapes for every implemented operation, the test
files under `src/diwass-emulator/**/*.test.js` double as working examples -
several use DIWASS's own unmodified sample XML from its spec pack.

## Waste classification codes

`wasteIdentification` on an Annex VII document (box 10 of the paper form)
is validated against reference code lists seeded into MongoDB on server
start (see `src/common/helpers/seed-reference-codes.js`):

- `ecListOfWastes` must match a code from `/waste-codes/ewc`
- `baselAnnexIX` must match a code from `/waste-codes/basel-annex-ix`
- `oecd` must match a code from either `/waste-codes/basel-annex-ix` or
  `/waste-codes/oecd-green-list`, since the OECD green list is Basel
  Annex IX plus a handful of extra entries, not a standalone code system

Matching ignores whitespace and case, so `150101` and `15 01 01` are
treated as the same code. `annexIIIA`, `annexIIIB`, `nationalCode` and
`commodityCodes` have no reference list and are not validated.

`POST /annexvii` returns `400` if any submitted code isn't found in its
reference list.

## Inspecting MongoDB

The `mongodb` container already includes `mongosh`, so no install is
needed to look at data:

```bash
docker compose exec mongodb mongosh green-list-waste-alpha-api
```

Alternatively, install `mongosh` on your host (Mongo's port is exposed to
`localhost:27017`):

```bash
brew install mongosh
mongosh mongodb://localhost:27017/green-list-waste-alpha-api
```

Once connected, query a collection:

```js
db.getCollection('annex-vii').find().pretty()
db.getCollection('diwass-operators').find().pretty()
db.getCollection('diwass-annex-vii').find().pretty()
```

To delete a record (careful, this is irreversible):

```js
// delete a specific document by its business key
db.getCollection('annex-vii').deleteOne({
  annexVIIDocumentNo: 'AX-2024-000001'
})

// delete everything in the collection
db.getCollection('annex-vii').deleteMany({})
```

## Project structure

```
src/
├── routes/            The alpha's own domain routes (health, annexvii, waste-codes)
├── schemas/           Joi validation schemas for the alpha's own routes
├── services/          Business logic used by routes, incl. the outbound DIWASS client
├── diwass-emulator/   The bundled DIWASS SOAP/XML emulator (see CLAUDE.md)
│   ├── xml/           Generic SOAP envelope parse/build helpers
│   ├── soapRoute.js   Shared Hapi route wrapper: dispatches by SOAP body root element
│   ├── ping/          IamAliveRequest
│   ├── operators/     Operator registration, lookup, approval
│   └── annex-vii/     Annex VII document creation
├── plugins/           Hapi plugins (router, MongoDB, logging, tracing)
├── common/helpers/    Shared helpers (Mongo locks, reference code seeding, etc)
├── config.js          All environment-driven configuration (convict)
├── server.js          Hapi server construction
└── index.js           Process entry point
```
