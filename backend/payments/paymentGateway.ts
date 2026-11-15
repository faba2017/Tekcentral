import type { BackendOrder, PaymentStatus } from "../types.js";
import { buildPayfastPaymentRequest, readPayfastConfig, type PayfastConfig } from "../payfast.js";
import { getSettingsDomain, patchSettingsDomain } from "../businessSettingsRepository.js";

export type PaymentGatewayProvider = "PAYFAST" | "PEACH_PAYMENTS" | "OZOW" | "PAYSTACK" | "YOCO" | "DPO_PAYGATE" | "STITCH";
export type PaymentGatewayMode = "SANDBOX" | "LIVE";
export type GatewayCapability = "CREATE_PAYMENT" | "HOSTED_CHECKOUT" | "EMBEDDED_CHECKOUT" | "WEBHOOK" | "STATUS_QUERY" | "FULL_REFUND" | "PARTIAL_REFUND" | "TOKENIZATION" | "RECURRING" | "PAY_BY_BANK" | "CARD";
export type GatewayImplementationStatus = "CONFIGURATION_SCHEMA_AVAILABLE" | "ADAPTER_AVAILABLE" | "CHECKOUT_AVAILABLE";
export interface GatewayField { key: string; label: string; kind: "SECRET" | "TEXT" | "URL" | "ENUM"; secret?: boolean; }
export interface PaymentGatewayDefinition { provider: PaymentGatewayProvider; displayName: string; description: string; modes: PaymentGatewayMode[]; capabilities: GatewayCapability[]; implementation: GatewayImplementationStatus[]; credentialFields: GatewayField[]; configurationFields: GatewayField[]; documentationUrl: string; }

