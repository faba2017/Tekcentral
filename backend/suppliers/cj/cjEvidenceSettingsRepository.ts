import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierCurrencyEvidence } from "../../types.js";

interface CjEvidenceSettingsStore {
  version: 1;
  accountCurrency?: SupplierCurrencyEvidence & { scope: "ACCOUNT_LEVEL"; evidenceType: string };
  accountCurrencyHistory?: Array<SupplierCurrencyEvidence & { scope: "ACCOUNT_LEVEL"; evidenceType: string }>;
}

const storePath = () => resolve(process.cwd(), ".data", "supplier-settings-cj.json");

export async function getCjEvidenceSettings(): Promise<CjEvidenceSettingsStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Partial<CjEvidenceSettingsStore>;
    return parsed.version === 1 ? { version: 1, accountCurrency: parsed.accountCurrency, accountCurrencyHistory: parsed.accountCurrencyHistory ?? [] } : { version: 1, accountCurrencyHistory: [] };
  } catch {
    return { version: 1 };
  }
}

export async function confirmCjAccountCurrency(input: { currency: string; evidenceType: string; evidenceNote: string; sourceReference: string; actor?: string }) {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter ISO code.");
  if (!input.evidenceType.trim() || !input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Account currency requires evidence type, note and source reference.");
  const current = await getCjEvidenceSettings();
  const accountCurrency = { currency, source: "ACCOUNT_CONFIGURATION" as const, sourceReference: input.sourceReference.trim(), evidenceNote: input.evidenceNote.trim(), confidence: "HIGH" as const, confirmedAt: new Date().toISOString(), confirmedBy: input.actor ?? "TekCentral Staff", scope: "ACCOUNT_LEVEL" as const, evidenceType: input.evidenceType.trim() };
  const store: CjEvidenceSettingsStore = { version: 1, accountCurrency, accountCurrencyHistory: [...(current.accountCurrency ? [current.accountCurrency] : []), ...(current.accountCurrencyHistory ?? [])].slice(0, 50) };
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2));
  return store;
}
