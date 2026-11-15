import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import { buildReport, lineProfitability, reportCsv, reportXlsx, summarizeProfitability } from "../analyticsService.js";
import { toCustomerOrder } from "../customerOrderView.js";
import { saveFxQuote } from "../fxRateRepository.js";
import { createInitialCostBasis, finalizeCostBasis, resolveSelectedSupplierCost } from "../orderCostBasis.js";
import { saveOrder } from "../orderRepository.js";
import { getOrder } from "../orderRepository.js";
import { createSupplierAllocation } from "../adminOperations.js";
import { approveSupplierOrder, generateSupplierOrders } from "../supplierOrchestration.js";
import { saveSupplierProductMapping } from "../supplierProductMappingRepository.js";
import { saveCjCatalogueProduct } from "../suppliers/cj/cjCatalogueRepository.js";
import { syncScoopCatalogueProducts } from "../suppliers/scoop/scoopCatalogueRepository.js";
import type { BackendOrder, BackendOrderItem, SupplierOrderLine } from "../types.js";

const now = "2026-10-13T10:00:00.000Z";
const item: BackendOrderItem = { productId: "profit-product", slug: "profit-product", sku: "TC-PROFIT", name: "Profit Product", brand: "TekCentral", quantity: 2, unitPrice: 575, lineTotal: 1150 };
const initial = createInitialCostBasis(item, 15, now);
assert.equal(initial.status, "UNAVAILABLE"); assert.equal(initial.revenueExVat, 1000); assert.equal(initial.vatAmount, 150);
const line: SupplierOrderLine = { orderItemId: item.productId, productId: item.productId, supplierSku: "SUP-1", supplierOfferId: "SCOOP:SUP-1", mappingId: "mapping-1", description: item.name, quantity: 2, unitCost: 300, normalizedUnitCostZar: 300, sourceUnitCost: 300, sourceCurrency: "ZAR", costEvidenceObservedAt: now, costSourceFingerprint: "evidence-1", sellingPriceSnapshot: item.unitPrice };
const complete = finalizeCostBasis({ ...item, costBasis: initial }, line, "SCOOP", "2026-10-13T11:00:00.000Z");
assert.equal(complete.status, "COMPLETE"); assert.equal(complete.normalizedLineCostZar, 600); assert.equal(complete.grossProfit, 400); assert.equal(complete.grossMarginPercent, 40); assert.equal(complete.fxStatus, "NOT_REQUIRED");
const immutable = finalizeCostBasis({ ...item, unitPrice: 9999, costBasis: complete }, { ...line, normalizedUnitCostZar: 900 }, "SCOOP", "2026-10-14T00:00:00.000Z");
assert.deepEqual(immutable, complete);

const baseOrder: BackendOrder = {
  id: "cost-order", orderNumber: "TC-COST-001", createdAt: now, updatedAt: now,
  customer: { firstName: "Cost", lastName: "Test", email: "cost@example.test", mobile: "0821234567" },
  deliveryAddress: { streetAddress: "Test", suburb: "Test", city: "Cape Town", province: "Western Cape", postalCode: "8000", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Delivery", estimatedRange: "2-5 days", price: 100, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Test", enabled: true },
  payment: { provider: "payfast", status: "PAID", paymentReference: "PF-COST", confirmedAt: now, updatedAt: now, processedItnIds: [] },
  items: [{ ...item, costBasis: complete }], subtotal: 1150, deliveryAmount: 100, taxAmount: 163.04, total: 1250, currency: "ZAR", status: "PROCESSING", statusHistory: [], returns: [], refunds: [],
};
assert.equal(lineProfitability(baseOrder, baseOrder.items[0]).grossProfit, 400);
const partialRefundOrder: BackendOrder = { ...baseOrder, refunds: [{ id: "refund-part", orderId: baseOrder.id, items: [{ productId: item.productId, name: item.name, quantity: 1, unitPrice: 575, lineTotal: 575 }], amount: 575, status: "REFUNDED", createdAt: now, updatedAt: now }] };
assert.deepEqual({ profit: lineProfitability(partialRefundOrder, partialRefundOrder.items[0]).grossProfit, margin: lineProfitability(partialRefundOrder, partialRefundOrder.items[0]).grossMarginPercent }, { profit: 200, margin: 40 });
const fullRefundOrder: BackendOrder = { ...baseOrder, refunds: [{ id: "refund-full", orderId: baseOrder.id, items: [{ productId: item.productId, name: item.name, quantity: 2, unitPrice: 575, lineTotal: 1150 }], amount: 1150, status: "REFUNDED", createdAt: now, updatedAt: now }] };
assert.equal(lineProfitability(fullRefundOrder, fullRefundOrder.items[0]).grossProfit, 0);
const unattributedRefundOrder: BackendOrder = { ...baseOrder, refunds: [{ id: "refund-unknown", orderId: baseOrder.id, amount: 100, status: "REFUNDED", createdAt: now, updatedAt: now }] };
assert.equal(lineProfitability(unattributedRefundOrder, unattributedRefundOrder.items[0]).status, "PARTIAL");
const oldOrder: BackendOrder = { ...baseOrder, id: "old-order", orderNumber: "TC-OLD-001", items: [{ ...item, costBasis: undefined }] };
assert.equal(summarizeProfitability([oldOrder]).coveragePercent, 0);
assert.equal((toCustomerOrder(baseOrder).items[0] as Record<string, unknown>).costBasis, undefined);

