import { getSupplierPolicySettings } from "./businessSettingsRepository.js";
import { availabilityFreshness, quantityAvailability, resolveProductAvailability, type ProductAvailabilityEvidence, type ResolvedProductAvailability } from "./productAvailability.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { supplierRegistry } from "./supplierRegistry.js";
import { listCjCatalogueProducts } from "./suppliers/cj/cjCatalogueRepository.js";
import { listScoopCatalogueProducts } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { listSyntechCatalogueProducts } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { listTekCentralManualOffers } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { listTvrCatalogueOffers } from "./suppliers/tvr/tvrCatalogueService.js";
import { getSupplierSource } from "./supplierSourceRegistry.js";
import { TVR_COMMERCIAL_WORKBOOK_ID } from "./suppliers/tvr/tvrSourceManifest.js";
import type { TvrNormalizedOffer } from "./suppliers/tvr/tvrOfferNormalization.js";

export interface ProductAvailabilitySummary extends ResolvedProductAvailability {
  reason: string;
  usableOfferCount: number;
  freshOfferCount: number;
  staleOfferCount: number;
}

export interface ProductAvailabilityIndex {
  get(productId: string): ProductAvailabilitySummary;
}

const unknownSummary = (): ProductAvailabilitySummary => ({
  ...resolveProductAvailability([]),
  reason: "No current trustworthy availability evidence is available from a verified supplier offer.",
  usableOfferCount: 0,
  freshOfferCount: 0,
  staleOfferCount: 0,
});

export function isUsableMappedOffer(mappingStatus: string | undefined, supplierEnabled: boolean) {
  return mappingStatus === "VERIFIED" && supplierEnabled;
}

export function isUsableScoopAvailabilitySource(offer: { staleAt?: string; availability: string; sourceObservations: { active: boolean }[] }) {
  return !offer.staleAt && offer.availability !== "STALE" && offer.sourceObservations.some((item) => item.active);
}

export function isUsableSyntechAvailabilitySource(offer: { sourcePresence: string }) {
  return offer.sourcePresence === "ACTIVE";
}

export function tvrAvailabilityEvidence(offer: TvrNormalizedOffer, sourceActive: boolean, freshnessHours: number): ProductAvailabilityEvidence | undefined {
  if (!sourceActive || offer.lifecycleStatus !== "CURRENT" || offer.classification === "CONFLICT") return undefined;
  const state = offer.availability === "AVAILABLE" ? "AVAILABLE_FROM_SUPPLIER"
    : offer.availability === "LOW_STOCK" ? "LOW_STOCK"
      : offer.availability === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "AVAILABILITY_UNKNOWN";
  return { state, observedAt: offer.observedAt, freshnessHours, source: "TVR_COMMERCIAL_WORKBOOK" };
}

function summarize(evidence: ProductAvailabilityEvidence[], now: Date): ProductAvailabilitySummary {
  if (!evidence.length) return unknownSummary();
  const fresh = evidence.filter((item) => availabilityFreshness(item.observedAt, item.freshnessHours, now) === "FRESH");
  const stale = evidence.filter((item) => availabilityFreshness(item.observedAt, item.freshnessHours, now) === "STALE");
  const resolved = resolveProductAvailability(evidence, now);
  const reason = resolved.state === "IN_STOCK" || resolved.state === "LOW_STOCK"
    ? `${fresh.filter((item) => item.state === "IN_STOCK" || item.state === "LOW_STOCK").length} active supplier offer(s) have fresh stock evidence.`
    : resolved.state === "AVAILABLE_FROM_SUPPLIER"
      ? `${fresh.filter((item) => item.state === "AVAILABLE_FROM_SUPPLIER").length} active supplier offer(s) confirm availability without a numeric quantity.`
      : resolved.state === "OUT_OF_STOCK"
        ? "All active supplier offers with fresh stock evidence report zero stock."
        : resolved.state === "CHECK_REQUIRED"
          ? "Supplier stock evidence exists but is older than the configured freshness threshold."
          : resolved.state === "DELIVERY_CHECK_REQUIRED"
            ? "Current supplier evidence requires an authoritative availability check before fulfilment."
            : "No current trustworthy availability evidence is available from a verified supplier offer.";
  return { ...resolved, reason, usableOfferCount: evidence.length, freshOfferCount: fresh.length, staleOfferCount: stale.length };
}

