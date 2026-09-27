import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["image/gif", ".gif"]]);
const maxBytes = 5 * 1024 * 1024;
export interface ImageProvenance { originalUrl: string; sourceType: string; capturedAt: string; contentType: string; bytes: number; }
export interface ImageIngestionResult { internalProductId?: string; sourceImageUrl: string; publicUrl: string; contentHash: string; mimeType: string; storedAt: string; provenance: ImageProvenance; }
interface LegacyImageResult { publicUrl: string; provenance: ImageProvenance; }
interface ImageRecordStore { version: 2; records: ImageIngestionResult[]; }
const assetDirectory = () => resolve(process.cwd(), ".data", "public-assets", "products");
const recordPath = () => resolve(process.cwd(), ".data", "public-assets", "image-records.json");
const filenameFromPublicUrl = (publicUrl: string) => publicUrl.split("/").at(-1) ?? "";
const hashFromPublicUrl = (publicUrl: string) => filenameFromPublicUrl(publicUrl).split(".")[0] ?? "";

async function readRecords(): Promise<ImageRecordStore> {
  try {
    const value = JSON.parse(await readFile(recordPath(), "utf8")) as { records?: (ImageIngestionResult | LegacyImageResult)[] };
    if (!Array.isArray(value.records)) return { version: 2, records: [] };
    return { version: 2, records: value.records.map((item) => "sourceImageUrl" in item ? item : {
      sourceImageUrl: item.provenance.originalUrl, publicUrl: item.publicUrl, contentHash: hashFromPublicUrl(item.publicUrl),
      mimeType: item.provenance.contentType, storedAt: item.provenance.capturedAt, provenance: item.provenance,
    }) };
  } catch { return { version: 2, records: [] }; }
}
async function writeRecords(store: ImageRecordStore) { const target = recordPath(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
async function assetExists(record: ImageIngestionResult) { try { await readFile(resolve(assetDirectory(), filenameFromPublicUrl(record.publicUrl))); return true; } catch { return false; } }

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

export async function ingestPublicProductImage(input: { internalProductId?: string; sourceUrl: string; sourceType: string }, fetcher: typeof fetch = fetch): Promise<ImageIngestionResult> {
  let source: URL; try { source = new URL(input.sourceUrl); } catch { throw new Error("IMAGE_SOURCE_INVALID"); }
  if (source.protocol !== "https:") throw new Error("IMAGE_SOURCE_HTTPS_REQUIRED");
  if (input.internalProductId) { const existing = await findIngestedPublicImage({ internalProductId: input.internalProductId, sourceUrl: source.href }); if (existing) return existing; }
  const store = await readRecords(); const reusable = store.records.find((item) => item.sourceImageUrl === source.href);
  if (reusable && await assetExists(reusable)) {
    const associated = { ...reusable, internalProductId: input.internalProductId ?? reusable.internalProductId };
    store.records = [associated, ...store.records.filter((item) => item !== reusable && !(input.internalProductId && item.internalProductId === input.internalProductId))];
    await writeRecords(store); return associated;
  }
  const response = await fetcher(source, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" } });
  if (!response.ok || new URL(response.url || source.href).protocol !== "https:") throw new Error("IMAGE_RETRIEVAL_FAILED");
  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? ""; const extension = allowed.get(mimeType);
  if (!extension) throw new Error("IMAGE_CONTENT_TYPE_UNSUPPORTED");
  const declared = Number(response.headers.get("content-length") ?? 0); if (declared > maxBytes) throw new Error("IMAGE_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer()); if (!bytes.length || bytes.length > maxBytes) throw new Error("IMAGE_TOO_LARGE");
  const contentHash = createHash("sha256").update(bytes).digest("hex"); const filename = `${contentHash}${extension}`; const directory = assetDirectory();
  await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, filename), bytes);
  const storedAt = new Date().toISOString();
  const result: ImageIngestionResult = { internalProductId: input.internalProductId, sourceImageUrl: source.href, publicUrl: `/api/public/assets/products/${filename}`, contentHash, mimeType, storedAt, provenance: { originalUrl: source.href, sourceType: input.sourceType, capturedAt: storedAt, contentType: mimeType, bytes: bytes.length } };
  const latest = await readRecords(); latest.records = [result, ...latest.records.filter((item) => item.sourceImageUrl !== source.href && !(input.internalProductId && item.internalProductId === input.internalProductId))]; await writeRecords(latest); return result;
}
export async function readPublicProductImage(filename: string) { if (filename !== filename.replace(/[^a-zA-Z0-9._-]/g, "") || !allowed.has(`image/${extname(filename).slice(1)}`.replace("image/jpg", "image/jpeg"))) return undefined; try { return await readFile(resolve(assetDirectory(), filename)); } catch { return undefined; } }
export function publicImageContentType(filename: string) { const extension = extname(filename).toLowerCase(); return extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : extension === ".gif" ? "image/gif" : undefined; }
