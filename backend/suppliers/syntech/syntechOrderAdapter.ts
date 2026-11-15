import { createHash } from "node:crypto";
import { getSupplierPolicySettings, getSyntechApiProcurementSetting } from "../../businessSettingsRepository.js";
import { recordAdminAuditBestEffort, type AuditInput } from "../../adminAuditService.js";
import { bestEffortAlert, bestEffortResolve } from "../../operationalAlertService.js";
import { getOrder } from "../../orderRepository.js";
import { claimSupplierOrderSubmission, getSupplierOrder, listSupplierOrders, updateSupplierOrder } from "../../supplierOrderRepository.js";
import { getSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import type { BackendOrder, SupplierOrder } from "../../types.js";
import { getSyntechCatalogueProduct } from "./syntechCatalogueRepository.js";

const ADAPTER_VERSION = "syntech-order-v1";
const inFlight = new Set<string>();
const SYNTECH_UAT_HOSTS = new Set(["reseller.syntech.co.za"]);
const MAX_LINE_QUANTITY = 999;

export type SyntechShippingSelection =
  | { type: "DELIVERY" }
  | { type: "COLLECTION"; location: "cpt" | "jhb" };

export type SyntechOrderErrorCategory =
  | "CONFIGURATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "PRODUCT_ERROR"
  | "STOCK_ERROR"
  | "ADDRESS_ERROR"
  | "PROVIDER_DEPENDENCY"
  | "UNKNOWN_RESULT";

export class SyntechOrderError extends Error {
  constructor(
    public code: string,
    message: string,
    public category: SyntechOrderErrorCategory,
    public retrySafe = false,
  ) { super(message); }
}

const rcMessages: Record<string, { category: SyntechOrderErrorCategory; message: string }> = {
  RC1: { category: "AUTHORIZATION_ERROR", message: "Syntech has not enabled direct ordering for this reseller account." },
  RC2: { category: "AUTHORIZATION_ERROR", message: "The Syntech reseller account is missing its accounting account number." },
  RC3: { category: "AUTHORIZATION_ERROR", message: "Syntech could not resolve the reseller accounting account." },
  RC4: { category: "PRODUCT_ERROR", message: "A requested Syntech SKU was not found." },
  RC5: { category: "ADDRESS_ERROR", message: "Syntech requires shipping information for this order." },
  RC6: { category: "ADDRESS_ERROR", message: "Syntech requires a valid shipping mode." },
  RC7: { category: "ADDRESS_ERROR", message: "Syntech requires a complete delivery address." },
  RC8: { category: "ADDRESS_ERROR", message: "The selected Syntech collection location is not available." },
  RC9: { category: "STOCK_ERROR", message: "Syntech does not have enough stock at the selected location." },
  RC10: { category: "ADDRESS_ERROR", message: "Syntech could not validate the delivery address. Review it without guessing or altering customer data." },
  RC11: { category: "PRODUCT_ERROR", message: "Syntech could not resolve the shipping item for this order." },
  RC12: { category: "PROVIDER_DEPENDENCY", message: "Syntech address verification is temporarily unavailable." },
};

export function mapSyntechRcError(code: string) {
  const normalized = code.toUpperCase();
  return { code: normalized, ...(rcMessages[normalized] ?? { category: "PROVIDER_DEPENDENCY" as const, message: "Syntech returned an unrecognized order error." }) };
}

export function validateSyntechUatBaseUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && SYNTECH_UAT_HOSTS.has(url.hostname.toLowerCase())
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && /^\/wp-json\/uat-api\/reseller\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function syntechUatOrderUrl(baseUrl: string) {
  if (!validateSyntechUatBaseUrl(baseUrl)) throw new SyntechOrderError("INVALID_UAT_ENDPOINT", "Syntech UAT endpoint configuration is invalid.", "CONFIGURATION_ERROR", true);
  return new URL("order/", `${baseUrl.replace(/\/?$/, "/")}`);
}

function syntechResellerApiRuntimeConfiguration() {
  const environment = (process.env.SYNTECH_RESELLER_API_ENVIRONMENT ?? "UAT").toUpperCase();
  const credential = process.env.SYNTECH_UAT_CREDENTIAL?.trim() || process.env.SYNTECH_RESELLER_UAT_TOKEN?.trim();
  const baseUrl = process.env.SYNTECH_UAT_BASE_URL?.trim() || process.env.SYNTECH_RESELLER_UAT_BASE_URL?.trim();
  const username = process.env.SYNTECH_UAT_USERNAME?.trim();
  const endpointValid = validateSyntechUatBaseUrl(baseUrl);
  return {
    enabled: process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED !== undefined ? process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED === "true" : process.env.SYNTECH_RESELLER_API_ENABLED === "true",
    environment,
    credential,
    baseUrl,
    username,
    tokenConfigured: Boolean(credential),
    baseUrlConfigured: Boolean(baseUrl),
    usernameConfigured: Boolean(username),
    endpointValid,
    configured: Boolean(credential && baseUrl && endpointValid),
    productionConfigured: Boolean(process.env.SYNTECH_RESELLER_PROD_TOKEN?.trim() && process.env.SYNTECH_RESELLER_PROD_BASE_URL?.trim()),
    productionOperational: false,
  };
}

export function syntechResellerApiConfiguration() {
  const runtime = syntechResellerApiRuntimeConfiguration();
  return { enabled: runtime.enabled, environment: runtime.environment, tokenConfigured: runtime.tokenConfigured, baseUrlConfigured: runtime.baseUrlConfigured, endpointValid: runtime.endpointValid, usernameConfigured: runtime.usernameConfigured, configured: runtime.configured, productionConfigured: runtime.productionConfigured, productionOperational: runtime.productionOperational };
}

export function deriveSyntechApiProcurementState(input: { deploymentEnabled: boolean; operationalEnabled: boolean; configured: boolean; environment: string; productionOperational: boolean }) {
  const environmentAllowed = input.environment === "UAT" || (input.environment === "PRODUCTION" && input.productionOperational);
  const effectiveEnabled = input.deploymentEnabled && input.operationalEnabled && input.configured && environmentAllowed;
  const blockedBy = !input.deploymentEnabled ? "DEPLOYMENT_DISABLED" as const
    : !input.operationalEnabled ? "OPERATIONALLY_DISABLED" as const
    : !input.configured ? "CONFIGURATION_INCOMPLETE" as const
    : !environmentAllowed ? "ENVIRONMENT_NOT_APPROVED" as const
    : undefined;
  return { effectiveEnabled, blockedBy };
}

export async function getSyntechApiProcurementControl() {
  const deployment = syntechResellerApiConfiguration();
  const operational = await getSyntechApiProcurementSetting();
  return { deployment, operational, ...deriveSyntechApiProcurementState({ deploymentEnabled: deployment.enabled, operationalEnabled: operational.enabled, configured: deployment.configured, environment: deployment.environment, productionOperational: deployment.productionOperational }) };
}

export function isSyntechMaintenanceWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return (hour === 23 && minute < 30) || (hour === 2 && minute < 30);
}

