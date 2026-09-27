import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BackendOrder } from "./types.js";

export type PayfastMode = "sandbox" | "live";

export interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase?: string;
  mode: PayfastMode;
  publicAppUrl: string;
  publicApiUrl: string;
  trustProxy: boolean;
}

export interface ItnValidationResult {
  ok: boolean;
  reason?: string;
  signatureDiagnostic?: PayfastSignatureDiagnostic;
}

export interface PayfastSignatureDiagnostic {
  receivedSignature?: string;
  calculatedSignature: string;
  serializedParameterString: string;
}

export const payfastProcessUrls: Record<PayfastMode, string> = {
  sandbox: "https://sandbox.payfast.co.za/eng/process",
  live: "https://www.payfast.co.za/eng/process",
};

const validPayfastHosts = [
  "www.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
  "sandbox.payfast.co.za",
];

export function readPayfastConfig(): PayfastConfig {
  const mode = process.env.PAYFAST_MODE === "live" ? "live" : "sandbox";
  const merchantId = process.env.PAYFAST_MERCHANT_ID ?? "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY ?? "";
  const passphrase = process.env.PAYFAST_PASSPHRASE || undefined;
  const publicAppUrl = (process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:5173").replace(
    /\/$/,
    "",
  );
  const publicApiUrl = (process.env.PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );
  const trustProxy = process.env.PAYFAST_TRUST_PROXY === "true";
  return {
    merchantId,
    merchantKey,
    passphrase,
    mode,
    publicAppUrl,
    publicApiUrl,
    trustProxy,
  };
}

export function encodePayfastValue(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/[!'()*~]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%20/g, "+");
}

export function createPayfastSignature(
  data: Record<string, string | number | undefined>,
  passphrase?: string,
) {
  const paramString = Object.entries(data)
    .filter(([, value]) => value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => `${key}=${encodePayfastValue(String(value))}`)
    .join("&");
  const signedString = passphrase
    ? `${paramString}&passphrase=${encodePayfastValue(passphrase)}`
    : paramString;
  return createHash("md5").update(signedString).digest("hex");
}

function createPayfastItnParameterString(
  data: Record<string, string>,
  passphrase?: string,
  redactSensitiveValues = false,
) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "signature") continue;
    const serializedValue =
      redactSensitiveValues && key === "merchant_key"
        ? "[redacted]"
        : encodePayfastValue(value);
    parts.push(`${key}=${serializedValue}`);
  }
  if (passphrase !== undefined) {
    parts.push(
      `passphrase=${redactSensitiveValues ? "[redacted]" : encodePayfastValue(passphrase)}`,
    );
  }
  return parts.join("&");
}

export function createPayfastItnSignature(data: Record<string, string>, passphrase?: string) {
  return createHash("md5")
    .update(createPayfastItnParameterString(data, passphrase))
    .digest("hex");
}

export function createPayfastItnSignatureDiagnostic(
  data: Record<string, string>,
  passphrase?: string,
): PayfastSignatureDiagnostic {
  return {
    receivedSignature: data.signature,
    calculatedSignature: createPayfastItnSignature(data, passphrase),
    serializedParameterString: createPayfastItnParameterString(data, passphrase, true),
  };
}

export function buildPayfastPaymentRequest(order: BackendOrder, config: PayfastConfig) {
  if (!config.merchantId || !config.merchantKey) {
    throw new Error("PayFast sandbox credentials are not configured.");
  }

  const fields: Record<string, string> = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: `${config.publicAppUrl}/payment/payfast/return?order=${encodeURIComponent(order.orderNumber)}`,
    cancel_url: `${config.publicAppUrl}/payment/payfast/cancel?order=${encodeURIComponent(order.orderNumber)}`,
    notify_url: `${config.publicApiUrl}/api/payments/payfast/itn`,
    name_first: order.customer.firstName,
    name_last: order.customer.lastName,
    email_address: order.customer.email,
    cell_number: order.customer.mobile,
    m_payment_id: order.payment.paymentReference,
    amount: order.total.toFixed(2),
    item_name: order.orderNumber,
    item_description: `TekCentral order ${order.orderNumber}`,
  };

  return {
    actionUrl: payfastProcessUrls[config.mode],
    fields: {
      ...fields,
      signature: createPayfastSignature(fields, config.passphrase),
    } as Record<string, string>,
  };
}

export function verifyPayfastSignature(
  data: Record<string, string>,
  passphrase?: string,
) {
  const receivedSignature = data.signature;
  if (!receivedSignature) return false;
  const expected = createPayfastItnSignature(data, passphrase);
  const receivedBuffer = Buffer.from(receivedSignature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function normalizeIp(ip?: string) {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export async function resolvePayfastIps() {
  const results = await Promise.all(
    validPayfastHosts.map((host) => lookup(host, { all: true })),
  );
  return new Set(results.flat().map((entry) => normalizeIp(entry.address)));
}

export async function isPayfastSourceIp(sourceIp?: string) {
  const normalizedSourceIp = normalizeIp(sourceIp);
  if (!normalizedSourceIp || !isIP(normalizedSourceIp)) return false;
  try {
    const validIps = await resolvePayfastIps();
    return validIps.has(normalizedSourceIp);
  } catch {
    return false;
  }
}

export async function validatePayfastItn(
  data: Record<string, string>,
  order: BackendOrder,
  config: PayfastConfig,
  sourceIp?: string,
  sourceIpValidator: (ip?: string) => Promise<boolean> = isPayfastSourceIp,
): Promise<ItnValidationResult> {
  if (!verifyPayfastSignature(data, config.passphrase)) {
    return {
      ok: false,
      reason: "Invalid signature",
      signatureDiagnostic: createPayfastItnSignatureDiagnostic(data, config.passphrase),
    };
  }
  if (data.merchant_id !== config.merchantId) {
    return { ok: false, reason: "Merchant mismatch" };
  }
  if (data.m_payment_id !== order.payment.paymentReference) {
    return { ok: false, reason: "Payment reference mismatch" };
  }
  const grossAmount = Number(data.amount_gross);
  if (!Number.isFinite(grossAmount) || Math.abs(grossAmount - order.total) > 0.01) {
    return { ok: false, reason: "Amount mismatch" };
  }
  if (data.payment_status !== "COMPLETE") {
    return { ok: false, reason: "Payment is not complete" };
  }
  const sourceIpOk = await sourceIpValidator(sourceIp);
  if (!sourceIpOk) {
    return { ok: false, reason: "Invalid PayFast source IP" };
  }
  return { ok: true };
}

export function isDuplicatePayfastItn(order: BackendOrder, duplicateKey?: string) {
  return Boolean(duplicateKey && order.payment.processedItnIds.includes(duplicateKey));
}
