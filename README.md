# Green List Waste - Alpha API

## Get it running

This is a node project, it uses hapi http library and mongo for persistence.
Running locally is easiest with docker and floci.

Install dependencies:

```bash
npm i
```

Run with docker:

```bash
docker compose up
```

To run docker with multiple sqs subscribers

```bash
  docker compose -f compose.yml -f compose-multiple.yml up
```

## Running tests

Run the full test suite with coverage:

```bash
npm test
```

This runs `vitest run --coverage` (v8 provider), printing a coverage summary
to the terminal and writing an `lcov` report to `./coverage/lcov.info`.

To re-run tests on file changes instead:

```bash
npm run test:watch
```

To run a single test file, pass it to vitest directly:

```bash
npx vitest run src/routes/annexVii.test.js
```

## Inspecting MongoDB

The `mongodb` container already includes `mongosh`, so no install is needed to look at data:

```bash
docker compose exec mongodb mongosh green-list-waste-alpha-api
```

Alternatively, install `mongosh` on your host (Mongo's port is exposed to `localhost:27017`):

```bash
brew install mongosh
mongosh mongodb://localhost:27017/green-list-waste-alpha-api
```

Once connected, query a collection:

```js
db.getCollection('annex-vii').find().pretty()
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

## API endpoints

| Method | Endpoint                       | Description                                                      |
| :----- | :----------------------------- | :--------------------------------------------------------------- |
| GET    | `/health`                      | Health check                                                     |
| POST   | `/annexvii`                    | Create an Annex VII shipment document                            |
| GET    | `/waste-codes/ewc`             | List EWC (List of Waste) codes                                   |
| GET    | `/waste-codes/basel-annex-ix`  | List Basel Annex IX (List B) codes                               |
| GET    | `/waste-codes/oecd-green-list` | List OECD green list codes not already covered by Basel Annex IX |

## Waste classification codes

`wasteIdentification` on an Annex VII document (box 10 of the paper form) is
validated against reference code lists seeded into MongoDB on server start
(see `src/common/helpers/seed-reference-codes.js`):

- `ecListOfWastes` must match a code from `/waste-codes/ewc`
- `baselAnnexIX` must match a code from `/waste-codes/basel-annex-ix`
- `oecd` must match a code from either `/waste-codes/basel-annex-ix` or
  `/waste-codes/oecd-green-list`, since the OECD green list is Basel Annex IX
  plus a handful of extra entries, not a standalone code system

Matching ignores whitespace and case, so `150101` and `15 01 01` are treated
as the same code. `annexIIIA`, `annexIIIB`, `nationalCode` and
`commodityCodes` have no reference list and are not validated.

`POST /annexvii` returns `400` if any submitted code isn't found in its
reference list.