const originalCwd = cwd(); const tempDir = await mkdtemp(join(tmpdir(), "tekcentral-cost-basis-test-"));
try {
  chdir(tempDir);
  await syncScoopCatalogueProducts({ products: [{ supplierId: "SCOOP", supplierSku: "SUP-1", description: "Scoop cost fixture", branchStock: { CPT: 1 }, totalStock: 1, availability: "AVAILABLE", dealerPriceExVat: 300, dealerVatAmount: 45, dealerPriceInclVat: 345, retailPriceInclVat: 575, currency: "ZAR", vatRate: 0.15, priceSemantics: { dealerPrice: "EXCLUDING_VAT", retailPrice: "INCLUDING_VAT" }, sourceMetadata: { feedUrl: "https://example.test/feed.xml", sourceFields: {} }, sourceObservations: [{ sourceType: "XML_FEED", sourceReference: "feed", firstSeenAt: now, lastSeenAt: now, lastSuccessfulRefreshAt: now, active: true, fields: {} }], reconciliationStatus: "XML_ONLY", lastSyncedAt: now }] });
  const scoopMapping = await saveSupplierProductMapping({ productId: item.productId, supplierCode: "SCOOP", supplierSku: "SUP-1", supplierOfferId: "SCOOP:SUP-1", status: "VERIFIED" });
  const scoopCost = await resolveSelectedSupplierCost("SCOOP", scoopMapping); assert.equal(scoopCost?.normalizedUnitCostZar, 300); assert.equal(scoopCost?.sourceCurrency, "ZAR");
  await saveFxQuote({ sourceCurrency: "USD", targetCurrency: "ZAR", rate: 18, provider: "TEST_PROVIDER", effectiveAt: now, fetchedAt: new Date().toISOString(), sourceReference: "test-rate" });
  await saveCjCatalogueProduct({ supplierCode: "CJ", supplierProductId: "PID-COST", supplierSku: "CJ-PRODUCT", supplierProductName: "CJ Cost Product", currency: "USD", variants: [{ supplierVariantId: "VID-COST", supplierVariantSku: "CJ-VARIANT", currency: "USD", costEvidence: { amount: 10, currency: "USD", sourceField: "staffConfirmedProcurementCost", endpoint: "CJ evidence", classification: "PROCUREMENT_COST", confidence: "HIGH", capturedAt: now, sourceFingerprint: "cj-cost-fingerprint" } }], importedAt: now, rawSourceFingerprint: "cj-product-fingerprint" });
  const cjProductId = "profit-product-cj";
  const cjMapping = await saveSupplierProductMapping({ productId: cjProductId, supplierCode: "CJ", supplierSku: "CJ-VARIANT", supplierOfferId: "CJ:PID-COST:VID-COST", supplierProductId: "PID-COST", supplierVariantId: "VID-COST", status: "VERIFIED" });
  const cjCost = await resolveSelectedSupplierCost("CJ", cjMapping); assert.equal(cjCost?.sourceUnitCost, 10); assert.equal(cjCost?.normalizedUnitCostZar, 180); assert.equal(cjCost?.fxRate, 18); assert.equal(cjCost?.fxProvider, "TEST_PROVIDER");
  const cjItem: BackendOrderItem = { ...item, productId: cjProductId, slug: cjProductId, sku: "TC-CJ", name: "CJ Profit Product", quantity: 1, unitPrice: 345, lineTotal: 345 };
  const allocationOrder: BackendOrder = { ...baseOrder, id: "allocation-cost", orderNumber: "TC-COST-ALLOCATION", items: [{ ...item, costBasis: initial }, { ...cjItem, costBasis: createInitialCostBasis(cjItem, 15, now) }], subtotal: 1495, total: 1595 };
  await saveOrder(allocationOrder);
  await createSupplierAllocation({ orderNumber: allocationOrder.orderNumber, orderItemIds: [item.productId], supplierCode: "SCOOP" });
  await createSupplierAllocation({ orderNumber: allocationOrder.orderNumber, orderItemIds: [cjProductId], supplierCode: "CJ" });
  const generated = await generateSupplierOrders(allocationOrder.orderNumber); assert.equal(generated?.length, 2); assert.equal((await getOrder(allocationOrder.orderNumber))?.items.every((entry) => entry.costBasis?.status === "UNAVAILABLE"), true);
  for (const supplierOrder of generated ?? []) await approveSupplierOrder(supplierOrder.id);
  const captured = await getOrder(allocationOrder.orderNumber); assert.equal(captured?.items.find((entry) => entry.productId === item.productId)?.costBasis?.supplierId, "SCOOP"); assert.equal(captured?.items.find((entry) => entry.productId === cjProductId)?.costBasis?.supplierId, "CJ"); assert.equal(captured?.items.every((entry) => entry.costBasis?.status === "COMPLETE"), true);
  await saveOrder(baseOrder); await saveOrder(oldOrder); await saveOrder({ ...baseOrder, id: "cancelled", orderNumber: "TC-CANCELLED-COST", status: "CANCELLED" });
  const report = await buildReport({ report: "profitability", period: "THIS_YEAR", all: true });
  assert.equal(report.rows.some((entry) => entry.orderNumber === baseOrder.orderNumber && entry.grossProfit === 400), true); assert.equal(report.rows.some((entry) => entry.orderNumber === oldOrder.orderNumber && entry.costBasisStatus === "UNAVAILABLE"), true); assert.equal(report.rows.some((entry) => entry.orderNumber === "TC-CANCELLED-COST"), false);
  assert.equal(reportCsv(report).includes("grossProfit"), true); assert.equal(reportXlsx(report).subarray(0, 2).toString(), "PK");
} finally { chdir(originalCwd); await rm(tempDir, { recursive: true, force: true }); }
console.log("Order cost-basis tests passed.");
