import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSyntechOrderPayload,
  deriveSyntechApiProcurementState,
  isSyntechMaintenanceWindow,
  mapSyntechRcError,
  normalizeSyntechCreateResponse,
  syntechResellerApiConfiguration,
  SyntechOrderError,
  validateSyntechUatBaseUrl,
} from "../suppliers/syntech/syntechOrderAdapter.js";
import type { BackendOrder } from "../types.js";

const order = {
  customer: { firstName: "Test", lastName: "Customer", email: "test@example.test", mobile: "0821234567" },
  deliveryAddress: { streetAddress: "1 Test Road", suburb: "Test", city: "Cape Town", province: "Western Cape", postalCode: "8000", country: "South Africa" },
} as BackendOrder;

const supplierOrderPage = await readFile("src/pages/admin/AdminSupplierOrderDetailPage.tsx", "utf8");
const supplierWorkspacePage = await readFile("src/pages/admin/AdminSupplierWorkspacePage.tsx", "utf8");
const adapterSource = await readFile("backend/suppliers/syntech/syntechOrderAdapter.ts", "utf8");
const settingsSource = await readFile("backend/businessSettingsRepository.ts", "utf8");
const serverSource = await readFile("backend/server.ts", "utf8");
const repositorySource = await readFile("backend/supplierOrderRepository.ts", "utf8");
const postgresSource = await readFile("backend/persistence/commerceRepository.ts", "utf8");
const authorizationSource = await readFile("backend/adminAuthorizationPolicy.ts", "utf8");
assert.match(supplierOrderPage, /Syntech automatic ordering is not yet enabled/);
assert.match(supplierOrderPage, /Place this order manually in the Syntech reseller portal, then record the supplier order reference\./);
assert.match(supplierOrderPage, /isSyntechOrder && !syntechUatEnabled/);
assert.match(supplierOrderPage, /isSyntechOrder && syntechUatEnabled/);
assert.match(supplierOrderPage, /Manual procurement remains available/);
assert.match(supplierOrderPage, /existing Syntech UAT order reference was reused/);
assert.match(adapterSource, /claimSupplierOrderSubmission/);
assert.match(adapterSource, /status === "UNKNOWN_RESULT"/);
assert.match(adapterSource, /bestEffortAlert/);
assert.match(adapterSource, /recordAdminAuditBestEffort/);
assert.match(repositorySource, /claimPostgresSupplierOrderSubmission/);
assert.match(postgresSource, /FOR UPDATE/);
assert.match(postgresSource, /state:"REUSED"/);
assert.match(postgresSource, /state:"BLOCKED"/);
assert.match(authorizationSource, /supplier_orders\.retry_api/);
assert.match(authorizationSource, /syntech\\\/create/);
assert.match(supplierWorkspacePage, /Syntech API procurement/);
assert.match(supplierWorkspacePage, /ConfirmationModal/);
assert.match(supplierWorkspacePage, /Manual fallback/);
assert.match(supplierWorkspacePage, /api\/admin\/suppliers\/syntech\/settings\/api-procurement/);
assert.match(settingsSource, /syntechApiProcurementEnabled/);
assert.match(serverSource, /SYNTECH_API_PROCUREMENT_SWITCH_CHANGED/);
assert.match(serverSource, /staffAuditActor\(staff/);

const delivery = buildSyntechOrderPayload({ reference: "TC-1-SO-SYNTECH-1", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "AP1300", quantity: 2 }] });
assert.equal(delivery.backorder, "no");
assert.equal(delivery.reference, "TC-1-SO-SYNTECH-1");
assert.deepEqual(delivery.lineitems, { AP1300: 2 });
assert.equal(delivery.shipping.type, "delivery");
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order, lines: [] }), /At least one valid Syntech line/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "", quantity: 1 }] }), /exact bounded SKU/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "SKU", quantity: 0 }] }), /positive whole quantity/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "SKU", quantity: 1_000 }] }), /no greater than 999/);
assert.throws(() => buildSyntechOrderPayload({ reference: "browser supplied reference!", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "SKU", quantity: 1 }] }), /server-owned Syntech reference/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order: { ...order, deliveryAddress: { ...order.deliveryAddress, streetAddress: "x".repeat(181) } } as BackendOrder, lines: [{ supplierSku: "SKU", quantity: 1 }] }), /Street address/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order: { ...order, customer: { ...order.customer, email: "invalid" } } as BackendOrder, lines: [{ supplierSku: "SKU", quantity: 1 }] }), /email is invalid/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order: { ...order, customer: { ...order.customer, mobile: "123" } } as BackendOrder, lines: [{ supplierSku: "SKU", quantity: 1 }] }), /phone is invalid/);
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order, lines: [{ supplierSku: "SKU", quantity: 1 }, { supplierSku: "SKU", quantity: 2 }] }), /Duplicate Syntech SKUs/);
const companyOrder = { ...order, customer: { ...order.customer, companyName: "Test Company" } } as BackendOrder;
assert.equal(buildSyntechOrderPayload({ reference: "stable", shipping: { type: "DELIVERY" }, order: companyOrder, lines: [{ supplierSku: "SKU", quantity: 1 }] }).shipping.type, "delivery", "optional company data must not alter the documented Syntech delivery contract");

