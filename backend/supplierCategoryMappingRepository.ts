import type { ProductTaxonomyAssignment, TaxonomyStatus } from "../src/lib/product-taxonomy.js";
import { resolveProductTaxonomy } from "../src/lib/product-taxonomy.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { readRows, replaceCategoryMappings, upsertCategoryMapping } from "./persistence/catalogueRepository.js";

export interface SupplierCategoryMapping extends ProductTaxonomyAssignment {
  id: string;
  supplierId: string;
  sourceCategoryId?: string;
  sourceCategoryPath?: string;
  sourceCategoryLabel?: string;
  normalizedSourcePath: string;
  status: TaxonomyStatus;
  confidence?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  revision: number;
  history: Array<{ revision: number; categoryId: string; subcategoryId?: string; productTypeId?: string; actor: string; verifiedAt: string }>;
}

interface Store { version: 1; mappings: SupplierCategoryMapping[]; }
const storePath = () => resolve(process.cwd(), ".data", "supplier-category-mappings.json");
async function readStore(): Promise<Store> { if (loadPersistenceConfig().provider === "POSTGRES") return { version: 1, mappings: await readRows<SupplierCategoryMapping>("catalogue_category_mappings", "id") }; try { const value = JSON.parse(await readFile(storePath(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.mappings) ? value : { version: 1, mappings: [] }; } catch { return { version: 1, mappings: [] }; } }
async function writeStore(store: Store) { if (loadPersistenceConfig().provider === "POSTGRES") { await replaceCategoryMappings(store.mappings); return; } const target = storePath(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
export function normalizeSupplierSourcePath(value?: string) { return value?.normalize("NFKC").trim().toLowerCase().replace(/\s*(?:>|\/|\\|\||»|→)+\s*/g, " > ").replace(/\s+/g, " ").replace(/^(?: > )+|(?: > )+$/g, "") ?? ""; }
const mappingPath = (input: { sourceCategoryId?: string; sourceCategoryPath?: string; sourceCategoryLabel?: string }) => normalizeSupplierSourcePath(input.sourceCategoryPath ?? input.sourceCategoryId ?? input.sourceCategoryLabel);
const hydrate = (mapping: SupplierCategoryMapping): SupplierCategoryMapping => ({ ...mapping, normalizedSourcePath: mapping.normalizedSourcePath || mappingPath(mapping), revision: mapping.revision || 1, history: mapping.history ?? [{ revision: 1, categoryId: mapping.categoryId, subcategoryId: mapping.subcategoryId, productTypeId: mapping.productTypeId, actor: mapping.reviewedBy ?? "TekCentral Staff", verifiedAt: mapping.reviewedAt ?? new Date(0).toISOString() }] });
export async function listSupplierCategoryMappings(supplierId?: string) { const mappings = (await readStore()).mappings.map(hydrate); return supplierId ? mappings.filter((item) => item.supplierId === supplierId) : mappings; }
export async function saveSupplierCategoryMapping(input: Omit<SupplierCategoryMapping, "id" | "normalizedSourcePath" | "taxonomyVersion" | "taxonomyStatus" | "status" | "reviewedAt" | "revision" | "history"> & { status: "VERIFIED"; reviewedAt?: string }) {
  if (!input.sourceCategoryPath?.trim() && !input.sourceCategoryId?.trim() && !input.sourceCategoryLabel?.trim()) throw new Error("Exact source category evidence is required.");
  const store = await readStore(); const normalizedSourcePath = mappingPath(input); if (!normalizedSourcePath) throw new Error("Normalized source category evidence is required.");
  const id = `${input.supplierId}:${normalizedSourcePath}`; const existingIndex = store.mappings.findIndex((item) => item.supplierId === input.supplierId && mappingPath(item) === normalizedSourcePath); const existing = existingIndex >= 0 ? hydrate(store.mappings[existingIndex]) : undefined;
  const reviewedBy = input.reviewedBy?.trim() || "TekCentral Staff"; const reviewedAt = input.reviewedAt ?? new Date().toISOString(); const changed = !existing || existing.categoryId !== input.categoryId || existing.subcategoryId !== input.subcategoryId || existing.productTypeId !== input.productTypeId; const revision = existing ? existing.revision + (changed ? 1 : 0) : 1;
  const history = changed ? [...(existing?.history ?? []), { revision, categoryId: input.categoryId, subcategoryId: input.subcategoryId, productTypeId: input.productTypeId, actor: reviewedBy, verifiedAt: reviewedAt }] : existing?.history ?? [];
  const mapping: SupplierCategoryMapping = { ...input, id, normalizedSourcePath, taxonomyVersion: 1, taxonomyStatus: "VERIFIED", status: "VERIFIED", reviewedBy, reviewedAt, revision, history };
  if (loadPersistenceConfig().provider === "POSTGRES") { await upsertCategoryMapping(mapping); return mapping; }
  if (existingIndex >= 0) store.mappings[existingIndex] = mapping; else store.mappings.unshift(mapping); await writeStore(store); return mapping;
}

/** Deterministic mappings are advisory until exact source evidence or staff review exists. */
export function suggestSupplierCategoryMapping(input: { supplierId: string; sourceCategoryId?: string; sourceCategoryPath?: string; sourceCategoryLabel?: string; productName?: string; supplierSku?: string }): SupplierCategoryMapping {
  const taxonomy = resolveProductTaxonomy({ name: input.productName ?? input.sourceCategoryLabel ?? input.sourceCategoryPath ?? "", sku: input.supplierSku, category: input.sourceCategoryLabel, categorySlug: input.sourceCategoryPath });
  const status: TaxonomyStatus = taxonomy.taxonomyStatus === "VERIFIED" ? "REVIEW_REQUIRED" : taxonomy.taxonomyStatus;
  return { id: `${input.supplierId}:${mappingPath(input) || "UNMAPPED"}`, ...input, ...taxonomy, normalizedSourcePath: mappingPath(input), taxonomyStatus: status, status, revision: 0, history: [] };
}

export function applyVerifiedSupplierCategoryMapping(existing: ProductTaxonomyAssignment | undefined, mapping: SupplierCategoryMapping) {
  if (existing?.taxonomyStatus === "VERIFIED") return existing;
  return mapping.status === "VERIFIED" ? { categoryId: mapping.categoryId, subcategoryId: mapping.subcategoryId, productTypeId: mapping.productTypeId, taxonomyVersion: 1 as const, taxonomyStatus: "VERIFIED" as const } : existing;
}
