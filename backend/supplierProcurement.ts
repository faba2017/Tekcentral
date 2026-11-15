import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { supplierRegistry } from "./supplierRegistry.js";
import type { SupplierCode } from "./types.js";

export const PROCUREMENT_UNAVAILABLE_MESSAGE = "This item is temporarily unavailable for purchase.";

export function supplierProcurementDecision(supplierCode: SupplierCode) {
  const policy = supplierRegistry[supplierCode]?.procurement;
  const viable = policy ? procurementViability([policy]) : false;
  return { supplierCode, viable, mode: policy?.mode ?? "UNSUPPORTED", automatic: policy?.automatic ?? false, description: policy?.description ?? "No approved production procurement path." };
}

export function procurementViability(paths: Array<{ operationallyAccepted: boolean; mode: "API_SUPPORTED" | "MANUAL_SUPPORTED" | "INTERNAL_SUPPORTED" | "UNSUPPORTED" }>) {
  return paths.some((path) => path.operationallyAccepted && path.mode !== "UNSUPPORTED");
}

export async function productProcurementDecision(productId: string) {
  const mappings = (await listSupplierProductMappings()).filter((mapping) => mapping.productId === productId && mapping.status === "VERIFIED");
  const paths = mappings.map((mapping) => supplierProcurementDecision(mapping.supplierCode));
  return { productId, viable: paths.some((path) => path.viable), paths };
}
