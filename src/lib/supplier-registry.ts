import type { SupplierCode } from "@/types/order";

export type SupplierCapabilitySupport = "SUPPORTED" | "MANUAL" | "UNSUPPORTED" | "UNKNOWN";
export type SupplierOrderMode = "API" | "EMAIL" | "PORTAL_AUTOMATION" | "MANUAL";
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

export interface SupplierRegistryEntry {
  code: SupplierCode;
  slug: string;
  displayName: string;
  route: string;
  enabled: boolean;
  supportedOrderModes: SupplierOrderMode[];
  capabilitiesV2: Record<SupplierCapability, SupplierCapabilitySupport>;
  capabilities: {
    catalogueRead?: boolean;
    importedCatalogue?: boolean;
    mappingSupport?: boolean;
    connectionConfig?: boolean;
  };
}

function capabilityMap(overrides: Partial<Record<SupplierCapability, SupplierCapabilitySupport>>) {
  const keys: SupplierCapability[] = [
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
  return Object.fromEntries(keys.map((key) => [key, overrides[key] ?? "UNKNOWN"])) as Record<
    SupplierCapability,
    SupplierCapabilitySupport
  >;
}

export const supplierRegistry: SupplierRegistryEntry[] = [
  {
    code: "CJ",
    slug: "cj",
    displayName: "CJ Dropshipping",
    route: "/admin/suppliers/cj",
    enabled: true,
    supportedOrderModes: ["API"],
    capabilitiesV2: capabilityMap({
      catalogue: "SUPPORTED",
      stock: "SUPPORTED",
      pricing: "SUPPORTED",
      productMapping: "SUPPORTED",
      orderCreate: "SUPPORTED",
      orderSubmitEmail: "UNSUPPORTED",
      portalAutomation: "UNSUPPORTED",
      directFulfilment: "SUPPORTED",
      logisticsQuote: "SUPPORTED",
      tracking: "UNKNOWN",
      orderStatus: "SUPPORTED",
      supplierPayment: "UNSUPPORTED",
    }),
    capabilities: {
      catalogueRead: true,
      importedCatalogue: true,
      mappingSupport: true,
      connectionConfig: true,
    },
  },
  {
    code: "SCOOP",
    slug: "scoop",
    displayName: "Scoop Distribution",
    route: "/admin/suppliers/scoop",
    enabled: true,
    supportedOrderModes: ["EMAIL", "MANUAL"],
    capabilitiesV2: capabilityMap({
      catalogue: "SUPPORTED",
      stock: "SUPPORTED",
      pricing: "SUPPORTED",
      productMapping: "SUPPORTED",
      orderCreate: "UNSUPPORTED",
      orderSubmitEmail: "MANUAL",
      portalAutomation: "UNKNOWN",
      directFulfilment: "UNKNOWN",
      logisticsQuote: "UNKNOWN",
      tracking: "UNKNOWN",
      orderStatus: "UNKNOWN",
      supplierPayment: "UNSUPPORTED",
    }),
    capabilities: {
      catalogueRead: true,
      importedCatalogue: false,
      mappingSupport: true,
      connectionConfig: false,
    },
  },
];

export const enabledSupplierRegistry = supplierRegistry.filter((supplier) => supplier.enabled);

export function supplierByCode(code: SupplierCode) {
  return supplierRegistry.find((supplier) => supplier.code === code);
}
