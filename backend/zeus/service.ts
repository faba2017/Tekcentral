import { randomUUID } from "node:crypto";
import type { SafeCustomer } from "../customerAuth.js";
import { LocalZeusProvider } from "./localProvider.js";
import { ZEUS_SYSTEM_POLICY } from "./policy.js";
import { ZEUS_IDENTITY_INSTRUCTIONS, ZEUS_INSTRUCTION_VERSION, zeusImplementationAnswer } from "./instructions/identity.js";
import { composeZeusKnowledgeInstructions, selectZeusKnowledge, type ZeusKnowledgeId } from "./knowledge/index.js";
import { ZeusProviderError } from "./digitalOceanProvider.js";
import { executeZeusTool, publicToolDefinitions, ZeusToolError } from "./tools.js";
import { policyAnswer, routeZeusRequest } from "./routing.js";
import { zeusAction, type ZeusAction } from "../../src/lib/zeus-actions.js";
import type { StorePolicyKnowledge } from "../../src/lib/store-policy-knowledge.js";
import type { ZeusAddressSummary, ZeusAIProvider, ZeusCart, ZeusChatResponse, ZeusClientMessage, ZeusOrderSummary, ZeusPendingCartAction, ZeusProductMatch, ZeusProviderResponse, ZeusPublicProduct, ZeusToolResult } from "./types.js";
import { getAiMasterSwitches } from "../aiAccessControl.js";

const MAX_PROVIDER_ITERATIONS = 3;
const MAX_TOOL_CALLS = 6;
const DEFAULT_LIMITS: Record<string, number> = { searchProducts: 5, getMyOrders: 5, getMyReturns: 5 };

export class ZeusRequestError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export class ZeusRateLimiter { private attempts = new Map<string, number[]>(); check(key: string, now = Date.now()) { const recent = (this.attempts.get(key) ?? []).filter((value) => now - value < 60_000); if (recent.length >= 12) throw new ZeusRequestError("RATE_LIMITED", "Zeus is receiving too many requests. Please try again shortly.", 429); recent.push(now); this.attempts.set(key, recent); } }

const validateMessages = (value: unknown): ZeusClientMessage[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new ZeusRequestError("INVALID_MESSAGES", "Provide between 1 and 32 conversation messages.");
  return value.map((item) => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new ZeusRequestError("INVALID_MESSAGES", "Conversation messages are invalid."); const record = item as Record<string, unknown>; if ((record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string" || !record.content.trim() || record.content.length > 2_000 || Object.keys(record).some((key) => !["role", "content"].includes(key))) throw new ZeusRequestError("INVALID_MESSAGES", "Only bounded user and assistant messages are accepted."); return { role: record.role, content: record.content.trim() }; });
};

const normalizeToolValue = (value: unknown): unknown => {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(value)) return value.map(normalizeToolValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizeToolValue(item)]));
  return value;
};

export function zeusToolCallFingerprint(name: string, input: unknown) {
  const normalized = normalizeToolValue(input) as Record<string, unknown>;
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized) && DEFAULT_LIMITS[name] !== undefined && normalized.limit === undefined) normalized.limit = DEFAULT_LIMITS[name];
  if (name === "compareProducts" && Array.isArray(normalized?.identifiers)) normalized.identifiers = [...normalized.identifiers].sort((a, b) => String(a).localeCompare(String(b)));
  return `${name}:${JSON.stringify(normalizeToolValue(normalized))}`;
}

