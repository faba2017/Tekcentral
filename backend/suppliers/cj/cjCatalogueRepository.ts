import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierCatalogueProduct } from "../../types.js";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { readSupplierStore, replaceSupplierStore } from "../../persistence/catalogueRepository.js";

interface CjCatalogueStore {
  version: 1;
  products: SupplierCatalogueProduct[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-catalogue-cj.json");
}

async function readStore(): Promise<CjCatalogueStore> {
  if (loadPersistenceConfig().provider === "POSTGRES") return readSupplierStore<SupplierCatalogueProduct>("CJ");
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CjCatalogueStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.products)) {
      return { version: 1, products: [] };
    }
    return { version: 1, products: parsed.products };
  } catch {
    return { version: 1, products: [] };
  }
}

async function writeStore(store: CjCatalogueStore) {
  if (loadPersistenceConfig().provider === "POSTGRES") { await replaceSupplierStore("CJ", store); return; }
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function listCjCatalogueProducts() {
  const store = await readStore();
  return store.products;
}

export async function getCjCatalogueProduct(supplierProductId: string) {
  const store = await readStore();
  return store.products.find((product) => product.supplierProductId === supplierProductId);
}

export async function confirmCjCatalogueCurrency(input: { supplierProductId: string; currency: string; evidenceNote: string; sourceReference: string; actor?: string }) {
  const product = await getCjCatalogueProduct(input.supplierProductId);
  if (!product) return undefined;
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter ISO code.");
  if (!input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Currency confirmation requires an evidence note and source reference.");
  return saveCjCatalogueProduct({
    ...product,
    currency,
    currencyEvidence: { currency, source: "ADMIN_CONFIRMED", sourceReference: input.sourceReference.trim(), evidenceNote: input.evidenceNote.trim(), confidence: "HIGH", confirmedAt: new Date().toISOString(), confirmedBy: input.actor ?? "TekCentral Staff" },
  });
}

export async function saveCjCatalogueProduct(product: SupplierCatalogueProduct) {
  const store = await readStore();
  const index = store.products.findIndex(
    (item) => item.supplierProductId === product.supplierProductId,
  );
  if (index >= 0) {
    const existing = store.products[index];
    const mergedCurrencyEvidence = product.currencyEvidence?.source !== "UNKNOWN" ? product.currencyEvidence : existing.currencyEvidence ?? product.currencyEvidence;
    store.products[index] = {
      ...existing,
      ...product,
      currency: product.currency ?? existing.currency,
      currencyEvidence: mergedCurrencyEvidence,
      evidenceHistory: [...(existing.evidenceHistory ?? []), ...(product.evidenceHistory ?? [])].filter((entry, entryIndex, rows) => rows.findIndex((candidate) => candidate.sourceFingerprint === entry.sourceFingerprint && candidate.endpoint === entry.endpoint) === entryIndex).slice(-25),
      variants: product.variants.map((variant) => ({
        ...existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId),
        ...variant,
        currency: variant.currency ?? existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.currency,
        currencyEvidence: variant.currencyEvidence?.source !== "UNKNOWN" ? variant.currencyEvidence : existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.currencyEvidence ?? variant.currencyEvidence,
        costEvidence: existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.costEvidence?.classification === "PROCUREMENT_COST" ? existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.costEvidence : variant.costEvidence,
        costEvidenceHistory: [...(existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.costEvidenceHistory ?? []), ...(variant.costEvidenceHistory ?? [])].filter((entry, entryIndex, rows) => rows.findIndex((candidate) => candidate.capturedAt === entry.capturedAt && candidate.sourceFingerprint === entry.sourceFingerprint) === entryIndex).slice(-25),
        identityEvidence: existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.identityEvidence?.source === "ADMIN_CONFIRMED" ? existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.identityEvidence : variant.identityEvidence,
        logisticsEvidence: existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.logisticsEvidence?.observations.some((item) => item.sourceFingerprint?.startsWith("ADMIN:")) ? existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.logisticsEvidence : variant.logisticsEvidence,
        evidenceHistory: [...(existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.evidenceHistory ?? []), ...(variant.evidenceHistory ?? [])].filter((entry, entryIndex, rows) => rows.findIndex((candidate) => candidate.sourceFingerprint === entry.sourceFingerprint && candidate.endpoint === entry.endpoint) === entryIndex).slice(-25),
        launch: variant.launch ?? existing.variants.find((item) => item.supplierVariantId === variant.supplierVariantId)?.launch,
      })),
    };
  }
  else store.products.unshift(product);
  await writeStore(store);
  return store.products.find((item) => item.supplierProductId === product.supplierProductId)!;
}

export async function updateCjCatalogueVariant(
  supplierProductId: string,
  supplierVariantId: string,
  update: (variant: SupplierCatalogueProduct["variants"][number], product: SupplierCatalogueProduct) => SupplierCatalogueProduct["variants"][number],
) {
  const product = await getCjCatalogueProduct(supplierProductId);
  if (!product) return undefined;
  const variant = product.variants.find((item) => item.supplierVariantId === supplierVariantId);
  if (!variant) return undefined;
  return saveCjCatalogueProduct({
    ...product,
    variants: product.variants.map((item) => item.supplierVariantId === supplierVariantId ? update(item, product) : item),
  });
}