export async function buildProductAvailabilityIndex(now = new Date()): Promise<ProductAvailabilityIndex> {
  const [mappings, cjProducts, scoopProducts, syntechProducts, manualOffers, tvrOffers, tvrSource, policy] = await Promise.all([
    listSupplierProductMappings(),
    listCjCatalogueProducts(),
    listScoopCatalogueProducts(),
    listSyntechCatalogueProducts(),
    listTekCentralManualOffers(),
    listTvrCatalogueOffers(),
    getSupplierSource(TVR_COMMERCIAL_WORKBOOK_ID),
    getSupplierPolicySettings(),
  ]);
  const verified = mappings.filter((mapping) => isUsableMappedOffer(mapping.status, supplierRegistry[mapping.supplierCode]?.enabled === true));
  const cjById = new Map(cjProducts.map((product) => [product.supplierProductId, product]));
  const scoopBySku = new Map(scoopProducts.map((product) => [product.supplierSku, product]));
  const syntechBySku = new Map(syntechProducts.map((product) => [product.supplierSku, product]));
  const manualById = new Map(manualOffers.map((offer) => [offer.id, offer]));
  const tvrById = new Map(tvrOffers.map((offer) => [offer.id, offer]));
  const byProduct = new Map<string, ProductAvailabilityEvidence[]>();
  const add = (productId: string, item: ProductAvailabilityEvidence) => byProduct.set(productId, [...(byProduct.get(productId) ?? []), item]);

  for (const mapping of verified) {
    if (mapping.supplierCode === "CJ" && mapping.supplierProductId && mapping.supplierVariantId) {
      const product = cjById.get(mapping.supplierProductId);
      const variant = product?.variants.find((item) => item.supplierVariantId === mapping.supplierVariantId);
      if (!product || !variant) continue;
      const quantity = variant.stockByWarehouse?.reduce((sum, row) => sum + row.quantity, 0) ?? variant.stockTotal;
      const state = quantityAvailability(quantity) ?? (variant.logisticsEvidence?.status === "COMPLETE" || variant.logisticsEvidence?.status === "PARTIAL" ? "DELIVERY_CHECK_REQUIRED" : "AVAILABILITY_UNKNOWN");
      add(mapping.productId, { state, quantity, observedAt: variant.stockEvidence?.observedAt ?? product.lastSuccessfulRefreshAt ?? product.lastFetchedAt, freshnessHours: policy.stockFreshnessHours, source: "CJ_EXACT_VARIANT" });
    }
    if (mapping.supplierCode === "SCOOP") {
      const offer = scoopBySku.get(mapping.supplierSku);
      if (!offer || !isUsableScoopAvailabilitySource(offer)) continue;
      const state = quantityAvailability(offer.totalStock) ?? (offer.availability === "AVAILABLE" ? "AVAILABLE_FROM_SUPPLIER" : offer.availability === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "AVAILABILITY_UNKNOWN");
      add(mapping.productId, { state, quantity: offer.totalStock, observedAt: offer.lastSyncedAt, freshnessHours: policy.stockFreshnessHours, source: "SCOOP_OFFER" });
    }
    if (mapping.supplierCode === "SYNTECH") {
      const offer = syntechBySku.get(mapping.supplierSku);
      if (!offer || !isUsableSyntechAvailabilitySource(offer)) continue;
      add(mapping.productId, { state: quantityAvailability(offer.totalStock) ?? "AVAILABILITY_UNKNOWN", quantity: offer.totalStock, observedAt: offer.observedAt, freshnessHours: policy.stockFreshnessHours, source: "SYNTECH_BRANCH_STOCK" });
    }
    if (mapping.supplierCode === "TEKCENTRAL" && mapping.supplierOfferId) {
      const offer = manualById.get(mapping.supplierOfferId);
      if (!offer || !offer.active) continue;
      add(mapping.productId, { state: quantityAvailability(offer.available) ?? "AVAILABILITY_UNKNOWN", quantity: offer.available, observedAt: offer.stockObservedAt, freshnessHours: policy.stockFreshnessHours, source: "TEKCENTRAL_MANUAL_STOCK" });
    }
    if (mapping.supplierCode === "TVR" && mapping.supplierOfferId) {
      const offer = tvrById.get(mapping.supplierOfferId);
      if (!offer) continue;
      const evidence = tvrAvailabilityEvidence(offer, tvrSource?.state === "ACTIVE" && tvrSource.isPrimary, policy.stockFreshnessHours);
      if (evidence) add(mapping.productId, evidence);
    }
  }

  return { get: (productId) => summarize(byProduct.get(productId) ?? [], now) };
}

export async function getProductAvailability(productId: string, now = new Date()) {
  return (await buildProductAvailabilityIndex(now)).get(productId);
}
