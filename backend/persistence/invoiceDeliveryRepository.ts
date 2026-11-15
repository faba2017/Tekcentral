import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "./postgres.js";
import type { BackendOrder } from "../types.js";

export type InvoiceStatus = "ISSUED";
export type CustomerDeliveryType = "ORDER_CONFIRMATION" | "INVOICE_DELIVERY";
export type CustomerDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";
export type CustomerDeliveryOrigin = "SYSTEM" | "STAFF_USER";
export type CustomerDeliveryAttemptOutcome = "SENT" | "FAILED";

export interface InvoiceCommercialSnapshot {
  schemaVersion: number;
  invoiceNumber: string;
  issuedAt: string;
  orderId?: string;
  orderNumber: string;
  orderCreatedAt?: string;
  seller: {
    legalName: string;
    tradingName?: string;
    registrationNumber?: string;
    registeredAddress: { lines: string[]; country: string };
    email: string;
    phone?: string;
    vatNumber?: string;
  };
  customer: {
    name: string;
    email: string;
    mobile?: string;
    companyName?: string;
    vatNumber?: string;
  };
  billingAddress: { lines: string[]; country: string; source?: "DELIVERY_ADDRESS_ONLY" | "BILLING_ADDRESS" };
  deliveryAddress?: { lines: string[]; country: string };
  lines: Array<{
    productId: string;
    description: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  deliveryAmount: number;
  taxAmount: number;
  total: number;
  currency: string;
  payment: {
    provider: string;
    reference: string;
    status: string;
    confirmedAt?: string;
  };
  taxEvidence?: { ratePercent?: number; treatment: "INCLUDED" | "UNRESOLVED" };
}

export interface CommerceInvoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issuedAt: string;
  currency: string;
  subtotal: number;
  deliveryAmount: number;
  taxAmount: number;
  total: number;
  paymentReference?: string;
  snapshot: InvoiceCommercialSnapshot;
  snapshotHash: string;
  snapshotSchemaVersion: number;
  createdAt: string;
}

export interface CommerceInvoiceDocument {
  id: string;
  invoiceId: string;
  mediaObjectId: string;
  rendererVersion: string;
  contentHash: string;
  createdAt: string;
}

export interface PrivateInvoiceMediaObject {
  id: string;
  bucket: string;
  objectKey: string;
  contentHash: string;
  contentType: "application/pdf";
  byteSize: number;
  createdAt: string;
}

export interface CommerceInvoiceDocumentBundle {
  document: CommerceInvoiceDocument;
  media: PrivateInvoiceMediaObject;
}

export interface CustomerDeliveryActor {
  originType: CustomerDeliveryOrigin;
  actorId?: string;
  actorLabel?: string;
  actorRole?: string;
}

export interface CommerceCustomerDelivery extends CustomerDeliveryActor {
  id: string;
  orderId: string;
  invoiceId?: string;
  deliveryType: CustomerDeliveryType;
  recipient: string;
  status: CustomerDeliveryStatus;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  sentAt?: string;
  safeFailureCode?: string;
  providerReference?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceCustomerDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt: string;
  outcome: CustomerDeliveryAttemptOutcome;
  providerReference?: string;
  safeFailureCode?: string;
  createdAt: string;
}

