import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MailTransport } from "./mailService.js";
import { claimGuestOrderOwnership, getOrder } from "./orderRepository.js";
import { revokeGuestOrderAccess } from "./guestOrderAccess.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query, withTransaction } from "./persistence/postgres.js";

const CLAIM_TTL_MS = 20 * 60 * 1_000;

interface OrderClaimChallenge {
  id: string;
  accountId: string;
  orderNumber: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
}

interface OrderClaimAudit {
  id: string;
  accountId: string;
  orderNumber: string;
  type: "CLAIM_REQUESTED" | "CLAIM_VERIFIED" | "ORDER_CLAIMED";
  createdAt: string;
}

interface OrderClaimStore {
  version: 1;
  challenges: OrderClaimChallenge[];
  audit: OrderClaimAudit[];
}

export class CustomerOrderClaimError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

let storePathOverride: string | undefined;
let writeQueue = Promise.resolve();
export function setOrderClaimStorePathForTests(path?: string) { storePathOverride = path; writeQueue = Promise.resolve(); }
const storePath = () => storePathOverride ?? resolve(process.cwd(), ".data", "customer-order-claims.json");
const emptyStore = (): OrderClaimStore => ({ version: 1, challenges: [], audit: [] });
const hashToken = (token: string) => createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;

async function readStore(): Promise<OrderClaimStore> {
  if(!storePathOverride&&loadPersistenceConfig().provider==="POSTGRES"){const[challenges,audit]=await Promise.all([query<{payload:OrderClaimChallenge}>("SELECT payload FROM commerce_order_claims ORDER BY created_at"),query<{payload:OrderClaimAudit}>("SELECT payload FROM commerce_order_claim_audit ORDER BY created_at")]);return{version:1,challenges:challenges.rows.map(row=>row.payload),audit:audit.rows.map(row=>row.payload)};}
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Partial<OrderClaimStore>;
    return parsed.version === 1 && Array.isArray(parsed.challenges) && Array.isArray(parsed.audit)
      ? { version: 1, challenges: parsed.challenges, audit: parsed.audit }
      : emptyStore();
  } catch { return emptyStore(); }
}

async function writeStore(store: OrderClaimStore) {
  if(!storePathOverride&&loadPersistenceConfig().provider==="POSTGRES"){await withTransaction(async client=>{await client.query("DELETE FROM commerce_order_claim_audit");await client.query("DELETE FROM commerce_order_claims");for(const row of store.challenges)await client.query("INSERT INTO commerce_order_claims(id,account_id,order_number,token_hash,expires_at,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",[row.id,row.accountId,row.orderNumber,row.tokenHash,row.expiresAt,JSON.stringify(row),row.createdAt]);for(const row of store.audit)await client.query("INSERT INTO commerce_order_claim_audit(id,account_id,order_number,event_type,payload,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)",[row.id,row.accountId,row.orderNumber,row.type,JSON.stringify(row),row.createdAt]);});return;}
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2));
}

async function mutate<T>(operation: (store: OrderClaimStore) => T | Promise<T>): Promise<T> {
  let result!: T;
  const run = writeQueue.then(async () => { const store = await readStore(); result = await operation(store); await writeStore(store); });
  writeQueue = run.catch(() => undefined);
  await run;
  return result;
}

export async function requestGuestOrderClaim(input: { accountId: string; orderNumber: string; mail: MailTransport }, now = new Date()) {
  const orderNumber = input.orderNumber.trim().toUpperCase();
  const order = await getOrder(orderNumber);
  if (!order || order.customerAccountId) return { requested: true } as const;

  const token = randomBytes(8).toString("hex").toUpperCase();
  const challengeId = await mutate((store) => {
    const timestamp = now.toISOString();
    store.challenges
      .filter((entry) => entry.accountId === input.accountId && entry.orderNumber === orderNumber && !entry.usedAt && !entry.revokedAt)
      .forEach((entry) => { entry.revokedAt = timestamp; });
    const challenge: OrderClaimChallenge = { id: id("order-claim"), accountId: input.accountId, orderNumber, tokenHash: hashToken(token), createdAt: timestamp, expiresAt: new Date(now.getTime() + CLAIM_TTL_MS).toISOString() };
    store.challenges.push(challenge);
    store.audit.push({ id: id("order-claim-audit"), accountId: input.accountId, orderNumber, type: "CLAIM_REQUESTED", createdAt: timestamp });
    return challenge.id;
  });

  try {
    await input.mail.send({
      to: order.customer.email,
      subject: "Verify your TekCentral guest order",
      text: `Use this verification code to add order ${orderNumber} to your TekCentral account:\n\n${token}\n\nThis code expires in 20 minutes and can be used once. If you did not request this, you can ignore this email.`,
      html: `<h1>Verify your TekCentral guest order</h1><p>Use this verification code to add order <strong>${orderNumber}</strong> to your TekCentral account:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px">${token}</p><p>This code expires in 20 minutes and can be used once. If you did not request this, you can ignore this email.</p>`,
    });
  } catch {
    await mutate((store) => { const challenge = store.challenges.find((entry) => entry.id === challengeId); if (challenge && !challenge.usedAt) challenge.revokedAt = new Date().toISOString(); });
    throw new CustomerOrderClaimError("CLAIM_DELIVERY_FAILED", "Verification email could not be sent. Please try again later.", 503);
  }
  return { requested: true } as const;
}

export async function verifyGuestOrderClaim(input: { accountId: string; orderNumber: string; token: string }, now = new Date()) {
  const orderNumber = input.orderNumber.trim().toUpperCase();
  const challenge = (await readStore()).challenges.find((entry) => entry.accountId === input.accountId && entry.orderNumber === orderNumber && entry.tokenHash === hashToken(input.token) && !entry.usedAt && !entry.revokedAt);
  if (!challenge || Date.parse(challenge.expiresAt) <= now.getTime()) throw new CustomerOrderClaimError("CLAIM_INVALID", "This verification code is invalid or has expired.");

  const claimed = await claimGuestOrderOwnership(orderNumber, input.accountId, now);
  if (!claimed) throw new CustomerOrderClaimError("CLAIM_INVALID", "This order cannot be claimed.");

  await mutate((store) => {
    const persisted = store.challenges.find((entry) => entry.id === challenge.id && !entry.usedAt && !entry.revokedAt);
    if (!persisted) throw new CustomerOrderClaimError("CLAIM_INVALID", "This verification code is invalid or has expired.");
    persisted.usedAt = now.toISOString();
    store.audit.push({ id: id("order-claim-audit"), accountId: input.accountId, orderNumber, type: "CLAIM_VERIFIED", createdAt: now.toISOString() });
    store.audit.push({ id: id("order-claim-audit"), accountId: input.accountId, orderNumber, type: "ORDER_CLAIMED", createdAt: now.toISOString() });
  });
  await revokeGuestOrderAccess(orderNumber, now);
  return claimed;
}

export const customerOrderClaimPolicy = { ttlMs: CLAIM_TTL_MS };
