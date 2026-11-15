export type ProductAvailabilityState = "IN_STOCK" | "LOW_STOCK" | "AVAILABLE_FROM_SUPPLIER" | "OUT_OF_STOCK" | "BACKORDER" | "PREORDER" | "AVAILABILITY_UNKNOWN" | "CHECK_REQUIRED" | "DELIVERY_CHECK_REQUIRED" | "DISCONTINUED";
export type AvailabilityFreshness = "FRESH" | "STALE" | "UNKNOWN";
export interface ProductAvailabilityEvidence {
  state: ProductAvailabilityState;
  observedAt?: string;
  source: string;
  quantity?: number;
  freshnessHours?: number;
}
export interface ResolvedProductAvailability {
  state: ProductAvailabilityState;
  label: string;
  freshness: AvailabilityFreshness;
  observedAt?: string;
  quantity?: number;
  source: string;
  purchasable: boolean;
}

const labels: Record<ProductAvailabilityState, string> = {
  IN_STOCK: "In stock", LOW_STOCK: "Limited stock", AVAILABLE_FROM_SUPPLIER: "Available", OUT_OF_STOCK: "Out of stock",
  BACKORDER: "Backorder", PREORDER: "Pre-order", AVAILABILITY_UNKNOWN: "Availability to be confirmed",
  CHECK_REQUIRED: "Availability check required", DELIVERY_CHECK_REQUIRED: "Availability confirmed at checkout", DISCONTINUED: "No longer available",
};
const rank: Record<ProductAvailabilityState, number> = { IN_STOCK: 90, LOW_STOCK: 80, AVAILABLE_FROM_SUPPLIER: 70, DELIVERY_CHECK_REQUIRED: 60, PREORDER: 50, BACKORDER: 40, CHECK_REQUIRED: 35, AVAILABILITY_UNKNOWN: 30, OUT_OF_STOCK: 20, DISCONTINUED: 10 };
export const availabilityLabel = (state: ProductAvailabilityState) => labels[state];
export const availabilityPurchasable = (state: ProductAvailabilityState) => !["OUT_OF_STOCK", "DISCONTINUED", "CHECK_REQUIRED", "AVAILABILITY_UNKNOWN"].includes(state);
export function availabilityFreshness(observedAt: string | undefined, freshnessHours = 24, now = new Date()) {
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) return "UNKNOWN" as const;
  return now.getTime() - Date.parse(observedAt) <= freshnessHours * 3_600_000 ? "FRESH" as const : "STALE" as const;
}
export function resolveProductAvailability(evidence: ProductAvailabilityEvidence[], now = new Date()): ResolvedProductAvailability {
  const normalized = evidence.map((item) => ({ ...item, freshness: availabilityFreshness(item.observedAt, item.freshnessHours, now) }));
  const fresh = normalized.filter((item) => item.freshness === "FRESH").sort((left, right) => rank[right.state] - rank[left.state]);
  const meaningfulFresh = fresh.filter((item) => item.state !== "AVAILABILITY_UNKNOWN");
  const selected = meaningfulFresh[0] ?? (normalized.some((item) => item.freshness === "STALE")
    ? { state: "CHECK_REQUIRED" as const, source: "STALE_SUPPLIER_EVIDENCE", freshness: "STALE" as const, observedAt: normalized.filter((item) => item.freshness === "STALE").sort((left, right) => Date.parse(right.observedAt ?? "") - Date.parse(left.observedAt ?? ""))[0]?.observedAt }
    : fresh[0] ?? { state: "AVAILABILITY_UNKNOWN" as const, source: "NO_CURRENT_EVIDENCE", freshness: "UNKNOWN" as const });
  return { state: selected.state, label: labels[selected.state], freshness: selected.freshness, observedAt: selected.observedAt, quantity: selected.quantity, source: selected.source, purchasable: availabilityPurchasable(selected.state) };
}

export function quantityAvailability(quantity: number | undefined, lowStockThreshold = 5): ProductAvailabilityState | undefined {
  if (quantity === undefined || !Number.isFinite(quantity)) return undefined;
  if (quantity <= 0) return "OUT_OF_STOCK";
  return quantity <= lowStockThreshold ? "LOW_STOCK" : "IN_STOCK";
}