type InvoiceRow = {
  id: string; order_id: string; invoice_number: string; status: InvoiceStatus; issued_at: Date | string;
  currency: string; subtotal: string | number; delivery_amount: string | number; tax_amount: string | number;
  total: string | number; payment_reference: string | null; snapshot: InvoiceCommercialSnapshot;
  snapshot_hash: string; snapshot_schema_version: number; created_at: Date | string;
};
type InvoiceRecoveryRow = InvoiceRow & { recovery_required_at: Date | string };
type DocumentRow = { id: string; invoice_id: string; media_object_id: string; renderer_version: string; content_hash: string; created_at: Date | string };
type PrivateInvoiceMediaRow = { id: string; bucket: string; object_key: string; content_hash: string; content_type: "application/pdf"; byte_size: string | number; created_at: Date | string };
type DeliveryRow = {
  id: string; order_id: string; invoice_id: string | null; delivery_type: CustomerDeliveryType; recipient: string;
  status: CustomerDeliveryStatus; idempotency_key: string; attempt_count: number; last_attempt_at: Date | string | null;
  next_attempt_at: Date | string | null; sent_at: Date | string | null; safe_failure_code: string | null;
  provider_reference: string | null; origin_type: CustomerDeliveryOrigin; actor_id: string | null; actor_label: string | null;
  actor_role: string | null; lease_owner: string | null; lease_expires_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
};
type AttemptRow = {
  id: string; delivery_id: string; attempt_number: number; started_at: Date | string; completed_at: Date | string;
  outcome: CustomerDeliveryAttemptOutcome; provider_reference: string | null; safe_failure_code: string | null; created_at: Date | string;
};

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const optionalIso = (value: Date | string | null) => value ? iso(value) : undefined;
const canonicalize = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]))
    : value;
export const canonicalInvoiceSnapshotJson = (snapshot: InvoiceCommercialSnapshot) => JSON.stringify(canonicalize(snapshot));
export const invoiceSnapshotHash = (snapshot: InvoiceCommercialSnapshot) => createHash("sha256").update(canonicalInvoiceSnapshotJson(snapshot)).digest("hex");