for (const location of ["cpt", "jhb"] as const) {
  const collection = buildSyntechOrderPayload({ reference: "stable", shipping: { type: "COLLECTION", location }, order, lines: [{ supplierSku: "SKU", quantity: 1 }] });
  assert.deepEqual(collection.shipping, { type: "collection", location });
}
assert.throws(() => buildSyntechOrderPayload({ reference: "stable", shipping: { type: "COLLECTION", location: "dbn" as "cpt" }, order, lines: [{ supplierSku: "SKU", quantity: 1 }] }), /Cape Town or Johannesburg/);

const categories = new Map<string, string>();
for (let index = 1; index <= 12; index += 1) {
  const code = `RC${index}`;
  const mapped = mapSyntechRcError(code);
  assert.equal(mapped.code, code);
  assert.ok(mapped.message.length > 10);
  categories.set(code, mapped.category);
  assert.throws(() => normalizeSyntechCreateResponse({ status: "failed", errors: { [code]: "provider detail" } }), (error) => error instanceof SyntechOrderError && error.code === code && error.retrySafe);
}
assert.equal(categories.get("RC9"), "STOCK_ERROR");
assert.equal(categories.get("RC10"), "ADDRESS_ERROR");
assert.equal(categories.get("RC12"), "PROVIDER_DEPENDENCY");

const success = normalizeSyntechCreateResponse({ status: "success", salesorder: "SO-UAT-123" });
assert.equal(success.salesorder, "SO-UAT-123");
assert.equal(success.responseFingerprint.length, 64);
assert.throws(() => normalizeSyntechCreateResponse({ status: "success" }), (error) => error instanceof SyntechOrderError && error.category === "UNKNOWN_RESULT");

assert.equal(isSyntechMaintenanceWindow(new Date("2026-10-16T21:10:00Z")), true); // 23:10 SAST
assert.equal(isSyntechMaintenanceWindow(new Date("2026-10-16T00:10:00Z")), true); // 02:10 SAST
assert.equal(isSyntechMaintenanceWindow(new Date("2026-10-16T12:00:00Z")), false);
assert.equal(validateSyntechUatBaseUrl("https://reseller.syntech.co.za/wp-json/uat-api/reseller/"), true);
assert.equal(validateSyntechUatBaseUrl("http://reseller.syntech.co.za/wp-json/uat-api/reseller/"), false);
assert.equal(validateSyntechUatBaseUrl("https://evil.example.test/wp-json/uat-api/reseller/"), false);
assert.equal(validateSyntechUatBaseUrl("https://reseller.syntech.co.za/wp-json/uat-api/reseller/?next=https://evil.example.test"), false);
assert.deepEqual(deriveSyntechApiProcurementState({ deploymentEnabled: true, operationalEnabled: true, configured: true, environment: "UAT", productionOperational: false }), { effectiveEnabled: true, blockedBy: undefined });
assert.equal(deriveSyntechApiProcurementState({ deploymentEnabled: false, operationalEnabled: true, configured: true, environment: "UAT", productionOperational: false }).blockedBy, "DEPLOYMENT_DISABLED");
assert.equal(deriveSyntechApiProcurementState({ deploymentEnabled: true, operationalEnabled: false, configured: true, environment: "UAT", productionOperational: false }).blockedBy, "OPERATIONALLY_DISABLED");
assert.equal(deriveSyntechApiProcurementState({ deploymentEnabled: true, operationalEnabled: true, configured: true, environment: "PRODUCTION", productionOperational: false }).blockedBy, "ENVIRONMENT_NOT_APPROVED");

