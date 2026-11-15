import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateCustomerAddress, type CustomerAddressInput } from "../src/lib/customer-address.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { mutatePostgresCustomerStore, readPostgresCustomerStore } from "./persistence/customerRepository.js";
const scrypt = (password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number }) => new Promise<Buffer>((resolve, reject) => nodeScrypt(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived)));
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const RESET_TTL_MS = 60 * 60 * 1_000;
const PASSWORD_MIN_LENGTH = 10;
const SESSION_COOKIE = "tc_customer_session";

export interface CustomerAccount {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export const ZEUS_ACCOUNT_DATA_CONSENT_VERSION = 1;
export interface CustomerSession { id: string; customerId: string; tokenHash: string; createdAt: string; expiresAt: string; revokedAt?: string; zeusAccountDataConsent?: { version: number; grantedAt: string; revokedAt?: string } }
export interface PasswordReset { id: string; customerId: string; tokenHash: string; createdAt: string; expiresAt: string; usedAt?: string; revokedAt?: string }
export interface CustomerAudit { id: string; customerId?: string; type: "REGISTERED" | "LOGIN_SUCCESS" | "LOGOUT" | "PASSWORD_RESET_REQUESTED" | "PASSWORD_RESET_COMPLETED" | "ZEUS_ACCOUNT_DATA_CONSENT_GRANTED" | "ZEUS_ACCOUNT_DATA_CONSENT_REVOKED"; createdAt: string }
export interface CustomerAddress extends CustomerAddressInput { id: string; customerAccountId: string; isDefault: boolean; createdAt: string; updatedAt: string }
export interface CustomerStore { version: 1; accounts: CustomerAccount[]; addresses: CustomerAddress[]; sessions: CustomerSession[]; passwordResets: PasswordReset[]; audit: CustomerAudit[] }

export interface SafeCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export class CustomerAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export class CustomerAuthRateLimiter {
  private attempts = new Map<string, number[]>();
  check(key: string, limit = 8, windowMs = 15 * 60 * 1_000, now = Date.now()) {
    const recent = (this.attempts.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) throw new CustomerAuthError("RATE_LIMITED", "Too many attempts. Please try again later.", 429);
    recent.push(now); this.attempts.set(key, recent);
  }
}

let storePathOverride: string | undefined;
let writeQueue = Promise.resolve();
export function setCustomerStorePathForTests(path?: string) { storePathOverride = path; writeQueue = Promise.resolve(); }
const storePath = () => storePathOverride ?? resolve(process.cwd(), ".data", "customer-accounts.json");
const emptyStore = (): CustomerStore => ({ version: 1, accounts: [], addresses: [], sessions: [], passwordResets: [], audit: [] });
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
export const normalizeCustomerEmail = (email: string) => email.trim().toLowerCase();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const safeCustomer = ({ passwordHash: _passwordHash, ...customer }: CustomerAccount): SafeCustomer => { void _passwordHash; return customer; };

async function readStore(): Promise<CustomerStore> {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return readPostgresCustomerStore();
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Partial<CustomerStore>;
    return parsed.version === 1 && Array.isArray(parsed.accounts) && Array.isArray(parsed.sessions) && Array.isArray(parsed.passwordResets)
      ? { version: 1, accounts: parsed.accounts, addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [], sessions: parsed.sessions, passwordResets: parsed.passwordResets, audit: Array.isArray(parsed.audit) ? parsed.audit : [] }
      : emptyStore();
  } catch { return emptyStore(); }
}

async function writeStore(store: CustomerStore) {
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2));
}

async function mutate<T>(operation: (store: CustomerStore) => Promise<T> | T): Promise<T> {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return mutatePostgresCustomerStore(operation);
  let result!: T;
  const run = writeQueue.then(async () => { const store = await readStore(); result = await operation(store); await writeStore(store); });
  writeQueue = run.catch(() => undefined);
  await run;
  return result;
}

function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new CustomerAuthError("PASSWORD_POLICY", `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include a letter and number.`);
  }
}

function validateEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CustomerAuthError("INVALID_EMAIL", "Enter a valid email address.");
}

