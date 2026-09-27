import { createHash } from "node:crypto";
import { getOrder } from "../../orderRepository.js";
import { getSupplierOrder, updateSupplierOrder } from "../../supplierOrderRepository.js";
import { getSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import type {
  BackendOrder,
  SupplierCatalogueVariant,
  SupplierExternalSubmission,
  SupplierOrder,
  SupplierOrderEvent,
  SupplierOrderLine,
} from "../../types.js";
import { CjClient } from "./cjClient.js";
import { CjApiError } from "./cjErrors.js";
import { normalizeCjStock, normalizeCjVariant } from "./cjProductMapper.js";
import { getCjCatalogueProduct } from "./cjCatalogueRepository.js";

export type CjOrderErrorCode =
  | "CJ_ORDER_CREATION_DISABLED"
  | "CJ_ORDER_PREFLIGHT_FAILED"
  | "CJ_ORDER_MAPPING_INVALID"
  | "CJ_ORDER_SHIPPING_INVALID"
  | "CJ_ORDER_LOGISTICS_REQUIRED"
  | "CJ_LOGISTICS_SOURCE_UNRESOLVED"
  | "CJ_LOGISTICS_VARIANT_INVALID"
  | "CJ_LOGISTICS_STOCK_UNAVAILABLE"
  | "CJ_LOGISTICS_DATA_INCOMPLETE"
  | "CJ_LOGISTICS_NO_ROUTE"
  | "CJ_LOGISTICS_API_REJECTED"
  | "CJ_LOGISTICS_RESPONSE_INVALID"
  | "CJ_ORDER_STOCK_UNAVAILABLE"
  | "CJ_ORDER_ALREADY_CREATED"
  | "CJ_ORDER_SUBMIT_FAILED"
  | "CJ_ORDER_RESULT_UNKNOWN";

export class CjOrderError extends Error {
  constructor(
    public code: CjOrderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CjShippingAddress {
  customerName: string;
  phone: string;
  consigneeId?: string;
  country: string;
  countryCode: string;
  province: string;
  city: string;
  address: string;
  address2?: string;
  postalCode: string;
}

export interface CjOrderLinePreview {
  orderItemId: string;
  tekcentralProduct: string;
  quantity: number;
  cjProductId: string;
  cjProductSku: string;
  cjVariantId: string;
  cjVariantSku: string;
  cjProductName?: string;
  unitPrice?: number;
  currency?: string;
  weight?: number;
  productProp?: string;
}

export interface CjLogisticsOption {
  id?: string;
  logisticName: string;
  fromCountryCode: string;
  destCountryCode: string;
  shippingCost?: number;
  currency: string;
  estimatedDelivery?: string;
  fetchedAt: string;
}

export interface CjRecipientValidation {
  phone: {
    status: "READY" | "NEEDS_CORRECTION";
    normalizedValue?: string;
    message?: string;
  };
  consigneeId: {
    status: "READY" | "NEEDS_CORRECTION" | "NOT_REQUIRED" | "UNKNOWN";
    normalizedValue?: string;
    maskedValue?: string;
    message?: string;
  };
}

export interface CjRecipientRequirements {
  phone: "REQUIRED" | "OPTIONAL";
  consigneeId: "REQUIRED" | "OPTIONAL" | "UNKNOWN";
}

export interface CjOrderPreflight {
  supplierOrderId: string;
  status: "BLOCKED" | "READY";
  featureEnabled: boolean;
  checkedAt: string;
  customerShipping?: CjShippingAddress;
  lines: CjOrderLinePreview[];
  logisticsOptions: CjLogisticsOption[];
  selectedLogistics?: CjLogisticsOption;
  selectionReason?: string;
  selectionMode?: "AUTO" | "STAFF";
  supplierProductAmount?: number;
  supplierShippingAmount?: number;
  supplierTotalAmount?: number;
  currency?: string;
  warnings: string[];
  blockers: string[];
  diagnostics?: SupplierExternalSubmission["diagnostics"];
  recipientRequirements?: CjRecipientRequirements;
  recipientValidation?: CjRecipientValidation;
  payloadPreview?: CjCreateOrderV2Payload;
  requestFingerprint?: string;
}

export type CjVariantDeliveryCheckStatus =
  | "AVAILABLE"
  | "NO_ROUTE"
  | "SOURCE_UNRESOLVED"
  | "STOCK_UNAVAILABLE"
  | "DATA_INCOMPLETE"
  | "VARIANT_INVALID"
  | "API_REJECTED";

export interface CjVariantDeliveryCheck {
  supplierVariantId: string;
  destinationCountryCode: "ZA";
  quantity: 1;
  status: CjVariantDeliveryCheckStatus;
  checkedAt: string;
  message: string;
  sourceCountries: string[];
  logisticsOptions: CjLogisticsOption[];
  diagnosticReasons?: string[];
  diagnostics?: SupplierExternalSubmission["diagnostics"];
}

export interface CjCreateOrderV2Payload {
  orderNumber: string;
  shippingZip: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingAddress2?: string;
  shippingCustomerName: string;
  shippingPhone: string;
  consigneeID?: string;
  remark: string;
  fromCountryCode: string;
  logisticName: string;
  payType: 3;
  platform: "Api";
  products: { vid: string; quantity: number }[];
}

export interface CjOrderActionResult {
  supplierOrder: SupplierOrder;
  preflight?: CjOrderPreflight;
}

type CjOrderClient = Pick<CjClient, "request">;

const defaultClient = new CjClient();
const submittingLocks = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function event(type: string, description: string): SupplierOrderEvent {
  return { timestamp: nowIso(), type, description };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function readCjRealOrderConfig() {
  return {
    realOrderCreationEnabled: process.env.CJ_REAL_ORDER_CREATION_ENABLED === "true",
  };
}

function externalReference(order: BackendOrder, supplierOrder: SupplierOrder) {
  return `${order.orderNumber}-${supplierOrder.id}`.slice(0, 40);
}

function countryCodeFor(country: string) {
  const normalized = country.trim().toLowerCase();
  if (normalized === "south africa") return "ZA";
  if (/^[a-z]{2}$/i.test(country.trim())) return country.trim().toUpperCase();
  return undefined;
}

export const cjRecipientValidationMessages = {
  phone: "CJ recipient phone must be a valid South African number.",
  consigneeIdMalformed: "CJ consignee ID must be 13 numeric digits when supplied.",
  consigneeIdRequired: "The selected CJ route requires a 13-digit consignee ID for this South Africa shipment.",
} as const;

export function normalizeSouthAfricanPhoneForCj(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const stripped = raw.replace(/[+\s()-]/g, "");
  if (!/^\d+$/.test(stripped)) return undefined;
  if (/^\d{9}$/.test(stripped)) return stripped;
  if (/^27\d{9}$/.test(stripped)) return stripped;
  if (/^0\d{9}$/.test(stripped)) return `27${stripped.slice(1)}`;
  return undefined;
}

export function normalizeSouthAfricanConsigneeIdForCj(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const stripped = raw.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(stripped)) return undefined;
  return stripped;
}

function maskConsigneeId(value: string) {
  return `*********${value.slice(-4)}`;
}

function encodeOperationalConsigneeId(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeOperationalConsigneeId(value: string | undefined) {
  if (!value) return undefined;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

const routeRecipientRequirementEvidence: Record<string, CjRecipientRequirements["consigneeId"]> = {
  "CJPacket Liquid Line": "REQUIRED",
  "CJPacket Sensitive": "REQUIRED",
  "CJPacket Postal": "REQUIRED",
  "PostNL": "OPTIONAL",
  "DHL Official": "OPTIONAL",
};

function recipientRequirementsFor(shipping: CjShippingAddress, selectedLogistics?: CjLogisticsOption): CjRecipientRequirements | undefined {
  if (shipping.countryCode !== "ZA") return undefined;
  return {
    phone: "REQUIRED",
    consigneeId: selectedLogistics
      ? routeRecipientRequirementEvidence[selectedLogistics.logisticName] ?? "UNKNOWN"
      : "UNKNOWN",
  };
}

function validateSouthAfricanRecipient(shipping: CjShippingAddress, requirements: CjRecipientRequirements): CjRecipientValidation {
  const normalizedPhone = normalizeSouthAfricanPhoneForCj(shipping.phone);
  const normalizedConsigneeId = normalizeSouthAfricanConsigneeIdForCj(shipping.consigneeId);
  const hasConsigneeId = Boolean(shipping.consigneeId?.trim());
  return {
    phone: normalizedPhone
      ? { status: "READY", normalizedValue: normalizedPhone }
      : { status: "NEEDS_CORRECTION", message: cjRecipientValidationMessages.phone },
    consigneeId: normalizedConsigneeId
      ? {
          status: "READY",
          normalizedValue: normalizedConsigneeId,
          maskedValue: maskConsigneeId(normalizedConsigneeId),
        }
      : hasConsigneeId
        ? { status: "NEEDS_CORRECTION", message: cjRecipientValidationMessages.consigneeIdMalformed }
        : requirements.consigneeId === "REQUIRED"
          ? { status: "NEEDS_CORRECTION", message: cjRecipientValidationMessages.consigneeIdRequired }
          : requirements.consigneeId === "OPTIONAL"
            ? { status: "NOT_REQUIRED" }
            : { status: "UNKNOWN", message: "Consignee ID requirement is not yet confirmed for the selected CJ route." },
  };
}

function recipientBlockersFor(validation: CjRecipientValidation) {
  return [validation.phone, validation.consigneeId]
    .filter((item) => item.status === "NEEDS_CORRECTION")
    .map((item) => item.message)
    .filter((message): message is string => Boolean(message));
}

export function sanitizeCjOrderPreflightForAdmin(preflight: CjOrderPreflight): CjOrderPreflight {
  const maskedId = preflight.recipientValidation?.consigneeId.maskedValue;
  const payloadPreview =
    preflight.payloadPreview && maskedId
      ? { ...preflight.payloadPreview, consigneeID: maskedId }
      : preflight.payloadPreview;
  return {
    ...preflight,
    recipientValidation: preflight.recipientValidation
      ? {
          phone: {
            status: preflight.recipientValidation.phone.status,
            message: preflight.recipientValidation.phone.message,
          },
          consigneeId: {
            status: preflight.recipientValidation.consigneeId.status,
            maskedValue: preflight.recipientValidation.consigneeId.maskedValue,
            message: preflight.recipientValidation.consigneeId.message,
          },
        }
      : undefined,
    payloadPreview,
  };
}

function normalizeShipping(order: BackendOrder) {
  const shipping: CjShippingAddress = {
    customerName: `${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim(),
    phone: order.customer.mobile?.trim() ?? "",
    consigneeId: order.customer.consigneeId?.trim() || undefined,
    country: order.deliveryAddress.country?.trim() ?? "",
    countryCode: countryCodeFor(order.deliveryAddress.country ?? "") ?? "",
    province: order.deliveryAddress.province?.trim() ?? "",
    city: order.deliveryAddress.city?.trim() ?? "",
    address: order.deliveryAddress.streetAddress?.trim() ?? "",
    address2: order.deliveryAddress.suburb?.trim() || undefined,
    postalCode: order.deliveryAddress.postalCode?.trim() ?? "",
  };
  const missing: string[] = [];
  if (!shipping.customerName) missing.push("Recipient name");
  if (!shipping.phone) missing.push("Phone number");
  if (!shipping.country) missing.push("Country");
  if (!shipping.countryCode) missing.push("Country code");
  if (!shipping.province) missing.push("Province");
  if (!shipping.city) missing.push("City");
  if (!shipping.address) missing.push("Address");
  if (!shipping.postalCode) missing.push("Postal code");
  return { shipping, missing };
}

function shippingWithOperationalRecipient(shipping: CjShippingAddress, supplierOrder: SupplierOrder): CjShippingAddress {
  return {
    ...shipping,
    consigneeId: decodeOperationalConsigneeId(supplierOrder.cjOperations?.recipientInfo?.consigneeIdEncrypted) ?? shipping.consigneeId,
  };
}

function assertBaseState(order: BackendOrder, supplierOrder: SupplierOrder) {
  if (order.payment.status !== "PAID") {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Paid payment confirmation is required before CJ order preparation.");
  }
  if (order.status === "CANCELLED") {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Cancelled customer orders cannot be submitted to CJ.");
  }
  if (order.operationalHold?.active) {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Customer order is on hold.");
  }
  if (supplierOrder.supplierCode !== "CJ") {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "This supplier order is not a CJ order.");
  }
  if (supplierOrder.status !== "APPROVED") {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order must be approved before CJ order preparation.");
  }
  if (supplierOrder.externalSubmission?.status === "CREATED") {
    throw new CjOrderError("CJ_ORDER_ALREADY_CREATED", "CJ order has already been created for this supplier order.");
  }
}

async function resolveVerifiedLine(line: SupplierOrderLine): Promise<CjOrderLinePreview> {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order line quantity is invalid.");
  }
  const mapping = await getSupplierProductMapping(line.productId, "CJ");
  if (
    mapping?.status !== "VERIFIED" ||
    !mapping.supplierProductId ||
    !mapping.supplierProductSku ||
    !mapping.supplierVariantId ||
    !mapping.supplierVariantSku ||
    mapping.supplierSku !== mapping.supplierVariantSku
  ) {
    throw new CjOrderError("CJ_ORDER_MAPPING_INVALID", "Verified CJ product and variant mapping is required for every line.");
  }
  const importedProduct = await getCjCatalogueProduct(mapping.supplierProductId);
  const importedVariant = importedProduct?.variants.find(
    (variant) => variant.supplierVariantId === mapping.supplierVariantId,
  );
  if (!importedProduct || !importedVariant) {
    throw new CjOrderError("CJ_ORDER_MAPPING_INVALID", "Verified CJ mapping no longer matches an imported CJ product and variant.");
  }
  return {
    orderItemId: line.orderItemId,
    tekcentralProduct: line.description,
    quantity: line.quantity,
    cjProductId: mapping.supplierProductId,
    cjProductSku: mapping.supplierProductSku,
    cjVariantId: mapping.supplierVariantId,
    cjVariantSku: mapping.supplierVariantSku,
    cjProductName: importedProduct.supplierProductName,
    unitPrice: importedVariant.price ?? importedProduct.supplierPrice,
    currency: importedVariant.currency ?? importedProduct.currency,
  };
}

async function assertFreshVariant(client: CjOrderClient, line: CjOrderLinePreview) {
  const variant = await fetchFreshVariant(client, line.cjVariantId);
  if (variant.supplierVariantId !== line.cjVariantId) {
    throw new CjOrderError("CJ_LOGISTICS_VARIANT_INVALID", "CJ variant could not be verified.");
  }
}

async function fetchFreshVariant(client: CjOrderClient, vid: string) {
  const response = await client.request<unknown>("/product/variant/queryByVid", {
    query: { vid, features: "enable_inventory" },
  });
  return normalizeCjVariant(response.data);
}

async function sourceCountriesForLines(client: CjOrderClient, lines: CjOrderLinePreview[]) {
  const sourceCountries = new Set<string>();
  for (const line of lines) {
    await assertFreshVariant(client, line);
    const response = await client.request<unknown[]>("/product/stock/queryByVid", {
      query: { vid: line.cjVariantId },
    });
    const stock = normalizeCjStock(response.data);
    if (stock.stockTotal <= 0) {
      throw new CjOrderError("CJ_LOGISTICS_STOCK_UNAVAILABLE", `${line.tekcentralProduct}: CJ stock is unavailable.`);
    }
    stock.stockByWarehouse
      .filter((warehouse) => warehouse.quantity > 0 && warehouse.countryCode)
      .forEach((warehouse) => sourceCountries.add(warehouse.countryCode!));
  }
  if (sourceCountries.size === 0) {
    throw new CjOrderError("CJ_LOGISTICS_SOURCE_UNRESOLVED", "CJ source warehouse or country could not be resolved.");
  }
  return [...sourceCountries].sort();
}

function normalizeTipLogisticsRows(raw: unknown, fromCountryCode: string, destCountryCode: string, fetchedAt: string): CjLogisticsOption[] {
  return arrayValue(raw)
    .map((row): CjLogisticsOption | undefined => {
      const item = objectValue(row);
      const option = objectValue(item.option);
      const channel = objectValue(item.channel);
      const logisticName = text(option.enName ?? item.logisticName ?? item.logisticsName ?? channel.enName);
      if (!logisticName) return undefined;
      return {
        id: text(item.optionId ?? option.id ?? item.channelId),
        logisticName,
        fromCountryCode: text(objectValue(item.srcArea).shortCode) ?? fromCountryCode,
        destCountryCode: text(objectValue(item.destArea).shortCode) ?? destCountryCode,
        shippingCost: numberValue(item.totalPostageFee ?? item.wrapPostage ?? item.discountFee ?? item.postage),
        currency: "USD",
        estimatedDelivery: text(item.arrivalTime ?? option.arrivalTime),
        fetchedAt,
      };
    })
    .filter((item): item is CjLogisticsOption => Boolean(item));
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter((item): item is string => Boolean(item));
  const single = text(value);
  return single ? single.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean) : [];
}

async function fetchCjProductLogisticsData(client: CjOrderClient, variant: SupplierCatalogueVariant) {
  const response = await client.request<unknown>("/product/query", {
    query: {
      pid: variant.supplierProductId,
      productSku: variant.supplierProductSku,
    },
  });
  const product = objectValue(response.data);
  return {
    requestId: response.requestId,
    productProp: stringList(product.productProEnSet ?? product.productProp ?? product.productPropList),
    productWeight: numberValue(product.productWeight ?? product.weight),
    productCode: text(product.productSku ?? product.sku ?? product.productCode),
    totalGoodsAmount: numberValue(product.sellPrice ?? product.nowPrice ?? product.price),
  };
}

export function buildCjFreightTipRequest(input: {
  sourceCountryCode: string;
  destinationCountryCode: string;
  weight: number;
  productProp: string[];
  sku: string;
  vid: string;
  quantity: number;
  productCode?: string;
  totalGoodsAmount?: number;
}) {
  const row: Record<string, unknown> = {
    srcAreaCode: input.sourceCountryCode,
    destAreaCode: input.destinationCountryCode,
    weight: input.weight,
    productProp: input.productProp,
    skuList: [input.sku],
    freightTrialSkuList: [
      {
        skuQuantity: input.quantity,
        sku: input.sku,
        vid: input.vid,
        skuWeight: input.weight,
        productPropList: input.productProp,
        productCode: input.productCode,
      },
    ],
  };
  if (input.totalGoodsAmount !== undefined) row.totalGoodsAmount = input.totalGoodsAmount;
  return { reqDTOS: [row] };
}

async function fetchCjFreightTrialOptions(input: {
  client: CjOrderClient;
  destinationCountryCode: string;
  lines: CjOrderLinePreview[];
}) {
  const { client, destinationCountryCode, lines } = input;
  const sourceCountries = await sourceCountriesForLines(client, lines);
  const fetchedAt = nowIso();
  const options: CjLogisticsOption[] = [];
  const diagnosticReasons: string[] = [];
  const diagnostics: NonNullable<SupplierExternalSubmission["diagnostics"]> = {
    destinationCountryCode,
    postalCodePresent: false,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    variants: [],
    sourceCountries,
  };
  const trialLines = [];
  for (const line of lines) {
    const variant = await fetchFreshVariant(client, line.cjVariantId);
    if (variant.supplierVariantId !== line.cjVariantId) {
      throw new CjOrderError("CJ_LOGISTICS_VARIANT_INVALID", "CJ variant could not be verified.");
    }
    const productLogistics = await fetchCjProductLogisticsData(client, variant);
    const weight = variant.weight ?? productLogistics.productWeight;
    const sku = variant.supplierVariantSku ?? variant.supplierProductSku ?? line.cjVariantSku;
    const missing: string[] = [];
    if (!sku) missing.push("CJ SKU");
    if (!weight || weight <= 0) missing.push("weight");
    if (productLogistics.productProp.length === 0) missing.push("productProp");
    if (missing.length > 0) {
      throw new CjOrderError("CJ_LOGISTICS_DATA_INCOMPLETE", `${line.tekcentralProduct}: CJ logistics data is incomplete. Missing: ${missing.join(", ")}.`);
    }
    const validatedWeight = weight!;
    const validatedSku = sku!;
    trialLines.push({
      line,
      weight: validatedWeight,
      sku: validatedSku,
      productProp: productLogistics.productProp,
      productCode: productLogistics.productCode,
      totalGoodsAmount: productLogistics.totalGoodsAmount ?? variant.price,
    });
    diagnostics.variants?.push({
      vid: line.cjVariantId,
      quantity: line.quantity,
      weight: validatedWeight,
      productProp: productLogistics.productProp.join(", "),
    });
  }
  for (const sourceCountry of sourceCountries) {
    for (const trialLine of trialLines) {
      const requestBody = buildCjFreightTipRequest({
        sourceCountryCode: sourceCountry,
        destinationCountryCode,
        weight: trialLine.weight,
        productProp: trialLine.productProp,
        sku: trialLine.sku,
        vid: trialLine.line.cjVariantId,
        quantity: trialLine.line.quantity,
        productCode: trialLine.productCode,
        totalGoodsAmount: trialLine.totalGoodsAmount,
      });
      diagnostics.requestBody = requestBody;
      const response = await client.request<unknown[]>("/logistic/freightCalculateTip", {
        method: "POST",
        body: requestBody,
      }).catch((error) => {
        if (error instanceof CjApiError) {
          diagnostics.responseMessage = error.message;
          diagnostics.requestId = error.requestId;
          diagnostics.responseShape = "error";
          return undefined;
        }
        throw error;
      });
      if (!response) continue;
      diagnostics.responseShape = Array.isArray(response.data) ? "array" : typeof response.data;
      diagnostics.requestId = response.requestId;
      const nextOptions = normalizeTipLogisticsRows(response.data, sourceCountry, destinationCountryCode, fetchedAt);
      options.push(...nextOptions);
      if (nextOptions.length === 0) {
        const unavailable = await client.request<unknown>("/logistic/unavailableShippingMethods", {
          method: "POST",
          body: requestBody,
        }).catch((error) => {
          if (error instanceof CjApiError) {
            diagnostics.responseMessage = error.message;
            diagnostics.requestId = error.requestId;
            diagnostics.responseShape = "error";
            diagnosticReasons.push(error.message || "CJ trial could not be evaluated.");
            return undefined;
          }
          throw error;
        });
        if (unavailable) {
          diagnostics.requestId = unavailable.requestId;
          diagnostics.responseMessage = "No freightCalculateTip methods returned.";
          diagnosticReasons.push(...normalizeUnavailableReasons(unavailable.data));
        }
      }
    }
  }
  if (diagnosticReasons.length > 0) diagnostics.unavailableReasons = diagnosticReasons;
  return { options, diagnostics, diagnosticReasons };
}

export function buildCjFreightRequest(input: {
  destinationCountryCode: string;
  sourceCountryCode: string;
  products: { vid: string; quantity: number }[];
}) {
  return {
    startCountryCode: input.sourceCountryCode,
    endCountryCode: input.destinationCountryCode,
    products: input.products.map((product) => ({
      vid: product.vid,
      quantity: product.quantity,
    })),
  };
}

function deliveryCheckStatusFromError(error: CjOrderError): CjVariantDeliveryCheckStatus {
  if (error.code === "CJ_LOGISTICS_SOURCE_UNRESOLVED") return "SOURCE_UNRESOLVED";
  if (error.code === "CJ_LOGISTICS_STOCK_UNAVAILABLE") return "STOCK_UNAVAILABLE";
  if (error.code === "CJ_LOGISTICS_DATA_INCOMPLETE") return "DATA_INCOMPLETE";
  if (error.code === "CJ_LOGISTICS_VARIANT_INVALID") return "VARIANT_INVALID";
  if (error.code === "CJ_LOGISTICS_API_REJECTED") return "API_REJECTED";
  return "API_REJECTED";
}

function deliveryCheckMessage(status: CjVariantDeliveryCheckStatus) {
  if (status === "AVAILABLE") return "Delivery to South Africa available ✓";
  if (status === "NO_ROUTE") return "No CJ shipping method is currently available to South Africa for this variant.";
  if (status === "SOURCE_UNRESOLVED") return "CJ source warehouse or country could not be resolved for this variant.";
  if (status === "STOCK_UNAVAILABLE") return "CJ stock is not currently available for this variant.";
  if (status === "DATA_INCOMPLETE") return "CJ logistics data is incomplete for this variant.";
  if (status === "VARIANT_INVALID") return "CJ could not verify this exact variant.";
  return "CJ delivery eligibility could not be checked for this variant.";
}

function deliveryDiagnosticReason(code: unknown, message: string) {
  if (code === 2003) return `Product attributes required: ${message}`;
  if (code === 2004) return `Product attributes unsupported: ${message}`;
  if (code === 2006) return `SKU unsupported: ${message}`;
  if (code === 2007 || code === 2009) return `Weight unsupported: ${message}`;
  if (code === 2008 || code === 2011 || code === 2016) return `Postcode or address constraint: ${message}`;
  if (code === 2013) return `Dimensions unsupported: ${message}`;
  if (code === 2014 || code === 2015) return `Route has no quote: ${message}`;
  if (typeof code === "number") return `CJ ${code}: ${message}`;
  return message || "CJ trial could not be evaluated.";
}

function normalizeUnavailableReasons(raw: unknown) {
  const data = objectValue(raw);
  const unavailableRows = arrayValue(data.unavailableList ?? raw);
  return unavailableRows
    .map((row) => {
      const item = objectValue(row);
      const optionName = text(item.optionName) ?? "Shipping method";
      const message = text(item.errorEn ?? item.error ?? item.message) ?? "CJ trial could not be evaluated.";
      const code = numberValue(item.errorCode);
      return `${optionName}: ${deliveryDiagnosticReason(code, message)}`;
    })
    .filter(Boolean);
}

export async function checkCjVariantDeliveryToSouthAfrica(input: {
  supplierVariantId: string;
  client?: CjOrderClient;
}): Promise<CjVariantDeliveryCheck> {
  const client = input.client ?? defaultClient;
  const supplierVariantId = input.supplierVariantId.trim();
  if (!supplierVariantId) {
    throw new CjOrderError("CJ_LOGISTICS_VARIANT_INVALID", "Select an exact CJ variant before checking delivery.");
  }
  const checkedAt = nowIso();
  try {
    const variant = await fetchFreshVariant(client, supplierVariantId);
    const { options, diagnostics, diagnosticReasons } = await fetchCjFreightTrialOptions({
      client,
      destinationCountryCode: "ZA",
      lines: [
        {
          orderItemId: "variant-delivery-check",
          tekcentralProduct: "Selected CJ variant",
          quantity: 1,
          cjProductId: variant.supplierProductId ?? "",
          cjProductSku: variant.supplierProductSku ?? "",
          cjVariantId: supplierVariantId,
          cjVariantSku: variant.supplierVariantSku ?? "",
        },
      ],
    });
    const status: CjVariantDeliveryCheckStatus = options.length > 0 ? "AVAILABLE" : "NO_ROUTE";
    return {
      supplierVariantId,
      destinationCountryCode: "ZA",
      quantity: 1,
      status,
      checkedAt,
      message: deliveryCheckMessage(status),
      sourceCountries: diagnostics.sourceCountries ?? [],
      logisticsOptions: options,
      diagnosticReasons,
      diagnostics: status === "NO_ROUTE"
        ? { ...diagnostics, responseMessage: diagnosticReasons[0] ?? "No logistics methods returned", unavailableReasons: diagnosticReasons }
        : diagnostics,
    };
  } catch (error) {
    if (!(error instanceof CjOrderError)) throw error;
    const status = deliveryCheckStatusFromError(error);
    return {
      supplierVariantId,
      destinationCountryCode: "ZA",
      quantity: 1,
      status,
      checkedAt,
      message: deliveryCheckMessage(status),
      sourceCountries: [],
      logisticsOptions: [],
      diagnosticReasons: [error.message],
      diagnostics: {
        destinationCountryCode: "ZA",
        postalCodePresent: false,
        itemCount: 1,
        variants: [{ vid: supplierVariantId, quantity: 1 }],
        responseMessage: error.message,
        responseShape: "error",
      },
    };
  }
}

function createPayload(order: BackendOrder, supplierOrder: SupplierOrder, shipping: CjShippingAddress, lines: CjOrderLinePreview[], selectedLogistics: CjLogisticsOption, recipientValidation?: CjRecipientValidation): CjCreateOrderV2Payload {
  const normalizedPhone = recipientValidation?.phone.normalizedValue ?? shipping.phone;
  const normalizedConsigneeId = recipientValidation?.consigneeId.normalizedValue;
  return {
    orderNumber: externalReference(order, supplierOrder),
    shippingZip: shipping.postalCode,
    shippingCountryCode: shipping.countryCode,
    shippingCountry: shipping.country,
    shippingProvince: shipping.province,
    shippingCity: shipping.city,
    shippingAddress: shipping.address,
    shippingAddress2: shipping.address2,
    shippingCustomerName: shipping.customerName,
    shippingPhone: normalizedPhone,
    ...(normalizedConsigneeId ? { consigneeID: normalizedConsigneeId } : {}),
    remark: `TekCentral supplier order ${supplierOrder.id}`,
    fromCountryCode: selectedLogistics.fromCountryCode,
    logisticName: selectedLogistics.logisticName,
    payType: 3,
    platform: "Api",
    products: lines.map((line) => ({ vid: line.cjVariantId, quantity: line.quantity })),
  };
}

function supplierProductAmount(lines: CjOrderLinePreview[]) {
  if (lines.some((line) => line.unitPrice === undefined)) return undefined;
  return lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
}

function optionKey(option?: { logisticName?: string; fromCountryCode?: string }) {
  return option?.logisticName && option.fromCountryCode ? `${option.fromCountryCode}::${option.logisticName}` : undefined;
}

function chooseEligibleNoIdRoute(input: {
  shipping: CjShippingAddress;
  logisticsOptions: CjLogisticsOption[];
  productAmount?: number;
}) {
  const { shipping, logisticsOptions, productAmount } = input;
  const eligible: { option: CjLogisticsOption; totalCost: number | undefined }[] = [];
  for (const option of logisticsOptions) {
    const requirements = recipientRequirementsFor(shipping, option);
    if (!requirements || requirements.consigneeId !== "OPTIONAL") continue;
    if (!option.estimatedDelivery) continue;
    if (option.shippingCost === undefined) continue;
    eligible.push({
      option,
      totalCost: productAmount === undefined ? undefined : productAmount + option.shippingCost,
    });
  }
  return eligible
    .sort((a, b) => {
      const left = a.totalCost ?? Number.POSITIVE_INFINITY;
      const right = b.totalCost ?? Number.POSITIVE_INFINITY;
      return left - right || a.option.logisticName.localeCompare(b.option.logisticName);
    })[0]?.option;
}

function cjOperationSelection(option: CjLogisticsOption, totalCost: number | undefined, selectedBy: "AUTO" | "STAFF", reason: string) {
  return {
    logisticName: option.logisticName,
    fromCountryCode: option.fromCountryCode,
    shippingCost: option.shippingCost,
    totalCost,
    currency: option.currency,
    estimatedDelivery: option.estimatedDelivery,
    selectedAt: nowIso(),
    selectedBy,
    reason,
  };
}

export async function prepareCjOrderPreflight(input: {
  supplierOrderId: string;
  selectedLogistics?: { logisticName?: string; fromCountryCode?: string };
  client?: CjOrderClient;
}): Promise<CjOrderPreflight> {
  const client = input.client ?? defaultClient;
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order not found.");
  const order = await getOrder(supplierOrder.customerOrderNumber);
  if (!order) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Customer order not found.");
  const checkedAt = nowIso();
  const blockers: string[] = [];
  const warnings: string[] = [];
  assertBaseState(order, supplierOrder);
  const normalized = normalizeShipping(order);
  const missing = normalized.missing;
  const shipping = shippingWithOperationalRecipient(normalized.shipping, supplierOrder);
  if (missing.length > 0) {
    throw new CjOrderError("CJ_ORDER_SHIPPING_INVALID", `CJ shipping information incomplete. Missing: ${missing.join(", ")}.`);
  }
  const lines = await Promise.all(supplierOrder.itemLines.map(resolveVerifiedLine));
  const unselectedRecipientRequirements = recipientRequirementsFor(shipping);
  const unselectedRecipientValidation = unselectedRecipientRequirements
    ? validateSouthAfricanRecipient(shipping, unselectedRecipientRequirements)
    : undefined;
  let logisticsOptions: CjLogisticsOption[];
  let diagnostics: SupplierExternalSubmission["diagnostics"];
  try {
    const trial = await fetchCjFreightTrialOptions({
      client,
      destinationCountryCode: shipping.countryCode,
      lines,
    });
    logisticsOptions = trial.options;
    diagnostics = trial.diagnostics;
  } catch (error) {
    if (!(error instanceof CjOrderError)) throw error;
    const preflight: CjOrderPreflight = {
      supplierOrderId: supplierOrder.id,
      status: "BLOCKED",
      featureEnabled: readCjRealOrderConfig().realOrderCreationEnabled,
      checkedAt,
      customerShipping: shipping,
      lines,
      logisticsOptions: [],
      warnings: [],
      blockers: [error.message, ...(unselectedRecipientValidation ? recipientBlockersFor(unselectedRecipientValidation) : [])],
      diagnostics: {
        destinationCountryCode: shipping.countryCode,
        postalCodePresent: Boolean(shipping.postalCode),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        variants: lines.map((line) => ({ vid: line.cjVariantId, quantity: line.quantity })),
        responseMessage: error.message,
        responseShape: "error",
      },
      recipientRequirements: unselectedRecipientRequirements,
      recipientValidation: unselectedRecipientValidation,
    };
    await updateSupplierOrder(supplierOrder.id, (current) => ({
      ...current,
      updatedAt: nowIso(),
      externalSubmission: {
        ...(current.externalSubmission ?? { mode: "CJ_API", status: "NOT_PREPARED" }),
        mode: "CJ_API",
        status: "NOT_PREPARED",
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
        diagnostics: preflight.diagnostics,
      },
      events: [...current.events, event("CJ_PREFLIGHT_BLOCKED", "CJ logistics preflight data is incomplete or unavailable.")],
    }));
    return preflight;
  }
  if (logisticsOptions.length === 0) {
    const preflight: CjOrderPreflight = {
      supplierOrderId: supplierOrder.id,
      status: "BLOCKED",
      featureEnabled: readCjRealOrderConfig().realOrderCreationEnabled,
      checkedAt,
      customerShipping: shipping,
      lines,
      logisticsOptions,
      warnings: [],
      blockers: [
        "This CJ variant currently has no available shipping method to the selected destination.",
        ...(unselectedRecipientValidation ? recipientBlockersFor(unselectedRecipientValidation) : []),
      ],
      diagnostics: {
        ...diagnostics,
        responseMessage: diagnostics?.unavailableReasons?.[0] ?? diagnostics?.responseMessage ?? "No logistics methods returned",
      },
      recipientRequirements: unselectedRecipientRequirements,
      recipientValidation: unselectedRecipientValidation,
    };
    await updateSupplierOrder(supplierOrder.id, (current) => ({
      ...current,
      updatedAt: nowIso(),
      externalSubmission: {
        ...(current.externalSubmission ?? { mode: "CJ_API", status: "NOT_PREPARED" }),
        mode: "CJ_API",
        status: "NOT_PREPARED",
        lastErrorCode: "CJ_LOGISTICS_NO_ROUTE",
        lastErrorMessage: "No CJ logistics options are available for this order.",
        diagnostics: preflight.diagnostics,
      },
      events: [...current.events, event("CJ_PREFLIGHT_BLOCKED", "CJ logistics returned no available shipping methods.")],
    }));
    return preflight;
  }
  const productAmount = supplierProductAmount(lines);
  const persistedSelection = supplierOrder.cjOperations?.selectedLogistics;
  const requestedSelection = input.selectedLogistics?.logisticName ? input.selectedLogistics : persistedSelection;
  let selectedLogistics = logisticsOptions.find((option) => optionKey(option) === optionKey(requestedSelection));
  let selectionReason = selectedLogistics
    ? requestedSelection === persistedSelection
      ? persistedSelection?.reason
      : "STAFF_SELECTED"
    : undefined;
  let selectionMode: "AUTO" | "STAFF" | undefined = selectedLogistics
    ? requestedSelection === persistedSelection
      ? persistedSelection?.selectedBy
      : "STAFF"
    : undefined;
  if (!selectedLogistics && !input.selectedLogistics?.logisticName) {
    selectedLogistics = chooseEligibleNoIdRoute({ shipping, logisticsOptions, productAmount });
    selectionReason = selectedLogistics ? "AUTO_SELECTED_NO_ID_LOWEST_COST" : undefined;
    selectionMode = selectedLogistics ? "AUTO" : undefined;
  }
  if (!selectedLogistics) blockers.push("Select a CJ logistics option.");
  const recipientRequirements = recipientRequirementsFor(shipping, selectedLogistics);
  const recipientValidation = recipientRequirements
    ? validateSouthAfricanRecipient(shipping, recipientRequirements)
    : undefined;
  blockers.push(...(recipientValidation ? recipientBlockersFor(recipientValidation) : []));
  const shippingAmount = selectedLogistics?.shippingCost;
  const totalAmount =
    productAmount !== undefined && shippingAmount !== undefined
      ? productAmount + shippingAmount
      : undefined;
  const payloadPreview = selectedLogistics && blockers.length === 0
    ? createPayload(order, supplierOrder, shipping, lines, selectedLogistics, recipientValidation)
    : undefined;
  const requestFingerprint = payloadPreview
    ? fingerprint({
        supplierOrderId: supplierOrder.id,
        approvedAt: supplierOrder.approvedAt,
        lines,
        shipping,
        selectedLogistics,
        payloadPreview,
      })
    : undefined;
  const requiresRecipientAttention =
    blockers.length > 0 &&
    recipientValidation?.consigneeId.status === "NEEDS_CORRECTION" &&
    recipientRequirements?.consigneeId === "REQUIRED";
  const noEligibleAutomation =
    !selectedLogistics &&
    shipping.countryCode === "ZA" &&
    !shipping.consigneeId &&
    logisticsOptions.length > 0 &&
    chooseEligibleNoIdRoute({ shipping, logisticsOptions, productAmount }) === undefined;
  await updateSupplierOrder(supplierOrder.id, (current) => {
    const now = nowIso();
    const selectedOperation = selectedLogistics
      ? cjOperationSelection(
          selectedLogistics,
          totalAmount,
          selectionMode ?? "STAFF",
          selectionReason ?? "STAFF_SELECTED",
        )
      : current.cjOperations?.selectedLogistics;
    const attentionActive = requiresRecipientAttention || noEligibleAutomation;
    const currentAttention = current.cjOperations?.attention;
    return {
      ...current,
      updatedAt: now,
      cjOperations: {
        ...current.cjOperations,
        selectedLogistics: selectedOperation,
        attention: attentionActive
          ? {
              code: "CJ_RECIPIENT_INFORMATION_REQUIRED",
              active: true,
              message: "Recipient information or shipping selection is required before CJ fulfilment can continue.",
              createdAt: currentAttention?.active ? currentAttention.createdAt : now,
            }
          : currentAttention?.active
            ? {
                ...currentAttention,
                active: false,
                resolvedAt: now,
              }
            : currentAttention,
      },
      events: attentionActive && !currentAttention?.active
        ? [
            ...current.events,
            event(
              "CJ_RECIPIENT_INFORMATION_REQUIRED",
              `CJ fulfilment paused for ${current.customerOrderNumber}. Recipient information or shipping selection is required.`,
            ),
          ]
        : current.events,
    };
  });
  return {
    supplierOrderId: supplierOrder.id,
    status: blockers.length > 0 ? "BLOCKED" : "READY",
    featureEnabled: readCjRealOrderConfig().realOrderCreationEnabled,
    checkedAt,
    customerShipping: shipping,
    lines,
    logisticsOptions,
    selectedLogistics,
    selectionReason,
    selectionMode,
    supplierProductAmount: productAmount,
    supplierShippingAmount: shippingAmount,
    supplierTotalAmount: totalAmount,
    currency: lines.find((line) => line.currency)?.currency ?? selectedLogistics?.currency,
    warnings,
    blockers,
    diagnostics,
    recipientRequirements,
    recipientValidation,
    payloadPreview,
    requestFingerprint,
  };
}

function normalizeCreatedSubmission(preflight: CjOrderPreflight, responseData: unknown, requestId?: string): SupplierExternalSubmission {
  const data = objectValue(responseData);
  const stringData = typeof responseData === "string" ? responseData : undefined;
  return {
    mode: "CJ_API",
    status: "CREATED",
    externalOrderId: text(data.orderId ?? data.id ?? data.shipmentOrderId) ?? stringData,
    externalOrderNumber: text(data.orderNumber ?? data.orderCode ?? data.cjOrderNumber) ?? stringData,
    externalStatus: text(data.orderStatus ?? data.status),
    externalPaymentStatus: text(data.paymentStatus ?? data.payStatus),
    paymentUrl: text(data.cjPayUrl ?? data.payUrl),
    submittedAt: nowIso(),
    lastSyncedAt: nowIso(),
    requestFingerprint: preflight.requestFingerprint,
    idempotencyKey: preflight.requestFingerprint,
    externalReference: preflight.payloadPreview?.orderNumber,
    rawResponseFingerprint: fingerprint({ responseData, requestId }),
  };
}

async function syncCjDetail(client: CjOrderClient, submission: SupplierExternalSubmission) {
  const orderContent = submission.externalOrderNumber ?? submission.externalOrderId ?? submission.externalReference;
  if (!orderContent) return submission;
  const response = await client.request<unknown>("/shopping/order/list", {
    query: { pageNum: 1, pageSize: 20, orderContent },
  });
  const data = objectValue(extractOrderRows(response.data).find((row) => stableStringify(row).includes(orderContent)) ?? {});
  if (Object.keys(data).length === 0) return {
    ...submission,
    lastSyncedAt: nowIso(),
    lastErrorCode: "CJ_ORDER_NOT_FOUND",
    lastErrorMessage: "No matching CJ order found during refresh.",
  };
  return {
    ...submission,
    externalStatus: text(data.orderStatus ?? data.status) ?? submission.externalStatus,
    externalPaymentStatus: text(data.paymentStatus ?? data.payStatus) ?? submission.externalPaymentStatus,
    lastSyncedAt: nowIso(),
    rawResponseFingerprint: fingerprint({ previous: submission.rawResponseFingerprint, responseData: response.data, requestId: response.requestId }),
  };
}

export async function createRealCjOrder(input: {
  supplierOrderId: string;
  selectedLogistics: { logisticName?: string; fromCountryCode?: string };
  client?: CjOrderClient;
}): Promise<CjOrderActionResult> {
  const client = input.client ?? defaultClient;
  if (!readCjRealOrderConfig().realOrderCreationEnabled) {
    throw new CjOrderError("CJ_ORDER_CREATION_DISABLED", "Real CJ order creation is disabled.");
  }
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order not found.");
  if (supplierOrder.externalSubmission?.status === "CREATED") {
    throw new CjOrderError("CJ_ORDER_ALREADY_CREATED", "CJ order has already been created for this supplier order.");
  }
  if (supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT") {
    throw new CjOrderError("CJ_ORDER_RESULT_UNKNOWN", "CJ order result is uncertain. Reconcile before retrying.");
  }
  const preflight = await prepareCjOrderPreflight({
    supplierOrderId: input.supplierOrderId,
    selectedLogistics: input.selectedLogistics,
    client,
  });
  if (preflight.status !== "READY" || !preflight.payloadPreview || !preflight.requestFingerprint) {
    submittingLocks.delete(input.supplierOrderId);
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "CJ order preflight is not ready.");
  }
  if (submittingLocks.has(input.supplierOrderId)) {
    return { supplierOrder };
  }
  submittingLocks.add(input.supplierOrderId);
  await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    externalSubmission: {
      mode: "CJ_API",
      status: "SUBMITTING",
      requestFingerprint: preflight.requestFingerprint,
      idempotencyKey: preflight.requestFingerprint,
      externalReference: preflight.payloadPreview?.orderNumber,
    },
    events: [...current.events, event("CJ_ORDER_CREATION_STARTED", "Real CJ order creation started.")],
  }));
  try {
    const response = await client.request<unknown>("/shopping/order/createOrderV2", {
      method: "POST",
      body: preflight.payloadPreview,
    });
    let externalSubmission = normalizeCreatedSubmission(preflight, response.data, response.requestId);
    externalSubmission = await syncCjDetail(client, externalSubmission).catch(() => externalSubmission);
    const updated = await updateSupplierOrder(input.supplierOrderId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      externalReference: externalSubmission.externalReference,
      supplierOrderReference: externalSubmission.externalOrderNumber ?? externalSubmission.externalOrderId ?? current.supplierOrderReference,
      submissionMode: "API",
      fulfilmentMode: "DIRECT_TO_CUSTOMER",
      externalSubmission,
      events: [...current.events, event("CJ_ORDER_CREATED", "CJ order created. Supplier payment was not initiated.")],
    }));
    return { supplierOrder: updated!, preflight };
  } catch (error) {
    const unknownResult = error instanceof CjApiError && error.code === "CJ_API_UNAVAILABLE";
    const status = unknownResult ? "UNKNOWN_RESULT" : "FAILED";
    const code = unknownResult ? "CJ_ORDER_RESULT_UNKNOWN" : "CJ_ORDER_SUBMIT_FAILED";
    const message =
      error instanceof Error
        ? error.message
        : unknownResult
          ? "CJ order result is uncertain."
          : "CJ order creation failed.";
    await updateSupplierOrder(input.supplierOrderId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      externalSubmission: {
        mode: "CJ_API",
        status,
        requestFingerprint: preflight.requestFingerprint,
        idempotencyKey: preflight.requestFingerprint,
        externalReference: preflight.payloadPreview?.orderNumber,
        lastErrorCode: code,
        lastErrorMessage: message,
      },
      events: [
        ...current.events,
        event(
          unknownResult ? "CJ_ORDER_RESULT_UNCERTAIN" : "CJ_ORDER_CREATION_FAILED",
          unknownResult
            ? "CJ order result is uncertain. Reconciliation is required before retry."
            : "CJ order creation failed.",
        ),
      ],
    }));
    throw new CjOrderError(code, message);
  } finally {
    submittingLocks.delete(input.supplierOrderId);
  }
}

export async function saveCjOperationalConsigneeId(input: {
  supplierOrderId: string;
  consigneeId?: string;
  client?: CjOrderClient;
}) {
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order not found.");
  const normalized = normalizeSouthAfricanConsigneeIdForCj(input.consigneeId);
  if (!normalized) {
    const updated = await updateSupplierOrder(input.supplierOrderId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      cjOperations: {
        ...current.cjOperations,
        recipientInfo: {
          ...current.cjOperations?.recipientInfo,
          invalidReason: cjRecipientValidationMessages.consigneeIdMalformed,
        },
      },
    }));
    return { supplierOrder: updated!, preflight: undefined };
  }
  await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    cjOperations: {
      ...current.cjOperations,
      recipientInfo: {
        consigneeIdEncrypted: encodeOperationalConsigneeId(normalized),
        consigneeIdMasked: maskConsigneeId(normalized),
        savedAt: nowIso(),
      },
    },
    events: [...current.events, event("CJ_CONSIGNEE_ID_UPDATED", "Operational CJ consignee ID saved.")],
  }));
  const preflight = await prepareCjOrderPreflight({
    supplierOrderId: input.supplierOrderId,
    client: input.client,
  });
  return { supplierOrder: (await getSupplierOrder(input.supplierOrderId))!, preflight };
}

export async function removeCjOperationalConsigneeId(input: { supplierOrderId: string; client?: CjOrderClient }) {
  await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    cjOperations: {
      ...current.cjOperations,
      recipientInfo: undefined,
    },
    events: [...current.events, event("CJ_CONSIGNEE_ID_REMOVED", "Operational CJ consignee ID removed.")],
  }));
  const preflight = await prepareCjOrderPreflight({
    supplierOrderId: input.supplierOrderId,
    client: input.client,
  });
  return { supplierOrder: (await getSupplierOrder(input.supplierOrderId))!, preflight };
}

export async function selectCjLogisticsOverride(input: {
  supplierOrderId: string;
  selectedLogistics: { logisticName?: string; fromCountryCode?: string };
  client?: CjOrderClient;
}) {
  const preflight = await prepareCjOrderPreflight({
    supplierOrderId: input.supplierOrderId,
    selectedLogistics: input.selectedLogistics,
    client: input.client,
  });
  const selected = preflight.selectedLogistics;
  if (!selected) throw new CjOrderError("CJ_ORDER_LOGISTICS_REQUIRED", "Selected CJ logistics option is not currently available.");
  await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    cjOperations: {
      ...current.cjOperations,
      selectedLogistics: cjOperationSelection(
        selected,
        preflight.supplierTotalAmount,
        "STAFF",
        "STAFF_SELECTED",
      ),
    },
    events: [...current.events, event("CJ_LOGISTICS_OVERRIDE_SELECTED", `Staff selected CJ logistics method ${selected.logisticName}.`)],
  }));
  const nextPreflight = await prepareCjOrderPreflight({
    supplierOrderId: input.supplierOrderId,
    selectedLogistics: input.selectedLogistics,
    client: input.client,
  });
  return { supplierOrder: (await getSupplierOrder(input.supplierOrderId))!, preflight: nextPreflight };
}

function extractOrderRows(data: unknown) {
  const root = objectValue(data);
  return arrayValue(root.list ?? root.records ?? root.content ?? root.orderList ?? data);
}

function bindSubmissionFromOrderRow(row: unknown, fallbackReference?: string): SupplierExternalSubmission {
  const item = objectValue(row);
  return {
    mode: "CJ_API",
    status: "CREATED",
    externalOrderId: text(item.orderId ?? item.id ?? item.shipmentOrderId),
    externalOrderNumber: text(item.orderNumber ?? item.orderCode ?? item.cjOrderNumber) ?? fallbackReference,
    externalStatus: text(item.orderStatus ?? item.status),
    externalPaymentStatus: text(item.paymentStatus ?? item.payStatus),
    externalReference: fallbackReference,
    lastSyncedAt: nowIso(),
    rawResponseFingerprint: fingerprint(row),
  };
}

export async function reconcileCjOrder(input: { supplierOrderId: string; client?: CjOrderClient }): Promise<CjOrderActionResult> {
  const client = input.client ?? defaultClient;
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order not found.");
  const reference = supplierOrder.externalSubmission?.externalReference ?? supplierOrder.externalReference;
  if (!reference) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "No CJ external reference is available for reconciliation.");
  const response = await client.request<unknown>("/shopping/order/list", {
    query: { pageNum: 1, pageSize: 20, orderContent: reference },
  });
  const match = extractOrderRows(response.data).find((row) => stableStringify(row).includes(reference));
  const now = nowIso();
  const updated = await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: now,
    externalSubmission: match
      ? bindSubmissionFromOrderRow(match, reference)
      : {
          ...(current.externalSubmission ?? { mode: "CJ_API", status: "UNKNOWN_RESULT" }),
          mode: "CJ_API",
          status: current.externalSubmission?.status === "CREATED" ? "CREATED" : (current.externalSubmission?.status ?? "UNKNOWN_RESULT"),
          externalReference: reference,
          lastSyncedAt: now,
          lastErrorCode: "CJ_ORDER_RESULT_UNKNOWN",
          lastErrorMessage: "No matching CJ order found during reconciliation.",
        },
    events: [
      ...current.events,
      event(
        "CJ_RECONCILIATION_COMPLETED",
        match ? "CJ reconciliation found and bound the external order." : "CJ reconciliation completed with no matching order.",
      ),
    ],
  }));
  return { supplierOrder: updated! };
}

export async function refreshCjOrderStatus(input: { supplierOrderId: string; client?: CjOrderClient }): Promise<CjOrderActionResult> {
  const client = input.client ?? defaultClient;
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "Supplier order not found.");
  if (!supplierOrder.externalSubmission) {
    throw new CjOrderError("CJ_ORDER_PREFLIGHT_FAILED", "No CJ order has been created for this supplier order.");
  }
  const externalSubmission = await syncCjDetail(client, supplierOrder.externalSubmission);
  const updated = await updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    externalSubmission,
    events: [...current.events, event("CJ_STATUS_REFRESHED", "CJ order status refreshed.")],
  }));
  return { supplierOrder: updated! };
}
