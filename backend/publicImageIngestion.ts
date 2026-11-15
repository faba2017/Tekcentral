import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { objectStorage } from "./storage/objectStorage.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { readRows, replaceMedia } from "./persistence/catalogueRepository.js";
import { SafeRemoteFetchError, safeRemoteFetch } from "./security/safeRemoteFetch.js";

const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["image/gif", ".gif"]]);
const maxBytes = 5 * 1024 * 1024;
export interface ImageProvenance { originalUrl: string; sourceType: string; capturedAt: string; contentType: string; bytes: number; }
export interface ImageIngestionResult { internalProductId?: string; sourceImageUrl: string; publicUrl: string; contentHash: string; mimeType: string; storedAt: string; provenance: ImageProvenance; }
interface LegacyImageResult { publicUrl: string; provenance: ImageProvenance; }
interface ImageRecordStore { version: 2; records: ImageIngestionResult[]; }
let testPaths: { assetDirectory: string; recordPath: string } | undefined;
const assetDirectory = () => testPaths?.assetDirectory ?? resolve(process.cwd(), ".data", "public-assets", "products");
const recordPath = () => testPaths?.recordPath ?? resolve(process.cwd(), ".data", "public-assets", "image-records.json");
export function setPublicImagePathsForTests(paths?: { assetDirectory: string; recordPath: string }) { testPaths = paths; }
const filenameFromPublicUrl = (publicUrl: string) => publicUrl.split("/").at(-1) ?? "";
const hashFromPublicUrl = (publicUrl: string) => filenameFromPublicUrl(publicUrl).split(".")[0] ?? "";
export const productMediaId = (internalProductId: string, publicUrl: string) => createHash("sha256").update(`${internalProductId}:${publicUrl}`).digest("hex");

