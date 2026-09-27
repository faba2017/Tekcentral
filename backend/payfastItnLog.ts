import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
  const store = await readStore();
  store.events.unshift({
    ...event,
    createdAt: new Date().toISOString(),
  });
  store.events = store.events.slice(0, 100);
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}