function externalReference(order: BackendOrder, supplierOrder: SupplierOrder) {
  return `${order.orderNumber}-${supplierOrder.id}`.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 80);
}

function hasControlCharacters(value: string, allowNewlines = false) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && !(allowNewlines && (code === 9 || code === 10 || code === 13)));
  });
}

function boundedText(value: string | undefined, label: string, maximum: number) {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > maximum || hasControlCharacters(normalized)) {
    throw new SyntechOrderError("INVALID_ADDRESS_FIELD", `${label} is missing or invalid for Syntech delivery.`, "ADDRESS_ERROR", true);
  }
  return normalized;
}

function deliveryLocation(order: BackendOrder) {
  const address = order.deliveryAddress;
  if (![address.streetAddress, address.suburb, address.city, address.province, address.postalCode, address.country].every((value) => value.trim())) {
    throw new SyntechOrderError("INCOMPLETE_ADDRESS", "A complete customer delivery address is required.", "ADDRESS_ERROR", true);
  }
  const email = boundedText(order.customer.email, "Customer email", 254);
  const phone = boundedText(order.customer.mobile, "Customer phone", 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SyntechOrderError("INVALID_ADDRESS_FIELD", "Customer email is invalid for Syntech delivery.", "ADDRESS_ERROR", true);
  if (phone.replace(/\D/g, "").length < 7 || !/^[+()\d\s-]+$/.test(phone)) throw new SyntechOrderError("INVALID_ADDRESS_FIELD", "Customer phone is invalid for Syntech delivery.", "ADDRESS_ERROR", true);
  return {
    address: boundedText(address.streetAddress, "Street address", 180),
    suburb: boundedText(address.suburb, "Suburb", 100),
    city: boundedText(address.city, "City", 100),
    province: boundedText(address.province, "Province", 100),
    postalcode: boundedText(address.postalCode, "Postal code", 20),
    country: boundedText(address.country, "Country", 80),
    name: boundedText(`${order.customer.firstName} ${order.customer.lastName}`, "Customer name", 160),
    email,
    phone,
  };
}

export function buildSyntechOrderPayload(input: {
  reference: string;
  shipping: SyntechShippingSelection;
  order: BackendOrder;
  lines: { supplierSku: string; quantity: number }[];
}) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(input.reference)) throw new SyntechOrderError("INVALID_REFERENCE", "The server-owned Syntech reference is invalid.", "PRODUCT_ERROR", true);
  if (!input.lines.length) throw new SyntechOrderError("EMPTY_ORDER", "At least one valid Syntech line item is required.", "PRODUCT_ERROR", true);
  const seen = new Set<string>();
  for (const line of input.lines) {
    const supplierSku = line.supplierSku.trim();
    if (!supplierSku || supplierSku.length > 128 || hasControlCharacters(supplierSku) || !Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > MAX_LINE_QUANTITY) throw new SyntechOrderError("INVALID_LINE_ITEM", `Every Syntech line requires an exact bounded SKU and positive whole quantity no greater than ${MAX_LINE_QUANTITY}.`, "PRODUCT_ERROR", true);
    if (seen.has(supplierSku)) throw new SyntechOrderError("DUPLICATE_SKU", "Duplicate Syntech SKUs must be consolidated before submission.", "PRODUCT_ERROR", true);
    seen.add(supplierSku);
  }
  if (input.shipping.type === "COLLECTION" && !["cpt", "jhb"].includes(input.shipping.location)) {
    throw new SyntechOrderError("INVALID_COLLECTION_LOCATION", "Syntech collection is available only from Cape Town or Johannesburg.", "ADDRESS_ERROR", true);
  }
  const lineitems = Object.fromEntries(input.lines.map((line) => [line.supplierSku.trim(), line.quantity]));
  return {
    reference: input.reference,
    backorder: "no" as const,
    shipping: input.shipping.type === "COLLECTION"
      ? { type: "collection" as const, location: input.shipping.location }
      : { type: "delivery" as const, location: deliveryLocation(input.order) },
    lineitems,
  };
}

