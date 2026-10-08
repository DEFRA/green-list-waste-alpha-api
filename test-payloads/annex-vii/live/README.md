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
