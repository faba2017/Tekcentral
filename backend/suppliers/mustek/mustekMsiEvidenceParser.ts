import { createHash } from "node:crypto";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { query } from "../../persistence/postgres.js";
import { objectStorage } from "../../storage/objectStorage.js";
import { normalizeMustekSupplierSku } from "./mustekOfferNormalization.js";

export const MUSTEK_MSI_SOURCE_LABEL = "MSI Notebooks Dealer Catalogue November 2026";

export interface MustekMsiSourceVersion {
  sourceId: string;
  sourceVersionId: string;
  sourceFingerprint: string;
  retrievedAt: string;
  objectKey?: string;
}

export interface MustekMsiSpecificationEvidence {
  group: string;
  key: string;
  value: string;
  sourceField: string;
}

export interface MustekMsiEmbeddedImageEvidence {
  access: "PRIVATE";
  kind: "EMBEDDED_DATA_URI";
  mediaType: string;
  contentFingerprint: string;
  byteSize: number;
  sourceField: string;
}

/**
 * Non-commercial evidence only. None of these fields is a SupplierOffer,
 * canonical Product fact, pricing input, availability input, or public asset.
 */
export interface MustekMsiProductEvidence {
  supplier: "MUSTEK";
  manufacturerContext: "MSI";
  supplierSku: string;
  sourceRecordIndex: number;
  sourceRecordReference: string;
  categoryEvidence?: { value: string; authority: "ADVISORY"; sourceField: "category" };
  content: {
    series?: string;
    summary: Record<string, string>;
    notes: string[];
    tag?: string;
  };
  specifications: MustekMsiSpecificationEvidence[];
  embeddedImage?: MustekMsiEmbeddedImageEvidence;
  sourceDisplayPrice?: { value: number; authority: "NON_AUTHORITATIVE"; sourceField: "price" };
  provenance: MustekMsiSourceVersion & {
    sourceKind: "HTML_CATALOGUE";
    sourceRecordReference: string;
  };
  logicalIdentityFingerprint: string;
  evidenceFingerprint: string;
}

export interface MustekMsiParseFailure {
  recordIndex?: number;
  code: "PRODUCTS_ARRAY_MISSING" | "PRODUCTS_ARRAY_INVALID" | "RECORD_INVALID" | "SKU_INVALID" | "DUPLICATE_SKU";
  message: string;
}

export interface MustekMsiParseResult {
  source: MustekMsiSourceVersion;
  sourceRecordCount: number;
  records: MustekMsiProductEvidence[];
  failures: MustekMsiParseFailure[];
}

type JsonRecord = Record<string, unknown>;

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const clean = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : undefined;
const cleanStringArray = (value: unknown) => Array.isArray(value) ? value.map(clean).filter((item): item is string => Boolean(item)) : [];

function cleanStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .map(([key, item]) => [clean(key), clean(item)] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])));
}

function extractProductsJson(html: string) {
  const declaration = /\bconst\s+products\s*=\s*/g.exec(html);
  if (!declaration) throw new Error("PRODUCTS_ARRAY_MISSING");
  const start = declaration.index + declaration[0].length;
  if (html[start] !== "[") throw new Error("PRODUCTS_ARRAY_INVALID");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error("PRODUCTS_ARRAY_INVALID");
}

function embeddedImageEvidence(value: unknown): MustekMsiEmbeddedImageEvidence | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return undefined;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) return undefined;
  return {
    access: "PRIVATE",
    kind: "EMBEDDED_DATA_URI",
    mediaType: match[1],
    contentFingerprint: hash(bytes),
    byteSize: bytes.length,
    sourceField: "imageData",
  };
}