function parseBusinessFailure(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const candidates = [record.code, record.error, record.errors, record.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const match = candidate.toUpperCase().match(/RC(?:1[0-2]|[1-9])/);
      if (match) return match[0];
    }
    if (candidate && typeof candidate === "object") {
      const code = Object.keys(candidate as object).find((key) => /^RC(?:1[0-2]|[1-9])$/i.test(key));
      if (code) return code.toUpperCase();
    }
  }
  return undefined;
}

export function normalizeSyntechCreateResponse(value: unknown) {
  const rc = parseBusinessFailure(value);
  if (rc) {
    const mapped = mapSyntechRcError(rc);
    throw new SyntechOrderError(mapped.code, mapped.message, mapped.category, true);
  }
  if (!value || typeof value !== "object") throw new SyntechOrderError("AMBIGUOUS_RESPONSE", "Syntech returned an unrecognized order response.", "UNKNOWN_RESULT");
  const record = value as Record<string, unknown>;
  const salesorder = [record.salesorder, record.salesOrder, (record.data as Record<string, unknown> | undefined)?.salesorder].find((item) => typeof item === "string" || typeof item === "number");
  if (!salesorder || !String(salesorder).trim()) throw new SyntechOrderError("AMBIGUOUS_RESPONSE", "Syntech did not return a sales order reference.", "UNKNOWN_RESULT");
  return { salesorder: String(salesorder).trim(), responseFingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

export interface SyntechOrderPreflight {
  supplierOrderId: string;
  status: "BLOCKED" | "READY_FOR_CONTROLLED_UAT";
  checkedAt: string;
  environment: "UAT";
  featureEnabled: boolean;
  configurationReady: boolean;
  externalReference: string;
  shipping: SyntechShippingSelection;
  backorder: "no";
  lines: { productId: string; description: string; supplierSku: string; quantity: number; unitCostZar: number; branchStock: { CPT?: number; JHB?: number; DBN?: number }; totalStock?: number; promotionActive: boolean; promotionChanged: boolean; observedAt: string }[];
  estimatedProductCostZar: number;
  warnings: string[];
  blockers: string[];
  submissionBlockers: string[];
  maintenanceWindow: boolean;
}

async function procurementExclusivityBlockers(supplierOrder: SupplierOrder, order: BackendOrder) {
  const terminal = new Set(["BACKORDERED", "REJECTED", "CANCELLED", "SUPERSEDED"]);
  const activeOrders = (await listSupplierOrders()).filter((candidate) => candidate.customerOrderNumber === supplierOrder.customerOrderNumber && !terminal.has(candidate.status));
  const blockers: string[] = [];
  for (const line of supplierOrder.itemLines) {
    const orderedQuantity = order.items.find((item) => item.productId === line.orderItemId)?.quantity;
    const committedQuantity = activeOrders.reduce((sum, candidate) => sum + candidate.itemLines.filter((candidateLine) => candidateLine.orderItemId === line.orderItemId).reduce((lineSum, candidateLine) => lineSum + candidateLine.quantity, 0), 0);
    if (orderedQuantity === undefined || committedQuantity > orderedQuantity) blockers.push(`${line.description}: another active procurement path conflicts with this customer Order line.`);
  }
  return blockers;
}

export async function prepareSyntechOrderPreflight(input: { supplierOrderId: string; shipping: SyntechShippingSelection; now?: Date }): Promise<SyntechOrderPreflight> {
  const now = input.now ?? new Date();
  const [supplierOrder, policy, control] = await Promise.all([getSupplierOrder(input.supplierOrderId), getSupplierPolicySettings(), getSyntechApiProcurementControl()]);
  if (!supplierOrder || supplierOrder.supplierCode !== "SYNTECH") throw new SyntechOrderError("SUPPLIER_ORDER_NOT_FOUND", "Syntech supplier order not found.", "PRODUCT_ERROR", true);
  const order = await getOrder(supplierOrder.customerOrderNumber);
  if (!order) throw new SyntechOrderError("CUSTOMER_ORDER_NOT_FOUND", "Customer order not found.", "PRODUCT_ERROR", true);
  const config = control.deployment;
  const blockers: string[] = [];
  const submissionBlockers: string[] = [];
  const warnings: string[] = [];
  if (order.payment.status !== "PAID") blockers.push("Customer payment must be confirmed before Syntech procurement.");
  if (order.operationalHold?.active) blockers.push("The customer order has an active operational hold.");
  if (supplierOrder.status !== "APPROVED") blockers.push("Staff procurement approval is required.");
  if (supplierOrder.externalSubmission?.status === "CREATED") blockers.push("A Syntech order has already been created.");
  if (["SUBMITTING", "UNKNOWN_RESULT"].includes(supplierOrder.externalSubmission?.status ?? "")) blockers.push("The existing Syntech submission must be reconciled before another attempt.");
  if (supplierOrder.externalSubmission?.status === "FAILED" && supplierOrder.externalSubmission.lastErrorCode === "RC3") blockers.push("Syntech could not resolve the reseller accounting account. Do not retry the API submission. Use the approved manual reseller-portal process or wait for Syntech account configuration to be corrected.");
  if (!config.enabled) submissionBlockers.push("Syntech API procurement is blocked by deployment configuration.");
  if (!control.operational.enabled) submissionBlockers.push("Syntech API procurement is operationally disabled. Manual procurement remains available.");
  if (!config.configured) submissionBlockers.push("Syntech UAT Reseller API is not configured.");
  if (config.environment !== "UAT") submissionBlockers.push("Syntech production order creation is disabled in this phase.");
  const maintenanceWindow = isSyntechMaintenanceWindow(now);
  if (maintenanceWindow) blockers.push("Syntech is in its documented maintenance window. Retry after the window closes.");
  blockers.push(...await procurementExclusivityBlockers(supplierOrder, order));

  const lines: SyntechOrderPreflight["lines"] = [];
  for (const line of supplierOrder.itemLines) {
    const orderItem = order.items.find((item) => item.productId === line.orderItemId);
    if (orderItem?.costBasis?.status !== "COMPLETE" || orderItem.costBasis.supplierId !== "SYNTECH") {
      blockers.push(`${line.description}: immutable Syntech cost basis must be complete before external creation.`);
    }
    const mapping = await getSupplierProductMapping(line.productId, "SYNTECH");
    if (!mapping || mapping.status !== "VERIFIED" || !mapping.supplierSku || mapping.supplierSku !== line.supplierSku) {
      blockers.push(`${line.description}: verified exact Syntech SKU mapping is required.`);
      continue;
    }
    const product = await getSyntechCatalogueProduct(mapping.supplierSku);
    if (!product || product.sourcePresence !== "ACTIVE" || product.effectiveDealerCostExVat === undefined) {
      blockers.push(`${line.description}: current Syntech product and cost evidence is unavailable.`);
      continue;
    }
    const ageMs = now.getTime() - Date.parse(product.observedAt);
    if (!Number.isFinite(ageMs) || ageMs > policy.sourcePriceFreshnessHours * 3_600_000) blockers.push(`${line.description}: Syntech cost evidence is stale; refresh it before procurement.`);
    if (!Number.isFinite(ageMs) || ageMs > policy.stockFreshnessHours * 3_600_000) blockers.push(`${line.description}: Syntech stock evidence is stale; refresh it before procurement.`);
    const available = input.shipping.type === "COLLECTION" ? product.branchStock[input.shipping.location.toUpperCase() as "CPT" | "JHB"] : product.totalStock;
    if (available === undefined) blockers.push(`${line.description}: current stock evidence is missing for the selected fulfilment mode.`);
    else if (available < line.quantity) blockers.push(`${line.description}: current Syntech stock is insufficient for quantity ${line.quantity}.`);
    const promotionChanged = line.promotionActive !== undefined && (line.promotionActive !== product.promotionActive || line.promoPriceExVat !== product.promoPriceExVat || line.normalDealerCostExVat !== product.normalDealerCostExVat);
    if (promotionChanged) warnings.push(`${line.description}: Syntech promotion or source cost changed after the procurement evidence was captured; re-approval is required.`);
    if (line.costSourceFingerprint && line.costSourceFingerprint !== product.sourceFingerprint) blockers.push(`${line.description}: Syntech source evidence changed after approval; refresh and re-approve procurement.`);
    lines.push({ productId: line.productId, description: line.description, supplierSku: mapping.supplierSku, quantity: line.quantity, unitCostZar: product.effectiveDealerCostExVat, branchStock: product.branchStock, totalStock: product.totalStock, promotionActive: product.promotionActive, promotionChanged, observedAt: product.observedAt });
  }
  const reference = supplierOrder.externalSubmission?.externalReference ?? externalReference(order, supplierOrder);
  try {
    buildSyntechOrderPayload({ reference, shipping: input.shipping, order, lines });
  } catch (error) {
    blockers.push(error instanceof SyntechOrderError ? error.message : "Syntech order payload validation failed.");
  }
  return { supplierOrderId: supplierOrder.id, status: blockers.length || submissionBlockers.length ? "BLOCKED" : "READY_FOR_CONTROLLED_UAT", checkedAt: now.toISOString(), environment: "UAT", featureEnabled: control.effectiveEnabled, configurationReady: config.configured && config.environment === "UAT", externalReference: reference, shipping: input.shipping, backorder: "no", lines, estimatedProductCostZar: Math.round(lines.reduce((sum, line) => sum + line.unitCostZar * line.quantity, 0) * 100) / 100, warnings, blockers, submissionBlockers, maintenanceWindow };
}

export async function createSyntechUatOrder(input: { supplierOrderId: string; shipping: SyntechShippingSelection; confirmed: boolean; actor: string; auditActor: Pick<AuditInput, "actorType" | "actorId" | "actorLabel" | "actorRole">; fetchImpl?: typeof fetch; now?: Date }) {
  if (!input.confirmed) throw new SyntechOrderError("CONFIRMATION_REQUIRED", "Explicit confirmation is required to create a Syntech UAT order.", "CONFIGURATION_ERROR", true);
  const control = await getSyntechApiProcurementControl();
  const config = syntechResellerApiRuntimeConfiguration();
  if (!config.enabled) throw new SyntechOrderError("UAT_WRITES_DISABLED", "Syntech UAT writes are disabled.", "CONFIGURATION_ERROR", true);
  if (!control.operational.enabled) throw new SyntechOrderError("API_OPERATIONALLY_DISABLED", "Syntech API procurement is operationally disabled. Use the approved manual procurement path.", "CONFIGURATION_ERROR", true);
  if (!config.configured) throw new SyntechOrderError("UAT_CONFIGURATION_INCOMPLETE", "Syntech UAT Reseller API is not configured.", "CONFIGURATION_ERROR", true);
  if (config.environment !== "UAT") throw new SyntechOrderError("PRODUCTION_DISABLED", "Syntech production ordering is disabled in this phase.", "CONFIGURATION_ERROR", true);
  const existing = await getSupplierOrder(input.supplierOrderId);
  if (existing?.supplierCode === "SYNTECH" && existing.externalSubmission?.status === "CREATED" && existing.externalSubmission.externalOrderId) return { supplierOrder: existing, reused: true as const };
  if (inFlight.has(input.supplierOrderId)) throw new SyntechOrderError("SUBMISSION_IN_PROGRESS", "A Syntech submission is already in progress.", "UNKNOWN_RESULT");
  const preflight = await prepareSyntechOrderPreflight(input);
  if (preflight.status !== "READY_FOR_CONTROLLED_UAT") throw new SyntechOrderError("PREFLIGHT_BLOCKED", preflight.blockers.join(" "), "PRODUCT_ERROR", true);
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  const order = supplierOrder ? await getOrder(supplierOrder.customerOrderNumber) : undefined;
  if (!supplierOrder || !order) throw new SyntechOrderError("ORDER_NOT_FOUND", "Order data is unavailable.", "PRODUCT_ERROR", true);
  const payload = buildSyntechOrderPayload({ reference: preflight.externalReference, shipping: input.shipping, order, lines: preflight.lines });
  const requestFingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const now = (input.now ?? new Date()).toISOString();
  inFlight.add(input.supplierOrderId);
  const claim = await claimSupplierOrderSubmission(input.supplierOrderId, requestFingerprint, (current) => ({ ...current, status: "SUBMITTING", updatedAt: now, externalSubmission: { mode: "SYNTECH_UAT_API", status: "SUBMITTING", submittedAt: now, requestFingerprint, idempotencyKey: requestFingerprint, externalReference: preflight.externalReference, diagnostics: { provider: "SYNTECH", environment: "UAT", adapterVersion: ADAPTER_VERSION, shippingMode: input.shipping.type, collectionLocation: input.shipping.type === "COLLECTION" ? input.shipping.location : undefined, lineItems: preflight.lines.map(({ supplierSku, quantity }) => ({ supplierSku, quantity })) } }, events: [...current.events, { timestamp: now, type: "SYNTECH_UAT_SUBMISSION_STARTED", description: `${input.actor ?? "TekCentral Staff"} confirmed a Syntech UAT order submission.` }] })).catch((error) => { inFlight.delete(input.supplierOrderId); throw error; });
  if (!claim) { inFlight.delete(input.supplierOrderId); throw new SyntechOrderError("ORDER_NOT_FOUND", "Supplier order data is unavailable.", "PRODUCT_ERROR", true); }
  if (claim.state === "REUSED") { inFlight.delete(input.supplierOrderId); return { supplierOrder: claim.order, preflight, reused: true as const }; }
  if (claim.state === "BLOCKED") { inFlight.delete(input.supplierOrderId); throw new SyntechOrderError(claim.order.externalSubmission?.status === "UNKNOWN_RESULT" ? "RECONCILIATION_REQUIRED" : "SUBMISSION_IN_PROGRESS", claim.order.externalSubmission?.status === "UNKNOWN_RESULT" ? "The Syntech submission result must be reconciled before another attempt." : "A Syntech submission is already in progress.", "UNKNOWN_RESULT"); }
  await recordAdminAuditBestEffort({ category: "AUDIT", ...input.auditActor, subsystem: "SUPPLIER_ORDERS", actionType: "SYNTECH_UAT_SUBMISSION_INITIATED", entityType: "SUPPLIER_ORDER", entityId: input.supplierOrderId, entityLabel: input.supplierOrderId, summary: "Staff initiated a controlled Syntech UAT order submission.", after: [{ label: "Environment", value: "UAT" }, { label: "Line count", value: preflight.lines.length }], targetRoute: `/admin/supplier-orders/${encodeURIComponent(input.supplierOrderId)}`, idempotencyKey: `syntech-uat-start:${input.supplierOrderId}:${requestFingerprint}` });
  try {
    const url = syntechUatOrderUrl(config.baseUrl!);
    let response: Response;
    try {
      response = await (input.fetchImpl ?? fetch)(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", RESELLERTOKEN: config.credential! }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new SyntechOrderError("AMBIGUOUS_TRANSPORT_FAILURE", "Syntech order result is unknown because the response was not received.", "UNKNOWN_RESULT");
    }
    if (response.status >= 500) throw new SyntechOrderError("AMBIGUOUS_PROVIDER_FAILURE", `Syntech returned HTTP ${response.status}; order creation requires reconciliation.`, "UNKNOWN_RESULT");
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new SyntechOrderError("AMBIGUOUS_RESPONSE", "Syntech returned an unreadable order response.", "UNKNOWN_RESULT"); }
    if (!response.ok) {
      const rc = parseBusinessFailure(body);
      if (rc) {
        const mapped = mapSyntechRcError(rc);
        throw new SyntechOrderError(mapped.code, mapped.message, mapped.category, true);
      }
      throw new SyntechOrderError(`HTTP_${response.status}`, `Syntech rejected the UAT order request with HTTP ${response.status}.`, response.status === 401 || response.status === 403 ? "AUTHORIZATION_ERROR" : "PROVIDER_DEPENDENCY", true);
    }
    const normalized = normalizeSyntechCreateResponse(body);
    const created = await updateSupplierOrder(input.supplierOrderId, (current) => ({ ...current, status: "ORDERED", orderedAt: now, orderedBy: input.actor ?? "TekCentral Staff", supplierOrderReference: normalized.salesorder, externalReference: preflight.externalReference, updatedAt: now, externalSubmission: { ...current.externalSubmission!, status: "CREATED", externalOrderId: normalized.salesorder, externalOrderNumber: normalized.salesorder, externalStatus: "CREATED_UNPAID", submittedAt: now, rawResponseFingerprint: normalized.responseFingerprint }, events: [...current.events, { timestamp: now, type: "SYNTECH_UAT_ORDER_CREATED", description: `Syntech UAT sales order ${normalized.salesorder} was created. No supplier payment or customer fulfilment status was changed.` }] }));
    await recordAdminAuditBestEffort({ category: "AUDIT", ...input.auditActor, subsystem: "SUPPLIER_ORDERS", actionType: "SYNTECH_UAT_ORDER_CREATED", entityType: "SUPPLIER_ORDER", entityId: input.supplierOrderId, entityLabel: input.supplierOrderId, summary: "Syntech confirmed creation of one UAT supplier order.", after: [{ label: "External reference recorded", value: Boolean(normalized.salesorder) }, { label: "External state", value: "CREATED_UNPAID" }], targetRoute: `/admin/supplier-orders/${encodeURIComponent(input.supplierOrderId)}`, idempotencyKey: `syntech-uat-created:${input.supplierOrderId}:${requestFingerprint}` });
    await bestEffortResolve({ type: "SUPPLIER_ORDER_API_FAILED", subsystem: "SUPPLIERS", entityType: "SUPPLIER_ORDER", entityId: input.supplierOrderId, diagnosticCode: "SYNTECH_UAT_SUBMISSION_FAILED" });
    return { supplierOrder: created!, preflight };
  } catch (error) {
    const normalized = error instanceof SyntechOrderError ? error : new SyntechOrderError("AMBIGUOUS_FAILURE", "Syntech order result is unknown.", "UNKNOWN_RESULT");
    const status = normalized.category === "UNKNOWN_RESULT" ? "UNKNOWN_RESULT" : "FAILED";
    const failed = await updateSupplierOrder(input.supplierOrderId, (current) => ({ ...current, status: "APPROVED", updatedAt: now, externalSubmission: { ...current.externalSubmission!, status, lastErrorCode: normalized.code, lastErrorMessage: normalized.message, diagnostics: { ...current.externalSubmission?.diagnostics, responseCategory: normalized.category } }, events: [...current.events, { timestamp: now, type: status === "UNKNOWN_RESULT" ? "SYNTECH_UAT_RESULT_UNKNOWN" : "SYNTECH_UAT_SUBMISSION_REJECTED", description: normalized.message }] }));
    await recordAdminAuditBestEffort({ category: "AUDIT", ...input.auditActor, subsystem: "SUPPLIER_ORDERS", actionType: status === "UNKNOWN_RESULT" ? "SYNTECH_UAT_RESULT_UNKNOWN" : "SYNTECH_UAT_SUBMISSION_FAILED", entityType: "SUPPLIER_ORDER", entityId: input.supplierOrderId, entityLabel: input.supplierOrderId, summary: status === "UNKNOWN_RESULT" ? "The Syntech UAT order result is unknown and requires reconciliation." : "Syntech rejected the controlled UAT order submission.", after: [{ label: "Safe error code", value: normalized.code }, { label: "State", value: status }], targetRoute: `/admin/supplier-orders/${encodeURIComponent(input.supplierOrderId)}`, idempotencyKey: `syntech-uat-failed:${input.supplierOrderId}:${requestFingerprint}:${status}` });
    if (status === "UNKNOWN_RESULT" || normalized.code !== "RC3" && ["AUTHORIZATION_ERROR", "PROVIDER_DEPENDENCY", "CONFIGURATION_ERROR"].includes(normalized.category)) {
      await bestEffortAlert({ type: "SUPPLIER_ORDER_API_FAILED", severity: "WARNING", subsystem: "SUPPLIERS", title: "Syntech UAT procurement requires attention", summary: status === "UNKNOWN_RESULT" ? "A Syntech UAT order submission has an unknown result. Do not retry until reconciled." : "A controlled Syntech UAT provider or configuration failure requires review.", entityType: "SUPPLIER_ORDER", entityId: input.supplierOrderId, targetRoute: `/admin/supplier-orders/${encodeURIComponent(input.supplierOrderId)}`, recommendedAction: status === "UNKNOWN_RESULT" ? "Reconcile the stable Syntech reference" : "Review the safe provider error or use manual procurement", diagnosticCode: "SYNTECH_UAT_SUBMISSION_FAILED" });
    }
    normalized.message = `${normalized.message}${failed ? "" : " Supplier order state could not be persisted."}`;
    throw normalized;
  } finally {
    inFlight.delete(input.supplierOrderId);
  }
}

export function sanitizeSyntechPreflight(preflight: SyntechOrderPreflight) { return preflight; }
