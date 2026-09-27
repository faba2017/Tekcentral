import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierCode, SupplierProductMapping } from "./types.js";

interface SupplierProductMappingStore {
  version: 1;
  mappings: SupplierProductMapping[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-product-mappings.json");
}

function mappingKey(productId: string, supplierCode: SupplierCode) {
  return `${supplierCode}:${productId}`;
}

function exactMappingKey(mapping: {
  productId: string;
  supplierCode: SupplierCode;
  supplierProductId?: string;
  supplierProductSku?: string;
  supplierVariantId?: string;
  supplierVariantSku?: string;
  supplierSku?: string;
  supplierOfferId?: string;
}) {
  return [
    mappingKey(mapping.productId, mapping.supplierCode),
    mapping.supplierProductId ?? "",
    mapping.supplierProductSku ?? "",
    mapping.supplierVariantId ?? "",
    mapping.supplierVariantSku ?? "",
    mapping.supplierSku ?? "",
    mapping.supplierOfferId ?? "",
  ].join(":");
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readStore(): Promise<SupplierProductMappingStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SupplierProductMappingStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.mappings)) {
      return { version: 1, mappings: [] };
    }
    return { version: 1, mappings: parsed.mappings };
  } catch {
    return { version: 1, mappings: [] };
  }
}

async function writeStore(store: SupplierProductMappingStore) {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function listSupplierProductMappings() {
  const store = await readStore();
  return store.mappings;
}

export async function getSupplierProductMapping(productId: string, supplierCode: SupplierCode) {
  const store = await readStore();
  const key = mappingKey(productId, supplierCode);
  return (
    store.mappings.find(
      (mapping) =>
        mappingKey(mapping.productId, mapping.supplierCode) === key &&
        mapping.status === "VERIFIED",
    ) ??
    store.mappings.find((mapping) => mappingKey(mapping.productId, mapping.supplierCode) === key)
  );
}

export async function getSupplierProductMappingById(id: string) {
  const store = await readStore();
  return store.mappings.find((mapping) => mapping.id === id);
}

export async function saveSupplierProductMapping(input: {
  id?: string;
  productId: string;
  supplierCode: SupplierCode;
  supplierSku: string;
  supplierOfferId?: string;
  supplierProductId?: string;
  supplierProductSku?: string;
  supplierVariantId?: string;
  supplierVariantSku?: string;
  status?: SupplierProductMapping["status"];
  confidence?: number;
  confidenceLevel?: SupplierProductMapping["confidenceLevel"];
  matchMethod?: string;
  evidence?: string[];
  verifiedBy?: string;
  verifiedAt?: string;
  source?: string;
}) {
  const supplierSku = input.supplierSku.trim();
  if (!supplierSku) throw new Error("SUPPLIER_MAPPING_REQUIRED");
  const store = await readStore();
  const now = new Date().toISOString();
  const key = mappingKey(input.productId, input.supplierCode);
  const exactKey = exactMappingKey({
    ...input,
    supplierSku,
  });
  const existingIndex = store.mappings.findIndex(
    (mapping) =>
      (input.id && mapping.id === input.id) ||
      (mappingKey(mapping.productId, mapping.supplierCode) === key &&
        exactMappingKey(mapping) === exactKey),
  );
  const existing = existingIndex >= 0 ? store.mappings[existingIndex] : undefined;
  const mapping: SupplierProductMapping = {
    id: input.id ?? existing?.id ?? createLocalId("supplier-mapping"),
    productId: input.productId,
    supplierCode: input.supplierCode,
    supplierSku,
    supplierOfferId: input.supplierOfferId ?? existing?.supplierOfferId,
    supplierProductId: input.supplierProductId ?? existing?.supplierProductId,
    supplierProductSku: input.supplierProductSku ?? existing?.supplierProductSku,
    supplierVariantId: input.supplierVariantId ?? existing?.supplierVariantId,
    supplierVariantSku: input.supplierVariantSku ?? existing?.supplierVariantSku,
    status: input.status ?? existing?.status ?? "VERIFIED",
    confidence: input.confidence ?? existing?.confidence,
    confidenceLevel: input.confidenceLevel ?? existing?.confidenceLevel,
    matchMethod: input.matchMethod ?? existing?.matchMethod,
    evidence: input.evidence ?? existing?.evidence,
    verifiedBy:
      input.verifiedBy ??
      (input.status === "SUGGESTED" ? undefined : existing?.verifiedBy),
    verifiedAt:
      input.verifiedAt ??
      (input.status === "SUGGESTED" ? undefined : existing?.verifiedAt) ??
      (input.status === "VERIFIED" ? now : undefined),
    source: input.source?.trim() || "Staff supplied",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existingIndex >= 0) store.mappings[existingIndex] = mapping;
  else store.mappings.unshift(mapping);
  await writeStore(store);
  return mapping;
}

export async function setSupplierProductMappingStatus(
  id: string,
  status: "VERIFIED" | "REJECTED",
) {
  const mapping = await getSupplierProductMappingById(id);
  if (!mapping) return undefined;
  return saveSupplierProductMapping({
    ...mapping,
    status,
    verifiedBy: status === "VERIFIED" ? "TekCentral Staff" : mapping.verifiedBy,
    verifiedAt: status === "VERIFIED" ? new Date().toISOString() : mapping.verifiedAt,
    source: mapping.source ?? "Staff reviewed",
  });
}
