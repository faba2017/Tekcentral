import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "../persistence/config.js";
import { query, withTransaction } from "../persistence/postgres.js";

export type StoredAdminAiPolicy<T> = { revision: number; policy: T; updatedAt?: string; updatedBy?: string; changed?: boolean };
type LocalStore = { version: 1; records: Record<string, StoredAdminAiPolicy<unknown>> };
const namespace = "admin-ai-policy";
let pathOverride: string | undefined;
let queue = Promise.resolve();
const localPath = () => pathOverride ?? resolve(process.cwd(), ".data", "admin-ai-policies.json");
const keyForStaff = (staffId: string) => `staff:${staffId}`;
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) : item);

async function readLocal(): Promise<LocalStore> {
  try { const value = JSON.parse(await readFile(localPath(), "utf8")) as LocalStore; return value.version === 1 && value.records ? value : { version: 1, records: {} }; }
  catch { return { version: 1, records: {} }; }
}
async function writeLocal(store: LocalStore) { const path = localPath(); await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8"); await rename(temporary, path); }
async function localMutate<T>(operation: (store: LocalStore) => Promise<T> | T) { const pending = queue.then(async () => { const store = await readLocal(); const result = await operation(store); await writeLocal(store); return result; }); queue = pending.then(() => undefined, () => undefined); return pending; }

export async function readAdminAiPolicy<T>(key: "platform" | string): Promise<StoredAdminAiPolicy<T> | undefined> {
  const storageKey = key === "platform" ? key : keyForStaff(key);
  if (loadPersistenceConfig().provider !== "POSTGRES") return (await readLocal()).records[storageKey] as StoredAdminAiPolicy<T> | undefined;
  const row = (await query<{ version: number | string; payload: T; updated_at: Date | string }>("SELECT version,payload,updated_at FROM operational_state WHERE namespace=$1 AND key=$2", [namespace, storageKey])).rows[0];
  return row ? { revision: Number(row.version), policy: row.payload, updatedAt: new Date(row.updated_at).toISOString() } : undefined;
}

export async function writeAdminAiPolicy<T extends object>(key: "platform" | string, expectedRevision: number, policy: T, actor: string, now = new Date()): Promise<StoredAdminAiPolicy<T>> {
  const storageKey = key === "platform" ? key : keyForStaff(key); const next = expectedRevision + 1; const payload = policy;
  if (loadPersistenceConfig().provider !== "POSTGRES") return localMutate(async (store) => { const current = store.records[storageKey]; if ((current?.revision ?? 0) !== expectedRevision) throw Object.assign(new Error("Admin AI policy changed. Reload before saving."), { code: "POLICY_REVISION_CONFLICT", status: 409 }); if (current && stableJson(current.policy) === stableJson(payload)) return { ...current, changed: false } as StoredAdminAiPolicy<T>; const record = { revision: next, policy: payload, updatedAt: now.toISOString(), updatedBy: actor, changed: true }; store.records[storageKey] = record; return record as StoredAdminAiPolicy<T>; });
  return withTransaction(async (client) => {
    const current = (await client.query<{ version: number | string; payload: T; updated_at: Date | string }>("SELECT version,payload,updated_at FROM operational_state WHERE namespace=$1 AND key=$2 FOR UPDATE", [namespace, storageKey])).rows[0];
    const currentRevision = current ? Number(current.version) : 0;
    if (currentRevision !== expectedRevision) throw Object.assign(new Error("Admin AI policy changed. Reload before saving."), { code: "POLICY_REVISION_CONFLICT", status: 409 });
    if (current && stableJson(current.payload) === stableJson(payload)) return { revision: Number(current.version), policy: current.payload, updatedAt: new Date(current.updated_at).toISOString(), changed: false };
    if (current) await client.query("UPDATE operational_state SET version=$3,payload=$4::jsonb,updated_at=$5 WHERE namespace=$1 AND key=$2", [namespace, storageKey, next, JSON.stringify(payload), now.toISOString()]);
    else await client.query("INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES($1,$2,$3,$4::jsonb,$5)", [namespace, storageKey, next, JSON.stringify(payload), now.toISOString()]);
    return { revision: next, policy: payload as T, updatedAt: now.toISOString(), updatedBy: actor, changed: true };
  });
}

export function setAdminAiPolicyStorePathForTests(path?: string) { pathOverride = path; queue = Promise.resolve(); }
