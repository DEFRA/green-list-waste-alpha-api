# Live DIWASS Annex VII schema

The XSDs behind `WasteAnnex7V1?wsdl` on the Commission's acceptance environment
(`https://webgate.acceptance.ec.europa.eu/tracesnt-alpha/ws/WasteAnnex7V1?wsdl`
and its `?xsd=1` to `?xsd=12` imports), downloaded on 6 October 2026, with each
`schemaLocation` pointed at the local copy. They are published without
credentials. `x3.xsd` is the Annex VII service schema.

They differ from the spec pack's sample XML (see the alpha site's test payloads
page), so they, not the samples, are the contract the outbound builder follows.

Check the builder against them with:

```bash
node test-payloads/annex-vii/scripts/validate-live-schema.mjs
```

Re-download them when DIWASS announces a release; the environment moved from
8.2.15 to 8.2.16 on 30 September 2026.
