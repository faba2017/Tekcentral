import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMustekMsiHtml, type MustekMsiSourceVersion } from "../suppliers/mustek/mustekMsiEvidenceParser.js";

process.env.PERSISTENCE_PROVIDER = "LOCAL";

const source: MustekMsiSourceVersion = {
  sourceId: "src-msi-test",
  sourceVersionId: "version-msi-test",
  sourceFingerprint: "source-fingerprint",
  retrievedAt: "2026-11-08T05:54:18.180Z",
  objectKey: "private/msi.html",
};

const dataImage = "data:image/png;base64,iVBORw0KGgo=";
const product = (sku: string, overrides: Record<string, unknown> = {}) => ({
  sku,
  price: 16549,
  category: "Gaming",
  series: "Cyborg",
  summary: { CPU: "INTEL CORE I7", Memory: "16GB DDR5" },
  specs: { CPU: ["Intel Core i7-13620H"], Display: ["15.6 inch FHD", "144Hz"] },
  notes: ["2Y Warranty", "Translucent Black"],
  imageData: dataImage,
  tag: "HOT!",
  ...overrides,
});
const html = (products: unknown[], markerCount = 180) => `<!doctype html><title>MSI</title><script>const structuredProductMarkers = ${markerCount}; const products = ${JSON.stringify(products)}; const seriesAccents = {};</script>`;

const parsed = parseMustekMsiHtml(new TextEncoder().encode(html([product(" cyborg 15 b13wekg-474za ")])), source);
assert.equal(parsed.sourceRecordCount, 1);
assert.equal(parsed.records.length, 1);
assert.equal(parsed.failures.length, 0);
assert.equal(parsed.records[0].supplierSku, "CYBORG 15 B13WEKG-474ZA");
assert.equal(parsed.records[0].manufacturerContext, "MSI");
assert.deepEqual(parsed.records[0].content.summary, { CPU: "INTEL CORE I7", Memory: "16GB DDR5" });
assert.deepEqual(parsed.records[0].content.notes, ["2Y Warranty", "Translucent Black"]);
assert.equal(parsed.records[0].content.series, "Cyborg");
assert.equal(parsed.records[0].content.tag, "HOT!");
assert.deepEqual(parsed.records[0].specifications.map((item) => [item.group, item.value]), [["CPU", "Intel Core i7-13620H"], ["Display", "15.6 inch FHD"], ["Display", "144Hz"]]);
assert.equal(parsed.records[0].categoryEvidence?.authority, "ADVISORY");
assert.deepEqual(parsed.records[0].sourceDisplayPrice, { value: 16549, authority: "NON_AUTHORITATIVE", sourceField: "price" });
assert.equal(parsed.records[0].embeddedImage?.access, "PRIVATE");
assert.equal(parsed.records[0].embeddedImage?.kind, "EMBEDDED_DATA_URI");
assert.equal(parsed.records[0].embeddedImage?.mediaType, "image/png");
assert.equal("imageData" in parsed.records[0], false, "Large embedded bytes must not be duplicated into normalized evidence.");
for (const forbidden of ["gtin", "mpn", "productUrl", "variantId", "canonicalProductId", "dealerCost", "currency", "taxBasis", "availability"]) assert.equal(forbidden in parsed.records[0], false, `${forbidden} must not be invented.`);

const repeated = parseMustekMsiHtml(new TextEncoder().encode(html([product("CYBORG 15 B13WEKG-474ZA")])), source);
assert.equal(repeated.records[0].logicalIdentityFingerprint, parsed.records[0].logicalIdentityFingerprint);
assert.equal(repeated.records[0].evidenceFingerprint, parsed.records[0].evidenceFingerprint);
const newVersionSameFacts = parseMustekMsiHtml(new TextEncoder().encode(html([product("CYBORG 15 B13WEKG-474ZA")])), { ...source, sourceVersionId: "new-version", sourceFingerprint: "new-source-fingerprint", retrievedAt: "2026-12-01T00:00:00.000Z" });
assert.equal(newVersionSameFacts.records[0].evidenceFingerprint, parsed.records[0].evidenceFingerprint, "Version metadata must not churn logical evidence fingerprints.");
const changed = parseMustekMsiHtml(new TextEncoder().encode(html([product("CYBORG 15 B13WEKG-474ZA", { notes: ["Changed source fact"] })])), source);
assert.notEqual(changed.records[0].evidenceFingerprint, parsed.records[0].evidenceFingerprint);

const duplicate = parseMustekMsiHtml(new TextEncoder().encode(html([product("SKU-1"), product(" sku-1 ")])), source);
assert.equal(duplicate.sourceRecordCount, 2);
assert.equal(duplicate.records.length, 1);
assert.equal(duplicate.failures[0]?.code, "DUPLICATE_SKU");
const missingSku = parseMustekMsiHtml(new TextEncoder().encode(html([product("")])), source);
assert.equal(missingSku.records.length, 0);
assert.equal(missingSku.failures[0]?.code, "SKU_INVALID");
assert.equal(parseMustekMsiHtml(new TextEncoder().encode("<html>no catalogue</html>"), source).failures[0]?.code, "PRODUCTS_ARRAY_MISSING");

// Current immutable H.5A source acceptance. The test stays portable when the
// private development object store is absent, while the dedicated PostgreSQL
// acceptance verifies the same source/version in the configured environment.
const currentSourcePath = resolve(process.cwd(), ".data/object-storage/private/supplier-evidence/mustek/src-67bfc3928cb6f581005b/4dc0b80f4afc0fec789e152e0c23e52aae25098906a56f6c9b3894e4ec3781c2/MSI_Notebooks_Dealer_Pricelist_Nov_2026_V2.html");
try {
  await access(currentSourcePath);
  const current = parseMustekMsiHtml(new Uint8Array(await readFile(currentSourcePath)), {
    sourceId: "src-67bfc3928cb6f581005b",
    sourceVersionId: "version-d233fcc4340e02d08045803b",
    sourceFingerprint: "4dc0b80f4afc0fec789e152e0c23e52aae25098906a56f6c9b3894e4ec3781c2",
    retrievedAt: "2026-11-08T05:54:18.180Z",
  });
  assert.equal(current.sourceRecordCount, 19, "Actual products[] count, not broad HTML marker count, is authoritative.");
  assert.equal(current.records.length, 19);
  assert.equal(current.failures.length, 0);
  assert.equal(new Set(current.records.map((item) => item.supplierSku)).size, 19);
  assert.equal(current.records.every((item) => item.embeddedImage?.access === "PRIVATE"), true);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

console.log("Mustek MSI immutable evidence parser tests passed.");
