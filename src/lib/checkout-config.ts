import type { DeliveryMethod, OrderTotals, PaymentMethod } from "@/types/order";

export const southAfricanProvinces = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

export const deliveryMethods: DeliveryMethod[] = [
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
];

export const paymentMethods: PaymentMethod[] = [
  {
    id: "payfast",
    name: "PayFast",
    description:
      "You'll be redirected to PayFast to choose from the payment methods available for your order.",
    settlementNote: "Secure hosted payment with PayFast.",
    enabled: true,
  },
  {
    id: "manual-eft",
    name: "EFT / Bank Transfer",
    description: "Manual payment path reserved for assisted orders.",
    settlementNote: "Manual EFT is not selectable for this checkout.",
    enabled: false,
  },
];

export const demoTaxConfig = {
  label: "Includes VAT",
  rate: 0.15,
  pricesIncludeVat: true,
};

export function calculateOrderTotals(
  subtotal: number,
  deliveryAmount: number,
): OrderTotals {
  const total = subtotal + deliveryAmount;
  const taxAmount = demoTaxConfig.pricesIncludeVat
    ? Math.round((total * demoTaxConfig.rate) / (1 + demoTaxConfig.rate))
    : Math.round(total * demoTaxConfig.rate);

  return {
    subtotal,
    deliveryAmount,
    taxAmount,
    total: demoTaxConfig.pricesIncludeVat ? total : total + taxAmount,
  };
}
