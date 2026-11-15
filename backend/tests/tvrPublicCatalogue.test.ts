import assert from "node:assert/strict";
import { acquireTvrPublicCatalogue, normalizeTvrPublicProduct, normalizeTvrWebsiteSku, sanitizeTvrProductHtml, TvrPublicCatalogueError } from "../suppliers/tvr/tvrPublicCatalogue.js";

const product = (id: number, sku: string, overrides: Record<string, unknown> = {}) => ({
  id, sku, name: `Product ${id}`, permalink: `https://www.tvr.co.za/product/product-${id}/`,
  short_description: "<p>Useful <strong>Product</strong>.</p><script>steal()</script>",
  description: "<style>.bad{}</style><p>Long &amp; safe.</p><ul><li>Feature one</li></ul>",
  brands: [{ id: 1, name: "Example", slug: "example" }], categories: [{ id: 2, name: "Networking", slug: "networking" }],
  attributes: [{ id: 3, name: "Ports", taxonomy: "pa_ports", terms: [{ id: 4, name: "4", slug: "4" }] }],
  weight: "1.2", dimensions: { length: "10", width: "20", height: "30" },
  images: [{ id: 5, src: `https://www.tvr.co.za/wp-content/uploads/product-${id}.jpg`, alt: "Product", name: "Primary" }],
  prices: { price: "99900", currency_code: "ZAR" }, is_in_stock: true, stock_availability: { text: "In stock" },
  ...overrides,
});

function mockPages(pages: unknown[][], options: { total?: number; totals?: number[]; pageCounts?: number[]; contentType?: string; extraNoise?: string } = {}) {
  let calls = 0;
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url), page = Number(url.searchParams.get("page")); calls += 1;
    const records = pages[page - 1] ?? [], total = options.totals?.[page - 1] ?? options.total ?? pages.reduce((sum, values) => sum + values.length, 0), pageCount = options.pageCounts?.[page - 1] ?? pages.length;
    const body = JSON.stringify(records) + (options.extraNoise ?? "");
    return new Response(body, { status: 200, headers: { "content-type": options.contentType ?? "application/json", "x-wp-total": String(total), "x-wp-totalpages": String(pageCount), "content-length": String(Buffer.byteLength(body)) } });
  }) as typeof fetch;
  return { fetcher, calls: () => calls };
}

async function rejectsCode(operation: Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => error instanceof TvrPublicCatalogueError && error.code === code);
}

assert.equal(normalizeTvrWebsiteSku("  PRO   MP165 E6  "), "pro mp165 e6");
assert.notEqual(normalizeTvrWebsiteSku("PRO-MP223-E2"), normalizeTvrWebsiteSku("PRO MP223 E2"));
assert.equal(sanitizeTvrProductHtml("<script>bad()</script><p>A &amp; B</p><style>x</style>"), "A & B");

const normalized = normalizeTvrPublicProduct(product(12544, "910-001793", {
  name: "LOGITECH MOUSE WIRED M90",
  brands: [{ name: "LOGITECH" }],
})).product!;
assert.equal(normalized.websiteSku, "910-001793"); assert.equal(normalized.normalizedSku, "910-001793"); assert.equal(normalized.brand, "LOGITECH");
assert.equal(normalized.shortDescription, "Useful Product."); assert.match(normalized.longDescription!, /Long & safe/); assert.doesNotMatch(normalized.longDescription!, /bad/);
assert.deepEqual(normalized.attributes[0]?.values, ["4"]); assert.equal(normalized.weight, "1.2"); assert.equal(normalized.dimensions?.width, "20");
assert.equal("prices" in normalized, false); assert.equal("is_in_stock" in normalized, false); assert.equal("stock_availability" in normalized, false);
assert.equal(normalized.deferredImages.length, 1); assert.equal(normalized.deferredImages[0]?.url.includes("product-12544.jpg"), true);