const mapInvoice = (row: InvoiceRow): CommerceInvoice => ({ id: row.id, orderId: row.order_id, invoiceNumber: row.invoice_number, status: row.status, issuedAt: iso(row.issued_at), currency: row.currency.trim(), subtotal: Number(row.subtotal), deliveryAmount: Number(row.delivery_amount), taxAmount: Number(row.tax_amount), total: Number(row.total), paymentReference: row.payment_reference ?? undefined, snapshot: row.snapshot, snapshotHash: row.snapshot_hash, snapshotSchemaVersion: row.snapshot_schema_version, createdAt: iso(row.created_at) });
const mapDocument = (row: DocumentRow): CommerceInvoiceDocument => ({ id: row.id, invoiceId: row.invoice_id, mediaObjectId: row.media_object_id, rendererVersion: row.renderer_version, contentHash: row.content_hash, createdAt: iso(row.created_at) });
const mapPrivateInvoiceMedia = (row: PrivateInvoiceMediaRow): PrivateInvoiceMediaObject => ({ id: row.id, bucket: row.bucket, objectKey: row.object_key, contentHash: row.content_hash, contentType: row.content_type, byteSize: Number(row.byte_size), createdAt: iso(row.created_at) });
const mapDelivery = (row: DeliveryRow): CommerceCustomerDelivery => ({ id: row.id, orderId: row.order_id, invoiceId: row.invoice_id ?? undefined, deliveryType: row.delivery_type, recipient: row.recipient, status: row.status, idempotencyKey: row.idempotency_key, attemptCount: row.attempt_count, lastAttemptAt: optionalIso(row.last_attempt_at), nextAttemptAt: optionalIso(row.next_attempt_at), sentAt: optionalIso(row.sent_at), safeFailureCode: row.safe_failure_code ?? undefined, providerReference: row.provider_reference ?? undefined, originType: row.origin_type, actorId: row.actor_id ?? undefined, actorLabel: row.actor_label ?? undefined, actorRole: row.actor_role ?? undefined, leaseOwner: row.lease_owner ?? undefined, leaseExpiresAt: optionalIso(row.lease_expires_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
const mapAttempt = (row: AttemptRow): CommerceCustomerDeliveryAttempt => ({ id: row.id, deliveryId: row.delivery_id, attemptNumber: row.attempt_number, startedAt: iso(row.started_at), completedAt: iso(row.completed_at), outcome: row.outcome, providerReference: row.provider_reference ?? undefined, safeFailureCode: row.safe_failure_code ?? undefined, createdAt: iso(row.created_at) });

export async function allocateInvoiceNumber(year: number, client?: PoolClient) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("INVOICE_YEAR_INVALID");
  const result = client
    ? await client.query<{ value: string }>("SELECT allocate_business_sequence('invoice',$1)::text AS value", [year])
    : await query<{ value: string }>("SELECT allocate_business_sequence('invoice',$1)::text AS value", [year]);
  return `INV-${year}-${String(result.rows[0].value).padStart(6, "0")}`;
}

export async function createInvoiceIdempotently(input: Omit<CommerceInvoice, "snapshotHash">) {
  if (input.snapshot.invoiceNumber !== input.invoiceNumber || input.snapshot.issuedAt !== input.issuedAt || input.snapshot.schemaVersion !== input.snapshotSchemaVersion) throw new Error("INVOICE_SNAPSHOT_IDENTITY_MISMATCH");
  const snapshotHash = invoiceSnapshotHash(input.snapshot);
  return withTransaction(async (client) => {
    const inserted = await client.query<InvoiceRow>("INSERT INTO commerce_invoices(id,order_id,invoice_number,status,issued_at,currency,subtotal,delivery_amount,tax_amount,total,payment_reference,snapshot,snapshot_hash,snapshot_schema_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15) ON CONFLICT(order_id) DO NOTHING RETURNING *", [input.id, input.orderId, input.invoiceNumber, input.status, input.issuedAt, input.currency, input.subtotal, input.deliveryAmount, input.taxAmount, input.total, input.paymentReference ?? null, canonicalInvoiceSnapshotJson(input.snapshot), snapshotHash, input.snapshotSchemaVersion, input.createdAt]);
    if (inserted.rows[0]) return { invoice: mapInvoice(inserted.rows[0]), created: true };
    const existing = await client.query<InvoiceRow>("SELECT * FROM commerce_invoices WHERE order_id=$1", [input.orderId]);
    if (!existing.rows[0]) throw new Error("INVOICE_IDEMPOTENCY_CONFLICT");
    return { invoice: mapInvoice(existing.rows[0]), created: false };
  });
}

export interface TransactionalInvoicePreparation {
  invoiceId: string;
  deliveryId: string;
  currency: string;
  subtotal: number;
  deliveryAmount: number;
  taxAmount: number;
  total: number;
  paymentReference?: string;
  snapshot: InvoiceCommercialSnapshot;
  snapshotSchemaVersion: number;
}

export async function issueInvoiceForOrderTransactionally(input: {
  orderId: string;
  validate(order: BackendOrder): void;
  prepare(context: { order: BackendOrder; invoiceNumber: string; issuedAt: string }): TransactionalInvoicePreparation;
}) {
  return withTransaction(async (client) => {
    const lockedOrder = await client.query<{ payload: BackendOrder }>("SELECT payload FROM commerce_orders WHERE id=$1 FOR UPDATE", [input.orderId]);
    const order = lockedOrder.rows[0]?.payload;
    if (!order) throw new Error("INVOICE_ORDER_NOT_FOUND");
    const existing = await client.query<InvoiceRow>("SELECT * FROM commerce_invoices WHERE order_id=$1", [input.orderId]);
    if (existing.rows[0]) return { invoice: mapInvoice(existing.rows[0]), created: false, order };
    input.validate(order);
    const clock = await client.query<{ issued_at: Date | string; invoice_year: string }>("SELECT now() AS issued_at, EXTRACT(YEAR FROM now() AT TIME ZONE 'Africa/Johannesburg')::text AS invoice_year");
    const issuedAt = iso(clock.rows[0].issued_at);
    const invoiceNumber = await allocateInvoiceNumber(Number(clock.rows[0].invoice_year), client);
    const prepared = input.prepare({ order, invoiceNumber, issuedAt });
    if (prepared.snapshot.invoiceNumber !== invoiceNumber || prepared.snapshot.issuedAt !== issuedAt || prepared.snapshot.schemaVersion !== prepared.snapshotSchemaVersion) throw new Error("INVOICE_SNAPSHOT_IDENTITY_MISMATCH");
    const snapshotHash = invoiceSnapshotHash(prepared.snapshot);
    const inserted = await client.query<InvoiceRow>("INSERT INTO commerce_invoices(id,order_id,invoice_number,status,issued_at,currency,subtotal,delivery_amount,tax_amount,total,payment_reference,snapshot,snapshot_hash,snapshot_schema_version,created_at) VALUES($1,$2,$3,'ISSUED',$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$4) RETURNING *", [prepared.invoiceId, order.id, invoiceNumber, issuedAt, prepared.currency, prepared.subtotal, prepared.deliveryAmount, prepared.taxAmount, prepared.total, prepared.paymentReference ?? null, canonicalInvoiceSnapshotJson(prepared.snapshot), snapshotHash, prepared.snapshotSchemaVersion]);
    await client.query("INSERT INTO commerce_customer_deliveries(id,order_id,invoice_id,delivery_type,recipient,status,idempotency_key,attempt_count,next_attempt_at,origin_type,created_at,updated_at) VALUES($1,$2,$3,'INVOICE_DELIVERY',$4,'PENDING',$5,0,NULL,'SYSTEM',$6,$6)", [prepared.deliveryId, order.id, prepared.invoiceId, order.customer.email.trim().toLowerCase(), `invoice-delivery:${prepared.invoiceId}`, issuedAt]);
    return { invoice: mapInvoice(inserted.rows[0]), created: true, order };
  });
}

export async function getInvoiceById(id: string) { const row = (await query<InvoiceRow>("SELECT * FROM commerce_invoices WHERE id=$1", [id])).rows[0]; return row ? mapInvoice(row) : undefined; }
export async function getInvoiceByOrderId(orderId: string) { const row = (await query<InvoiceRow>("SELECT * FROM commerce_invoices WHERE order_id=$1", [orderId])).rows[0]; return row ? mapInvoice(row) : undefined; }
export async function getInvoiceByNumber(invoiceNumber: string) { const row = (await query<InvoiceRow>("SELECT * FROM commerce_invoices WHERE invoice_number=$1", [invoiceNumber])).rows[0]; return row ? mapInvoice(row) : undefined; }

export async function findProspectiveInvoicesMissingDocument(input: { requiredBefore: string; limit?: number }) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  const rows = await query<InvoiceRecoveryRow>(`SELECT i.*,o.invoice_required_at AS recovery_required_at
    FROM commerce_invoices i
    JOIN commerce_orders o ON o.id=i.order_id
    WHERE o.invoice_required_at IS NOT NULL
      AND i.issued_at<=$1::timestamptz
      AND NOT EXISTS (SELECT 1 FROM commerce_invoice_documents d WHERE d.invoice_id=i.id)
    ORDER BY i.issued_at,i.id
    LIMIT $2`, [input.requiredBefore, limit]);
  return rows.rows.map((row) => ({ invoice: mapInvoice(row), requiredAt: iso(row.recovery_required_at) }));
}

export async function findProspectiveInvoicesMissingDelivery(input: { requiredBefore: string; limit?: number }) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  const rows = await query<InvoiceRecoveryRow>(`SELECT i.*,o.invoice_required_at AS recovery_required_at
    FROM commerce_invoices i
    JOIN commerce_orders o ON o.id=i.order_id
    WHERE o.invoice_required_at IS NOT NULL
      AND i.issued_at<=$1::timestamptz
      AND EXISTS (SELECT 1 FROM commerce_invoice_documents d WHERE d.invoice_id=i.id)
      AND NOT EXISTS (SELECT 1 FROM commerce_customer_deliveries cd WHERE cd.invoice_id=i.id AND cd.delivery_type='INVOICE_DELIVERY')
    ORDER BY i.issued_at,i.id
    LIMIT $2`, [input.requiredBefore, limit]);
  return rows.rows.map((row) => ({ invoice: mapInvoice(row), requiredAt: iso(row.recovery_required_at) }));
}

