import type { PoolClient } from "pg";
import type {
  CustomerAccount,
  CustomerAddress,
  CustomerAudit,
  CustomerSession,
  CustomerStore,
} from "../customerAuth.js";
import { postgresPool, withTransaction } from "./postgres.js";

const CUSTOMER_STORE_LOCK = 8_473_629_111;

type CustomerRow = {
  id: string;
  email: string;
  password_hash: string;
  status: CustomerAccount["status"];
  profile: { firstName?: string; lastName?: string; phone?: string } | null;
  email_verified_at: Date | string | null;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : undefined;

async function loadWith(client: Pick<PoolClient, "query">): Promise<CustomerStore> {
  const accountsResult = await client.query<CustomerRow>("SELECT id,email,password_hash,status,profile,email_verified_at,last_login_at,created_at,updated_at FROM customers ORDER BY created_at,id");
  const addressesResult = await client.query<{ id: string; customer_id: string; label: string; recipient: Record<string, unknown>; address: Record<string, unknown>; is_default: boolean; created_at: Date | string; updated_at: Date | string }>("SELECT * FROM customer_addresses ORDER BY created_at,id");
  const sessionsResult = await client.query<{ id: string; customer_id: string; token_hash: string; created_at: Date | string; expires_at: Date | string; revoked_at: Date | string | null; metadata: { zeusAccountDataConsent?: CustomerSession["zeusAccountDataConsent"] } | null }>("SELECT id,customer_id,token_hash,created_at,expires_at,revoked_at,metadata FROM customer_sessions ORDER BY created_at,id");
  const resetsResult = await client.query<{ id: string; customer_id: string; token_hash: string; created_at: Date | string; expires_at: Date | string; used_at: Date | string | null; revoked_at: Date | string | null }>("SELECT * FROM customer_password_resets ORDER BY created_at,id");
  const auditResult = await client.query<{ id: string; customer_id: string | null; event_type: CustomerAudit["type"]; occurred_at: Date | string }>("SELECT id,customer_id,event_type,occurred_at FROM customer_security_events ORDER BY occurred_at,id");
  return {
    version: 1,
    accounts: accountsResult.rows.map((row) => ({ id: row.id, email: row.email, passwordHash: row.password_hash, firstName: row.profile?.firstName ?? "", lastName: row.profile?.lastName ?? "", phone: row.profile?.phone, status: row.status, emailVerifiedAt: iso(row.email_verified_at), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!, lastLoginAt: iso(row.last_login_at) })),
    addresses: addressesResult.rows.map((row) => ({ id: row.id, customerAccountId: row.customer_id, label: row.label, ...(row.recipient as Pick<CustomerAddress, "recipientFirstName" | "recipientLastName" | "company" | "phone">), ...(row.address as Pick<CustomerAddress, "addressLine1" | "addressLine2" | "suburb" | "city" | "province" | "postalCode" | "country">), isDefault: row.is_default, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! })),
    sessions: sessionsResult.rows.map((row) => ({ id: row.id, customerId: row.customer_id, tokenHash: row.token_hash, createdAt: iso(row.created_at)!, expiresAt: iso(row.expires_at)!, revokedAt: iso(row.revoked_at), zeusAccountDataConsent: row.metadata?.zeusAccountDataConsent })),
    passwordResets: resetsResult.rows.map((row) => ({ id: row.id, customerId: row.customer_id, tokenHash: row.token_hash, createdAt: iso(row.created_at)!, expiresAt: iso(row.expires_at)!, usedAt: iso(row.used_at), revokedAt: iso(row.revoked_at) })),
    audit: auditResult.rows.map((row) => ({ id: row.id, customerId: row.customer_id ?? undefined, type: row.event_type, createdAt: iso(row.occurred_at)! })),
  };
}

async function replaceWith(client: PoolClient, store: CustomerStore) {
  for (const account of store.accounts) await client.query(`INSERT INTO customers(id,email,normalized_email,display_name,password_hash,status,profile,email_verified_at,last_login_at,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,normalized_email=EXCLUDED.normalized_email,display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,status=EXCLUDED.status,profile=EXCLUDED.profile,email_verified_at=EXCLUDED.email_verified_at,last_login_at=EXCLUDED.last_login_at,updated_at=EXCLUDED.updated_at`,
    [account.id, account.email, account.email.toLowerCase(), `${account.firstName} ${account.lastName}`.trim(), account.passwordHash, account.status, { firstName: account.firstName, lastName: account.lastName, phone: account.phone }, account.emailVerifiedAt ?? null, account.lastLoginAt ?? null, account.createdAt, account.updatedAt]);
  for (const address of store.addresses) await client.query(`INSERT INTO customer_addresses(id,customer_id,label,recipient,address,is_default,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,recipient=EXCLUDED.recipient,address=EXCLUDED.address,is_default=EXCLUDED.is_default,updated_at=EXCLUDED.updated_at`,
    [address.id, address.customerAccountId, address.label, { recipientFirstName: address.recipientFirstName, recipientLastName: address.recipientLastName, company: address.company, phone: address.phone }, { addressLine1: address.addressLine1, addressLine2: address.addressLine2, suburb: address.suburb, city: address.city, province: address.province, postalCode: address.postalCode, country: address.country }, address.isDefault, address.createdAt, address.updatedAt]);
  for (const session of store.sessions) await client.query(`INSERT INTO customer_sessions(id,customer_id,token_hash,created_at,last_seen_at,expires_at,revoked_at,metadata)
    VALUES($1,$2,$3,$4,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at,metadata=EXCLUDED.metadata`,
    [session.id, session.customerId, session.tokenHash, session.createdAt, session.expiresAt, session.revokedAt ?? null, { zeusAccountDataConsent: session.zeusAccountDataConsent }]);
  for (const reset of store.passwordResets) await client.query(`INSERT INTO customer_password_resets(id,customer_id,token_hash,created_at,expires_at,used_at,revoked_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET used_at=EXCLUDED.used_at,revoked_at=EXCLUDED.revoked_at`,
    [reset.id, reset.customerId, reset.tokenHash, reset.createdAt, reset.expiresAt, reset.usedAt ?? null, reset.revokedAt ?? null]);
  for (const event of store.audit) await client.query("INSERT INTO customer_security_events(id,customer_id,event_type,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING", [event.id, event.customerId ?? null, event.type, event.createdAt]);

  const prune = async (table: string, ids: string[]) => {
    if (ids.length) await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [ids]);
    else await client.query(`DELETE FROM ${table}`);
  };
  await prune("customer_addresses", store.addresses.map((item) => item.id));
  await prune("customer_sessions", store.sessions.map((item) => item.id));
  await prune("customer_password_resets", store.passwordResets.map((item) => item.id));
  await prune("customer_security_events", store.audit.map((item) => item.id));
  await prune("customers", store.accounts.map((item) => item.id));
}