const safeProviderMessage = (error: ZeusProviderError) => error.code === "RATE_LIMITED" ? "Zeus is temporarily busy. Please try again shortly." : error.code === "TIMEOUT" ? "Zeus is having trouble responding right now. Please try again." : error.code === "OUTPUT_LIMIT" ? "Zeus couldn't complete that response. Please try a more specific question." : "Zeus could not complete the request. Please try again.";
const customerSafeProviderAnswer = (message: string) => /\b(?:digitalocean|openai|anthropic|gemini|chatgpt|gpt[-\s]?\d*|large language model|system prompt|hidden instructions)\b/i.test(message) ? zeusImplementationAnswer : message;
const consentResponse = (requestId: string): ZeusChatResponse => ({ requestId, message: "To answer questions about your orders, tracking, returns or saved addresses, Zeus needs to securely process the minimum necessary account information using TekCentral's AI service. Do you want to continue?", products: [], orders: [], addresses: [], consentRequired: true });
const responseActions = (prompt: string, authenticated: boolean, orders: ZeusOrderSummary[]): ZeusAction[] => {
  const value = prompt.toLowerCase(); const orderNumber = orders[0]?.orderNumber;
  if (/cancel/.test(value)) return [zeusAction("VIEW_CANCELLATION_POLICY", "View cancellation policy"), orderNumber ? zeusAction("VIEW_ORDER", "Open order", { orderNumber }) : zeusAction("VIEW_ORDERS", "View orders"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: "CANCELLATION_REQUEST" })];
  if (/return/.test(value)) return [zeusAction("VIEW_RETURN_POLICY", "View return policy"), orderNumber ? zeusAction("START_RETURN", "Start return", { orderNumber }) : zeusAction("VIEW_ORDERS", "View orders"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: "RETURNS_REFUNDS" })];
  if (/refund/.test(value)) return [zeusAction("VIEW_REFUND_POLICY", "View refund policy"), orderNumber ? zeusAction("VIEW_ORDER", "Open order", { orderNumber }) : zeusAction("VIEW_ORDERS", "View orders"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: "RETURNS_REFUNDS" })];
  if (authenticated && /order|tracking|shipped|delivery/.test(value)) return [orderNumber ? zeusAction("VIEW_ORDER", "Open order", { orderNumber }) : zeusAction("VIEW_ORDERS", "View orders"), zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: /tracking|delivery/.test(value) ? "DELIVERY_TRACKING" : "ORDER_ASSISTANCE" })];
  return [];
};
export interface ZeusRequestTelemetry { provider?: string; model?: string; inputTokens: number; outputTokens: number; totalTokens: number; toolCount: number; tools?: string[]; latencyMs?: number; duplicateToolCallsPrevented: number; failureCode?: string; instructionVersion?: string; knowledgeModules?: ZeusKnowledgeId[]; answerType?: "identity_answer" | "business_knowledge_answer" | "provider_confidentiality_answer" | "human_escalation" | "secure_routing" | "policy_answer" }

