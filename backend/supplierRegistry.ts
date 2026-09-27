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
        enabled: true,
        supportedOrderModes: adapter.supportedOrderModes,
        defaultOrderMode: adapter.supportedOrderModes[0] ?? "MANUAL",
        capabilities: adapter.getCapabilities(),
        adapterAvailable: Boolean(adapter),
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
