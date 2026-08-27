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

| Method | Endpoint    | Description                           |
| :----- | :---------- | :------------------------------------ |
| GET    | `/health`   | Health check                          |
| POST   | `/annexvii` | Create an Annex VII shipment document |
