import type { CartLine } from "@/state/cart";

const snapshotPrefix = "tekcentral-payfast-cart-";

export function savePayfastCartSnapshot(orderNumber: string, lines: CartLine[]) {
  window.localStorage.setItem(`${snapshotPrefix}${orderNumber}`, JSON.stringify(lines));
}

export function readPayfastCartSnapshot(orderNumber: string) {
  try {
    const stored = window.localStorage.getItem(`${snapshotPrefix}${orderNumber}`);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) =>
        typeof line.productId === "string" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function clearPayfastCartSnapshot(orderNumber: string) {
  window.localStorage.removeItem(`${snapshotPrefix}${orderNumber}`);
}