export function extractMustekMsiEmbeddedImage(bytes: Uint8Array, supplierSku: string, expectedContentFingerprint: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(extractProductsJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { throw new Error("MUSTEK_PRIVATE_MEDIA_SOURCE_INVALID"); }
  if (!Array.isArray(parsed)) throw new Error("MUSTEK_PRIVATE_MEDIA_SOURCE_INVALID");
  const normalizedSku = normalizeMustekSupplierSku(supplierSku);
  const record = parsed.find((item) => item && typeof item === "object" && !Array.isArray(item) && normalizeMustekSupplierSku(clean((item as JsonRecord).sku)) === normalizedSku) as JsonRecord | undefined;
  if (!record) throw new Error("MUSTEK_PRIVATE_MEDIA_RECORD_NOT_FOUND");
  const metadata = embeddedImageEvidence(record.imageData);
  if (!metadata) throw new Error("MUSTEK_PRIVATE_MEDIA_IMAGE_MISSING");
  if (metadata.contentFingerprint !== expectedContentFingerprint) throw new Error("MUSTEK_PRIVATE_MEDIA_FINGERPRINT_MISMATCH");
  const match = typeof record.imageData === "string" ? /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(record.imageData) : undefined;
  if (!match) throw new Error("MUSTEK_PRIVATE_MEDIA_IMAGE_INVALID");
  const imageBytes = new Uint8Array(Buffer.from(match[2], "base64"));
  if (!imageBytes.length || hash(imageBytes) !== expectedContentFingerprint) throw new Error("MUSTEK_PRIVATE_MEDIA_FINGERPRINT_MISMATCH");
  return { bytes: imageBytes, mimeType: match[1], metadata };
}

function normalizedSpecifications(value: unknown): MustekMsiSpecificationEvidence[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows: MustekMsiSpecificationEvidence[] = [];
  for (const [rawGroup, rawValues] of Object.entries(value as JsonRecord)) {
    const group = clean(rawGroup);
    if (!group) continue;
    for (const specificationValue of cleanStringArray(rawValues)) rows.push({ group, key: group, value: specificationValue, sourceField: `specs.${group}` });
  }
  return rows;
}

function fingerprintFacts(record: Omit<MustekMsiProductEvidence, "provenance" | "evidenceFingerprint">) {
  return {
    supplier: record.supplier,
    manufacturerContext: record.manufacturerContext,
    supplierSku: record.supplierSku,
    categoryEvidence: record.categoryEvidence,
    content: {
      series: record.content.series,
      summary: Object.fromEntries(Object.entries(record.content.summary).sort(([left], [right]) => left.localeCompare(right))),
      notes: [...record.content.notes].sort(),
      tag: record.content.tag,
    },
    specifications: [...record.specifications].sort((left, right) => `${left.group}\0${left.value}`.localeCompare(`${right.group}\0${right.value}`)),
    embeddedImage: record.embeddedImage,
    sourceDisplayPrice: record.sourceDisplayPrice,
  };
}

export function parseMustekMsiHtml(bytes: Uint8Array, source: MustekMsiSourceVersion): MustekMsiParseResult {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(extractProductsJson(html)); }
  catch (error) {
    const code = error instanceof Error && error.message === "PRODUCTS_ARRAY_MISSING" ? "PRODUCTS_ARRAY_MISSING" : "PRODUCTS_ARRAY_INVALID";
    return { source, sourceRecordCount: 0, records: [], failures: [{ code, message: code === "PRODUCTS_ARRAY_MISSING" ? "MSI products array was not found." : "MSI products array was not valid JSON." }] };
  }
  if (!Array.isArray(parsed)) return { source, sourceRecordCount: 0, records: [], failures: [{ code: "PRODUCTS_ARRAY_INVALID", message: "MSI products value was not an array." }] };

  const records: MustekMsiProductEvidence[] = [];
  const failures: MustekMsiParseFailure[] = [];
  const seen = new Set<string>();
  parsed.forEach((raw, sourceRecordIndex) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { failures.push({ recordIndex: sourceRecordIndex, code: "RECORD_INVALID", message: "MSI record was not an object." }); return; }
    const input = raw as JsonRecord;
    const supplierSku = normalizeMustekSupplierSku(clean(input.sku));
    if (!supplierSku) { failures.push({ recordIndex: sourceRecordIndex, code: "SKU_INVALID", message: "MSI record did not contain a valid SKU." }); return; }
    if (seen.has(supplierSku)) { failures.push({ recordIndex: sourceRecordIndex, code: "DUPLICATE_SKU", message: `Duplicate MSI SKU ${supplierSku} was not normalized twice.` }); return; }
    seen.add(supplierSku);
    const sourceRecordReference = `products[${sourceRecordIndex}]`;
    const category = clean(input.category);
    const price = typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0 ? input.price : undefined;
    const base: Omit<MustekMsiProductEvidence, "provenance" | "evidenceFingerprint"> = {
      supplier: "MUSTEK",
      manufacturerContext: "MSI",
      supplierSku,
      sourceRecordIndex,
      sourceRecordReference,
      categoryEvidence: category ? { value: category, authority: "ADVISORY", sourceField: "category" } : undefined,
      content: {
        series: clean(input.series),
        summary: cleanStringRecord(input.summary),
        notes: cleanStringArray(input.notes),
        tag: clean(input.tag),
      },
      specifications: normalizedSpecifications(input.specs),
      embeddedImage: embeddedImageEvidence(input.imageData),
      sourceDisplayPrice: price === undefined ? undefined : { value: price, authority: "NON_AUTHORITATIVE", sourceField: "price" },
      logicalIdentityFingerprint: hash(`MUSTEK\0MSI_HTML\0${supplierSku}`),
    };
    records.push({
      ...base,
      provenance: { ...source, sourceKind: "HTML_CATALOGUE", sourceRecordReference },
      evidenceFingerprint: hash(JSON.stringify(fingerprintFacts(base))),
    });
  });
  return { source, sourceRecordCount: parsed.length, records, failures };
}

/** Read-only adapter for the current immutable MSI source version. */
export async function readCurrentMustekMsiEvidence(): Promise<MustekMsiParseResult> {
  if (loadPersistenceConfig().provider !== "POSTGRES") throw new Error("MUSTEK_MSI_POSTGRES_REQUIRED");
  const result = await query<{ source_id: string; source_version_id: string; source_fingerprint: string; object_key: string | null; retrieved_at: string | Date }>(`SELECT s.id AS source_id,v.id AS source_version_id,v.fingerprint AS source_fingerprint,v.object_key,v.retrieved_at
    FROM supplier_sources s JOIN supplier_source_versions v ON v.source_id=s.id AND v.fingerprint=s.fingerprint
    WHERE s.supplier_code='MUSTEK' AND s.label=$1 AND s.state='ACTIVE' AND s.purpose='HTML_CATALOGUE' AND s.format='HTML'
    ORDER BY v.retrieved_at DESC LIMIT 1`, [MUSTEK_MSI_SOURCE_LABEL]);
  const row = result.rows[0];
  if (!row?.object_key) throw new Error("MUSTEK_MSI_SOURCE_VERSION_NOT_FOUND");
  const bytes = await objectStorage().readObject(row.object_key, "PRIVATE");
  if (!bytes) throw new Error("MUSTEK_MSI_PRIVATE_OBJECT_NOT_FOUND");
  if (hash(bytes) !== row.source_fingerprint) throw new Error("MUSTEK_MSI_SOURCE_FINGERPRINT_MISMATCH");
  return parseMustekMsiHtml(bytes, {
    sourceId: row.source_id,
    sourceVersionId: row.source_version_id,
    sourceFingerprint: row.source_fingerprint,
    retrievedAt: new Date(row.retrieved_at).toISOString(),
    objectKey: row.object_key,
  });
}
