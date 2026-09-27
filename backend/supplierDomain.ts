import type {
  BackendOrder,
  SupplierCode,
  SupplierFulfilmentMode,
  SupplierOrder,
  SupplierOrderLine,
  SupplierProductMapping,
  SupplierSubmissionMode,
} from "./types.js";

export type SupplierCapabilitySupport = "SUPPORTED" | "MANUAL" | "UNSUPPORTED" | "UNKNOWN";

export type SupplierCapability =
  | "catalogue"
  | "stock"
  | "pricing"
  | "productMapping"
  | "orderCreate"
  | "orderSubmitEmail"
  | "portalAutomation"
  | "directFulfilment"
  | "logisticsQuote"
  | "tracking"
  | "orderStatus"
  | "supplierPayment";

export type NormalizedSupplierOrderMode = "API" | "EMAIL" | "PORTAL_AUTOMATION" | "MANUAL";

export type SupplierCapabilityMap = Record<SupplierCapability, SupplierCapabilitySupport>;

export interface SupplierRegistryEntry {
  id: SupplierCode;
  displayName: string;
  enabled: boolean;
  supportedOrderModes: NormalizedSupplierOrderMode[];
  defaultOrderMode: NormalizedSupplierOrderMode;
  capabilities: SupplierCapabilityMap;
  adapterAvailable: boolean;
  manualProcurementUrl?: string;
  operationalChannel?: string;
}

export interface SupplierOffer {
  id: string;
  tekcentralProductId: string;
  supplierId: SupplierCode;
  supplierProductId?: string;
  supplierVariantId?: string;
  supplierSku?: string;
  cost?: number | null;
  currency?: string;
  availability?: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  sourceLocation?: string;
  fulfilmentCapability: SupplierCapabilitySupport;
  mappingStatus: NonNullable<SupplierProductMapping["status"]>;
  lastVerifiedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SupplierAdapterContext {
  order: BackendOrder;
  supplierOrder: SupplierOrder;
}

export interface SupplierAdapterPreflightResult {
  status: "READY" | "BLOCKED";
  blockers: string[];
  payloadPreview?: unknown;
}

export interface SupplierAdapterSubmissionResult {
  supplierReference?: string;
  payloadPreview: unknown;
}

export interface SupplierAdapterContract {
  code: SupplierCode;
  name: string;
  getCapabilities: () => SupplierCapabilityMap;
  supportedOrderModes: NormalizedSupplierOrderMode[];
  defaultSubmissionMode: SupplierSubmissionMode;
  defaultFulfilmentMode: SupplierFulfilmentMode;
  createOrderPayload: (order: BackendOrder, supplierOrder: SupplierOrder) => unknown;
  submitOrder?: (
    order: BackendOrder,
    supplierOrder: SupplierOrder,
    scenario: unknown,
  ) => Promise<SupplierAdapterSubmissionResult>;
  preflightOrder?: (context: SupplierAdapterContext) => Promise<SupplierAdapterPreflightResult>;
  refreshOrder?: (supplierOrder: SupplierOrder) => Promise<SupplierOrder>;
  reconcileOrder?: (supplierOrder: SupplierOrder) => Promise<SupplierOrder>;
  getTracking?: (supplierOrder: SupplierOrder) => Promise<unknown>;
}

const allCapabilities: SupplierCapability[] = [
  "catalogue",
  "stock",
  "pricing",
  "productMapping",
  "orderCreate",
  "orderSubmitEmail",
  "portalAutomation",
  "directFulfilment",
  "logisticsQuote",
  "tracking",
  "orderStatus",
  "supplierPayment",
];

export function capabilities(overrides: Partial<SupplierCapabilityMap> = {}): SupplierCapabilityMap {
  return Object.fromEntries(
    allCapabilities.map((capability) => [capability, overrides[capability] ?? "UNKNOWN"]),
  ) as SupplierCapabilityMap;
}

export function hasCapability(
  supplierCapabilities: SupplierCapabilityMap,
  capability: SupplierCapability,
) {
  return supplierCapabilities[capability] === "SUPPORTED" || supplierCapabilities[capability] === "MANUAL";
}

export function requireCapability(
  supplierCapabilities: SupplierCapabilityMap,
  capability: SupplierCapability,
) {
  if (!hasCapability(supplierCapabilities, capability)) {
    throw new Error(`Supplier capability ${capability} is not supported.`);
  }
}

export function supplierOfferFromMapping(
  mapping: SupplierProductMapping,
  line?: SupplierOrderLine,
): SupplierOffer {
  return {
    id: mapping.supplierOfferId ?? `${mapping.supplierCode}:${mapping.productId}:${mapping.supplierVariantId ?? mapping.supplierSku}`,
    tekcentralProductId: mapping.productId,
    supplierId: mapping.supplierCode,
    supplierProductId: mapping.supplierProductId,
    supplierVariantId: mapping.supplierVariantId,
    supplierSku: mapping.supplierSku,
    cost: line?.unitCost ?? null,
    availability: "UNKNOWN",
    fulfilmentCapability: "UNKNOWN",
    mappingStatus: mapping.status ?? "UNMAPPED",
    lastVerifiedAt: mapping.verifiedAt,
    metadata: {
      supplierProductSku: mapping.supplierProductSku,
      supplierVariantSku: mapping.supplierVariantSku,
      matchMethod: mapping.matchMethod,
    },
  };
}
