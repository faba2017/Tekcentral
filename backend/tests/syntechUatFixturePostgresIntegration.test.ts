import assert from "node:assert/strict";
import { Pool } from "pg";
import type { BackendOrder, SupplierOrder } from "../types.js";
import type { SyntechCatalogueProduct } from "../suppliers/syntech/syntechTypes.js";

if (process.env.RUN_SYNTECH_UAT_FIXTURE_INTEGRATION !== "1") {
  console.log("Syntech UAT fixture PostgreSQL integration skipped.");
  process.exit(0);
}

const sourceDatabaseUrl = process.env.DATABASE_URL;
const fixtureDatabaseUrl = process.env.SYNTECH_UAT_FIXTURE_DATABASE_URL;
if (!sourceDatabaseUrl || !fixtureDatabaseUrl) {
  throw new Error("DATABASE_URL and SYNTECH_UAT_FIXTURE_DATABASE_URL are required.");
}
if (sourceDatabaseUrl === fixtureDatabaseUrl) {
  throw new Error("The Syntech UAT fixture database must be isolated from the source database.");
}

const sourcePool = new Pool({ connectionString: sourceDatabaseUrl, max: 1 });
const sourceRows = await sourcePool.query<{ payload: SyntechCatalogueProduct }>(
  "SELECT payload FROM catalogue_supplier_offers WHERE supplier_code='SYNTECH' ORDER BY supplier_identity",
);
await sourcePool.end();

const sourceProduct = sourceRows.rows
  .map((row) => row.payload)
  .filter((product) =>
    product.sourcePresence === "ACTIVE"
    && typeof product.effectiveDealerCostExVat === "number"
    && product.effectiveDealerCostExVat > 0
    && typeof product.totalStock === "number"
    && product.totalStock >= 1,
  )
  .sort((left, right) => left.effectiveDealerCostExVat! - right.effectiveDealerCostExVat!)[0];
assert.ok(sourceProduct, "A current in-stock Syntech feed row is required for the isolated fixture.");

process.env.DATABASE_URL = fixtureDatabaseUrl;
process.env.PERSISTENCE_PROVIDER = "POSTGRES";
process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED = "false";

const [{ closePostgres }, { syncSyntechProducts }, { saveInternalProduct }, { saveSupplierProductMapping }, { saveOrder }, { saveSupplierOrder, getSupplierOrder }, orderAdapter] = await Promise.all([
  import("../persistence/postgres.js"),
  import("../suppliers/syntech/syntechCatalogueRepository.js"),
  import("../internalProductRepository.js"),
  import("../supplierProductMappingRepository.js"),
  import("../orderRepository.js"),
  import("../supplierOrderRepository.js"),
  import("../suppliers/syntech/syntechOrderAdapter.js"),
]);

const observedAt = sourceProduct.observedAt;
const checkedAt = new Date(Date.parse(observedAt) + 60_000);
const safeSku = sourceProduct.supplierSku.replace(/[^A-Za-z0-9-]/g, "-").toLowerCase();
const offerId = `SYNTECH:${sourceProduct.supplierSku}`;

await syncSyntechProducts({
  type: "FULL",
  expectedCount: 1,
  parsedCount: 1,
  currency: sourceProduct.currency,
  products: [sourceProduct],
  observedAt,
});
const product = await saveInternalProduct({
  slug: `syntech-uat-fixture-${safeSku}`,
  sku: `UAT-${sourceProduct.supplierSku}`,
  name: sourceProduct.name ?? `Syntech ${sourceProduct.supplierSku}`,
  brand: sourceProduct.brand ?? "Syntech feed fixture",
  category: "Accessories",
  categorySlug: "accessories",
  shortDescription: "Isolated non-production Syntech UAT acceptance fixture.",
  images: [],
  publicationStatus: "INTERNAL_DRAFT",
  provenance: {
    createdFromSupplierOffer: true,
    sourceSupplier: "SYNTECH",
    sourceSupplierOfferId: offerId,
    sourceSupplierSku: sourceProduct.supplierSku,
    sourceDescription: sourceProduct.name ?? sourceProduct.supplierSku,
  },
});
const mapping = await saveSupplierProductMapping({
  productId: product.id,
  supplierCode: "SYNTECH",
  supplierSku: sourceProduct.supplierSku,
  supplierOfferId: offerId,
  status: "VERIFIED",
  verifiedBy: "SYNTECH_UAT_FIXTURE_SYSTEM",
  verifiedAt: checkedAt.toISOString(),
  source: "Isolated acceptance fixture derived from exact current Syntech feed identity",
});

