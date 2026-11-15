import assert from "node:assert/strict";
import { __resetSupplierSourceRegistryForTests, createSourceRun, saveSupplierSource, updateSourceRun } from "../supplierSourceRegistry.js";
import { getSupplierSourceView, safeSourceLocation, supplierHasSourceWorkspace, validateSupplierSourceDefinitions } from "../supplierSourcePlatform.js";
import type { SupplierCode } from "../types.js";

process.env.PERSISTENCE_PROVIDER = "LOCAL";
process.env.SYNTECH_ENABLED = "false";
delete process.env.SYNTECH_FULL_FEED_URL;
delete process.env.SYNTECH_UPDATE_FEED_URL;

const validation = validateSupplierSourceDefinitions();
assert.equal(validation.valid, true, validation.errors.join("\n"));
assert.equal(new Set(validation.definitions.map((item) => item.id)).size, validation.definitions.length);
const expected = { SCOOP: ["SCOOP_XML_CATALOGUE", "SCOOP_PUBLIC_WEBSITE"], SYNTECH: ["SYNTECH_FULL_FEED", "SYNTECH_UPDATE_FEED"], CJ: ["CJ_API"], TEKCENTRAL: ["TEKCENTRAL_MANUAL"], MUSTEK: [], TVR: [] } satisfies Partial<Record<SupplierCode, string[]>>;
for (const [supplier, ids] of Object.entries(expected) as [SupplierCode, string[]][]) {
  assert.equal(supplierHasSourceWorkspace(supplier), true);
  assert.deepEqual((await getSupplierSourceView(supplier)).sources.map((source) => source.id).sort(), ids.sort());
}
const manual = (await getSupplierSourceView("TEKCENTRAL")).sources[0];
assert.deepEqual(manual.capabilities, { canCheck: false, canSync: false, canRefresh: false, canImport: false, canActivate: false, canDeactivate: false, canConfigure: false });
assert.equal(manual.authority.includes("MANUAL"), true);
const scoop = await getSupplierSourceView("SCOOP");
assert.equal(scoop.sources.find((source) => source.id === "SCOOP_XML_CATALOGUE")?.capabilities.canSync, true);
assert.equal(scoop.sources.find((source) => source.id === "SCOOP_PUBLIC_WEBSITE")?.capabilities.canSync, false);
assert.equal(safeSourceLocation("https://supplier.example/feed?token=secret&key=value"), "supplier.example/feed");

__resetSupplierSourceRegistryForTests();
const commercial = await saveSupplierSource({ supplierCode: "TVR", label: "Commercial", purpose: "PRICE_LIST", transport: "DOWNLOAD_URL", format: "XLSX", sourceUrl: "https://docs.google.com/export?token=private", state: "ACTIVE", priority: 1, isPrimary: true, expectedMimeTypes: [], allowedHost: "docs.google.com", hints: { authority: "COMMERCIAL_STOCK" }, syncEnabled: false, revisionMetadata: {} }, "test", true);
const enrichment = await saveSupplierSource({ supplierCode: "TVR", label: "Catalogue", purpose: "HTML_CATALOGUE", transport: "DOWNLOAD_URL", format: "HTML", sourceUrl: "https://www.tvr.co.za/shop/?signature=private", state: "ACTIVE", priority: 2, isPrimary: false, expectedMimeTypes: [], allowedHost: "www.tvr.co.za", hints: { authority: "CONTENT_SPECIFICATION_MEDIA" }, syncEnabled: false, revisionMetadata: {} }, "test", true);
const run = await createSourceRun(commercial.id); run.status = "PARTIAL"; run.completedAt = new Date().toISOString(); await updateSourceRun(run);
const tvr = await getSupplierSourceView("TVR");
assert.equal(tvr.sources.length, 2);
assert.equal(tvr.sources.find((source) => source.id === commercial.id)?.isPrimary, true);
assert.equal(tvr.sources.find((source) => source.id === commercial.id)?.health, "PARTIAL");
assert.equal(tvr.sources.find((source) => source.id === enrichment.id)?.isPrimary, false);
assert.equal(JSON.stringify(tvr).includes("token=private"), false);
assert.equal(JSON.stringify(tvr).includes("signature=private"), false);
console.log("Supplier source platform tests passed");
