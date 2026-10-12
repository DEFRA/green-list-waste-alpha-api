# Captured end-to-end run, 12 October 2026

One Annex VII sent with curl to `POST /annexvii` on this API (commit `45b8852`,
run locally against the DIWASS acceptance environment), with the outbound
DIWASS call recorded by a fetch wrapper loaded at startup (no API code change).
Same payload as the first accepted run (GLW.GB260000001550i).

| File | Stage |
| --- | --- |
| `1-request-to-api.json` | The JSON the caller sent to `POST /annexvii` |
| `2-soap-request-to-diwass.xml` | The SOAP the API built and sent to `.../ws/WasteAnnex7V1` (password digest and nonce redacted) |
| `3-soap-response-from-diwass.xml` | DIWASS's reply, as received: `OK`, `GLW.GB260000001564i` |
| `4-api-response.json` | What the API returned to the caller (HTTP 201) |
| `5-stored-record.json` | The record the API stored in Mongo (`annex-vii` collection) |
| `http-exchange.json` | URL, method, HTTP status and selected headers of the DIWASS call |