export async function hashCustomerPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyCustomerPassword(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, salt, expected] = encoded.split("$");
    if (algorithm !== "scrypt" || !salt || !expected) return false;
    const expectedBuffer = Buffer.from(expected, "base64");
    const actual = await scrypt(password, Buffer.from(salt, "base64"), expectedBuffer.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch { return false; }
}

function newSession(store: CustomerStore, customerId: string, now: Date) {
  const token = randomBytes(32).toString("base64url");
  store.sessions.push({ id: localId("customer-session"), customerId, tokenHash: tokenHash(token), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() });
  return token;
}

export async function registerCustomer(input: { firstName?: string; lastName?: string; email?: string; password?: string; phone?: string }, now = new Date()) {
  const firstName = input.firstName?.trim() ?? ""; const lastName = input.lastName?.trim() ?? ""; const email = normalizeCustomerEmail(input.email ?? ""); const password = input.password ?? "";
  if (!firstName || !lastName) throw new CustomerAuthError("INVALID_NAME", "First name and last name are required.");
  validateEmail(email); validatePassword(password);
  const passwordHash = await hashCustomerPassword(password);
  return mutate((store) => {
    if (store.accounts.some((item) => item.email.toLowerCase() === email)) throw new CustomerAuthError("EMAIL_EXISTS", "An account with this email already exists.", 409);
    const timestamp = now.toISOString();
    const account: CustomerAccount = { id: localId("customer"), email, passwordHash, firstName, lastName, phone: input.phone?.trim() || undefined, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp, lastLoginAt: timestamp };
    store.accounts.push(account); store.audit.push({ id: localId("customer-audit"), customerId: account.id, type: "REGISTERED", createdAt: timestamp });
    return { customer: safeCustomer(account), sessionToken: newSession(store, account.id, now) };
  });
}

export async function loginCustomer(input: { email?: string; password?: string }, now = new Date()) {
  const email = normalizeCustomerEmail(input.email ?? ""); const password = input.password ?? "";
  const store = await readStore(); const account = store.accounts.find((item) => item.email.toLowerCase() === email);
  if (!account || account.status !== "ACTIVE" || !(await verifyCustomerPassword(password, account.passwordHash))) throw new CustomerAuthError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  return mutate((current) => {
    const persisted = current.accounts.find((item) => item.id === account.id);
    if (!persisted || persisted.status !== "ACTIVE") throw new CustomerAuthError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
    persisted.lastLoginAt = now.toISOString(); persisted.updatedAt = now.toISOString();
    current.audit.push({ id: localId("customer-audit"), customerId: persisted.id, type: "LOGIN_SUCCESS", createdAt: now.toISOString() });
    return { customer: safeCustomer(persisted), sessionToken: newSession(current, persisted.id, now) };
  });
}

export async function customerFromSessionToken(token: string | undefined, now = new Date()) {
  if (!token) return undefined;
  const store = await readStore(); const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && !item.revokedAt && Date.parse(item.expiresAt) > now.getTime());
  const account = session ? store.accounts.find((item) => item.id === session.customerId && item.status === "ACTIVE") : undefined;
  return account ? safeCustomer(account) : undefined;
}

export async function logoutCustomer(token: string | undefined, now = new Date()) {
  if (!token) return;
  await mutate((store) => { const session = store.sessions.find((item) => item.tokenHash === tokenHash(token) && !item.revokedAt); if (session) { session.revokedAt = now.toISOString(); store.audit.push({ id: localId("customer-audit"), customerId: session.customerId, type: "LOGOUT", createdAt: now.toISOString() }); } });
}

export async function getZeusAccountDataConsent(token: string | undefined, now = new Date()) {
  if (!token) return { granted: false, version: ZEUS_ACCOUNT_DATA_CONSENT_VERSION };
  const store = await readStore(); const hash = tokenHash(token);
  const session = store.sessions.find((item) => item.tokenHash === hash && !item.revokedAt && Date.parse(item.expiresAt) > now.getTime());
  const consent = session?.zeusAccountDataConsent;
  return { granted: Boolean(consent && consent.version === ZEUS_ACCOUNT_DATA_CONSENT_VERSION && !consent.revokedAt), version: ZEUS_ACCOUNT_DATA_CONSENT_VERSION, grantedAt: consent?.grantedAt };
}

