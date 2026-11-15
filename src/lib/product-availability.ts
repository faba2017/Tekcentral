import type { Product, ProductAvailabilityState } from "@/types/product";

const labels: Record<ProductAvailabilityState, string> = {
  IN_STOCK: "In stock", LOW_STOCK: "Limited stock", AVAILABLE_FROM_SUPPLIER: "Available", OUT_OF_STOCK: "Out of stock",
  BACKORDER: "Backorder", PREORDER: "Pre-order", AVAILABILITY_UNKNOWN: "Availability to be confirmed",
  CHECK_REQUIRED: "Availability check required", DELIVERY_CHECK_REQUIRED: "Availability confirmed at checkout", DISCONTINUED: "No longer available",
};
export function productAvailability(product: Product) {
  if (product.availability) return product.availability;
  const state: ProductAvailabilityState = product.stockStatus === "in-stock" ? "IN_STOCK" : product.stockStatus === "low-stock" ? "LOW_STOCK" : product.stockStatus === "out-of-stock" ? "OUT_OF_STOCK" : "AVAILABILITY_UNKNOWN";
  return { state, label: labels[state], freshness: "UNKNOWN" as const, purchasable: product.stockStatus !== "out-of-stock" };
}