const orderNumber = "TC-UAT-SYNTECH-000001";
const supplierOrderId = "SO-SYNTECH-UAT-000001";
const unitCost = sourceProduct.effectiveDealerCostExVat;
if (typeof unitCost !== "number") throw new Error("Selected Syntech fixture evidence has no dealer cost.");
const order: BackendOrder = {
  id: "order-syntech-uat-000001",
  orderNumber,
  createdAt: checkedAt.toISOString(),
  updatedAt: checkedAt.toISOString(),
  customer: {
    firstName: "Syntech",
    lastName: "UAT Fixture",
    email: "syntech-uat@example.invalid",
    mobile: "0820000000",
  },
  deliveryAddress: {
    streetAddress: "1 Acceptance Fixture Road",
    suburb: "Test Suburb",
    city: "Cape Town",
    province: "Western Cape",
    postalCode: "8000",
    country: "South Africa",
  },
  deliveryMethod: { id: "uat-delivery", name: "UAT delivery", description: "Non-production fixture", estimatedRange: "Not applicable", price: 0, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Isolated fixture only", settlementNote: "No PayFast call was made.", enabled: true },
  payment: { provider: "payfast", status: "PAID", paymentReference: "UAT-NO-PAYMENT-TRANSACTION", updatedAt: checkedAt.toISOString(), processedItnIds: [] },
  items: [{
    productId: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    quantity: 1,
    unitPrice: unitCost,
    lineTotal: unitCost,
    costBasis: {
      status: "COMPLETE",
      evaluatedAt: checkedAt.toISOString(),
      capturedAt: checkedAt.toISOString(),
      productId: product.id,
      productSku: product.sku,
      quantity: 1,
      supplierId: "SYNTECH",
      supplierOfferId: offerId,
      mappingId: mapping.id,
      sourceCurrency: sourceProduct.currency,
      sourceUnitCost: unitCost,
      fxStatus: "NOT_REQUIRED",
      normalizedUnitCostZar: unitCost,
      normalizedLineCostZar: unitCost,
      customerUnitPriceInclVat: unitCost,
      customerLineTotalInclVat: unitCost,
      vatRatePercent: 15,
      vatAmount: 0,
      revenueExVat: unitCost,
      costEvidenceObservedAt: observedAt,
      sourceFingerprint: sourceProduct.sourceFingerprint,
      sourceReference: offerId,
    },
  }],
  subtotal: unitCost,
  deliveryAmount: 0,
  taxAmount: 0,
  total: unitCost,
  currency: "ZAR",
  status: "PROCESSING",
  statusHistory: [{ status: "PROCESSING", label: "UAT fixture", createdAt: checkedAt.toISOString() }],
  returns: [],
  refunds: [],
  operationalHold: { active: false },
};
await saveOrder(order);

const supplierOrder: SupplierOrder = {
  id: supplierOrderId,
  customerOrderNumber: orderNumber,
  supplierCode: "SYNTECH",
  supplierName: "Syntech",
  allocationIds: ["allocation-syntech-uat-000001"],
  itemLines: [{
    orderItemId: product.id,
    productId: product.id,
    supplierSku: sourceProduct.supplierSku,
    supplierOfferId: offerId,
    customerSku: product.sku,
    description: product.name,
    quantity: 1,
    unitCost,
    costCurrency: sourceProduct.currency,
    costExcludesVat: true,
    expectedMerchandiseCost: unitCost,
    costCapturedAt: observedAt,
    costSourceOfferId: offerId,
    normalizedUnitCostZar: unitCost,
    sourceUnitCost: unitCost,
    sourceCurrency: sourceProduct.currency,
    costEvidenceObservedAt: observedAt,
    costSourceFingerprint: sourceProduct.sourceFingerprint,
    mappingId: mapping.id,
    sellingPriceSnapshot: unitCost,
    normalDealerCostExVat: sourceProduct.normalDealerCostExVat,
    promoPriceExVat: sourceProduct.promoPriceExVat,
    promotionActive: sourceProduct.promotionActive,
  }],
  status: "APPROVED",
  createdAt: checkedAt.toISOString(),
  updatedAt: checkedAt.toISOString(),
  approvedAt: checkedAt.toISOString(),
  submissionMode: "API",
  fulfilmentMode: "SHIP_TO_CUSTOMER",
  supplierSubtotal: unitCost,
  supplierDeliveryCost: null,
  supplierTotalCost: unitCost,
  mockSubmissions: [],
  events: [{ timestamp: checkedAt.toISOString(), type: "SYNTECH_UAT_FIXTURE_APPROVED", description: "Approved isolated non-production acceptance fixture." }],
};
await saveSupplierOrder(supplierOrder);

const preflight = await orderAdapter.prepareSyntechOrderPreflight({ supplierOrderId, shipping: { type: "DELIVERY" }, now: checkedAt });
assert.equal(preflight.status, "READY_FOR_CONTROLLED_UAT");
assert.deepEqual(preflight.blockers, []);
assert.equal(preflight.featureEnabled, false);
assert.equal(preflight.submissionBlockers.includes("Syntech UAT writes are disabled."), true);
assert.equal(preflight.lines[0]?.supplierSku, sourceProduct.supplierSku);
assert.equal(preflight.lines[0]?.quantity, 1);
assert.ok((preflight.lines[0]?.totalStock ?? 0) >= 1);

let externalPostCount = 0;
await assert.rejects(
  orderAdapter.createSyntechUatOrder({
    supplierOrderId,
    shipping: { type: "DELIVERY" },
    confirmed: true,
    actor: "Syntech UAT Fixture System",
    auditActor: { actorType: "SYSTEM", actorLabel: "Syntech UAT Fixture System", actorRole: "SYSTEM" },
    fetchImpl: (async () => { externalPostCount += 1; throw new Error("External network must not be reached."); }) as typeof fetch,
    now: checkedAt,
  }),
  (error) => error instanceof orderAdapter.SyntechOrderError && error.code === "UAT_WRITES_DISABLED",
);
assert.equal(externalPostCount, 0);
const persisted = await getSupplierOrder(supplierOrderId);
assert.equal(persisted?.status, "APPROVED");
assert.equal(persisted?.externalSubmission, undefined);

console.log(JSON.stringify({
  fixture: "SYNTECH_UAT_ISOLATED_POSTGRES",
  supplierOrderId,
  orderNumber,
  productId: product.id,
  supplierSku: sourceProduct.supplierSku,
  quantity: 1,
  preflight: preflight.status,
  commercialEvidence: "CURRENT_SYNTECH_FEED",
  stock: "SUFFICIENT",
  writeFlag: "OFF",
  externalPostCount,
}));
await closePostgres();
