# Draft, announce, update, cancel through the API, 12 October 2026

The lifecycle a software provider described: announce the Annex VII in DIWASS
as soon as the export is planned, update it once the load is known, cancel it
if the export does not go ahead. Run through this API against the DIWASS
acceptance environment, with the outbound DIWASS calls recorded (password
digest and nonce redacted). Payload: `live/01-defra-alpha-test.json`.

| Step | API call | DIWASS call | Result |
| --- | --- | --- | --- |
| 1 | `POST /annexvii/drafts`, no carriers, date or quantity | none | `DRAFT` |
| 2 | `PUT /annexvii/{id}`, planned: 1 tonne, 20 October | none | `DRAFT` |
| 3 | `POST /annexvii/{id}/announce` | `1-announce` (CreateAnnex7DocumentTypeRequest) | `ANNOUNCED`, OK, **GLW.GB260000001575i**, request 718e2923-2cc0-4f71-975b-2a03b556aa1c |
| 4 | `PUT /annexvii/{id}`, loaded: 1.42 tonnes, 19 October | `2-update-when-loaded` (UpdateAnnex7DocumentTypeRequest) | still `ANNOUNCED`, update OK, request f023159b-2a7c-486a-acbd-28a4193636e0; record now 1.42 tonnes, 19 October |
| 5 | `POST /annexvii` (a second shipment, announced in one step) | `3-announce-second` | `ANNOUNCED`, OK, **GLW.GB260000001576i**, request cd87b7bf-1672-44ce-ae15-766a708d2d74 |
| 6 | `POST /annexvii/{id2}/cancel` | `4-cancel-second` (CreateAnnex7SignalTypeRequest, Annex7Cancelled, signed by the arranger's declared signatory) | `CANCELLED`, OK, request 37552759-1379-48a0-a590-a854f68fe227. DIWASS answers with Annex7MovementDocumentTypeResponse naming the document |
| 7 | `PUT /annexvii/{id2}` after cancelling | none | 409, "Annex VII has been cancelled" (DWT refuses, though DIWASS itself accepted an update after a cancel in the probes) |

Four DIWASS calls in all, each at the step that needed one. Confirmed in the
DIWASS web UI on 12 October 2026: GLW.GB260000001575i shows Announced with
1.42 tonnes, and GLW.GB260000001576i shows as cancelled.