assert.equal(normalizeTvrPublicProduct(product(1, "", { name: "Title cannot become SKU" })).reason, "MISSING_SKU");
assert.equal(normalizeTvrPublicProduct(product(1, "BAD\u0007SKU")).reason, "MALFORMED_SKU");
assert.equal(normalizeTvrPublicProduct(product(1, "SKU", { permalink: "https://evil.example/product/sku/" })).reason, "INVALID_CANONICAL_URL");
assert.equal(normalizeTvrPublicProduct(product(1, "SKU", { permalink: "https://www.tvr.co.za/shop/sku/" })).reason, "INVALID_CANONICAL_URL");

const twoPages = mockPages([[product(1, "A-1")], [product(2, "B 2")]]);
const acquired = await acquireTvrPublicCatalogue({ fetch: twoPages.fetcher, pageSize: 1 });
assert.equal(acquired.diagnostics.pagesFetched, 2); assert.equal(acquired.diagnostics.expectedTotal, 2); assert.equal(acquired.products.length, 2); assert.equal(twoPages.calls(), 2);
assert.equal(acquired.diagnostics.termination, "FINAL_PAGE");

const empty = await acquireTvrPublicCatalogue({ fetch: mockPages([[]], { total: 0, pageCounts: [0] }).fetcher });
assert.equal(empty.products.length, 0); assert.equal(empty.diagnostics.termination, "EMPTY_PAGE");

await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")], [product(1, "A")]]).fetcher, pageSize: 1 }), "PAGINATION_REPEATED_PAGE");
const noProgress = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")], [product(1, "A", { description: "changed transport noise" })]], { total: 2 }).fetcher, pageSize: 1 });
assert.equal(noProgress.diagnostics.termination, "NO_NEW_PRODUCTS"); assert.equal(noProgress.diagnostics.duplicateProductIds, 1);
await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")]], { total: 101, pageCounts: [101] }).fetcher, maxPages: 100 }), "SOURCE_PAGE_LIMIT");
await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")]], { total: 10_001, pageCounts: [1] }).fetcher }), "SOURCE_PRODUCT_LIMIT");
await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")], [product(2, "B")]], { totals: [2, 3] }).fetcher, pageSize: 1 }), "PAGINATION_INCONSISTENT");
await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")]], { total: 2, pageCounts: [1] }).fetcher }), "PAGINATION_INCOMPLETE");
await rejectsCode(acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")]]).fetcher, maxResponseBytes: 10 }), "SOURCE_RESPONSE_TOO_LARGE");
const timeout = (async () => { const error = new Error("timed out"); error.name = "TimeoutError"; throw error; }) as typeof fetch;
await rejectsCode(acquireTvrPublicCatalogue({ fetch: timeout }), "SOURCE_TIMEOUT");

const duplicates = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "DUP"), product(2, "DUP")]]).fetcher });
assert.equal(duplicates.products.length, 2); assert.equal(duplicates.diagnostics.duplicateNormalizedSkus, 1);
const duplicateUrl = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A"), product(2, "B", { permalink: "https://www.tvr.co.za/product/product-1/" })]]).fetcher });
assert.equal(duplicateUrl.products.length, 1); assert.equal(duplicateUrl.diagnostics.duplicateCanonicalUrls, 1); assert.equal(duplicateUrl.quarantine[0]?.reason, "DUPLICATE_CANONICAL_URL");

const ordered = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A")], [product(2, "B")]]).fetcher, pageSize: 1 });
const reordered = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(2, "B")], [product(1, "A")]]).fetcher, pageSize: 1 });
assert.equal(ordered.logicalFingerprint, reordered.logicalFingerprint, "API page order must not affect logical identity");
const noisy = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A", { nonce: "changed", tracking: "ignored" })], [product(2, "B")]]).fetcher, pageSize: 1 });
assert.equal(ordered.logicalFingerprint, noisy.logicalFingerprint, "transport/tracking noise must not affect logical identity");
const changed = await acquireTvrPublicCatalogue({ fetch: mockPages([[product(1, "A", { description: "A materially changed description" })], [product(2, "B")]]).fetcher, pageSize: 1 });
assert.notEqual(ordered.logicalFingerprint, changed.logicalFingerprint);

console.log("TVR public catalogue acquisition tests passed.");
