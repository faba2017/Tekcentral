import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query, withTransaction } from "./persistence/postgres.js";

interface GuestAccessRecord {
  orderNumber: string;
  tokenHash: string;
  version: 1;
  issuedAt: string;
  revokedAt?: string;
}

interface GuestAccessStore { version: 1; records: GuestAccessRecord[] }

let storePathOverride: string | undefined;
let writeQueue = Promise.resolve();
export function setGuestOrderAccessStorePathForTests(path?: string) { storePathOverride = path; writeQueue = Promise.resolve(); }
const storePath = () => storePathOverride ?? resolve(process.cwd(), ".data", "guest-order-access.json");
const emptyStore = (): GuestAccessStore => ({ version: 1, records: [] });
const tokenHash = (token: string) => createHash("sha256").update(token).digest();

async function readStore(): Promise<GuestAccessStore> {
  if(!storePathOverride&&loadPersistenceConfig().provider==="POSTGRES")return{version:1,records:(await query<{payload:GuestAccessRecord}>("SELECT payload FROM commerce_guest_credentials ORDER BY issued_at")).rows.map(row=>row.payload)};
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Partial<GuestAccessStore>;
    return parsed.version === 1 && Array.isArray(parsed.records) ? { version: 1, records: parsed.records } : emptyStore();
  } catch { return emptyStore(); }
}

async function writeStore(store: GuestAccessStore) {
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2));
}

async function mutate<T>(operation: (store: GuestAccessStore) => T | Promise<T>): Promise<T> {
  let result!: T;
  const run = writeQueue.then(async () => { const store = await readStore(); result = await operation(store); await writeStore(store); });
  writeQueue = run.catch(() => undefined);
  await run;
  return result;
}

export async function issueGuestOrderAccess(orderNumber: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  if(!storePathOverride&&loadPersistenceConfig().provider==="POSTGRES"){const issuedAt=now.toISOString();const record:GuestAccessRecord={orderNumber,tokenHash:tokenHash(token).toString("hex"),version:1,issuedAt};await withTransaction(async client=>{await client.query("UPDATE commerce_guest_credentials SET revoked_at=$2,payload=jsonb_set(payload,'{revokedAt}',to_jsonb($2::text)) WHERE order_number=$1 AND revoked_at IS NULL",[orderNumber,issuedAt]);await client.query("INSERT INTO commerce_guest_credentials(order_number,token_hash,payload,issued_at) VALUES($1,$2,$3::jsonb,$4)",[orderNumber,record.tokenHash,JSON.stringify(record),issuedAt]);});return token;}
  await mutate((store) => {
    store.records.filter((entry) => entry.orderNumber === orderNumber && !entry.revokedAt).forEach((entry) => { entry.revokedAt = now.toISOString(); });
    store.records.push({ orderNumber, tokenHash: tokenHash(token).toString("hex"), version: 1, issuedAt: now.toISOString() });
  });
  return token;
}

export async function verifyGuestOrderAccess(orderNumber: string, token: string | undefined) {
  if (!token) return false;
  const record = (await readStore()).records.find((entry) => entry.orderNumber === orderNumber && !entry.revokedAt);
  if (!record) return false;
  const expected = Buffer.from(record.tokenHash, "hex"); const actual = tokenHash(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function revokeGuestOrderAccess(orderNumber: string, now = new Date()) {
  if(!storePathOverride&&loadPersistenceConfig().provider==="POSTGRES"){const revokedAt=now.toISOString();const result=await query("UPDATE commerce_guest_credentials SET revoked_at=$2,payload=jsonb_set(payload,'{revokedAt}',to_jsonb($2::text)) WHERE order_number=$1 AND revoked_at IS NULL",[orderNumber,revokedAt]);return(result.rowCount??0)>0;}
  return mutate((store) => {
    let revoked = false;
    store.records.filter((entry) => entry.orderNumber === orderNumber && !entry.revokedAt).forEach((entry) => { entry.revokedAt = now.toISOString(); revoked = true; });
    return revoked;
  });
}
