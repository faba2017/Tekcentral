import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listIngestedPublicImages, setPublicImagePathsForTests } from "../publicImageIngestion.js";
import type { SupplierMediaCandidate } from "../supplierProductEnrichment.js";
import { ingestResolvedPrivateMedia } from "../suppliers/mustek/mustekPrivateMediaIngestion.js";
import { extractMustekMsiEmbeddedImage } from "../suppliers/mustek/mustekMsiEvidenceParser.js";
import { LocalObjectStorage, setObjectStorageForTests } from "../storage/objectStorage.js";

const root = await mkdtemp(join(tmpdir(), "tekcentral-mustek-media-"));
const storage = new LocalObjectStorage(join(root, "objects"));
setObjectStorageForTests(storage);
setPublicImagePathsForTests({ assetDirectory: join(root, "assets"), recordPath: join(root, "records.json") });

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const pngTwo = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6]);
const fingerprint = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const candidate = (id: string, bytes = png, overrides: Partial<SupplierMediaCandidate> = {}): SupplierMediaCandidate => ({
  id, supplier: "MUSTEK", supplierSku: "MSI-EXACT-1", sourceType: "PRIVATE_SUPPLIER_EVIDENCE", association: "PRODUCT",
  discoveredAt: "2026-11-08T10:00:00.000Z", candidateOrder: 0, reuseEligibility: "REVIEW_REQUIRED", status: "REVIEW_REQUIRED",
  evidence: { supplier: "MUSTEK", sourceField: "imageData", retrievedAt: "2026-11-08T10:00:00.000Z" },
  privateEvidence: { mimeType: "image/png", byteSize: bytes.length, contentFingerprint: fingerprint(bytes), sourceLabel: "Private fixture", evidenceClassification: "PRIVATE_REVIEW_REQUIRED" },
  ...overrides,
});
const ingest = (productId: string, item: SupplierMediaCandidate, bytes: Uint8Array, mimeType = "image/png") => ingestResolvedPrivateMedia({
  internalProductId: productId, candidateId: item.id, resolve: async () => ({ candidate: item, readBytes: async () => ({ bytes, mimeType }) }),
});

try {
  const firstCandidate = candidate("opaque-candidate-1");
  assert.equal(JSON.stringify(firstCandidate).includes("objectKey"), false);
  assert.equal(firstCandidate.url, undefined);
  const first = await ingest("product-1", firstCandidate, png);
  assert.match(first.publicUrl, /^\/api\/public\/assets\/products\/[a-f0-9]{64}\.png$/);
  assert.equal(first.sourceImageUrl, "private-supplier-evidence://opaque-candidate-1");

  const duplicate = await ingest("product-1", candidate("different-candidate-id"), png);
  assert.equal(duplicate.publicUrl, first.publicUrl, "same Product bytes must deduplicate regardless of private filename or candidate ID");
  assert.equal((await listIngestedPublicImages("product-1")).length, 1);

  const distinct = await ingest("product-1", candidate("opaque-candidate-2", pngTwo), pngTwo);
  assert.notEqual(distinct.publicUrl, first.publicUrl);
  assert.equal((await listIngestedPublicImages("product-1")).length, 2);

  const privateKey = "fixtures/private-image.png";
  await storage.storeObject({ key: privateKey, access: "PRIVATE", bytes: png, contentType: "image/png" });
  const objectCandidate = candidate("private-object-candidate");
  const objectResult = await ingestResolvedPrivateMedia({ internalProductId: "product-2", candidateId: objectCandidate.id, resolve: async () => ({ candidate: objectCandidate, readBytes: async () => ({ bytes: (await storage.readObject(privateKey, "PRIVATE"))!, mimeType: "image/png" }) }) });
  assert.match(objectResult.publicUrl, /^\/api\/public\/assets\/products\//);
  assert.equal(JSON.stringify(objectResult).includes(privateKey), false, "private object locator must not enter public metadata");

  const html = new TextEncoder().encode(`<script>const products = [{"sku":"MSI-EXACT-1","imageData":"data:image/png;base64,${Buffer.from(png).toString("base64")}"}];</script>`);
  const extracted = extractMustekMsiEmbeddedImage(html, "MSI-EXACT-1", fingerprint(png));
  assert.deepEqual(extracted.bytes, png);
  assert.equal(extracted.mimeType, "image/png");
  assert.throws(() => extractMustekMsiEmbeddedImage(new TextEncoder().encode(`<script>const products = [{"sku":"MSI-EXACT-1","imageData":"data:image/png;base64,broken%%%"}];</script>`), "MSI-EXACT-1", fingerprint(png)), /MUSTEK_PRIVATE_MEDIA_IMAGE_MISSING/);

  await assert.rejects(() => ingest("product-3", candidate("wrong-fingerprint"), pngTwo), /PRIVATE_MEDIA_FINGERPRINT_MISMATCH/);
  await assert.rejects(() => ingest("product-3", candidate("wrong-mime"), png, "image/jpeg"), /PRIVATE_MEDIA_MIME_MISMATCH/);
  const unsupported = candidate("unsupported-mime", png, { privateEvidence: { mimeType: "image/svg+xml", byteSize: png.length, contentFingerprint: fingerprint(png), sourceLabel: "Private fixture", evidenceClassification: "PRIVATE_REVIEW_REQUIRED" } });
  await assert.rejects(() => ingest("product-3", unsupported, png, "image/svg+xml"), /IMAGE_CONTENT_TYPE_UNSUPPORTED/);
  await assert.rejects(() => ingest("product-3", candidate("invalid-signature", new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3])), /IMAGE_CONTENT_INVALID/);
  await assert.rejects(() => ingest("product-3", candidate("empty", new Uint8Array()), new Uint8Array()), /IMAGE_CONTENT_EMPTY/);
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1); oversized.set(png.subarray(0, 8));
  await assert.rejects(() => ingest("product-3", candidate("oversized", oversized), oversized), /IMAGE_TOO_LARGE/);
  await assert.rejects(() => ingestResolvedPrivateMedia({ internalProductId: "product-3", candidateId: "stale-candidate", resolve: async () => undefined }), /PRIVATE_MEDIA_CANDIDATE_INVALID/);
  assert.equal((await listIngestedPublicImages("product-3")).length, 0, "invalid private evidence must never create public media");

  const failingStorage = new LocalObjectStorage(join(root, "failing"));
  failingStorage.storeObject = async () => { throw new Error("CONTROLLED_STORAGE_UNAVAILABLE"); };
  setObjectStorageForTests(failingStorage);
  await assert.rejects(() => ingest("product-4", candidate("storage-failure"), png), /CONTROLLED_STORAGE_UNAVAILABLE/);
  setObjectStorageForTests(storage);
  assert.equal((await listIngestedPublicImages("product-4")).length, 0, "storage failure must not create a canonical media record");

  console.log("Mustek controlled private media workflow tests passed.");
} finally {
  setObjectStorageForTests(undefined);
  setPublicImagePathsForTests(undefined);
  await rm(root, { recursive: true, force: true });
}
