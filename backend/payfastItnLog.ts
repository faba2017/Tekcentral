import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query } from "./persistence/postgres.js";

interface PayfastItnEvent {
  createdAt: string;
  orderNumber?: string;
  paymentReference?: string;
  pfPaymentId?: string;
  remoteAddress?: string;
  forwardedClientIp?: string;
  trustedClientIp?: string;
  accepted: boolean;
  reason?: string;
  signatureDiagnostic?: {
    receivedSignature?: string;
    calculatedSignature: string;
    serializedParameterString: string;
  };
}

interface PayfastItnEventStore {
  version: 1;
  events: PayfastItnEvent[];
}

const storePath = resolve(process.cwd(), ".data", "payfast-itn-events.json");

async function readStore(): Promise<PayfastItnEventStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PayfastItnEventStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
      return { version: 1, events: [] };
    }
    return { version: 1, events: parsed.events };
  } catch {
    return { version: 1, events: [] };
  }
}

export async function recordPayfastItnEvent(
  event: Omit<PayfastItnEvent, "createdAt">,
) {
  if(loadPersistenceConfig().provider==="POSTGRES"){
    const createdAt=new Date().toISOString();const payload={...event,createdAt};const key=event.pfPaymentId?`PAYFAST:${event.pfPaymentId}`:createHash("sha256").update(JSON.stringify([event.orderNumber,event.paymentReference,event.accepted,event.reason])).digest("hex");const id=createHash("sha256").update(`${key}:${createdAt}`).digest("hex");
    await query("INSERT INTO commerce_payment_events(id,order_number,provider_reference,idempotency_key,accepted,reason,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(idempotency_key) DO NOTHING",[id,event.orderNumber??null,event.pfPaymentId??event.paymentReference??null,key,event.accepted,event.reason??null,JSON.stringify(payload),createdAt]);return;
  }
  const store = await readStore();
  store.events.unshift({
    ...event,
    createdAt: new Date().toISOString(),
  });
  store.events = store.events.slice(0, 100);
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}
