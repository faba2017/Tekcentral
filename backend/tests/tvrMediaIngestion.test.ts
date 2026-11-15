import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listIngestedPublicImages, productMediaId, removeIngestedPublicImage, setPublicImagePathsForTests } from "../publicImageIngestion.js";
import { LocalObjectStorage, setObjectStorageForTests } from "../storage/objectStorage.js";
import type { SupplierMediaCandidate } from "../supplierProductEnrichment.js";
import { ingestResolvedTvrMedia } from "../suppliers/tvr/tvrMediaIngestion.js";

const root = await mkdtemp(join(tmpdir(), "tekcentral-tvr-media-"));
const storage = new LocalObjectStorage(join(root, "objects"));
setObjectStorageForTests(storage);
setPublicImagePathsForTests({ assetDirectory: join(root, "assets"), recordPath: join(root, "records.json") });

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const publicAddress = async () => ["102.67.136.44"];
const candidate = (id = "tvr-candidate", url = "https://www.tvr.co.za/wp-content/uploads/product.png"): SupplierMediaCandidate => ({
  id, targetProductId: "product-1", url, supplier: "TVR", supplierSku: "910-001793", supplierProductId: "123", sourceType: "HTML", association: "PRODUCT",
  discoveredAt: "2026-11-09T10:00:00.000Z", candidateOrder: 0, reuseEligibility: "REVIEW_REQUIRED", status: "REVIEW_REQUIRED",
  evidence: { supplier: "TVR", sourceId: "TVR_PUBLIC_CATALOGUE", sourceVersionId: "version-1", sourceField: "deferredImages[0]", retrievedAt: "2026-11-09T10:00:00.000Z" },
});
const response = (bytes = png, init: ResponseInit = {}) => new Response(bytes, { status: 200, headers: { "content-type": "image/png", "content-length": String(bytes.length) }, ...init });
const ingest = (item: SupplierMediaCandidate, fetcher: typeof fetch, productId = "product-1") => ingestResolvedTvrMedia({ internalProductId: productId, candidateId: item.id, resolve: async () => item, fetcher, resolver: publicAddress });

try {
  let calls = 0;
  const validFetcher = async () => { calls += 1; return response(); };
  const first = await ingest(candidate(), validFetcher as typeof fetch);
  assert.match(first.publicUrl, /^\/api\/public\/assets\/products\/[a-f0-9]{64}\.png$/);
  assert.equal(first.provenance.sourceType, "TVR_PUBLIC_CATALOGUE");
  const duplicate = await ingest(candidate("second-candidate", "https://www.tvr.co.za/wp-content/uploads/duplicate.png"), validFetcher as typeof fetch);
  assert.equal(duplicate.publicUrl, first.publicUrl, "identical bytes must deduplicate by Product content hash");
  assert.equal((await listIngestedPublicImages("product-1")).length, 1);
  assert.equal(calls, 2);

  let crossProductFetches = 0;
  const crossProductFetcher = async () => { crossProductFetches += 1; return response(); };
  await assert.rejects(() => ingest(candidate("m90-candidate"), crossProductFetcher as typeof fetch, "product-r400"), /TVR_MEDIA_PRODUCT_MISMATCH/);
  await assert.rejects(() => ingest({ ...candidate("r400-candidate"), targetProductId: "product-r400", supplierSku: "910-001356" }, crossProductFetcher as typeof fetch, "product-m90"), /TVR_MEDIA_PRODUCT_MISMATCH/);
  assert.equal(crossProductFetches, 0, "cross-Product candidates must be rejected before image retrieval");
  assert.equal((await listIngestedPublicImages("product-r400")).length, 0);
  assert.equal((await listIngestedPublicImages("product-m90")).length, 0);

  await assert.rejects(() => ingestResolvedTvrMedia({ internalProductId: "product-2", candidateId: "missing", resolve: async () => undefined }), /TVR_MEDIA_CANDIDATE_INVALID/);
  await assert.rejects(() => ingest({ ...candidate("bad-host", "https://evil.example/wp-content/uploads/a.png"), targetProductId: "product-2" }, validFetcher as typeof fetch, "product-2"), /SOURCE_HOST_NOT_ALLOWED/);
  await assert.rejects(() => ingest({ ...candidate("bad-path", "https://www.tvr.co.za/product/a.png"), targetProductId: "product-2" }, validFetcher as typeof fetch, "product-2"), /TVR_MEDIA_PATH_NOT_ALLOWED/);
  await assert.rejects(() => ingestResolvedTvrMedia({ internalProductId: "product-2", candidateId: "private-address", resolve: async () => ({ ...candidate("private-address"), targetProductId: "product-2" }), fetcher: validFetcher as typeof fetch, resolver: async () => ["127.0.0.1"] }), /SOURCE_PRIVATE_ADDRESS_BLOCKED/);
  const redirectFetcher = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/a.png" } });
  await assert.rejects(() => ingest({ ...candidate("redirect"), targetProductId: "product-2" }, redirectFetcher as typeof fetch, "product-2"), /SOURCE_HOST_NOT_ALLOWED/);
  const wrongMime = async () => new Response("text", { status: 200, headers: { "content-type": "text/plain" } });
  await assert.rejects(() => ingest({ ...candidate("mime"), targetProductId: "product-2" }, wrongMime as typeof fetch, "product-2"), /IMAGE_CONTENT_TYPE_UNSUPPORTED/);
  const invalidImage = async () => response(new Uint8Array([1, 2, 3]));
  await assert.rejects(() => ingest({ ...candidate("signature"), targetProductId: "product-2" }, invalidImage as typeof fetch, "product-2"), /IMAGE_CONTENT_INVALID/);
  const oversized = async () => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/png", "content-length": String(5 * 1024 * 1024 + 1) } });
  await assert.rejects(() => ingest({ ...candidate("oversized"), targetProductId: "product-2" }, oversized as typeof fetch, "product-2"), /IMAGE_TOO_LARGE/);
  assert.equal((await listIngestedPublicImages("product-2")).length, 0);

  const removed = await removeIngestedPublicImage({ internalProductId: "product-1", mediaId: productMediaId("product-1", first.publicUrl) });
  assert.equal(removed.publicUrl, first.publicUrl);
  assert.equal((await listIngestedPublicImages("product-1")).length, 0, "canonical removal must clear only the Product-scoped media record");
  assert.ok(await storage.readObject(`products/${first.publicUrl.split("/").at(-1)}`, "PUBLIC"), "content-addressed bytes remain available for safe shared reuse");

  console.log("TVR controlled website media workflow tests passed.");
} finally {
  setObjectStorageForTests(undefined);
  setPublicImagePathsForTests(undefined);
  await rm(root, { recursive: true, force: true });
}
