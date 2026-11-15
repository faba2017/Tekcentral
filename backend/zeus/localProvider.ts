import { availabilitySentence } from "./policy.js";
import type { StorePolicyKnowledge } from "../../src/lib/store-policy-knowledge.js";
import type { ZeusAIProvider, ZeusOrderSummary, ZeusProviderRequest, ZeusProviderResponse, ZeusPublicProduct } from "./types.js";

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
const lastUser = (request: ZeusProviderRequest) => [...request.messages].reverse().find((item) => item.role === "user")?.content ?? "";
const identifiers = (message: string) => [...message.matchAll(/(?:\/product\/)?([a-z0-9]+(?:-[a-z0-9]+)+)/gi)].map((match) => match[1]);

export class LocalZeusProvider implements ZeusAIProvider {
  async generate(request: ZeusProviderRequest): Promise<ZeusProviderResponse> {
    if (request.toolResults?.length) {
      const result = request.toolResults.at(-1)!; const output = result.output as { policy?: StorePolicyKnowledge; products?: ZeusPublicProduct[]; product?: ZeusPublicProduct | null; availability?: ZeusPublicProduct["availability"] | null; orders?: ZeusOrderSummary[]; order?: { orderNumber: string; orderStatus: string; paymentStatus: string; tracking?: { trackingNumber?: string; carrier?: string } | null; returns?: unknown[]; refunds?: { status: string }[]; url: string } | null; tracking?: { trackingNumber?: string; carrier?: string } | null; returns?: { orderNumber: string; status: string; refundStatus?: string }[]; addresses?: { label: string; city: string; province: string; isDefault: boolean }[] };
      const products = output.products ?? (output.product ? [output.product] : []);
      if (result.name === "getStorePolicy" && output.policy) return { provider: "local", model: "deterministic-v1", message: `${output.policy.summary} ${output.policy.nextStep}` };
      if (result.name === "getMyOrders") return { provider: "local", model: "deterministic-v1", message: output.orders?.length ? `I found ${output.orders.length} recent order${output.orders.length === 1 ? "" : "s"} in your account. The newest is ${output.orders[0].orderNumber}, currently ${output.orders[0].orderStatus.toLowerCase().replaceAll("_", " ")}.` : "I couldn't find any orders in your account." };
      if (result.name === "getMyOrder") return { provider: "local", model: "deterministic-v1", message: output.order ? `${output.order.orderNumber} is ${output.order.orderStatus.toLowerCase().replaceAll("_", " ")} and its payment status is ${output.order.paymentStatus.toLowerCase().replaceAll("_", " ")}.` : "I couldn't find that order in your account." };
      if (result.name === "getMyTracking") { const orderNumber = (output as { orderNumber?: string }).orderNumber; return { provider: "local", model: "deterministic-v1", message: orderNumber ? output.tracking?.trackingNumber ? `Tracking for ${orderNumber}: ${output.tracking.carrier ?? "Courier"} ${output.tracking.trackingNumber}.` : `Tracking is not available yet for ${orderNumber}.` : "I couldn't find that order in your account." }; }
      if (result.name === "getMyReturns") return { provider: "local", model: "deterministic-v1", message: output.returns?.length ? `You have ${output.returns.length} recent return record${output.returns.length === 1 ? "" : "s"}. The most recent is ${output.returns[0].status.toLowerCase().replaceAll("_", " ")}.` : "I couldn't find any return records in your account." };
      if (result.name === "getMyAddresses") return { provider: "local", model: "deterministic-v1", message: output.addresses?.length ? `You have ${output.addresses.length} saved address${output.addresses.length === 1 ? "" : "es"}. ${output.addresses.find((item) => item.isDefault)?.label ?? output.addresses[0].label} is your default.` : "You don't currently have a saved address." };
      if (result.name === "getProductAvailability") return { provider: "local", model: "deterministic-v1", message: output.availability ? availabilitySentence(output.availability.state, output.availability.label) : "I couldn't find that product in TekCentral's current public catalogue." };
      if (!products.length) return { provider: "local", model: "deterministic-v1", message: "I couldn't find a matching product in TekCentral's current public catalogue. Try a broader product type, category or budget." };
      if (result.name === "compareProducts") return { provider: "local", model: "deterministic-v1", message: `Here is a customer-safe comparison of ${products.map((item) => item.name).join(" and ")}. Review price, specifications and current availability below.` };
      return { provider: "local", model: "deterministic-v1", message: `I found ${products.length === 1 ? "this option" : `${products.length} options`}: ${products.map((item) => `${item.name} (${money(item.price)})`).join(", ")}. Availability is shown from TekCentral's current catalogue evidence.` };
    }
    const message = lastUser(request); const lower = message.toLowerCase();
    if (/supplier|cost price|margin|password|token|credential|another customer|other customer/.test(lower)) return { provider: "local", model: "deterministic-v1", message: "I can't access or disclose supplier, security, credential, margin or another customer's private information. I can help with public TekCentral products and store guidance." };
    const accountIntent = /\b(my|i|order|tracking|return|refund|address)\b/.test(lower) && /order|tracking|shipped|return|refund|address/.test(lower);
    if (accountIntent && !request.authenticated) return { provider: "local", model: "deterministic-v1", message: "Please sign in to access account-owned orders, tracking, returns or saved addresses. Guest order access remains available through your secure order link." };
    if (/cancel|refund my|change (my )?address|place (an )?order|pay/.test(lower)) return { provider: "local", model: "deterministic-v1", message: "I can't perform that action. Please use the relevant secure TekCentral account workflow, or contact support if you need assistance." };
    if (/refund policy|how do refunds|how .*refund/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-refund-policy", name: "getStorePolicy", input: { topic: "REFUNDS" } }] };
    if (/cancellation policy|how .*cancel|can i cancel/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-cancellation-policy", name: "getStorePolicy", input: { topic: "CANCELLATIONS" } }] };
    if (/shipping policy|how .*delivery|deliver across|how .*shipping/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-shipping-policy", name: "getStorePolicy", input: { topic: "SHIPPING" } }] };
    const orderNumber = message.match(/TC-\d{4}-\d{6}/i)?.[0].toUpperCase();
    if (/address/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-addresses", name: "getMyAddresses", input: {} }] };
    if (/return|refund/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-returns", name: "getMyReturns", input: { limit: 5 } }] };
    if (/tracking|tracking number|has .* shipped|where is/.test(lower) && orderNumber) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-tracking", name: "getMyTracking", input: { orderNumber } }] };
    if (orderNumber) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-order", name: "getMyOrder", input: { orderNumber } }] };
    if (/order|shipped|tracking/.test(lower)) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-orders", name: "getMyOrders", input: { limit: /recent|orders/.test(lower) ? 5 : 1 } }] };
    const ids = identifiers(message);
    if (/compare/.test(lower) && ids.length >= 2) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-compare", name: "compareProducts", input: { identifiers: ids.slice(0, 4) } }] };
    if (/in stock|available|availability/.test(lower) && ids.length) return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-availability", name: "getProductAvailability", input: { identifier: ids[0] } }] };
    const budgetMatch = lower.match(/(?:under|below|budget(?: of)?|up to)\s*r?\s*([\d ,]+)/); const budget = budgetMatch ? Number(budgetMatch[1].replace(/[ ,]/g, "")) : undefined;
    return { provider: "local", model: "deterministic-v1", toolCalls: [{ id: "local-search", name: "searchProducts", input: { query: message, budget, limit: 5 } }] };
  }
}
