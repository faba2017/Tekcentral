import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import { buildReport, getDashboard, reportCsv, reportFilename, reportXlsx, resolveDateRange, summarizeOrderFinancials } from "../analyticsService.js";
import { saveOrder } from "../orderRepository.js";
import type { BackendOrder } from "../types.js";

const paidOrder: BackendOrder = {
  id: "analytics-paid", orderNumber: "TC-ANALYTICS-001", createdAt: "2026-09-05T08:00:00.000Z", updatedAt: "2026-09-06T08:00:00.000Z",
  customer: { firstName: "Report", lastName: "Customer", email: "report@example.test", mobile: "0821234567" },
  deliveryAddress: { streetAddress: "Test", suburb: "Test", city: "Cape Town", province: "Western Cape", postalCode: "8000", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Delivery", estimatedRange: "2-5 days", price: 100, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Test", enabled: true },
  payment: { provider: "payfast", status: "PAID", paymentReference: "PF-1", confirmedAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", processedItnIds: [] },
  items: [{ productId: "snapshot-product", slug: "snapshot-product", sku: "SNAP-1", name: "Historical Snapshot Name", brand: "Snapshot Brand", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, deliveryAmount: 100, taxAmount: 143.48, total: 1100, currency: "ZAR", status: "CONFIRMED", statusHistory: [],
  returns: [{ id: "return-1", orderId: "analytics-paid", items: [], reason: "Test return", createdAt: "2026-09-20T08:00:00.000Z", status: "REQUESTED" }],
  refunds: [{ id: "refund-1", orderId: "analytics-paid", items: [{ productId: "snapshot-product", name: "Historical Snapshot Name", quantity: 1, unitPrice: 500, lineTotal: 500 }], amount: 110, status: "REFUNDED", createdAt: "2026-09-21T08:00:00.000Z", updatedAt: "2026-09-21T08:00:00.000Z" }],
};
const pendingOrder: BackendOrder = { ...paidOrder, id: "analytics-pending", orderNumber: "TC-ANALYTICS-002", payment: { ...paidOrder.payment, status: "PENDING", confirmedAt: undefined, paymentReference: "PF-2" }, status: "PENDING", returns: [], refunds: [] };

const reportingNow = new Date("2026-10-13T22:30:00.000Z");
assert.deepEqual(resolveDateRange({ period: "TODAY" }, reportingNow), { period: "TODAY", from: "2026-10-13T22:00:00.000Z", to: "2026-10-14T21:59:59.999Z", timezone: "Africa/Johannesburg" });
assert.equal(resolveDateRange({ period: "YESTERDAY" }, reportingNow).from, "2026-10-12T22:00:00.000Z");
assert.equal(resolveDateRange({ period: "LAST_7_DAYS" }, reportingNow).from, "2026-10-07T22:00:00.000Z");
assert.equal(resolveDateRange({ period: "CUSTOM", from: "2026-09-01", to: "2026-09-30" }).to, "2026-09-30T21:59:59.999Z");
assert.throws(() => resolveDateRange({ period: "CUSTOM", from: "2026-10-02", to: "2026-10-01" }), /Invalid report date range/);
const financialSummary = summarizeOrderFinancials([paidOrder]);
assert.deepEqual({ gross: financialSummary.grossRevenue, refunds: financialSummary.refunds, net: financialSummary.netRevenue, aov: financialSummary.averageOrderValue }, { gross: 1100, refunds: 110, net: 990, aov: 1100 });
assert.equal(financialSummary.refundedVat, 14.35);

const originalCwd = cwd(); const tempDir = await mkdtemp(join(tmpdir(), "tekcentral-analytics-test-"));
try {
  chdir(tempDir); await saveOrder(paidOrder); await saveOrder(pendingOrder);
  const range = { period: "CUSTOM" as const, from: "2026-09-01", to: "2026-09-30" };
  const sales = await buildReport({ report: "sales", ...range, page: 1, pageSize: 1 });
  assert.equal(sales.pagination.totalRows, 1); assert.equal(sales.summary.netRevenue, 990);
  const orders = await buildReport({ report: "orders", ...range, all: true });
  assert.equal(orders.pagination.totalRows, 2); assert.equal(orders.rows.some((row) => row.paymentStatus === "PENDING"), true);
  const products = await buildReport({ report: "products", ...range, all: true });
  assert.equal(products.rows[0].product, "Historical Snapshot Name"); assert.equal(products.rows[0].unitsSold, 2); assert.equal(products.rows[0].netRevenue, 500);
  const returns = await buildReport({ report: "returns", ...range, all: true });
  assert.equal(returns.rows.length, 2); assert.equal(returns.summary.refundedValue, 110);
  const payments = await buildReport({ report: "payments", ...range, gateway: "PAYFAST", all: true });
  assert.equal(payments.rows.length, 2); assert.equal(payments.rows.every((row) => row.gateway === "PAYFAST"), true); assert.equal(payments.rows.every((row) => row.gatewayInstance === "PAYFAST:LEGACY"), true);
  const suppliers = await buildReport({ report: "suppliers", ...range, all: true }); assert.equal(suppliers.rows.length, 6);
  const fx = await buildReport({ report: "fx", ...range, classification: "REVIEW", all: true }); assert.equal(fx.rows.every((row) => row.classification === "REVIEW"), true);
  const vat = await buildReport({ report: "vat", ...range, all: true }); assert.equal(vat.summary.vatAmount, 143.48); assert.equal(vat.summary.refundedVat, 14.35); assert.equal(vat.summary.netVat, 129.13);
  const csv = reportCsv(payments); assert.equal(csv.includes('"Filter: gateway","PAYFAST"'), true);
  assert.equal(reportXlsx(payments).subarray(0, 2).toString(), "PK");
  assert.equal(reportFilename("sales", sales.range, "xlsx"), "tekcentral-sales-2026-09-01-to-2026-09-30.xlsx");
  const dashboard = await getDashboard("THIS_YEAR"); assert.equal(dashboard.kpis.orders, 2); assert.equal(dashboard.kpis.grossProfit.available, false); assert.equal(dashboard.suppliers.length, 6);
} finally { chdir(originalCwd); await rm(tempDir, { recursive: true, force: true }); }

const reportsSource = readFileSync(join(originalCwd, "src/pages/admin/AdminReportsPage.tsx"), "utf8");
const dashboardSource = readFileSync(join(originalCwd, "src/pages/admin/AdminDashboardPage.tsx"), "utf8");
const pricingSource = readFileSync(join(originalCwd, "src/pages/admin/AdminPricingSettingsPage.tsx"), "utf8");
const productsSource = readFileSync(join(originalCwd, "src/pages/admin/AdminProductsPage.tsx"), "utf8");
const tableSource = readFileSync(join(originalCwd, "src/components/admin/AdminTable.tsx"), "utf8");
const imageResolverSource = readFileSync(join(originalCwd, "src/lib/admin-product-image.ts"), "utf8");
const analyticsSource = readFileSync(join(originalCwd, "backend/analyticsService.ts"), "utf8");
assert.equal(reportsSource.includes("useSearchParams"), true); assert.equal(reportsSource.includes("Export CSV"), true); assert.equal(reportsSource.includes("Export Excel"), true); assert.equal(reportsSource.includes("<AdminPagination"), true);
assert.equal(dashboardSource.includes('/admin/products?view=attention'), true); assert.equal(dashboardSource.includes('/admin/supplier-orders?attention=true'), true); assert.equal(dashboardSource.includes(': "Unavailable"'), true);
assert.equal(pricingSource.includes('"Needs Approval"'), true); assert.equal(pricingSource.includes("<AdminTable"), true); assert.equal(pricingSource.includes("<AdminPagination"), true); assert.equal(pricingSource.includes('to="/admin/settings/pricing"'), true);
assert.equal(pricingSource.includes('role="dialog"'), true); assert.equal(pricingSource.includes('aria-modal="true"'), true); assert.equal(pricingSource.includes('event.key === "Escape"'), true); assert.equal(pricingSource.includes('selected ? "Reviewing" : "Review"'), true); assert.equal(pricingSource.includes('sm:w-[min(92vw,760px)]'), true);
assert.equal(pricingSource.includes('params.get("proposal")'), true); assert.equal(pricingSource.includes("reviewTrigger.current?.focus()"), true); assert.equal(pricingSource.includes("if (selectedId === proposalId) return"), true);
assert.equal(productsSource.includes("Legacy record · No canonical Product"), true);
assert.equal(/>\s*Details\s*</.test(productsSource), true);
assert.equal(productsSource.includes("publicationActionAvailable ?"), false);
assert.equal(imageResolverSource.includes('/api/public/assets/products/'), true); assert.equal(imageResolverSource.includes("apiBaseUrl"), true);
assert.equal(tableSource.includes("resolveAdminProductImageUrl"), true); assert.equal(tableSource.includes("onError={() => setFailed(true)}"), true); assert.equal(tableSource.includes("primaryTitle"), true);
assert.equal(analyticsSource.includes('/admin/pricing?view=fx'), true);
console.log("Analytics backend tests passed.");
