# Update after announcing, 12 October 2026

Tests the software provider's model: an Annex VII is created ("announced")
in DIWASS as soon as the export is planned, then updated once the load is
known. The live schema documents the create type, WasteAnnex7DocumentType,
as "Announcement Document"; UpdateAnnex7DocumentTypeRequest takes the same
type plus annexVIIDocumentNo.

The SOAP body DIWASS accepted for GLW.GB260000001574i (created through the
API's draft and submit routes) was resent as UpdateAnnex7DocumentTypeRequest
with annexVIIDocumentNo GLW.GB260000001574i, the quantity changed from 1 to
1.35 tonnes and the shipment date from 2026-10-15 to 2026-10-13. Validated
offline against the live XSD first. Sent by the operator user acting as
248482. The full document was sent, not only the changed fields.

Result: HTTP 200, statusCode OK, annexVIIDocumentNo GLW.GB260000001574i
(unchanged), WS request ID fba7c553-027d-4f39-8400-4f14484cdfcb.

The Annex VII service has no read operation, so the stored values and the
document's status (for example "announced") can only be checked in the
DIWASS web UI.

| File | |
| --- | --- |
| `1-update-request.xml` | The request, password digest and nonce redacted |
| `2-update-response.xml` | DIWASS's reply |