export async function importPostgresCustomerStore(store: CustomerStore, sourceFingerprint: string) {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [CUSTOMER_STORE_LOCK]);
    const prior = await client.query<{ status: string }>("SELECT status FROM migration_import_runs WHERE source_fingerprint=$1 AND mode='CUSTOMERS'", [sourceFingerprint]);
    if (prior.rows[0]?.status === "SUCCESS") return { imported: false, idempotent: true, accounts: store.accounts.length };
    const destination = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM customers");
    if (Number(destination.rows[0]?.count ?? 0) > 0) throw new Error("CUSTOMER_MIGRATION_CONFLICT: destination customers table is not empty.");
    await client.query("INSERT INTO migration_import_runs(source_fingerprint,mode,status,summary) VALUES($1,'CUSTOMERS','RUNNING',$2)", [sourceFingerprint, { accounts: store.accounts.length, addresses: store.addresses.length, sessions: store.sessions.length }]);
    await replaceWith(client, store);
    await client.query("UPDATE migration_import_runs SET status='SUCCESS',completed_at=now(),summary=$2 WHERE source_fingerprint=$1 AND mode='CUSTOMERS'", [sourceFingerprint, { accounts: store.accounts.length, addresses: store.addresses.length, sessions: store.sessions.length, passwordResets: store.passwordResets.length, securityEvents: store.audit.length }]);
    return { imported: true, idempotent: false, accounts: store.accounts.length };
  });
}

export async function readPostgresCustomerStore() {
  return loadWith(postgresPool());
}

export async function mutatePostgresCustomerStore<T>(operation: (store: CustomerStore) => Promise<T> | T) {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [CUSTOMER_STORE_LOCK]);
    const store = await loadWith(client);
    const result = await operation(store);
    await replaceWith(client, store);
    return result;
  });
}
