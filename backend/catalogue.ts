import { products } from "../src/data/catalogue.js";
import { getPublishedBackendProduct } from "./productPublicationRepository.js";

export const backendProducts = products.map((product) => ({
  productId: product.id,
  slug: product.slug,
  sku: product.sku,
  name: product.name,
  brand: product.brand,
  price: product.price,
  stockStatus: product.stockStatus,
}));

export async function getBackendProduct(productId: string) {
  return backendProducts.find((item) => item.productId === productId) ?? getPublishedBackendProduct(productId);
}

export const backendDeliveryMethods = [
  {
    id: "standard",
    name: "Standard Delivery",
    description: "Delivery to your South African address.",
    estimatedRange: "2-5 business days",
    price: 149,
    enabled: true,
  },
  {
    id: "express",
    name: "Express Delivery",
    description: "Priority dispatch for faster delivery.",
    estimatedRange: "1-2 business days",
    price: 299,
    enabled: true,
  },
] as const;

export function calculateBackendTotals(subtotal: number, deliveryAmount: number) {
  const total = subtotal + deliveryAmount;
  return {
    subtotal,
    deliveryAmount,
    taxAmount: Math.round((total * 0.15) / 1.15),
    total,
  };
}
