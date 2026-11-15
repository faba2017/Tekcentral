import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { mutateOperationalState, readOperationalState } from "./persistence/operationalState.js";

export type FxImpactClassification = "IGNORE" | "MONITOR" | "REVIEW" | "CRITICAL";
export interface FxPricingImpact {
  id: string; productId: string; productName: string; category?: string; supplierId: string; supplierOfferId: string;
  sourceCurrency: string; targetCurrency: "ZAR"; sourceCostAmount: number;
  previousFxRate: number; currentFxRate: number; previousNormalizedCost: number; currentNormalizedCost: number;
  costDelta: number; costDeltaPercent: number; direction: "INCREASE" | "DECREASE" | "UNCHANGED";
  commercialBaseline: "LIVE" | "APPROVED" | "PENDING" | "NONE"; currentRetailPrice?: number;
  previousGrossMarginPercent?: number; currentGrossMarginPercent?: number; marginPointChange?: number; currentGrossProfit?: number;
  recommendedPrice?: number; classification: FxImpactClassification; reasons: string[];
  evaluatedAt: string; fxEffectiveAt: string; fxProvider: string; fingerprint: string;
  resultingAction: "NONE" | "MONITOR" | "PRICE_REVIEW_REQUIRED" | "PROPOSAL_CREATED";
  proposalId?: string; notificationRequired: boolean; notificationCreatedAt?: string;
}
interface Store { version: 1; current: FxPricingImpact[]; history: FxPricingImpact[]; }
const path = () => resolve(process.cwd(), ".data", "fx-pricing-impacts.json");
async function readStore(): Promise<Store> {if(loadPersistenceConfig().provider==="POSTGRES")return readOperationalState("operations","fxImpacts",{version:1,current:[],history:[]});try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.current) && Array.isArray(value.history) ? value : { version: 1, current: [], history: [] }; } catch { return { version: 1, current: [], history: [] }; } }
async function writeStore(store: Store) { const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
export async function listFxPricingImpacts() { return (await readStore()).current; }
export async function saveFxPricingImpact(impact: FxPricingImpact) {
  if(loadPersistenceConfig().provider==="POSTGRES")return mutateOperationalState<Store,FxPricingImpact>("operations","fxImpacts",{version:1,current:[],history:[]},store=>{const existing=store.current.find(item=>item.id===impact.id);const saved={...impact,notificationCreatedAt:existing?.fingerprint===impact.fingerprint?existing.notificationCreatedAt:impact.notificationRequired?impact.evaluatedAt:undefined};store.current=[saved,...store.current.filter(item=>item.id!==impact.id)];if(!existing||existing.fingerprint!==saved.fingerprint)store.history=[saved,...store.history].slice(0,500);return saved;});
  const store = await readStore(); const existing = store.current.find((item) => item.id === impact.id);
  const stableNotification = existing?.fingerprint === impact.fingerprint ? existing.notificationCreatedAt : undefined;
  const saved = { ...impact, notificationCreatedAt: stableNotification ?? (impact.notificationRequired ? impact.evaluatedAt : undefined) };
  store.current = [saved, ...store.current.filter((item) => item.id !== impact.id)];
  if (!existing || existing.fingerprint !== saved.fingerprint) store.history = [saved, ...store.history].slice(0, 500);
  await writeStore(store); return saved;
}
