import type { SupplierCode } from "@/types/order";

export type SupplierCapabilitySupport = "SUPPORTED" | "MANUAL" | "UNSUPPORTED" | "UNKNOWN";
export type SupplierOrderMode = "API" | "EMAIL" | "PORTAL_AUTOMATION" | "MANUAL";
export type SupplierCapability =
  | "catalogue"
  | "productDetail"
  | "variantDetail"
  | "stock"
  | "warehouseStock"
  | "pricing"
  | "logistics"
  | "productImages"
  | "productContent"
  | "productAttributes"
  | "dealerPricing"
  | "promotions"
  | "branchStock"
  | "shipmentEta"
  | "categoryEvidence"
  | "evidence"
  | "syncHistory"
  | "health"
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
    sourceManagement?: boolean;
  };
}

function capabilityMap(overrides: Partial<Record<SupplierCapability, SupplierCapabilitySupport>>) {
  const keys: SupplierCapability[] = [
    "catalogue",
    "productDetail",
    "variantDetail",
    "stock",
    "warehouseStock",
    "pricing",
    "logistics",
    "productImages",
    "productContent",
    "productAttributes",
    "dealerPricing",
    "promotions",
    "branchStock",
    "shipmentEta",
    "categoryEvidence",
    "evidence",
    "syncHistory",
    "health",
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
    code: "TEKCENTRAL", slug: "tekcentral", displayName: "TekCentral", route: "/admin/suppliers/tekcentral", enabled: true, supportedOrderModes: ["MANUAL"],
    capabilitiesV2: capabilityMap({ catalogue: "MANUAL", productDetail: "MANUAL", stock: "MANUAL", warehouseStock: "UNSUPPORTED", pricing: "MANUAL", productImages: "MANUAL", productContent: "MANUAL", productAttributes: "MANUAL", evidence: "MANUAL", syncHistory: "UNSUPPORTED", health: "SUPPORTED", productMapping: "MANUAL", orderCreate: "MANUAL", orderSubmitEmail: "UNSUPPORTED", portalAutomation: "UNSUPPORTED", directFulfilment: "MANUAL", logisticsQuote: "UNSUPPORTED", tracking: "MANUAL", orderStatus: "MANUAL", supplierPayment: "UNSUPPORTED" }),
    capabilities: { catalogueRead: false, importedCatalogue: false, mappingSupport: true, connectionConfig: false, sourceManagement: true },
  },
  {
    code: "SYNTECH", slug: "syntech", displayName: "Syntech Distribution", route: "/admin/suppliers/syntech", enabled: true, supportedOrderModes: ["API", "MANUAL"],
    capabilitiesV2: capabilityMap({ catalogue: "SUPPORTED", productDetail: "SUPPORTED", stock: "SUPPORTED", warehouseStock: "SUPPORTED", pricing: "SUPPORTED", productImages: "SUPPORTED", productContent: "SUPPORTED", productAttributes: "SUPPORTED", dealerPricing: "SUPPORTED", promotions: "SUPPORTED", branchStock: "SUPPORTED", shipmentEta: "SUPPORTED", categoryEvidence: "SUPPORTED", evidence: "SUPPORTED", syncHistory: "SUPPORTED", health: "SUPPORTED", productMapping: "SUPPORTED", orderCreate: "SUPPORTED", orderSubmitEmail: "UNSUPPORTED", portalAutomation: "UNSUPPORTED", directFulfilment: "UNSUPPORTED", logisticsQuote: "UNSUPPORTED", tracking: "UNSUPPORTED", orderStatus: "UNSUPPORTED", supplierPayment: "UNSUPPORTED" }),
    capabilities: { catalogueRead: true, importedCatalogue: false, mappingSupport: true, connectionConfig: true, sourceManagement: true },
  },
  {
    code: "MUSTEK", slug: "mustek", displayName: "Mustek", route: "/admin/suppliers/mustek", enabled: true, supportedOrderModes: ["MANUAL"],
    capabilitiesV2: capabilityMap({ catalogue: "SUPPORTED", productDetail: "UNKNOWN", stock: "UNKNOWN", pricing: "SUPPORTED", productImages: "MANUAL", productContent: "MANUAL", dealerPricing: "SUPPORTED", evidence: "SUPPORTED", syncHistory: "SUPPORTED", health: "SUPPORTED", productMapping: "SUPPORTED", orderCreate: "MANUAL", orderSubmitEmail: "UNSUPPORTED", portalAutomation: "UNSUPPORTED", directFulfilment: "MANUAL", logisticsQuote: "UNSUPPORTED", tracking: "MANUAL", orderStatus: "MANUAL", supplierPayment: "UNSUPPORTED" }),
    capabilities: { catalogueRead: true, importedCatalogue: false, mappingSupport: true, connectionConfig: true, sourceManagement: true },
  },
  {
    code: "TVR", slug: "tvr", displayName: "TVR Distribution", route: "/admin/suppliers/tvr", enabled: true, supportedOrderModes: ["MANUAL"],
    capabilitiesV2: capabilityMap({ catalogue: "SUPPORTED", productDetail: "UNKNOWN", stock: "UNKNOWN", pricing: "UNKNOWN", productImages: "UNKNOWN", productContent: "UNKNOWN", evidence: "SUPPORTED", syncHistory: "SUPPORTED", health: "SUPPORTED", productMapping: "SUPPORTED", orderCreate: "MANUAL", orderSubmitEmail: "UNSUPPORTED", portalAutomation: "UNSUPPORTED", directFulfilment: "MANUAL", logisticsQuote: "UNSUPPORTED", tracking: "MANUAL", orderStatus: "MANUAL", supplierPayment: "UNSUPPORTED" }),
    capabilities: { catalogueRead: true, importedCatalogue: false, mappingSupport: true, connectionConfig: true, sourceManagement: true },
  },
  {
    code: "CJ",
    slug: "cj",
    displayName: "CJ Dropshipping",
    route: "/admin/suppliers/cj",
    enabled: true,
    supportedOrderModes: ["API"],
    capabilitiesV2: capabilityMap({
      catalogue: "SUPPORTED",
      productDetail: "SUPPORTED",
      variantDetail: "SUPPORTED",
      stock: "SUPPORTED",
      warehouseStock: "SUPPORTED",
      pricing: "SUPPORTED",
      logistics: "SUPPORTED",
      productImages: "SUPPORTED",
      productContent: "SUPPORTED",
      evidence: "SUPPORTED",
      syncHistory: "SUPPORTED",
      health: "SUPPORTED",
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
      sourceManagement: true,
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
      productDetail: "SUPPORTED",
      stock: "SUPPORTED",
      pricing: "SUPPORTED",
      productImages: "SUPPORTED",
      productContent: "SUPPORTED",
      evidence: "SUPPORTED",
      syncHistory: "SUPPORTED",
      health: "SUPPORTED",
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
      sourceManagement: true,
    },
  },
];

export const enabledSupplierRegistry = supplierRegistry.filter((supplier) => supplier.enabled);

export function supplierByCode(code: SupplierCode) {
  return supplierRegistry.find((supplier) => supplier.code === code);
}

export function supplierDefaultRoute(supplier: SupplierRegistryEntry) {
  return `${supplier.route}/overview`;
}

export function supplierCatalogueRoute(supplier: SupplierRegistryEntry) {
  return ["MUSTEK", "TVR", "TEKCENTRAL"].includes(supplier.code)
    ? `${supplier.route}/products`
    : supplier.route;
}

export function supplierProductsRoute(supplier: SupplierRegistryEntry) {
  return supplier.code === "CJ" ? `${supplier.route}/imported` : `${supplier.route}/products`;
}
