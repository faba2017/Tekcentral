import type {
  BackendOrder,
  MockSupplierScenario,
  SupplierCode,
  SupplierFulfilmentMode,
  SupplierOrder,
  SupplierSubmissionMode,
} from "./types.js";
import {
  capabilities,
  type NormalizedSupplierOrderMode,
  type SupplierAdapterContract,
  type SupplierCapabilityMap,
} from "./supplierDomain.js";

export interface SupplierAdapterCapabilities {
  api: boolean;
  emailOrdering: boolean;
  portalOrdering: boolean;
  directShipping: boolean;
  feed: "CSV_XML" | "UNKNOWN";
  mockOnly: boolean;
  catalogueRead?: boolean;
  productSearch?: boolean;
  productDetails?: boolean;
  stockRead?: boolean;
  realOrderPrepare?: boolean;
  realOrderSubmit?: boolean;
  payment?: boolean;
  cancel?: boolean;
  automaticFulfilment?: boolean;
  realOrderCancel?: false;
  realDispatch?: false;
}

export interface SupplierAdapter {
  code: SupplierCode;
  name: string;
  capabilities: SupplierAdapterCapabilities;
  capabilityMap: SupplierCapabilityMap;
  getCapabilities: SupplierAdapterContract["getCapabilities"];
  supportedOrderModes: NormalizedSupplierOrderMode[];
  defaultSubmissionMode: SupplierSubmissionMode;
  defaultFulfilmentMode: SupplierFulfilmentMode;
  createOrderPayload: (order: BackendOrder, supplierOrder: SupplierOrder) => unknown;
  submitOrder: (
    order: BackendOrder,
    supplierOrder: SupplierOrder,
    scenario: MockSupplierScenario,
  ) => Promise<{ supplierReference?: string; payloadPreview: unknown }>;
  getOrderStatus: (supplierOrder: SupplierOrder) => SupplierOrder["status"];
}

const unknownCapabilities: SupplierAdapterCapabilities = {
  api: false,
  emailOrdering: false,
  portalOrdering: false,
  directShipping: false,
  feed: "UNKNOWN",
  mockOnly: true,
};

const unknownCapabilityMap = capabilities({
  catalogue: "UNKNOWN",
  stock: "UNKNOWN",
  pricing: "UNKNOWN",
  productMapping: "MANUAL",
  orderCreate: "MANUAL",
  orderSubmitEmail: "MANUAL",
  portalAutomation: "UNKNOWN",
  directFulfilment: "UNKNOWN",
  logisticsQuote: "UNKNOWN",
  tracking: "UNKNOWN",
  orderStatus: "UNKNOWN",
  supplierPayment: "UNSUPPORTED",
});

const supplierCapabilityMaps: Record<SupplierCode, SupplierCapabilityMap> = {
  SCOOP: capabilities({
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
  CJ: capabilities({
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
  MANUAL: unknownCapabilityMap,
  PINNACLE: unknownCapabilityMap,
  MIRO: unknownCapabilityMap,
  RECTRON: unknownCapabilityMap,
  MUSTEK: unknownCapabilityMap,
  AXIZ: unknownCapabilityMap,
};

const supplierNames: Record<SupplierCode, string> = {
  SCOOP: "Scoop Distribution",
  PINNACLE: "Pinnacle ICT",
  MIRO: "MiRO Distribution",
  RECTRON: "Rectron",
  MUSTEK: "Mustek",
  AXIZ: "Axiz",
  CJ: "CJdropshipping",
  MANUAL: "Manual sourcing",
};

function createPayload(order: BackendOrder, supplierOrder: SupplierOrder) {
  return {
    supplier: supplierOrder.supplierName,
    orderReference: order.orderNumber,
    submissionMode: supplierOrder.submissionMode,
    fulfilmentMode: supplierOrder.fulfilmentMode,
    shipTo:
      supplierOrder.fulfilmentMode === "SHIP_TO_CUSTOMER"
        ? order.deliveryAddress
        : "TekCentral operations",
    items: supplierOrder.itemLines.map((line) => ({
      ...(line.supplierSku ? { supplierSku: line.supplierSku } : {}),
      ...(line.supplierProductId ? { supplierProductId: line.supplierProductId } : {}),
      ...(line.supplierProductSku ? { supplierProductSku: line.supplierProductSku } : {}),
      ...(line.supplierVariantId ? { supplierVariantId: line.supplierVariantId } : {}),
      ...(line.supplierVariantSku ? { supplierVariantSku: line.supplierVariantSku } : {}),
      supplierSkuStatus: line.supplierSku ? "MAPPED" : "MAPPING_REQUIRED",
      customerSku: line.customerSku,
      description: line.description,
      quantity: line.quantity,
    })),
  };
}

export const supplierAdapters: Record<SupplierCode, SupplierAdapter> = Object.fromEntries(
  (Object.keys(supplierNames) as SupplierCode[]).map((code) => [
    code,
    {
      code,
      name: supplierNames[code],
      capabilityMap: supplierCapabilityMaps[code],
      getCapabilities: () => supplierCapabilityMaps[code],
      supportedOrderModes: code === "CJ" ? ["API"] : code === "SCOOP" ? ["EMAIL", "MANUAL"] : ["MANUAL"],
      capabilities:
        code === "SCOOP"
          ? {
              api: false,
              emailOrdering: true,
              portalOrdering: true,
              directShipping: true,
              feed: "CSV_XML",
              mockOnly: false,
              catalogueRead: true,
              stockRead: true,
            }
          : code === "CJ"
            ? {
                api: true,
                emailOrdering: false,
                portalOrdering: false,
                directShipping: false,
                feed: "UNKNOWN",
                mockOnly: true,
                catalogueRead: true,
                productSearch: true,
                productDetails: true,
                stockRead: true,
                realOrderPrepare: true,
                get realOrderSubmit() {
                  return process.env.CJ_REAL_ORDER_CREATION_ENABLED === "true";
                },
                payment: false,
                cancel: false,
                automaticFulfilment: false,
                realOrderCancel: false,
                realDispatch: false,
              }
          : unknownCapabilities,
      defaultSubmissionMode: code === "CJ" ? "API" : "MANUAL",
      defaultFulfilmentMode:
        code === "CJ" ? "PENDING_LOGISTICS" : code === "SCOOP" ? "SHIP_TO_CUSTOMER" : "MANUAL",
      createOrderPayload: createPayload,
      submitOrder: async (order, supplierOrder, scenario) => ({
        supplierReference:
          scenario === "REJECTED"
            ? undefined
            : `${code}-MOCK-${supplierOrder.id.split("-").at(-1) ?? "000001"}`,
        payloadPreview: createPayload(order, supplierOrder),
      }),
      getOrderStatus: (supplierOrder) => supplierOrder.status,
    },
  ]),
) as Record<SupplierCode, SupplierAdapter>;