const provider = (definition: PaymentGatewayDefinition) => definition;
export const paymentGatewayRegistry: PaymentGatewayDefinition[] = [
  provider({ provider: "PAYFAST", displayName: "PayFast", description: "Hosted South African payment checkout.", modes: ["SANDBOX", "LIVE"], capabilities: ["CREATE_PAYMENT", "HOSTED_CHECKOUT", "WEBHOOK"], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE", "ADAPTER_AVAILABLE", "CHECKOUT_AVAILABLE"], credentialFields: [{ key: "merchantId", label: "Merchant ID", kind: "SECRET", secret: true }, { key: "merchantKey", label: "Merchant Key", kind: "SECRET", secret: true }, { key: "passphrase", label: "Passphrase", kind: "SECRET", secret: true }], configurationFields: [{ key: "returnUrl", label: "Return URL", kind: "URL" }, { key: "cancelUrl", label: "Cancel URL", kind: "URL" }, { key: "notifyUrl", label: "Notify URL", kind: "URL" }], documentationUrl: "https://developers.payfast.co.za/" }),
  provider({ provider: "PEACH_PAYMENTS", displayName: "Peach Payments", description: "Schema prepared for future Peach Payments integration.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "clientId", label: "Client ID", kind: "SECRET", secret: true }, { key: "clientSecret", label: "Client Secret", kind: "SECRET", secret: true }, { key: "merchantId", label: "Merchant ID", kind: "SECRET", secret: true }, { key: "entityId", label: "Entity ID", kind: "SECRET", secret: true }, { key: "secretToken", label: "Secret Token", kind: "SECRET", secret: true }, { key: "webhookSigningSecret", label: "Webhook signing secret", kind: "SECRET", secret: true }], configurationFields: [{ key: "integrationType", label: "Integration type/version", kind: "TEXT" }, { key: "returnUrl", label: "Return/result URL", kind: "URL" }, { key: "webhookUrl", label: "Webhook URL", kind: "URL" }, { key: "domainAllowlistStatus", label: "Domain allowlist status", kind: "TEXT" }], documentationUrl: "https://developer.peachpayments.com/" }),
  provider({ provider: "OZOW", displayName: "Ozow", description: "Schema prepared for a future versioned Ozow Payments API adapter.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "siteCode", label: "Site Code", kind: "SECRET", secret: true }, { key: "apiKey", label: "API Key", kind: "SECRET", secret: true }, { key: "privateKey", label: "Private Key", kind: "SECRET", secret: true }], configurationFields: [{ key: "integrationType", label: "Integration type/version", kind: "TEXT" }, { key: "notifyUrl", label: "Notify URL", kind: "URL" }, { key: "successUrl", label: "Success URL", kind: "URL" }, { key: "cancelUrl", label: "Cancel URL", kind: "URL" }, { key: "errorUrl", label: "Error URL", kind: "URL" }], documentationUrl: "https://hub.ozow.com/" }),
  provider({ provider: "PAYSTACK", displayName: "Paystack", description: "Schema prepared for future Paystack integration.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "publicKey", label: "Public Key", kind: "SECRET", secret: true }, { key: "secretKey", label: "Secret Key", kind: "SECRET", secret: true }], configurationFields: [{ key: "webhookUrl", label: "Webhook URL", kind: "URL" }, { key: "ipWhitelistStatus", label: "IP-whitelisting status", kind: "TEXT" }], documentationUrl: "https://paystack.com/docs/" }),
  provider({ provider: "YOCO", displayName: "Yoco", description: "Schema prepared for future Yoco integration.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "publicKey", label: "Public Key", kind: "SECRET", secret: true }, { key: "secretKey", label: "Secret Key", kind: "SECRET", secret: true }], configurationFields: [{ key: "webhookUrl", label: "Webhook URL", kind: "URL" }, { key: "callbackUrl", label: "Callback URL", kind: "URL" }], documentationUrl: "https://developer.yoco.com/" }),
  provider({ provider: "DPO_PAYGATE", displayName: "DPO PayGate", description: "Schema prepared for future DPO PayGate integration.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "payGateId", label: "PayGate ID", kind: "SECRET", secret: true }, { key: "encryptionKey", label: "Encryption Key", kind: "SECRET", secret: true }], configurationFields: [{ key: "returnUrl", label: "Return URL", kind: "URL" }, { key: "notifyUrl", label: "Notify URL", kind: "URL" }, { key: "integrationType", label: "Integration type", kind: "TEXT" }, { key: "tokenization", label: "Tokenization setting", kind: "ENUM" }], documentationUrl: "https://docs.paygate.co.za/" }),
  provider({ provider: "STITCH", displayName: "Stitch", description: "Schema prepared for future Stitch integration.", modes: ["SANDBOX", "LIVE"], capabilities: [], implementation: ["CONFIGURATION_SCHEMA_AVAILABLE"], credentialFields: [{ key: "clientId", label: "Client ID", kind: "SECRET", secret: true }, { key: "clientSecret", label: "Client Secret", kind: "SECRET", secret: true }, { key: "webhookSigningSecret", label: "Webhook signing secret", kind: "SECRET", secret: true }], configurationFields: [{ key: "scopes", label: "Scopes", kind: "TEXT" }, { key: "webhookUrl", label: "Webhook URL", kind: "URL" }, { key: "enabledCapabilities", label: "Enabled product capabilities", kind: "TEXT" }], documentationUrl: "https://docs.stitch.money/" }),
];

function configured(...values: (string | undefined)[]) { return values.every((value) => Boolean(value?.trim())); }
function payfastProfile(mode: PaymentGatewayMode) {
  const prefix = mode === "LIVE" ? "PAYFAST_LIVE" : "PAYFAST_SANDBOX";
  const legacy = mode === (process.env.PAYFAST_MODE === "live" ? "LIVE" : "SANDBOX");
  return {
    merchantId: process.env[`${prefix}_MERCHANT_ID`] ?? (legacy ? process.env.PAYFAST_MERCHANT_ID : undefined),
    merchantKey: process.env[`${prefix}_MERCHANT_KEY`] ?? (legacy ? process.env.PAYFAST_MERCHANT_KEY : undefined),
    passphrase: process.env[`${prefix}_PASSPHRASE`] ?? (legacy ? process.env.PAYFAST_PASSPHRASE : undefined),
  };
}
export function getPayfastProfileStatus(mode: PaymentGatewayMode) { const profile = payfastProfile(mode); return { mode, configured: configured(profile.merchantId, profile.merchantKey), credentialSource: "ENVIRONMENT" as const, fields: { merchantId: Boolean(profile.merchantId), merchantKey: Boolean(profile.merchantKey), passphrase: Boolean(profile.passphrase) } }; }

export async function getPaymentSettings() {
  const domain = await getSettingsDomain("payments");
  const value = (key: string) => domain.settings.find((item) => item.key === key)?.effectiveValue;
  const mode = (value("payfastMode") === "LIVE" ? "LIVE" : "SANDBOX") as PaymentGatewayMode;
  const app = (process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
  const api = (process.env.PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const gateways = paymentGatewayRegistry.map((item) => item.provider === "PAYFAST" ? { ...item, enabled: value("payfastEnabled") !== "false", defaultGateway: value("defaultGateway") !== undefined ? value("defaultGateway") === "PAYFAST" : true, mode, supportedCurrencies: ["ZAR"], configurationStatus: getPayfastProfileStatus(mode).configured ? "CONFIGURED" : "NOT_CONFIGURED", profiles: [getPayfastProfileStatus("SANDBOX"), getPayfastProfileStatus("LIVE")], healthStatus: "UNKNOWN", lastVerifiedAt: value("payfastLastVerifiedAt"), callbacks: { returnUrl: `${app}/payment/payfast/return`, cancelUrl: `${app}/payment/payfast/cancel`, notifyUrl: `${api}/api/payments/payfast/itn`, source: "DERIVED" } } : { ...item, enabled: false, defaultGateway: false, mode: "SANDBOX" as const, supportedCurrencies: [], configurationStatus: "NOT_CONFIGURED", profiles: [], healthStatus: "UNKNOWN" });
  return { revision: domain.revision, defaultGateway: (value("defaultGateway") ?? "PAYFAST") as PaymentGatewayProvider, gateways };
}

export async function updatePayfastSettings(input: { revision: number; mode?: PaymentGatewayMode; enabled?: boolean; defaultGateway?: PaymentGatewayProvider; confirmHighRisk?: boolean }) {
  if (input.mode === "LIVE" && !getPayfastProfileStatus("LIVE").configured) throw new Error("PayFast Live credentials are not configured. Add the environment-managed live profile before activation.");
  if (input.enabled === false) throw new Error("PayFast is the only operational checkout gateway and cannot be disabled.");
  if (input.defaultGateway && input.defaultGateway !== "PAYFAST") throw new Error("The selected gateway does not have a checkout adapter installed.");
  const changes: Record<string, string> = {};
  if (input.mode) changes.payfastMode = input.mode;
  if (input.enabled !== undefined) changes.payfastEnabled = String(input.enabled);
  if (input.defaultGateway) changes.defaultGateway = input.defaultGateway;
  await patchSettingsDomain("payments", { revision: input.revision, changes, confirmHighRisk: input.confirmHighRisk });
  return getPaymentSettings();
}

export async function testPayfastConfiguration() {
  const settings = await getPaymentSettings(); const gateway = settings.gateways.find((item) => item.provider === "PAYFAST")!;
  const profile = getPayfastProfileStatus(gateway.mode);
  const callbackValid = "callbacks" in gateway && Object.values(gateway.callbacks).filter((value) => typeof value === "string").every((value) => value.startsWith("http://") || value.startsWith("https://") || value === "DERIVED");
  const result = profile.configured && callbackValid ? "CONFIGURATION_VALID" : "CONFIGURATION_INVALID";
  if (result === "CONFIGURATION_VALID") await patchSettingsDomain("payments", { revision: settings.revision, changes: { payfastLastVerifiedAt: new Date().toISOString() }, confirmHighRisk: true });
  return { provider: "PAYFAST" as const, mode: gateway.mode, result, configured: profile.configured, connectionTested: false, message: result === "CONFIGURATION_VALID" ? "Required credentials and callback configuration are present. No payment was created." : "Required credentials or callback configuration is missing.", checkedAt: new Date().toISOString() };
}

function payfastConfigForMode(mode: PaymentGatewayMode): PayfastConfig { const base = readPayfastConfig(); const profile = payfastProfile(mode); return { ...base, mode: mode === "LIVE" ? "live" : "sandbox", merchantId: profile.merchantId ?? "", merchantKey: profile.merchantKey ?? "", passphrase: profile.passphrase }; }
export async function getActivePayfastConfig() { const settings = await getPaymentSettings(); const gateway = settings.gateways.find((item) => item.provider === "PAYFAST")!; return payfastConfigForMode(gateway.mode); }
export async function getPayfastConfigForOrder(order: BackendOrder) { const snapshotMode = order.payment.gatewayInstanceId?.endsWith(":LIVE") ? "LIVE" : order.payment.gatewayInstanceId?.endsWith(":SANDBOX") ? "SANDBOX" : undefined; return snapshotMode ? payfastConfigForMode(snapshotMode) : getActivePayfastConfig(); }
export async function createPayment(order: BackendOrder) { const settings = await getPaymentSettings(); const gateway = settings.gateways.find((item) => item.provider === settings.defaultGateway); if (!gateway || !gateway.enabled || gateway.provider !== "PAYFAST" || !gateway.implementation.includes("CHECKOUT_AVAILABLE")) throw new Error("No configured payment gateway is available."); return { provider: gateway.provider, mode: gateway.mode, ...(buildPayfastPaymentRequest(order, payfastConfigForMode(gateway.mode))) }; }
export function mapPayfastStatus(status: string): PaymentStatus { return status === "COMPLETE" ? "PAID" : status === "CANCELLED" ? "CANCELLED" : status === "FAILED" ? "FAILED" : "PENDING"; }
