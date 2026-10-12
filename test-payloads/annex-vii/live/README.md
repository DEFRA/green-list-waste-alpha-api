# Live DIWASS end-to-end payloads

Annex VII submissions for the Commission's acceptance environment, sent
through this API's `POST /annexvii` with live DIWASS settings. Every party is
a team test operator, so no real company is named.

| File | Arranger (acts as) | Consignee and facility | Carrier |
| --- | --- | --- | --- |
| `01-defra-alpha-test.json` | DEFRA-ALPHA-TEST (248482) | DEFRA-ALPHA-TEST-B (248540) | DEFRA-ALPHA-TEST-GB-CA2-CARRIER (248626) |
| `02-defra-alpha-test-b.json` | DEFRA-ALPHA-TEST-B (248540) | DEFRA-ALPHA-TEST (248482) | DEFRA-ALPHA-TEST-GB-CA2-CARRIER (248626) |

Both go through the same DIWASS user and key, which holds authorisations for
both operators: the API names the arranger as the operator each call acts for.

They mirror the Annex VII DIWASS accepted on 8 October 2026
(GLW.GB260000001490i): GB to GB, Basel B3020, no commodity code (every code
tried so far is rejected with WASTE-CUSTOMS-INVALID-CODE). No
`annexVIIDocumentNo` is sent; DIWASS assigns it.

## Results

Both were sent with curl to `POST /annexvii` on this API running locally
(commit `ec2c3e0`, `DIWASS_BASE_URL` set to the acceptance `.../ws` base) and
accepted by live DIWASS on 12 October 2026, first time:

| File | API submissionId | DIWASS document number | DIWASS request ID |
| --- | --- | --- | --- |
| `01-defra-alpha-test.json` | 0b01c4ed-9c74-4a2f-bb02-30a2bc0b4739 | GLW.GB260000001550i | 95b43832-9f89-43aa-ace4-14d67d0d1153 |
| `02-defra-alpha-test-b.json` | 792bea94-cd4e-48e4-9d19-91a5f679b519 | GLW.GB260000001552i | a15a083e-451f-49f1-ba1e-c9e572a99691 |

To repeat: set `DIWASS_BASE_URL`, `DIWASS_USERNAME` (the operator user's EU
Login ID, not its email address) and `DIWASS_AUTH_KEY` in `.env`, start the API
with `npm run dev`, then:

```bash
curl -X POST http://127.0.0.1:3055/annexvii \
  -H 'Content-Type: application/json' \
  --data @test-payloads/annex-vii/live/01-defra-alpha-test.json
```

A response with `diwass.status` `OK` and a `GLW.` document number is an
acceptance. The outcome is also stored on the record in Mongo.

## Draft, then submit (12 October 2026)

DIWASS's API has no draft stage, so drafts are held in this API. The same
payload went through the draft routes against live DIWASS:

1. `POST /annexvii/drafts` with no carriers, no shipment date and no quantity:
   201, status `DRAFT`. No call to DIWASS.
2. `POST /annexvii/{id}/submit` straight away: 400, "not ready to submit",
   listing the quantity, shipment date and carriers.
3. `PUT /annexvii/{id}` with the complete payload: 200, still `DRAFT`. No
   call to DIWASS.
4. `POST /annexvii/{id}/submit`: 200, `SUBMITTED`, DIWASS `OK`,
   GLW.GB260000001574i (request ID 3a2bace7-c254-4097-a448-e7ecea0b398f).
   The only DIWASS call in the sequence.
5. Submitting again: 409, already submitted.
