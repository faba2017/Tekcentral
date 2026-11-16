import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storeMigrationInventory } from "../persistence/storeInventory.js";

const sql = await readFile("backend/persistence/migrations/0001_foundation.sql", "utf8");
for (const table of ["products", "product_versions", "customers", "orders", "order_lines", "supplier_offers", "supplier_orders", "inventory_reservations", "staff_accounts", "staff_recovery_codes", "staff_pre_auth_challenges", "contact_conversations", "admin_audit", "operational_alerts", "media_objects", "rate_limit_buckets", "feature_flags"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(sql, /allocate_business_sequence/); assert.match(sql, /UNIQUE\(supplier_code, supplier_sku\)/); assert.match(sql, /admin_audit_no_update/); assert.match(sql, /admin_audit_no_delete/);
assert.ok(storeMigrationInventory.length >= 30); assert.ok(storeMigrationInventory.some((item) => item.file === "staff-auth.json" && item.destination.includes("staff_accounts"))); assert.ok(storeMigrationInventory.some((item) => item.file.includes("public-assets/products") && item.destination.includes("Spaces")));
const serialized = JSON.stringify(storeMigrationInventory); for (const forbidden of ["passwordHash", "accessToken", "merchant key", "TOTP secret value"]) assert.equal(serialized.includes(forbidden), false);
assert.ok(storeMigrationInventory.every((item) => item.owner && item.migrationStatus && item.runtimeStatus && item.validationStatus && item.legacyDisposition));
assert.equal(storeMigrationInventory.find((item) => item.file === "customer-accounts.json")?.runtimeStatus, "RUNTIME_CUTOVER");
assert.deepEqual(
  storeMigrationInventory.find((item) => item.file === "staff-auth.json") && {
    runtimeStatus: storeMigrationInventory.find((item) => item.file === "staff-auth.json")?.runtimeStatus,
    validationStatus: storeMigrationInventory.find((item) => item.file === "staff-auth.json")?.validationStatus,
    legacyDisposition: storeMigrationInventory.find((item) => item.file === "staff-auth.json")?.legacyDisposition,
  },
  { runtimeStatus: "RUNTIME_CUTOVER", validationStatus: "LIVE_LOCAL_VALIDATED", legacyDisposition: "MIGRATION_ONLY" },
);
const cutoverSql = await readFile("backend/persistence/migrations/0002_repository_cutover.sql", "utf8");
assert.match(cutoverSql, /customer_security_events/);
assert.match(cutoverSql, /customer_sessions_customer_active_idx/);
const customerSource = await readFile("backend/customerAuth.ts", "utf8");
assert.match(customerSource, /readPostgresCustomerStore/);
assert.match(customerSource, /mutatePostgresCustomerStore/);
const staffSql = await readFile("backend/persistence/migrations/0003_staff_cutover.sql", "utf8");
assert.match(staffSql, /staff_pre_auth_active_idx/);
const staffSource = await readFile("backend/staffAuth.ts", "utf8");
assert.match(staffSource, /readPostgresStaffStore/);
assert.match(staffSource, /mutatePostgresStaffStore/);
const catalogueSql = await readFile("backend/persistence/migrations/0004_catalogue_cutover.sql", "utf8");
for (const table of ["catalogue_products", "catalogue_publication_versions", "catalogue_supplier_offers", "catalogue_product_mappings", "catalogue_pricing_proposals", "catalogue_media_records"]) assert.match(catalogueSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
for (const file of ["internalProductRepository.ts", "productPublicationRepository.ts", "pricingProposalRepository.ts", "supplierProductMappingRepository.ts", "publicImageIngestion.ts"]) assert.match(await readFile(`backend/${file}`, "utf8"), /persistence\/catalogueRepository/);
for (const file of ["supplier-catalogue-cj.json", "supplier-catalogue-scoop.json", "supplier-catalogue-syntech.json", "pricing-proposals.json", "public-assets/image-records.json"]) assert.equal(storeMigrationInventory.find((item) => item.file === file)?.runtimeStatus, "RUNTIME_CUTOVER");
const adminAiChatSql = await readFile("backend/persistence/migrations/0011_admin_ai_chat.sql", "utf8");
for (const table of ["admin_ai_conversations", "admin_ai_messages", "admin_ai_context_attachments"]) assert.match(adminAiChatSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(adminAiChatSql, /REFERENCES staff_accounts\(id\) ON DELETE CASCADE/);
assert.match(adminAiChatSql, /UNIQUE\(conversation_id, sequence\)/);
assert.match(adminAiChatSql, /admin_ai_messages_idempotency_idx/);
for (const forbidden of ["reasoning_content", "system_prompt", "raw_request", "raw_response"]) assert.equal(adminAiChatSql.includes(forbidden), false);
const adminAiActionSql = await readFile("backend/persistence/migrations/0012_admin_ai_actions.sql", "utf8");
assert.match(adminAiActionSql, /CREATE TABLE IF NOT EXISTS admin_ai_actions/);
assert.match(adminAiActionSql, /admin_ai_actions_conversation_owner_fk/);
assert.match(adminAiActionSql, /UNIQUE \(conversation_id, turn_id\)/);
for (const state of ["AWAITING_CONFIRMATION", "EXECUTING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]) assert.match(adminAiActionSql, new RegExp(state));
for (const index of ["admin_ai_actions_conversation_created_idx", "admin_ai_actions_owner_state_idx", "admin_ai_actions_expiry_idx"]) assert.match(adminAiActionSql, new RegExp(index));
for (const forbidden of ["reasoning_content", "system_prompt", "raw_request", "raw_response", "provider_payload", "transcript"]) assert.equal(adminAiActionSql.includes(forbidden), false);
const adminAiAutomationSql = await readFile("backend/persistence/migrations/0013_admin_ai_automation_foundation.sql", "utf8");
for (const table of ["admin_ai_automations", "admin_ai_automation_events", "admin_ai_automation_runs"]) assert.match(adminAiAutomationSql, new RegExp(`CREATE TABLE ${table}`));
for (const constraint of ["admin_ai_automation_runs_occurrence_unique", "admin_ai_actions_exact_origin", "admin_ai_actions_chat_turn_unique_idx", "admin_ai_actions_automation_run_unique_idx"]) assert.match(adminAiAutomationSql, new RegExp(constraint));
for (const forbidden of ["system_prompt", "reasoning_content", "raw_request", "raw_response", "provider_payload", "credentials", "auth_token"]) assert.equal(adminAiAutomationSql.includes(forbidden), false);
const invoiceDeliverySql = await readFile("backend/persistence/migrations/0015_commerce_invoice_delivery_foundation.sql", "utf8");
for (const table of ["commerce_invoices", "commerce_invoice_documents", "commerce_customer_deliveries", "commerce_customer_delivery_attempts"]) assert.match(invoiceDeliverySql, new RegExp(`CREATE TABLE ${table}`));
for (const constraint of ["commerce_invoices_order_unique", "commerce_invoices_number_unique", "commerce_invoice_documents_invoice_unique", "commerce_customer_delivery_attempts_number_unique"]) assert.match(invoiceDeliverySql, new RegExp(constraint));
for (const safeguard of ["PRIVATE_INVOICE", "application/pdf", "reject_immutable_commerce_record", "commerce_customer_deliveries_due_idx", "ON DELETE RESTRICT"]) assert.match(invoiceDeliverySql, new RegExp(safeguard.replace("/", "\\/")));
for (const forbidden of ["smtp_password", "api_key", "access_token", "merchant_key", "passphrase"]) assert.equal(invoiceDeliverySql.toLowerCase().includes(forbidden), false);
const commerceRecoverySql = await readFile("backend/persistence/migrations/0016_commerce_recovery_scope.sql", "utf8");
for (const field of ["order_confirmation_required_at", "invoice_required_at"]) assert.match(commerceRecoverySql, new RegExp(`ADD COLUMN ${field} timestamptz`));
for (const index of ["commerce_orders_confirmation_recovery_idx", "commerce_orders_invoice_recovery_idx"]) assert.match(commerceRecoverySql, new RegExp(index));
assert.equal(/DEFAULT\s+(now\(\)|CURRENT_TIMESTAMP)/i.test(commerceRecoverySql), false, "historical Orders must remain outside prospective recovery scope");
assert.equal(/UPDATE\s+commerce_orders/i.test(commerceRecoverySql), false, "the migration must not backfill historical Orders");
const logisticsSql = await readFile("backend/persistence/migrations/0017_product_manual_logistics_evidence.sql", "utf8");
assert.match(logisticsSql, /CREATE TABLE IF NOT EXISTS product_manual_logistics_evidence/);
for (const value of ["PRODUCT", "PACKAGE", "SHIPPING", "STAFF_MANUAL", "actor_staff_id", "evidence_fingerprint", "superseded_at"]) assert.match(logisticsSql, new RegExp(value));
assert.match(logisticsSql, /product_manual_logistics_active_idx/);
assert.equal(/UPDATE\s+catalogue_products/i.test(logisticsSql), false, "manual logistics migration must not backfill Products");
console.log("Persistence migration tests passed.");