async function readRecords(): Promise<ImageRecordStore> {
  if (loadPersistenceConfig().provider === "POSTGRES") return { version: 2, records: await readRows<ImageIngestionResult>("catalogue_media_records", "product_id, sort_order") };
  try {
    const value = JSON.parse(await readFile(recordPath(), "utf8")) as { records?: (ImageIngestionResult | LegacyImageResult)[] };
    if (!Array.isArray(value.records)) return { version: 2, records: [] };
    return { version: 2, records: value.records.map((item) => "sourceImageUrl" in item ? item : {
      sourceImageUrl: item.provenance.originalUrl, publicUrl: item.publicUrl, contentHash: hashFromPublicUrl(item.publicUrl),
      mimeType: item.provenance.contentType, storedAt: item.provenance.capturedAt, provenance: item.provenance,
    }) };
  } catch { return { version: 2, records: [] }; }
}
async function writeRecords(store: ImageRecordStore) { if (loadPersistenceConfig().provider === "POSTGRES") { await replaceMedia(store.records); return; } const target = recordPath(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
async function assetExists(record: ImageIngestionResult) { if (await objectStorage().readObject(`products/${filenameFromPublicUrl(record.publicUrl)}`, "PUBLIC")) return true; try { await readFile(resolve(assetDirectory(), filenameFromPublicUrl(record.publicUrl))); return true; } catch { return false; } }

export async function findIngestedPublicImage(input: { internalProductId: string; sourceUrl?: string }) {
  const sourceUrl = input.sourceUrl ? new URL(input.sourceUrl).href : undefined;
  const store = await readRecords();
  let record = store.records.find((item) => item.internalProductId === input.internalProductId && (!sourceUrl || item.sourceImageUrl === sourceUrl));
  if (!record && sourceUrl) {
    const legacy = store.records.find((item) => !item.internalProductId && item.sourceImageUrl === sourceUrl);
    if (legacy) {
      record = { ...legacy, internalProductId: input.internalProductId };
      store.records = [record, ...store.records.filter((item) => item !== legacy)];
      await writeRecords(store);
    }
  }
  return record && await assetExists(record) ? record : undefined;
}
export async function listIngestedPublicImages(internalProductId: string) {
  const records = (await readRecords()).records.filter((item) => item.internalProductId === internalProductId);
  const available = await Promise.all(records.map(async (record) => await assetExists(record) ? record : undefined));
  return available.filter((record): record is ImageIngestionResult => Boolean(record)).filter((record, index, rows) => rows.findIndex((item) => item.publicUrl === record.publicUrl) === index).slice(0, 8);
}

export async function removeIngestedPublicImage(input: { internalProductId: string; mediaId: string }) {
  const store = await readRecords();
  const record = store.records.find((item) => item.internalProductId === input.internalProductId && productMediaId(input.internalProductId, item.publicUrl) === input.mediaId);
  if (!record) throw new Error("PRODUCT_MEDIA_NOT_FOUND");
  store.records = store.records.filter((item) => item !== record);
  await writeRecords(store);
  return { ...record, mediaId: input.mediaId };
}

export async function ingestPublicProductImage(input: { internalProductId?: string; sourceUrl: string; sourceType: string }, fetcher: typeof fetch = fetch): Promise<ImageIngestionResult> {
  let source: URL; try { source = new URL(input.sourceUrl); } catch { throw new Error("IMAGE_SOURCE_INVALID"); }
  if (source.protocol !== "https:") throw new Error("IMAGE_SOURCE_HTTPS_REQUIRED");
  if (input.internalProductId) { const existing = await findIngestedPublicImage({ internalProductId: input.internalProductId, sourceUrl: source.href }); if (existing) return existing; }
  const store = await readRecords(); const reusable = store.records.find((item) => item.sourceImageUrl === source.href);
  if (reusable && await assetExists(reusable)) {
    const associated = { ...reusable, internalProductId: input.internalProductId ?? reusable.internalProductId };
    store.records = [associated, ...store.records.filter((item) => item !== reusable && !(input.internalProductId && item.internalProductId === input.internalProductId && item.sourceImageUrl === associated.sourceImageUrl))];
    await writeRecords(store); return associated;
  }
  const injectedFetcher = fetcher === fetch ? undefined : fetcher;
  let loaded;
  try { loaded = await safeRemoteFetch(source.href, { allowedContentTypes: [...allowed.keys()], fetcher: injectedFetcher, resolver: injectedFetcher ? async () => ["8.8.8.8"] : undefined, headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" }, maxBytes, maxRedirects: 4 }); }
  catch (error) {
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_CONTENT_TYPE_UNSUPPORTED") throw new Error("IMAGE_CONTENT_TYPE_UNSUPPORTED", { cause: error });
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_RESPONSE_TOO_LARGE") throw new Error("IMAGE_TOO_LARGE", { cause: error });
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_SOURCE_NOT_ALLOWED") throw new Error("IMAGE_SOURCE_NOT_ALLOWED", { cause: error });
    throw new Error("IMAGE_RETRIEVAL_FAILED", { cause: error });
  }
  const mimeType = loaded.contentType; const extension = allowed.get(mimeType);
  if (!extension) throw new Error("IMAGE_CONTENT_TYPE_UNSUPPORTED");
  const bytes = loaded.bytes; if (!bytes.length) throw new Error("IMAGE_CONTENT_EMPTY");
  if (!validImageSignature(bytes, mimeType)) throw new Error("IMAGE_CONTENT_INVALID");
  const contentHash = createHash("sha256").update(bytes).digest("hex"); const filename = `${contentHash}${extension}`;
  await objectStorage().storeObject({ key: `products/${filename}`, access: "PUBLIC", bytes, contentType: mimeType, expectedHash: contentHash });
  const storedAt = new Date().toISOString();
  const result: ImageIngestionResult = { internalProductId: input.internalProductId, sourceImageUrl: source.href, publicUrl: `/api/public/assets/products/${filename}`, contentHash, mimeType, storedAt, provenance: { originalUrl: source.href, sourceType: input.sourceType, capturedAt: storedAt, contentType: mimeType, bytes: bytes.length } };
  const latest = await readRecords(); latest.records = [result, ...latest.records.filter((item) => item.sourceImageUrl !== source.href)]; await writeRecords(latest); return result;
}

function validImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/gif") return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(Buffer.from(bytes.subarray(0, 6)).toString("ascii"));
  if (mimeType === "image/webp") return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  return false;
}

export async function ingestPublicProductImageBytes(input: { internalProductId: string; bytes: Uint8Array; mimeType: string; sourceReference: string; sourceType: string }): Promise<ImageIngestionResult> {
  const mimeType = input.mimeType.split(";")[0].trim().toLowerCase();
  const extension = allowed.get(mimeType);
  if (!extension) throw new Error("IMAGE_CONTENT_TYPE_UNSUPPORTED");
  if (!input.bytes.length) throw new Error("IMAGE_CONTENT_EMPTY");
  if (input.bytes.length > maxBytes) throw new Error("IMAGE_TOO_LARGE");
  if (!validImageSignature(input.bytes, mimeType)) throw new Error("IMAGE_CONTENT_INVALID");
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const publicUrl = `/api/public/assets/products/${contentHash}${extension}`;
  const store = await readRecords();
  const duplicate = store.records.find((item) => item.internalProductId === input.internalProductId && item.contentHash === contentHash);
  if (duplicate && await assetExists(duplicate)) return duplicate;
  await objectStorage().storeObject({ key: `products/${contentHash}${extension}`, access: "PUBLIC", bytes: input.bytes, contentType: mimeType, expectedHash: contentHash });
  const storedAt = new Date().toISOString();
  const result: ImageIngestionResult = { internalProductId: input.internalProductId, sourceImageUrl: input.sourceReference, publicUrl, contentHash, mimeType, storedAt, provenance: { originalUrl: input.sourceReference, sourceType: input.sourceType, capturedAt: storedAt, contentType: mimeType, bytes: input.bytes.length } };
  store.records = [result, ...store.records.filter((item) => !(item.internalProductId === input.internalProductId && item.contentHash === contentHash))];
  await writeRecords(store);
  return result;
}

export async function uploadPublicProductImage(input: { internalProductId: string; filename: string; mimeType: string; base64: string; actor?: string }): Promise<ImageIngestionResult> {
  const mimeType = input.mimeType.split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return ingestPublicProductImageBytes({ internalProductId: input.internalProductId, bytes, mimeType, sourceReference: `tekcentral-upload://${contentHash}/${encodeURIComponent(input.filename.trim() || "product-image")}`, sourceType: "MANUAL_UPLOAD" });
}
export async function readPublicProductImage(filename: string) { if (filename !== filename.replace(/[^a-zA-Z0-9._-]/g, "") || !allowed.has(`image/${extname(filename).slice(1)}`.replace("image/jpg", "image/jpeg"))) return undefined; const durable = await objectStorage().readObject(`products/${filename}`, "PUBLIC"); if (durable) return Buffer.from(durable); try { return await readFile(resolve(assetDirectory(), filename)); } catch { return undefined; } }
export function publicImageContentType(filename: string) { const extension = extname(filename).toLowerCase(); return extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : extension === ".gif" ? "image/gif" : undefined; }
