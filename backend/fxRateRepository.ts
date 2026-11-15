import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { mutateOperationalState, readOperationalState } from "./persistence/operationalState.js";

export type FxRateStatus = "FRESH" | "STALE" | "MISSING";
export interface FxQuote {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  provider: string;
  effectiveAt: string;
  fetchedAt: string;
  sourceReference: string;
}

interface FxStore { version: 1; current: Record<string, FxQuote>; history: FxQuote[]; }
const HISTORY_LIMIT = 100;
const storePath = () => resolve(process.cwd(), ".data", "fx-rates.json");
export const fxPairKey = (sourceCurrency: string, targetCurrency: string) => `${sourceCurrency.toUpperCase()}/${targetCurrency.toUpperCase()}`;

async function readStore(): Promise<FxStore> {
  if(loadPersistenceConfig().provider==="POSTGRES")return readOperationalState("operations","fxRates",{version:1,current:{},history:[]});
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as FxStore;
    return parsed.version === 1 && parsed.current && Array.isArray(parsed.history) ? parsed : { version: 1, current: {}, history: [] };
  } catch { return { version: 1, current: {}, history: [] }; }
}

async function writeStore(store: FxStore) {
  const target = storePath(); const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, JSON.stringify(store, null, 2));
  await rename(temporary, target);
}

export async function getStoredFxQuote(sourceCurrency: string, targetCurrency: string) {
  return (await readStore()).current[fxPairKey(sourceCurrency, targetCurrency)];
}

export async function saveFxQuote(quote: FxQuote) {
  if(loadPersistenceConfig().provider==="POSTGRES")return mutateOperationalState<FxStore,FxQuote>("operations","fxRates",{version:1,current:{},history:[]},store=>{const key=fxPairKey(quote.sourceCurrency,quote.targetCurrency);store.current[key]=quote;store.history=[quote,...store.history].slice(0,HISTORY_LIMIT);return quote;});
  const store = await readStore();
  const key = fxPairKey(quote.sourceCurrency, quote.targetCurrency);
  store.current[key] = quote;
  store.history = [quote, ...store.history].slice(0, HISTORY_LIMIT);
  await writeStore(store);
  return quote;
}
