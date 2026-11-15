import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { mutateOperationalState, readOperationalState } from "./persistence/operationalState.js";

export interface FxReconciliationRunSummary {
  id: string; trigger: "SCHEDULED" | "MANUAL"; startedAt: string; completedAt: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  pairsEvaluated: number; ratesRefreshed: number; ratesReused: number; offersEvaluated: number;
  ignore: number; monitor: number; review: number; critical: number;
  proposalsGenerated: number; attentionCreated: number; errors: { pair?: string; message: string }[];
}
interface Store { version: 1; lastRun?: FxReconciliationRunSummary; history: FxReconciliationRunSummary[]; }
const path = () => resolve(process.cwd(), ".data", "fx-reconciliation-runs.json");
async function readStore(): Promise<Store> {if(loadPersistenceConfig().provider==="POSTGRES")return readOperationalState("operations","fxRuns",{version:1,history:[]});try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.history) ? value : { version: 1, history: [] }; } catch { return { version: 1, history: [] }; } }
export async function getLastFxReconciliationRun() { return (await readStore()).lastRun; }
export async function saveFxReconciliationRun(run: FxReconciliationRunSummary) {if(loadPersistenceConfig().provider==="POSTGRES")return mutateOperationalState<Store,FxReconciliationRunSummary>("operations","fxRuns",{version:1,history:[]},store=>{store.lastRun=run;store.history=[run,...store.history].slice(0,50);return run;});const store = await readStore(); const next = { version: 1 as const, lastRun: run, history: [run, ...store.history].slice(0, 50) }; const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(next, null, 2)); await rename(temp, target); return run; }
