import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { BackendOrder, SupplierOrder } from "../types.js";
import { query, withTransaction } from "./postgres.js";

const LOCK = 8_473_629_114;
const json = (value: unknown) => JSON.stringify(value);
type Json = Record<string, unknown>;

export interface CommerceRecoveryScope {
  orderConfirmationRequiredAt?: string;
  invoiceRequiredAt?: string;
}

export interface CommerceRecoveryCandidate {
  order: BackendOrder;
  requiredAt: string;
}

type RecoveryScopeRow = {
  order_confirmation_required_at: Date | string | null;
  invoice_required_at: Date | string | null;
};

type RecoveryCandidateRow = { payload: BackendOrder; required_at: Date | string };
const recoveryIso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const boundedRecoveryLimit = (limit: number) => Math.max(1, Math.min(100, Math.trunc(limit)));

async function persistOrder(client: PoolClient, order: BackendOrder) {
  await client.query("INSERT INTO commerce_orders(id,order_number,customer_id,status,payment_status,currency,total,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,status=excluded.status,payment_status=excluded.payment_status,currency=excluded.currency,total=excluded.total,payload=excluded.payload,updated_at=excluded.updated_at", [order.id, order.orderNumber, order.customerAccountId ?? null, order.status, order.payment.status, order.currency, order.total, json(order), order.createdAt, order.updatedAt]);
  await client.query("DELETE FROM commerce_order_lines WHERE order_id=$1", [order.id]);
  for (const item of order.items) await client.query("INSERT INTO commerce_order_lines(order_id,line_id,product_id,sku,quantity,unit_price,cost_basis,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)", [order.id, item.productId, item.productId, item.sku ?? null, item.quantity, item.unitPrice, item.costBasis ? json(item.costBasis) : null, json(item)]);
  await client.query("INSERT INTO commerce_payment_records(order_id,status,provider,provider_reference,amount,currency,payload,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,provider=excluded.provider,provider_reference=excluded.provider_reference,amount=excluded.amount,currency=excluded.currency,payload=excluded.payload,updated_at=excluded.updated_at", [order.id, order.payment.status, order.payment.provider, order.payment.payfastPaymentId ?? order.payment.paymentReference, order.payment.amount ?? order.payment.grossAmount ?? order.total, order.payment.currency ?? order.currency, json(order.payment), order.payment.updatedAt]);
  await client.query("DELETE FROM commerce_returns WHERE order_id=$1", [order.id]);
  for (const item of order.returns) await client.query("INSERT INTO commerce_returns(id,order_id,status,payload,created_at) VALUES($1,$2,$3,$4::jsonb,$5)", [item.id, order.id, item.status, json(item), item.createdAt]);
  await client.query("DELETE FROM commerce_refunds WHERE order_id=$1", [order.id]);
  for (const item of order.refunds) await client.query("INSERT INTO commerce_refunds(id,order_id,status,amount,payload,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)", [item.id, order.id, item.status, item.amount, json(item), item.createdAt]);
  await client.query("DELETE FROM commerce_shipments WHERE order_id=$1", [order.id]);
  const shipments = [...(order.shipments ?? []), ...(order.shipment ? [order.shipment] : [])] as Array<Record<string, unknown>>;
  for (const [index, item] of shipments.entries()) await client.query("INSERT INTO commerce_shipments(id,order_id,status,payload,created_at) VALUES($1,$2,$3,$4::jsonb,$5)", [String(item.id ?? `${order.id}-shipment-${index + 1}`), order.id, String(item.status ?? "UNKNOWN"), json(item), String(item.createdAt ?? order.updatedAt)]);
}

export async function listPostgresOrders() { return (await query<{ payload: BackendOrder }>("SELECT payload FROM commerce_orders ORDER BY created_at DESC, id")).rows.map((row) => row.payload); }
export async function getPostgresOrderById(id: string) { return (await query<{ payload: BackendOrder }>("SELECT payload FROM commerce_orders WHERE id=$1", [id])).rows[0]?.payload; }
export async function savePostgresOrder(order: BackendOrder) { await withTransaction(async (client) => { await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await persistOrder(client, order); }); return order; }
export async function saveProspectivePostgresOrder(order: BackendOrder) {
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    await persistOrder(client, order);
    await client.query("UPDATE commerce_orders SET order_confirmation_required_at=COALESCE(order_confirmation_required_at,now()) WHERE id=$1", [order.id]);
  });
  return order;
}
export async function mutatePostgresOrder(selector: { orderNumber?: string; id?: string }, updater: (order: BackendOrder) => BackendOrder) {
  return withTransaction(async (client) => { const result = await client.query<{ payload: BackendOrder }>(`SELECT payload FROM commerce_orders WHERE ${selector.orderNumber ? "order_number=$1" : "id=$1"} FOR UPDATE`, [selector.orderNumber ?? selector.id]); if (!result.rows[0]) return undefined; const next = updater(result.rows[0].payload); await persistOrder(client, next); return next; });
}
export async function mutatePostgresOrderForVerifiedPaidTransition(orderNumber: string, updater: (order: BackendOrder) => BackendOrder) {
  return withTransaction(async (client) => {
    const result = await client.query<{ payload: BackendOrder }>("SELECT payload FROM commerce_orders WHERE order_number=$1 FOR UPDATE", [orderNumber]);
    if (!result.rows[0]) return undefined;
    if (result.rows[0].payload.payment.status === "PAID") return result.rows[0].payload;
    const next = updater(result.rows[0].payload);
    if (next.payment.status !== "PAID") throw new Error("VERIFIED_PAYMENT_TRANSITION_MUST_BE_PAID");
    await persistOrder(client, next);
    await client.query("UPDATE commerce_orders SET invoice_required_at=COALESCE(invoice_required_at,now()) WHERE id=$1", [next.id]);
    return next;
  });
}