export async function associateInvoiceDocument(input: CommerceInvoiceDocument) {
  const inserted = await query<DocumentRow>("INSERT INTO commerce_invoice_documents(id,invoice_id,media_object_id,renderer_version,content_hash,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(invoice_id) DO NOTHING RETURNING *", [input.id, input.invoiceId, input.mediaObjectId, input.rendererVersion, input.contentHash, input.createdAt]);
  if (inserted.rows[0]) return { document: mapDocument(inserted.rows[0]), created: true };
  const existing = await getInvoiceDocument(input.invoiceId);
  if (!existing) throw new Error("INVOICE_DOCUMENT_CONFLICT");
  if (existing.mediaObjectId !== input.mediaObjectId || existing.contentHash !== input.contentHash) throw new Error("INVOICE_DOCUMENT_ALREADY_ASSOCIATED");
  return { document: existing, created: false };
}
export async function getInvoiceDocument(invoiceId: string) { const row = (await query<DocumentRow>("SELECT * FROM commerce_invoice_documents WHERE invoice_id=$1", [invoiceId])).rows[0]; return row ? mapDocument(row) : undefined; }

export async function getInvoiceDocumentBundle(invoiceId: string): Promise<CommerceInvoiceDocumentBundle | undefined> {
  const row = (await query<DocumentRow & PrivateInvoiceMediaRow>("SELECT d.*,m.id AS media_id,m.bucket,m.object_key,m.content_hash AS media_content_hash,m.content_type,m.byte_size,m.created_at AS media_created_at FROM commerce_invoice_documents d JOIN media_objects m ON m.id=d.media_object_id WHERE d.invoice_id=$1 AND m.deleted_at IS NULL", [invoiceId])).rows[0] as (DocumentRow & { media_id: string; bucket: string; object_key: string; media_content_hash: string; content_type: "application/pdf"; byte_size: string | number; media_created_at: Date | string }) | undefined;
  if (!row) return undefined;
  return { document: mapDocument(row), media: mapPrivateInvoiceMedia({ id: row.media_id, bucket: row.bucket, object_key: row.object_key, content_hash: row.media_content_hash, content_type: row.content_type, byte_size: row.byte_size, created_at: row.media_created_at }) };
}

