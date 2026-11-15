import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CustomerStore } from "../customerAuth.js";
import { importPostgresCustomerStore } from "../persistence/customerRepository.js";
import { closePostgres } from "../persistence/postgres.js";

const sourcePath = resolve(process.cwd(), process.env.PERSISTENCE_SOURCE_DIR?.trim() || ".data", "customer-accounts.json");
const apply = process.argv.includes("--apply");
const raw = await readFile(sourcePath, "utf8");
const sourceFingerprint = createHash("sha256").update(raw).digest("hex");
const parsed = JSON.parse(raw) as Partial<CustomerStore>;
if (parsed.version !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.passwordResets)) throw new Error("CUSTOMER_MIGRATION_SOURCE_INVALID");
const store: CustomerStore = { version: 1, accounts: parsed.accounts, addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [], sessions: parsed.sessions, passwordResets: parsed.passwordResets, audit: Array.isArray(parsed.audit) ? parsed.audit : [] };
const duplicate = (values: string[]) => values.length !== new Set(values).size;
if (duplicate(store.accounts.map((item) => item.id)) || duplicate(store.accounts.map((item) => item.email.trim().toLowerCase())) || duplicate(store.sessions.map((item) => item.tokenHash))) throw new Error("CUSTOMER_MIGRATION_SOURCE_CONFLICT");
const accountIds = new Set(store.accounts.map((item) => item.id));
if ([...store.addresses, ...store.sessions, ...store.passwordResets].some((item) => !accountIds.has("customerAccountId" in item ? item.customerAccountId : item.customerId))) throw new Error("CUSTOMER_MIGRATION_RELATIONSHIP_INVALID");
const summary = { mode: apply ? "APPLY" : "DRY_RUN", fingerprint: sourceFingerprint.slice(0, 16), accounts: store.accounts.length, addresses: store.addresses.length, sessions: store.sessions.length, passwordResets: store.passwordResets.length, securityEvents: store.audit.length };
if (!apply) console.log(JSON.stringify(summary, null, 2));
else {
  try { console.log(JSON.stringify({ ...summary, result: await importPostgresCustomerStore(store, sourceFingerprint) }, null, 2)); }
  finally { await closePostgres(); }
}