export async function getCommerceRecoveryScope(orderId: string): Promise<CommerceRecoveryScope | undefined> {
  const row = (await query<RecoveryScopeRow>("SELECT order_confirmation_required_at,invoice_required_at FROM commerce_orders WHERE id=$1", [orderId])).rows[0];
  if (!row) return undefined;
  return {
    ...(row.order_confirmation_required_at ? { orderConfirmationRequiredAt: recoveryIso(row.order_confirmation_required_at) } : {}),
    ...(row.invoice_required_at ? { invoiceRequiredAt: recoveryIso(row.invoice_required_at) } : {}),
  };
}

export async function findOrdersMissingRequiredConfirmation(input: { limit?: number; afterRequiredAt?: string; afterId?: string; requiredBefore?: string } = {}): Promise<CommerceRecoveryCandidate[]> {
  const limit = boundedRecoveryLimit(input.limit ?? 50);
  const cursor = input.afterRequiredAt && input.afterId;
  const parameters: unknown[] = cursor ? [input.afterRequiredAt, input.afterId, input.requiredBefore ?? null, limit] : [input.requiredBefore ?? null, limit];
  const rows = await query<RecoveryCandidateRow>(`SELECT o.payload,o.order_confirmation_required_at AS required_at
    FROM commerce_orders o
    WHERE o.order_confirmation_required_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM commerce_customer_deliveries d WHERE d.order_id=o.id AND d.delivery_type='ORDER_CONFIRMATION')
      ${cursor ? "AND (o.order_confirmation_required_at,o.id)>($1::timestamptz,$2)" : ""}
      AND ($${cursor ? 3 : 1}::timestamptz IS NULL OR o.order_confirmation_required_at<=$${cursor ? 3 : 1}::timestamptz)
    ORDER BY o.order_confirmation_required_at,o.id
    LIMIT $${cursor ? 4 : 2}`, parameters);
  return rows.rows.map((row) => ({ order: row.payload, requiredAt: recoveryIso(row.required_at) }));
}

export async function findPaidOrdersMissingRequiredInvoice(input: { limit?: number; afterRequiredAt?: string; afterId?: string; requiredBefore?: string } = {}): Promise<CommerceRecoveryCandidate[]> {
  const limit = boundedRecoveryLimit(input.limit ?? 50);
  const cursor = input.afterRequiredAt && input.afterId;
  const parameters: unknown[] = cursor ? [input.afterRequiredAt, input.afterId, input.requiredBefore ?? null, limit] : [input.requiredBefore ?? null, limit];
  const rows = await query<RecoveryCandidateRow>(`SELECT o.payload,o.invoice_required_at AS required_at
    FROM commerce_orders o
    WHERE o.invoice_required_at IS NOT NULL
      AND o.payment_status='PAID'
      AND NOT EXISTS (SELECT 1 FROM commerce_invoices i WHERE i.order_id=o.id)
      ${cursor ? "AND (o.invoice_required_at,o.id)>($1::timestamptz,$2)" : ""}
      AND ($${cursor ? 3 : 1}::timestamptz IS NULL OR o.invoice_required_at<=$${cursor ? 3 : 1}::timestamptz)
    ORDER BY o.invoice_required_at,o.id
    LIMIT $${cursor ? 4 : 2}`, parameters);
  return rows.rows.map((row) => ({ order: row.payload, requiredAt: recoveryIso(row.required_at) }));
}
export async function claimPostgresOrder(orderNumber:string,customerAccountId:string,updatedAt:string){return withTransaction(async client=>{const found=await client.query<{payload:BackendOrder}>("SELECT payload FROM commerce_orders WHERE order_number=$1 FOR UPDATE",[orderNumber]);const order=found.rows[0]?.payload;if(!order||order.customerAccountId)return undefined;const next={...order,customerAccountId,updatedAt};await persistOrder(client,next);return next;});}