export async function persistInvoiceDocument(input: { invoiceId: string; documentId: string; mediaId: string; rendererVersion: string; contentHash: string; bucket: string; objectKey: string; byteSize: number; createdAt: string }): Promise<{ bundle: CommerceInvoiceDocumentBundle; created: boolean }> {
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) throw new Error("INVOICE_DOCUMENT_HASH_INVALID");
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) throw new Error("INVOICE_DOCUMENT_SIZE_INVALID");
  return withTransaction(async (client) => {
    const invoice = await client.query("SELECT id FROM commerce_invoices WHERE id=$1 FOR UPDATE", [input.invoiceId]);
    if (!invoice.rows[0]) throw new Error("INVOICE_NOT_FOUND");
    const existing = await client.query<DocumentRow & { media_id: string; bucket: string; object_key: string; media_content_hash: string; content_type: "application/pdf"; byte_size: string | number; media_created_at: Date | string }>("SELECT d.*,m.id AS media_id,m.bucket,m.object_key,m.content_hash AS media_content_hash,m.content_type,m.byte_size,m.created_at AS media_created_at FROM commerce_invoice_documents d JOIN media_objects m ON m.id=d.media_object_id WHERE d.invoice_id=$1 AND m.deleted_at IS NULL", [input.invoiceId]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      return { bundle: { document: mapDocument(row), media: mapPrivateInvoiceMedia({ id: row.media_id, bucket: row.bucket, object_key: row.object_key, content_hash: row.media_content_hash, content_type: row.content_type, byte_size: row.byte_size, created_at: row.media_created_at }) }, created: false };
    }
    await client.query("INSERT INTO media_objects(id,object_scope,bucket,object_key,content_hash,content_type,byte_size,created_at) VALUES($1,'PRIVATE_INVOICE',$2,$3,$4,'application/pdf',$5,$6) ON CONFLICT(bucket,object_key) DO NOTHING", [input.mediaId, input.bucket, input.objectKey, input.contentHash, input.byteSize, input.createdAt]);
    const mediaRow = (await client.query<PrivateInvoiceMediaRow>("SELECT id,bucket,object_key,content_hash,content_type,byte_size,created_at FROM media_objects WHERE bucket=$1 AND object_key=$2 AND deleted_at IS NULL", [input.bucket, input.objectKey])).rows[0];
    if (!mediaRow || mediaRow.content_hash !== input.contentHash || mediaRow.content_type !== "application/pdf" || Number(mediaRow.byte_size) !== input.byteSize) throw new Error("INVOICE_MEDIA_METADATA_CONFLICT");
    const documentRow = (await client.query<DocumentRow>("INSERT INTO commerce_invoice_documents(id,invoice_id,media_object_id,renderer_version,content_hash,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [input.documentId, input.invoiceId, mediaRow.id, input.rendererVersion, input.contentHash, input.createdAt])).rows[0];
    return { bundle: { document: mapDocument(documentRow), media: mapPrivateInvoiceMedia(mediaRow) }, created: true };
  });
}

export async function createCustomerDeliveryIdempotently(input: Omit<CommerceCustomerDelivery, "status" | "attemptCount" | "lastAttemptAt" | "sentAt" | "safeFailureCode" | "providerReference" | "leaseOwner" | "leaseExpiresAt" | "updatedAt"> & { nextAttemptAt?: string }) {
  const inserted = await query<DeliveryRow>("INSERT INTO commerce_customer_deliveries(id,order_id,invoice_id,delivery_type,recipient,status,idempotency_key,attempt_count,next_attempt_at,origin_type,actor_id,actor_label,actor_role,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'PENDING',$6,0,$7,$8,$9,$10,$11,$12,$12) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *", [input.id, input.orderId, input.invoiceId ?? null, input.deliveryType, input.recipient, input.idempotencyKey, input.nextAttemptAt ?? input.createdAt, input.originType, input.actorId ?? null, input.actorLabel ?? null, input.actorRole ?? null, input.createdAt]);
  if (inserted.rows[0]) return { delivery: mapDelivery(inserted.rows[0]), created: true };
  const existing = await getCustomerDeliveryByIdempotencyKey(input.idempotencyKey);
  if (!existing) throw new Error("CUSTOMER_DELIVERY_IDEMPOTENCY_CONFLICT");
  return { delivery: existing, created: false };
}

export async function getCustomerDelivery(id: string) { const row = (await query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE id=$1", [id])).rows[0]; return row ? mapDelivery(row) : undefined; }
export async function getCustomerDeliveryByIdempotencyKey(key: string) { const row = (await query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE idempotency_key=$1", [key])).rows[0]; return row ? mapDelivery(row) : undefined; }
export async function listCustomerDeliveriesByOrder(orderId: string) { return (await query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE order_id=$1 ORDER BY created_at,id", [orderId])).rows.map(mapDelivery); }
export async function listCustomerDeliveriesByInvoice(invoiceId: string) { return (await query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE invoice_id=$1 ORDER BY created_at,id", [invoiceId])).rows.map(mapDelivery); }

export async function listDueCustomerDeliveries(input: { now: string; limit?: number; deliveryType?: CustomerDeliveryType }) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  return (await query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE ($2::text IS NULL OR delivery_type=$2) AND ((status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=$1)) OR (status='FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at<=$1) OR (status='SENDING' AND lease_expires_at<=$1)) ORDER BY COALESCE(next_attempt_at,lease_expires_at,created_at),id LIMIT $3", [input.now, input.deliveryType ?? null, limit])).rows.map(mapDelivery);
}

export async function claimCustomerDelivery(input: { deliveryId: string; leaseOwner: string; now: string; leaseSeconds?: number }) {
  const leaseSeconds = Math.min(900, Math.max(15, Math.trunc(input.leaseSeconds ?? 60)));
  return withTransaction(async (client) => {
    const claimed = await client.query<DeliveryRow>("UPDATE commerce_customer_deliveries SET status='SENDING',attempt_count=attempt_count+1,last_attempt_at=$2,next_attempt_at=NULL,safe_failure_code=NULL,provider_reference=NULL,lease_owner=$3,lease_expires_at=$2::timestamptz+($4::int*interval '1 second'),updated_at=$2 WHERE id=$1 AND ((status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=$2)) OR (status='FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at<=$2) OR (status='SENDING' AND lease_expires_at<=$2)) RETURNING *", [input.deliveryId, input.now, input.leaseOwner, leaseSeconds]);
    return claimed.rows[0] ? mapDelivery(claimed.rows[0]) : undefined;
  });
}

export async function deferClaimedCustomerDelivery(input: { deliveryId: string; leaseOwner: string; now: string; nextAttemptAt: string; safeFailureCode: string }) {
  const updated = await query<DeliveryRow>("UPDATE commerce_customer_deliveries SET status='PENDING',attempt_count=GREATEST(0,attempt_count-1),next_attempt_at=$4,safe_failure_code=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=$3 WHERE id=$1 AND status='SENDING' AND lease_owner=$2 RETURNING *", [input.deliveryId, input.leaseOwner, input.now, input.nextAttemptAt]);
  if (!updated.rows[0]) throw new Error("DELIVERY_CLAIM_NOT_OWNED");
  return mapDelivery(updated.rows[0]);
}

export async function scheduleFailedCustomerDeliveryRetry(input: { deliveryId: string; now: string }) {
  const updated = await query<DeliveryRow>("UPDATE commerce_customer_deliveries SET status='PENDING',next_attempt_at=$2,safe_failure_code=NULL,updated_at=$2 WHERE id=$1 AND status='FAILED' AND safe_failure_code NOT IN ('INVALID_RECIPIENT','RECIPIENT_MISMATCH') AND (safe_failure_code IS NULL OR safe_failure_code !~ '^SMTP_5[0-9]{2}$') RETURNING *", [input.deliveryId, input.now]);
  return updated.rows[0] ? mapDelivery(updated.rows[0]) : undefined;
}

export async function completeCustomerDeliveryAttempt(input: { deliveryId: string; attemptId: string; attemptNumber: number; leaseOwner: string; startedAt: string; completedAt: string; outcome: CustomerDeliveryAttemptOutcome; providerReference?: string; safeFailureCode?: string; nextAttemptAt?: string }) {
  if (input.outcome === "FAILED" && !input.safeFailureCode) throw new Error("DELIVERY_FAILURE_CODE_REQUIRED");
  if (input.outcome === "SENT" && input.safeFailureCode) throw new Error("DELIVERY_SUCCESS_FAILURE_CODE_INVALID");
  return withTransaction(async (client) => {
    const locked = await client.query<DeliveryRow>("SELECT * FROM commerce_customer_deliveries WHERE id=$1 FOR UPDATE", [input.deliveryId]);
    const delivery = locked.rows[0];
    if (!delivery || delivery.status !== "SENDING" || delivery.lease_owner !== input.leaseOwner || delivery.attempt_count !== input.attemptNumber) throw new Error("DELIVERY_CLAIM_NOT_OWNED");
    const attempt = await client.query<AttemptRow>("INSERT INTO commerce_customer_delivery_attempts(id,delivery_id,attempt_number,started_at,completed_at,outcome,provider_reference,safe_failure_code,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$5) RETURNING *", [input.attemptId, input.deliveryId, input.attemptNumber, input.startedAt, input.completedAt, input.outcome, input.providerReference ?? null, input.safeFailureCode ?? null]);
    const status: CustomerDeliveryStatus = input.outcome === "SENT" ? "SENT" : "FAILED";
    const updated = await client.query<DeliveryRow>("UPDATE commerce_customer_deliveries SET status=$2,sent_at=CASE WHEN $2='SENT' THEN $3::timestamptz ELSE NULL END,safe_failure_code=$4,provider_reference=$5,next_attempt_at=$6,lease_owner=NULL,lease_expires_at=NULL,updated_at=$3 WHERE id=$1 RETURNING *", [input.deliveryId, status, input.completedAt, input.safeFailureCode ?? null, input.providerReference ?? null, input.outcome === "FAILED" ? input.nextAttemptAt ?? null : null]);
    return { delivery: mapDelivery(updated.rows[0]), attempt: mapAttempt(attempt.rows[0]) };
  });
}

export async function listCustomerDeliveryAttempts(deliveryId: string) { return (await query<AttemptRow>("SELECT * FROM commerce_customer_delivery_attempts WHERE delivery_id=$1 ORDER BY attempt_number", [deliveryId])).rows.map(mapAttempt); }
