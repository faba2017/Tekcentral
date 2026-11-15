import { supplierAdapters } from "./mockSupplierAdapters.js";
import type { SupplierCode } from "./types.js";
import type { SupplierRegistryEntry } from "./supplierDomain.js";

export const supplierRegistry: Record<SupplierCode, SupplierRegistryEntry> = Object.fromEntries(
  (Object.keys(supplierAdapters) as SupplierCode[]).map((code) => {
    const adapter = supplierAdapters[code];
    return [
      code,
      {
        id: code,
        displayName: adapter.name,
        description: code === "TEKCENTRAL" ? "Internal manual offers with staff-maintained ZAR cost and stock evidence." : code === "CJ" ? "API catalogue, variant evidence, logistics and controlled order operations." : code === "SCOOP" ? "Reseller catalogue feed, local product evidence and assisted procurement." : code === "SYNTECH" ? "Secure reseller JSON feeds with content, dealer pricing, promotions and branch stock evidence." : code === "MUSTEK" ? "Controlled workbook, HTML catalogue and private marketing evidence sources." : code === "TVR" ? "Controlled commercial workbook evidence with a separately governed public enrichment source." : undefined,
        enabled: true,
        supportedOrderModes: adapter.supportedOrderModes,
        defaultOrderMode: code === "SYNTECH" ? "MANUAL" : adapter.supportedOrderModes[0] ?? "MANUAL",
        capabilities: adapter.getCapabilities(),
        adapterAvailable: Boolean(adapter),
        configurationSource: code === "CJ" || code === "SYNTECH" ? "ENVIRONMENT" : code === "SCOOP" || code === "MUSTEK" || code === "TVR" ? "FEED" : "INTERNAL",
        procurement: code === "TEKCENTRAL"
          ? { mode: "INTERNAL_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Controlled internal stock reservation and staff fulfilment." }
          : code === "CJ"
          ? { mode: "API_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Staff-controlled unpaid CJ order creation with downstream manual payment and fulfilment controls." }
          : code === "SCOOP"
          ? { mode: "MANUAL_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Approved manual reseller-portal procurement." }
          : code === "SYNTECH"
          ? { mode: "MANUAL_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Approved manual reseller-portal fallback; production API ordering is disabled." }
          : code === "MUSTEK"
          ? { mode: "MANUAL_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Approved manual supplier procurement with staff-recorded external reference." }
          : code === "TVR"
          ? { mode: "MANUAL_SUPPORTED", operationallyAccepted: true, automatic: false, description: "Approved manual supplier procurement with staff-recorded external reference." }
          : { mode: "UNSUPPORTED", operationallyAccepted: false, automatic: false, description: "No approved production procurement path." },
        ...(code === "SCOOP"
          ? {
              manualProcurementUrl: "https://scoop.co.za/products/wired-networking/routing/",
              operationalChannel: "Scoop reseller portal",
            }
          : {}),
      },
    ];
  }),
) as Record<SupplierCode, SupplierRegistryEntry>;

export function getSupplierRegistryEntry(code: SupplierCode) {
  return supplierRegistry[code];
}

export function getSupplierDisplayName(code: SupplierCode) {
  return getSupplierRegistryEntry(code)?.displayName ?? code;
}

export const operationalSupplierIds = ["TEKCENTRAL", "CJ", "SCOOP", "SYNTECH", "MUSTEK", "TVR"] as const;
