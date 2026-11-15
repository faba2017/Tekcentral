import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export interface ProtectedSecret { version: 1; iv: string; ciphertext: string; tag: string; }

let testEncryptionKey: Buffer | undefined;

export function setStaffTwoFactorEncryptionKeyForTests(value?: Buffer) { testEncryptionKey = value; }

export function staffTwoFactorEncryptionKey(environment: NodeJS.ProcessEnv = process.env) {
  if (testEncryptionKey) return testEncryptionKey;
  const raw = environment.STAFF_2FA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("STAFF_2FA_ENCRYPTION_KEY is required for staff two-factor authentication.");
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("STAFF_2FA_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function generateTotpSecret(bytes = 20) { return encodeBase32(randomBytes(bytes)); }

export function encodeBase32(value: Buffer) {
  let bits = ""; for (const byte of value) bits += byte.toString(2).padStart(8, "0");
  let result = ""; for (let index = 0; index < bits.length; index += 5) result += BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return result;
}

export function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  if (!normalized || [...normalized].some((character) => !BASE32.includes(character))) throw new Error("Invalid base32 secret.");
  let bits = ""; for (const character of normalized) bits += BASE32.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function protectTotpSecret(secret: string, key = staffTwoFactorEncryptionKey()): ProtectedSecret {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from("tekcentral:staff-totp:v1"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function revealTotpSecret(value: ProtectedSecret, key = staffTwoFactorEncryptionKey()) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64")); decipher.setAAD(Buffer.from("tekcentral:staff-totp:v1")); decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function totpAtStep(secret: string, step: number) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest(); const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

export function verifyTotp(secret: string, code: string, now = new Date(), window = 1) {
  if (!/^\d{6}$/.test(code)) return undefined; const current = Math.floor(now.getTime() / 1_000 / TOTP_PERIOD_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) { const step = current + offset; const expected = Buffer.from(totpAtStep(secret, step)); const actual = Buffer.from(code); if (expected.length === actual.length && timingSafeEqual(expected, actual)) return step; }
  return undefined;
}

export function createOtpAuthUri(email: string, secret: string) { return `otpauth://totp/${encodeURIComponent(`TekCentral:${email}`)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent("TekCentral")}&algorithm=SHA1&digits=6&period=30`; }
export function generateRecoveryCodes(count = 10) { return Array.from({ length: count }, () => `${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`); }
export function hashRecoveryCode(code: string) { return createHash("sha256").update(code.trim().toUpperCase().replace(/\s/g, "")).digest("hex"); }
