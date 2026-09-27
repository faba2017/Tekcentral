import { ApiError } from "@/lib/api";

export function getCustomerPaymentError(error: unknown) {
  if (error instanceof TypeError) {
    return "We couldn't connect to the payment service. Please try again.";
  }

  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("credentials") ||
    normalized.includes("configured") ||
    normalized.includes("payfast sandbox")
  ) {
    return "Secure payment is temporarily unavailable. Please try again shortly.";
  }

  if (normalized.includes("unknown product")) {
    return "One of the items in your cart could not be prepared for checkout. Please return to your cart and try again.";
  }

  if (
    normalized.includes("order not found") ||
    (error instanceof ApiError && error.status === 404)
  ) {
    return "We couldn't find this order. Please return to your order history.";
  }

  if (normalized.includes("request failed")) {
    return "We couldn't connect to the payment service. Please try again.";
  }

  return "We couldn't prepare your secure payment session right now. Please try again.";
}