export async function listPostgresSupplierOrders() { return (await query<{ payload: SupplierOrder }>("SELECT payload FROM commerce_supplier_orders ORDER BY created_at DESC, id")).rows.map((row) => row.payload); }
async function persistSupplierOrder(client:PoolClient,order:SupplierOrder){await client.query("INSERT INTO commerce_supplier_orders(id,order_number,supplier_code,status,external_reference,request_fingerprint,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT(id) DO UPDATE SET status=excluded.status,external_reference=excluded.external_reference,request_fingerprint=excluded.request_fingerprint,payload=excluded.payload,updated_at=excluded.updated_at",[order.id,order.customerOrderNumber,order.supplierCode,order.status,order.externalReference??order.supplierOrderReference??null,order.externalSubmission?.requestFingerprint??null,json(order),order.createdAt,order.updatedAt]);await client.query("DELETE FROM commerce_supplier_order_lines WHERE supplier_order_id=$1",[order.id]);for(const line of order.itemLines)await client.query("INSERT INTO commerce_supplier_order_lines(supplier_order_id,line_id,product_id,supplier_sku,quantity,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[order.id,line.orderItemId,line.productId,line.supplierSku??line.supplierVariantSku??null,line.quantity,json(line)]);}
export async function savePostgresSupplierOrder(order: SupplierOrder) { await withTransaction(client=>persistSupplierOrder(client,order)); return order; }
export async function mutatePostgresSupplierOrder(id: string, updater: (order: SupplierOrder) => SupplierOrder) { return withTransaction(async (client) => { const found=await client.query<{payload:SupplierOrder}>("SELECT payload FROM commerce_supplier_orders WHERE id=$1 FOR UPDATE",[id]);if(!found.rows[0])return undefined;const next=updater(found.rows[0].payload);await persistSupplierOrder(client,next);return next;}); }
export async function claimPostgresSupplierOrderSubmission(id:string,requestFingerprint:string,updater:(order:SupplierOrder)=>SupplierOrder){return withTransaction(async client=>{const found=await client.query<{payload:SupplierOrder}>("SELECT payload FROM commerce_supplier_orders WHERE id=$1 FOR UPDATE",[id]);const current=found.rows[0]?.payload;if(!current)return undefined;const status=current.externalSubmission?.status;if(status==="CREATED")return{state:"REUSED" as const,order:current};if(status==="SUBMITTING"||status==="UNKNOWN_RESULT")return{state:"BLOCKED" as const,order:current};const next=updater(current);if(next.externalSubmission?.requestFingerprint!==requestFingerprint)throw new Error("Supplier submission claim fingerprint mismatch.");await persistSupplierOrder(client,next);return{state:"CLAIMED" as const,order:next};});}

export async function readCommerceRows<T>(table:string,order:string){return(await query<{payload:T}>(`SELECT payload FROM ${table} ORDER BY ${order}`)).rows.map(row=>row.payload);}
export async function replaceCommerceRows(table:string,rows:unknown[],insert:(client:PoolClient,row:Json)=>Promise<unknown>){await withTransaction(async client=>{await client.query("SELECT pg_advisory_xact_lock($1)",[LOCK]);await client.query(`DELETE FROM ${table}`);for(const value of rows)await insert(client,value as Json);});}
export function commerceFingerprint(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,16);}
export async function recordCommerceImport(fingerprint:string,summary:unknown){await query("INSERT INTO commerce_import_runs(fingerprint,source_summary,completed_at) VALUES($1,$2::jsonb,now()) ON CONFLICT DO NOTHING",[fingerprint,json(summary)]);}
export async function commerceImportExists(fingerprint:string){return(await query("SELECT 1 FROM commerce_import_runs WHERE fingerprint=$1",[fingerprint])).rowCount===1;}

export async function reserveFinalInventoryUnit(input:{offerId:string;orderLineId:string;quantity:number}){return withTransaction(async client=>{const existing=await client.query("SELECT 1 FROM commerce_inventory_reservations WHERE offer_id=$1 AND supplier_order_id=$2",[input.offerId,input.orderLineId]);if(existing.rowCount)return true;const balance=await client.query<{on_hand:number;reserved:number}>("SELECT on_hand,reserved FROM commerce_inventory_balances WHERE offer_id=$1 FOR UPDATE",[input.offerId]);if(!balance.rows[0]||balance.rows[0].on_hand-balance.rows[0].reserved<input.quantity)return false;const inserted=await client.query("INSERT INTO commerce_inventory_reservations(id,offer_id,supplier_order_id,quantity,status,payload,created_at) VALUES($1,$2,$3,$4,'ACTIVE',$5::jsonb,now()) ON CONFLICT(offer_id,supplier_order_id) DO NOTHING RETURNING id",[`reservation-${input.offerId}-${input.orderLineId}`,input.offerId,input.orderLineId,input.quantity,json(input)]);if(!inserted.rowCount)return true;await client.query("UPDATE commerce_inventory_balances SET reserved=reserved+$2,updated_at=now(),payload=jsonb_set(payload,'{reserved}',to_jsonb(reserved+$2)) WHERE offer_id=$1",[input.offerId,input.quantity]);return true;});}