export async function setZeusAccountDataConsent(token: string | undefined, granted: boolean, now = new Date()) {
  if (!token) throw new CustomerAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
  return mutate((store) => {
    const session = store.sessions.find((item) => item.tokenHash === tokenHash(token) && !item.revokedAt && Date.parse(item.expiresAt) > now.getTime());
    if (!session) throw new CustomerAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
    const timestamp = now.toISOString();
    if (granted) session.zeusAccountDataConsent = { version: ZEUS_ACCOUNT_DATA_CONSENT_VERSION, grantedAt: timestamp };
    else if (session.zeusAccountDataConsent) session.zeusAccountDataConsent.revokedAt = timestamp;
    store.audit.push({ id: localId("customer-audit"), customerId: session.customerId, type: granted ? "ZEUS_ACCOUNT_DATA_CONSENT_GRANTED" : "ZEUS_ACCOUNT_DATA_CONSENT_REVOKED", createdAt: timestamp });
    return { granted, version: ZEUS_ACCOUNT_DATA_CONSENT_VERSION, grantedAt: granted ? timestamp : undefined };
  });
}

export async function requestPasswordReset(emailInput: string, now = new Date()) {
  const email = normalizeCustomerEmail(emailInput); const store = await readStore(); const account = store.accounts.find((item) => item.email.toLowerCase() === email && item.status === "ACTIVE");
  if (!account) return undefined;
  const token = randomBytes(32).toString("base64url");
  await mutate((current) => { current.passwordResets.filter((item) => item.customerId === account.id && !item.usedAt && !item.revokedAt).forEach((item) => { item.revokedAt = now.toISOString(); }); current.passwordResets.push({ id: localId("password-reset"), customerId: account.id, tokenHash: tokenHash(token), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + RESET_TTL_MS).toISOString() }); current.audit.push({ id: localId("customer-audit"), customerId: account.id, type: "PASSWORD_RESET_REQUESTED", createdAt: now.toISOString() }); });
  return { token, customer: safeCustomer(account), expiresAt: new Date(now.getTime() + RESET_TTL_MS).toISOString() };
}

export async function resetCustomerPassword(input: { token?: string; password?: string }, now = new Date()) {
  const token = input.token ?? ""; const password = input.password ?? ""; validatePassword(password); const passwordHash = await hashCustomerPassword(password);
  return mutate((store) => {
    const reset = store.passwordResets.find((item) => item.tokenHash === tokenHash(token) && !item.usedAt && !item.revokedAt);
    if (!reset || Date.parse(reset.expiresAt) <= now.getTime()) throw new CustomerAuthError("RESET_TOKEN_INVALID", "This password reset link is invalid or has expired.", 400);
    const account = store.accounts.find((item) => item.id === reset.customerId);
    if (!account) throw new CustomerAuthError("RESET_TOKEN_INVALID", "This password reset link is invalid or has expired.", 400);
    reset.usedAt = now.toISOString(); account.passwordHash = passwordHash; account.updatedAt = now.toISOString();
    store.sessions.filter((item) => item.customerId === account.id && !item.revokedAt).forEach((item) => { item.revokedAt = now.toISOString(); });
    store.audit.push({ id: localId("customer-audit"), customerId: account.id, type: "PASSWORD_RESET_COMPLETED", createdAt: now.toISOString() });
    return safeCustomer(account);
  });
}

export async function updateCustomerProfile(customerId: string, input: { firstName?: string; lastName?: string; phone?: string }, now = new Date()) {
  return mutate((store) => { const account = store.accounts.find((item) => item.id === customerId); if (!account) throw new CustomerAuthError("CUSTOMER_NOT_FOUND", "Account not found.", 404); const firstName = input.firstName?.trim(); const lastName = input.lastName?.trim(); if (!firstName || !lastName) throw new CustomerAuthError("INVALID_NAME", "First name and last name are required."); account.firstName = firstName; account.lastName = lastName; account.phone = input.phone?.trim() || undefined; account.updatedAt = now.toISOString(); return safeCustomer(account); });
}