const previous = {
  enabled: process.env.SYNTECH_RESELLER_API_ENABLED,
  environment: process.env.SYNTECH_RESELLER_API_ENVIRONMENT,
  token: process.env.SYNTECH_RESELLER_UAT_TOKEN,
  baseUrl: process.env.SYNTECH_RESELLER_UAT_BASE_URL,
  uatCredential: process.env.SYNTECH_UAT_CREDENTIAL,
  uatBaseUrl: process.env.SYNTECH_UAT_BASE_URL,
  uatUsername: process.env.SYNTECH_UAT_USERNAME,
  uatWrites: process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED,
};
delete process.env.SYNTECH_RESELLER_UAT_TOKEN;
delete process.env.SYNTECH_RESELLER_UAT_BASE_URL;
process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED = "true";
process.env.SYNTECH_RESELLER_API_ENVIRONMENT = "UAT";
process.env.SYNTECH_UAT_CREDENTIAL = "must-not-be-returned";
process.env.SYNTECH_UAT_USERNAME = "uat-user-must-not-be-returned";
process.env.SYNTECH_UAT_BASE_URL = "https://reseller.syntech.co.za/wp-json/uat-api/reseller/";
const configuration = syntechResellerApiConfiguration();
assert.equal(configuration.configured, true);
assert.equal(configuration.endpointValid, true);
assert.equal(configuration.environment, "UAT");
assert.equal(JSON.stringify(configuration).includes("must-not-be-returned"), false);
assert.equal("baseUrl" in configuration, false);
assert.equal(configuration.usernameConfigured, true);
assert.equal(adapterSource.includes("must-not-be-returned"), false);
assert.match(adapterSource, /if \(!response\.ok\)[\s\S]*parseBusinessFailure\(body\)/, "non-2xx provider bodies must retain canonical RC classification");
process.env.SYNTECH_RESELLER_API_ENABLED = "true";
process.env.SYNTECH_UAT_ORDER_WRITES_ENABLED = "false";
assert.equal(syntechResellerApiConfiguration().enabled, false, "the explicit canonical write flag must override the legacy alias");
process.env.SYNTECH_RESELLER_API_ENVIRONMENT = "PRODUCTION";
assert.notEqual(syntechResellerApiConfiguration().environment, "UAT");

for (const [key, value] of Object.entries(previous)) {
  const envKey = key === "enabled" ? "SYNTECH_RESELLER_API_ENABLED" : key === "environment" ? "SYNTECH_RESELLER_API_ENVIRONMENT" : key === "token" ? "SYNTECH_RESELLER_UAT_TOKEN" : key === "baseUrl" ? "SYNTECH_RESELLER_UAT_BASE_URL" : key === "uatCredential" ? "SYNTECH_UAT_CREDENTIAL" : key === "uatBaseUrl" ? "SYNTECH_UAT_BASE_URL" : key === "uatUsername" ? "SYNTECH_UAT_USERNAME" : "SYNTECH_UAT_ORDER_WRITES_ENABLED";
  if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
}

console.log("Syntech UAT order adapter tests passed.");
