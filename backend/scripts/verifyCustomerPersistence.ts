import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CustomerStore } from "../customerAuth.js";
import { readPostgresCustomerStore } from "../persistence/customerRepository.js";
import { closePostgres } from "../persistence/postgres.js";

type Status = "MATCH" | "MISMATCH" | "NOT_APPLICABLE";
const source = JSON.parse(await readFile(resolve(process.cwd(), process.env.PERSISTENCE_SOURCE_DIR?.trim() || ".data", "customer-accounts.json"), "utf8")) as CustomerStore;
const destination = await readPostgresCustomerStore();
const sorted = (values: string[]) => [...values].sort();
const same = (left: unknown, right: unknown): Status => JSON.stringify(left) === JSON.stringify(right) ? "MATCH" : "MISMATCH";
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left],[right]) => left.localeCompare(right)).map(([key,item]) => [key,canonical(item)])) : value;
const encoded = (value: unknown) => JSON.stringify(canonical(value));
const accountProjection = (store: CustomerStore) => sorted(store.accounts.map((item) => JSON.stringify({ id:item.id,email:item.email,passwordHash:item.passwordHash,firstName:item.firstName,lastName:item.lastName,phone:item.phone,status:item.status,emailVerifiedAt:item.emailVerifiedAt,createdAt:item.createdAt,updatedAt:item.updatedAt,lastLoginAt:item.lastLoginAt })));
const addressProjection = (store: CustomerStore) => sorted(store.addresses.map(encoded));
const sessionProjection = (store: CustomerStore) => sorted(store.sessions.map(encoded));
const resetProjection = (store: CustomerStore) => sorted(store.passwordResets.map(encoded));
const eventProjection = (store: CustomerStore) => sorted(store.audit.map(encoded));
const destinationAccountIds = new Set(destination.accounts.map((item) => item.id));
const relationshipsValid = [...destination.addresses, ...destination.sessions, ...destination.passwordResets].every((item) => destinationAccountIds.has("customerAccountId" in item ? item.customerAccountId : item.customerId));
const checks: Record<string, Status> = {
  accounts: same(accountProjection(source), accountProjection(destination)),
  profilesAndPasswordHashes: same(accountProjection(source), accountProjection(destination)),
  addresses: same(addressProjection(source), addressProjection(destination)),
  sessionsAndZeusConsent: same(sessionProjection(source), sessionProjection(destination)),
  passwordResets: source.passwordResets.length || destination.passwordResets.length ? same(resetProjection(source), resetProjection(destination)) : "NOT_APPLICABLE",
  securityEvents: same(eventProjection(source), eventProjection(destination)),
  foreignKeyRelationships: relationshipsValid ? "MATCH" : "MISMATCH",
};
console.log(JSON.stringify({ counts: { source: { accounts:source.accounts.length,addresses:source.addresses.length,sessions:source.sessions.length,passwordResets:source.passwordResets.length,securityEvents:source.audit.length }, destination: { accounts:destination.accounts.length,addresses:destination.addresses.length,sessions:destination.sessions.length,passwordResets:destination.passwordResets.length,securityEvents:destination.audit.length } }, checks, success: Object.values(checks).every((status) => status !== "MISMATCH") }, null, 2));
await closePostgres();
if (Object.values(checks).includes("MISMATCH")) process.exitCode = 1;