function normalizedAddress(input: CustomerAddressInput): CustomerAddressInput {
  const value = { label: input.label?.trim() || "Address", recipientFirstName: input.recipientFirstName?.trim(), recipientLastName: input.recipientLastName?.trim(), company: input.company?.trim() || undefined, phone: input.phone?.trim(), addressLine1: input.addressLine1?.trim(), addressLine2: input.addressLine2?.trim() || undefined, suburb: input.suburb?.trim(), city: input.city?.trim(), province: input.province, postalCode: input.postalCode?.trim(), country: input.country?.trim() };
  const errors = validateCustomerAddress(value); if (Object.keys(errors).length) throw new CustomerAuthError("INVALID_ADDRESS", Object.values(errors)[0], 400); return value;
}
export async function listCustomerAddresses(customerId: string) { return (await readStore()).addresses.filter((item) => item.customerAccountId === customerId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Date.parse(a.createdAt) - Date.parse(b.createdAt)); }
export async function listAdminCustomerSupportIdentities(now = new Date()) {
  const store = await readStore();
  return store.accounts.map((account) => ({
    customer: safeCustomer(account),
    addresses: store.addresses.filter((address) => address.customerAccountId === account.id),
    zeusConsent: {
      active: store.sessions.some((session) => session.customerId === account.id && !session.revokedAt && Date.parse(session.expiresAt) > now.getTime() && session.zeusAccountDataConsent?.version === ZEUS_ACCOUNT_DATA_CONSENT_VERSION && !session.zeusAccountDataConsent.revokedAt),
      scope: "SESSION" as const,
      usedForAccountAssistance: store.audit.some((entry) => entry.customerId === account.id && entry.type === "ZEUS_ACCOUNT_DATA_CONSENT_GRANTED"),
    },
  }));
}
export async function createCustomerAddress(customerId: string, input: CustomerAddressInput, now = new Date()) { const value = normalizedAddress(input); return mutate((store) => { const timestamp = now.toISOString(); const first = !store.addresses.some((item) => item.customerAccountId === customerId); const address: CustomerAddress = { ...value, id: localId("customer-address"), customerAccountId: customerId, isDefault: first, createdAt: timestamp, updatedAt: timestamp }; store.addresses.push(address); return address; }); }
export async function updateCustomerAddress(customerId: string, addressId: string, input: CustomerAddressInput, now = new Date()) { const value = normalizedAddress(input); return mutate((store) => { const address = store.addresses.find((item) => item.id === addressId && item.customerAccountId === customerId); if (!address) throw new CustomerAuthError("ADDRESS_NOT_FOUND", "Address not found.", 404); Object.assign(address, value, { updatedAt: now.toISOString() }); return address; }); }
export async function setDefaultCustomerAddress(customerId: string, addressId: string, now = new Date()) { return mutate((store) => { const address = store.addresses.find((item) => item.id === addressId && item.customerAccountId === customerId); if (!address) throw new CustomerAuthError("ADDRESS_NOT_FOUND", "Address not found.", 404); store.addresses.filter((item) => item.customerAccountId === customerId).forEach((item) => { item.isDefault = item.id === address.id; if (item.id === address.id) item.updatedAt = now.toISOString(); }); return address; }); }
export async function deleteCustomerAddress(customerId: string, addressId: string, now = new Date()) { return mutate((store) => { const index = store.addresses.findIndex((item) => item.id === addressId && item.customerAccountId === customerId); if (index < 0) throw new CustomerAuthError("ADDRESS_NOT_FOUND", "Address not found.", 404); const [removed] = store.addresses.splice(index, 1); if (removed.isDefault) { const replacement = store.addresses.filter((item) => item.customerAccountId === customerId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]; if (replacement) { replacement.isDefault = true; replacement.updatedAt = now.toISOString(); } } return removed; }); }

export function parseCustomerSessionCookie(header?: string) {
  return header?.split(";").map((item) => item.trim().split("=")).find(([name]) => name === SESSION_COOKIE)?.[1];
}
export function customerSessionCookie(token: string, production: boolean) { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${production ? "; Secure" : ""}`; }
export function clearCustomerSessionCookie(production: boolean) { return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? "; Secure" : ""}`; }
export const customerPasswordPolicy = { minimumLength: PASSWORD_MIN_LENGTH };

