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

## API endpoints

| Method | Endpoint    | Description                           |
| :----- | :---------- | :------------------------------------ |
| GET    | `/health`   | Health check                          |
| POST   | `/annexvii` | Create an Annex VII shipment document |