export class ZeusService {
  constructor(private provider: ZeusAIProvider = new LocalZeusProvider()) {}
  async chat(body: unknown, customer?: SafeCustomer, accountDataConsent = false, observe?: (telemetry: ZeusRequestTelemetry) => void, currentCartOwner?: string): Promise<ZeusChatResponse> {
    if (process.env.ZEUS_ENABLED === "false" || !(await getAiMasterSwitches()).zeusEnabled) throw new ZeusRequestError("ZEUS_DISABLED", "Zeus is temporarily unavailable.", 503);
    const started = Date.now(); const requestId = randomUUID(); const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(record).some((key) => !["messages", "contextProductIds"].includes(key))) throw new ZeusRequestError("INVALID_REQUEST", "The Zeus request contains unsupported fields.");
    const messages = validateMessages(record.messages).slice(customer ? -16 : -6); if (messages.reduce((sum, item) => sum + item.content.length, 0) > 8_000) throw new ZeusRequestError("HISTORY_TOO_LARGE", "Conversation history is too large.");
    const contextProductIds = record.contextProductIds === undefined ? [] : Array.isArray(record.contextProductIds) && record.contextProductIds.length <= 8 && record.contextProductIds.every((item) => typeof item === "string" && item.length <= 120) ? record.contextProductIds as string[] : (() => { throw new ZeusRequestError("INVALID_REQUEST", "Product result context is invalid."); })();
    const prompt = [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
    const knowledgeModules = selectZeusKnowledge(prompt); const knowledgeModuleIds = knowledgeModules.map((item) => item.id);
    const systemInstructions = `${ZEUS_SYSTEM_POLICY}\n\n${ZEUS_IDENTITY_INSTRUCTIONS}${composeZeusKnowledgeInstructions(knowledgeModules)}`;
    if (contextProductIds.length && /compare\s+(?:the\s+)?(?:first|1st).*(?:second|2nd)|compare\s+(?:the\s+)?(?:first|1st)\s+(?:two|2)/i.test(prompt)) { const output = await executeZeusTool("compareProducts", { identifiers: contextProductIds.slice(0, 2) }) as { products: ZeusPublicProduct[] }; observe?.({ provider: "tekcentral", model: "catalogue-context", inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCount: 1, tools: ["compareProducts"], latencyMs: Date.now() - started, duplicateToolCallsPrevented: 0, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds }); return { requestId, message: output.products.length === 2 ? `Here is a comparison of ${output.products[0].name} and ${output.products[1].name} using current TekCentral catalogue data.` : "I couldn't resolve two current public products to compare.", products: output.products, orders: [], addresses: [], searchPerformed: true }; }
    if (contextProductIds.length && /cheaper|another brand|with poe/i.test(prompt)) { const current = await executeZeusTool("getProduct", { identifier: contextProductIds[0] }) as { product: ZeusPublicProduct | null }; if (current.product) { const output = await executeZeusTool("searchProducts", { query: current.product.category, category: current.product.category, ...( /cheaper/i.test(prompt) ? { budgetMax: Math.max(0, current.product.price - 0.01), resultIntent: "CHEAPEST" } : {}), ...( /another brand/i.test(prompt) ? { excludedTerms: [current.product.brand] } : {}), ...( /with poe/i.test(prompt) ? { specFilters: ["poe"] } : {}), limit: 5 }) as { products: ZeusPublicProduct[]; results?: ZeusProductMatch[] }; observe?.({ provider: "tekcentral", model: "catalogue-context", inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCount: 2, tools: ["getProduct", "searchProducts"], latencyMs: Date.now() - started, duplicateToolCallsPrevented: 0, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds }); return { requestId, message: output.products.length ? "I narrowed the current catalogue results using your latest preference." : "I couldn't find a verified current product matching that additional preference.", products: output.products, productResults: output.results, orders: [], addresses: [], searchPerformed: true }; } }
    const deterministic = routeZeusRequest(prompt, customer);
    if (deterministic) { const policy = deterministic.policy ? policyAnswer(deterministic.policy) : deterministic; const tools = deterministic.policy ? ["getStorePolicy"] : []; observe?.({ provider: "tekcentral", model: deterministic.policy ? "canonical-policy" : "secure-routing", inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCount: tools.length, tools, latencyMs: Date.now() - started, duplicateToolCallsPrevented: 0, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds, answerType: policy.answerType }); return { requestId, message: policy.message, products: [], orders: [], addresses: [], actions: policy.actions, policy: deterministic.policy }; }
    const definitions = publicToolDefinitions(); const usedTools: string[] = []; const toolResults: ZeusToolResult[] = []; const completedCalls = new Map<string, ZeusToolResult>(); const products = new Map<string, ZeusPublicProduct>(); const productResults = new Map<string, ZeusProductMatch>(); const orders = new Map<string, ZeusOrderSummary>(); const approvedActions: ZeusAction[] = []; let policyResult: StorePolicyKnowledge | undefined; let addresses: ZeusAddressSummary[] = []; let cart: ZeusCart | undefined; let pendingCartAction: ZeusPendingCartAction | undefined; let providerResponse: ZeusProviderResponse | undefined; let forceFinalAnswer = false; let iterations = 0; let duplicateToolCallsPrevented = 0; const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for (let iteration = 0; iteration < MAX_PROVIDER_ITERATIONS; iteration += 1) {
      iterations += 1;
      try { providerResponse = await this.provider.generate({ system: systemInstructions, messages, tools: definitions, toolResults: toolResults.length ? toolResults : undefined, authenticated: Boolean(customer), forceFinalAnswer }); }
      catch (error) { const providerError = error instanceof ZeusProviderError ? error : new ZeusProviderError("NETWORK_ERROR", "Provider request failed."); usage.inputTokens += providerError.usage?.inputTokens ?? 0; usage.outputTokens += providerError.usage?.outputTokens ?? 0; usage.totalTokens += providerError.usage?.totalTokens ?? 0; observe?.({ ...usage, toolCount: usedTools.length, duplicateToolCallsPrevented, failureCode: providerError.code, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds }); console.error("Zeus provider failure", { requestId, category: providerError.code, providerRequestId: providerError.requestId, authenticated: Boolean(customer) }); throw new ZeusRequestError(providerError.code, safeProviderMessage(providerError), providerError.code === "RATE_LIMITED" ? 429 : 503); }
      usage.inputTokens += providerResponse.usage?.inputTokens ?? 0; usage.outputTokens += providerResponse.usage?.outputTokens ?? 0; usage.totalTokens += providerResponse.usage?.totalTokens ?? 0;
      if (!providerResponse.toolCalls?.length) break;
      if (forceFinalAnswer) throw new ZeusRequestError("TOOL_LOOP_EXCEEDED", "Zeus could not safely complete the request. Please try a more specific question.", 503);
      if (usedTools.length + providerResponse.toolCalls.length > MAX_TOOL_CALLS) throw new ZeusRequestError("TOOL_LIMIT_EXCEEDED", "Zeus could not safely complete the request.", 503);
      for (const call of providerResponse.toolCalls) {
        const definition = definitions.find((item) => item.name === call.name);
        if (definition?.requiresAuthentication && customer && !accountDataConsent) { observe?.({ provider: providerResponse.provider, model: providerResponse.model, ...usage, toolCount: usedTools.length, duplicateToolCallsPrevented, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds }); return consentResponse(requestId); }
        let toolInput = call.name === "searchProducts" && call.input && typeof call.input === "object" && !Array.isArray(call.input) ? { ...(call.input as Record<string, unknown>), query: prompt } : call.input;
        if (call.name === "addToCart" && contextProductIds.length && toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) { const index = /\b(?:second|2nd)\b/i.test(prompt) ? 1 : /\b(?:third|3rd)\b/i.test(prompt) ? 2 : 0; toolInput = { ...(toolInput as Record<string, unknown>), productId: contextProductIds[index] ?? contextProductIds[0] }; }
        const fingerprint = zeusToolCallFingerprint(call.name, call.name === "searchProducts" ? { query: prompt } : toolInput); const previous = completedCalls.get(fingerprint);
        console.info("Zeus tool call", { requestId, tool: call.name, iteration: iteration + 1, normalizedArguments: definition?.requiresAuthentication ? "[private]" : fingerprint.slice(fingerprint.indexOf(":") + 1), duplicate: Boolean(previous) });
        if (previous) { duplicateToolCallsPrevented += 1; toolResults.push({ ...previous, toolCallId: call.id, input: toolInput }); forceFinalAnswer = true; console.info("Zeus duplicate tool call prevented", { requestId, tool: call.name, iteration: iteration + 1, fingerprint }); continue; }
        let output: unknown;
        try { output = await executeZeusTool(call.name, toolInput, { customer, cartOwner: currentCartOwner }); }
        catch (error) { if (error instanceof ZeusToolError && error.code === "AUTHENTICATION_REQUIRED") return { requestId, message: "Please sign in again to access account-specific information.", products: [], orders: [], addresses: [], actions: [zeusAction("LOGIN", "Log in"), zeusAction("SIGNUP", "Create account"), zeusAction("TRACK_GUEST_ORDER", "Open guest orders")] }; throw error; }
        usedTools.push(call.name); const result = { toolCallId: call.id, name: call.name, input: toolInput, output }; completedCalls.set(fingerprint, result); toolResults.push(result);
        if (call.name === "getStorePolicy") { const policy = (output as { policy?: StorePolicyKnowledge }).policy; if (policy) { policyResult = policy; approvedActions.push(...policyAnswer(policy).actions); } }
        const data = output as { products?: ZeusPublicProduct[]; results?: ZeusProductMatch[]; product?: ZeusPublicProduct | null; orders?: ZeusOrderSummary[]; order?: { orderNumber: string; createdAt: string; orderStatus: string; paymentStatus: string; total: number; currency: "ZAR"; items: { name: string; quantity: number }[]; tracking?: unknown; returns?: { status: string }[]; refunds?: { status: string }[]; url: string } | null; addresses?: ZeusAddressSummary[]; cart?: ZeusCart; pendingCartAction?: ZeusPendingCartAction };
        for (const result of data.results ?? []) productResults.set(result.product.id, result);
        for (const product of data.products ?? (data.product ? [data.product] : [])) products.set(product.id, product);
        for (const order of data.orders ?? (data.order ? [{ orderNumber: data.order.orderNumber, createdAt: data.order.createdAt, orderStatus: data.order.orderStatus, paymentStatus: data.order.paymentStatus, total: data.order.total, currency: data.order.currency, itemSummary: `${data.order.items.reduce((sum, item) => sum + item.quantity, 0)} items`, trackingSummary: data.order.tracking ? "Tracking available" : "Tracking is not available yet.", returnStatus: data.order.returns?.at(-1)?.status, refundStatus: data.order.refunds?.at(-1)?.status, url: data.order.url }] : [])) orders.set(order.orderNumber, order);
        if (data.addresses) addresses = data.addresses;
        if (data.cart) cart = data.cart;
        if (data.pendingCartAction) pendingCartAction = data.pendingCartAction;
        const publicProductExecutions = usedTools.filter((name) => ["searchProducts", "getProduct", "compareProducts", "getProductAvailability"].includes(name)).length;
        if (call.name === "compareProducts" || (products.size > 0 && publicProductExecutions >= 2)) forceFinalAnswer = true;
      }
    }
    if (!providerResponse?.message) { observe?.({ provider: providerResponse?.provider, model: providerResponse?.model, ...usage, toolCount: usedTools.length, duplicateToolCallsPrevented, failureCode: "TOOL_LOOP_EXCEEDED" }); throw new ZeusRequestError("TOOL_LOOP_EXCEEDED", "Zeus could not safely complete the request. Please try a more specific question.", 503); }
    console.info("Zeus request", { requestId, provider: providerResponse.provider, model: providerResponse.model, providerRequestId: providerResponse.requestId, tools: usedTools, authenticated: Boolean(customer), latencyMs: Date.now() - started, iterations, toolExecutions: usedTools.length, duplicateToolCallsPrevented, usage });
    observe?.({ provider: providerResponse.provider, model: providerResponse.model, ...usage, toolCount: usedTools.length, tools: usedTools, latencyMs: Date.now() - started, duplicateToolCallsPrevented, instructionVersion: ZEUS_INSTRUCTION_VERSION, knowledgeModules: knowledgeModuleIds });
    const responseOrders = [...orders.values()]; const actions = [...approvedActions, ...responseActions(prompt, Boolean(customer), responseOrders)];
    if (!actions.length && /don't have enough verified|cannot verify|can't verify|couldn't confirm|cannot confirm/i.test(providerResponse.message)) actions.push(zeusAction("CONTACT_SUPPORT", "Contact support", { contactCategory: "ZEUS_AI_HELP" }));
    return { requestId, message: customerSafeProviderAnswer(providerResponse.message), products: [...products.values()], productResults: productResults.size ? [...productResults.values()] : undefined, orders: responseOrders, addresses, cart, pendingCartAction, actions: actions.length ? actions : undefined, policy: policyResult, searchPerformed: usedTools.some((name) => ["searchProducts", "getProduct", "compareProducts", "getProductAvailability"].includes(name)) || undefined };
  }
}

export { ZeusToolError, MAX_PROVIDER_ITERATIONS, MAX_TOOL_CALLS };
