import { createHash } from "node:crypto";
import type { TvrLogicalCell, TvrWorkbookSnapshot } from "./tvrWorkbookSnapshot.js";

export type TvrRowClassification = "PRODUCT_ROW" | "SECTION_HEADER" | "NOTE" | "EMPTY" | "INVALID" | "REVIEW_REQUIRED";
export type TvrGroupClassification = "UNIQUE" | "DUPLICATE_SAME_FACT" | "CONFLICTING_FACTS";
export type TvrCondition = "NEW" | "CLEARANCE" | "REMANUFACTURED";
export type TvrStockState = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
export type TvrParserProfile = "INFORMATIONAL" | "COMMON_B_E" | "HEADERLESS_B_E" | "TCL_B_D" | "KELON_B_G" | "REMANUFACTURED_B_D";

export interface TvrPriceEvidence { raw: string | number; amount: number; sourceLabel?: string; explicitCurrency?: "ZAR"; currencyAuthority: "EXPLICIT" | "UNKNOWN"; taxBasis: "UNKNOWN"; }
export interface TvrStockEvidence { raw?: string; rawType: "TEXT" | "ERROR" | "MISSING"; state: TvrStockState; quantity?: never; }
export interface TvrSemanticEvidence {
  id: string; supplierSku: string; rawIdentifier: string; normalizedIdentifier: string; compositeIdentity?: { rawIndoorModel: string; rawOutdoorModel: string; normalizedIndoorModel: string; normalizedOutdoorModel: string };
  sourceDescription: string; workbookName: string; worksheetName: string; sourceRow: number; sourceCells: string[]; condition: TvrCondition;
  sectionContext?: string; sourceNotes: string[]; flags: string[]; price: TvrPriceEvidence; stock: TvrStockEvidence;
  rowClassification: "PRODUCT_ROW"; groupClassification: TvrGroupClassification; groupId?: string; conditionCollision: boolean; conditionCollisionGroupId?: string;
  sourceFingerprint: string; profile: TvrParserProfile; semanticUncertainty?: string;
}
export interface TvrTabReport { worksheetName: string; usedRows: number; profile: TvrParserProfile; counts: Record<TvrRowClassification, number>; duplicateRows: number; conflictRows: number; productRows: number; notes: string[]; }
export interface TvrSemanticParseResult { workbookName: string; logicalFingerprint: string; evidence: TvrSemanticEvidence[]; tabs: TvrTabReport[]; notes: Array<{ worksheetName: string; sourceRow: number; text: string }>; groups: { duplicateSameFact: number; conflictingFacts: number; conditionCollisions: number }; counts: Record<TvrRowClassification, number>; conditions: Record<TvrCondition, number>; flags: Record<string, number>; }

type Row = Map<number, TvrLogicalCell>;
interface Profile { kind: TvrParserProfile; identity: number[]; description: number; stock?: number; price: number; condition: TvrCondition; uncertainty?: string; }

const commonTabs = new Set(["Adata", "Canon", "Drives", "Eaton UPS", "Equip", "Genius ", "Huntkey", "HTC", "Logitech", "Lexar", "Monitors", "Tenda", "GGX", "Roccat", "Software", "Thermaltake", "Samsung ", "Clearance Stock"]);
const headerlessTabs = new Set(["CPU", "MSI", "Notebooks"]);
const knownTabs = ["Menu", "Adata", "Canon", "Drives", "Eaton UPS", "Equip", "CPU", "Genius ", "Huntkey", "HTC", "Kelon", "Logitech", "Lexar", "MSI", "Monitors", "Notebooks", "Tenda", "TCL", "GGX", "Roccat", "Software", "Thermaltake", "Samsung ", "Clearance Stock", "Remanufactured"];

const text = (cell?: TvrLogicalCell) => cell?.value === undefined || cell.value === null ? "" : String(cell.value).normalize("NFKC").replace(/\s+/g, " ").trim();
export const normalizeTvrIdentity = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("en-ZA");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cellRef = (column: number, row: number) => `${String.fromCharCode(64 + column)}${row}`;
const isHeader = (values: string[]) => values.some((value) => /^(item\s*(no|number)?|sku|model|indoor model|description|stock level|price( excl)?|refurb price)$/i.test(value));
const price = (cell: TvrLogicalCell | undefined, label?: string): TvrPriceEvidence | undefined => {
  if (!cell || cell.type === "error" || cell.type === "blank") return undefined;
  const raw = cell.value as string | number;
  const rawText = String(raw).trim();
  const explicitCurrency = /^\s*R(?:\s|\d)/i.test(rawText) ? "ZAR" as const : undefined;
  const amount = typeof raw === "number" ? raw : Number(rawText.replace(/^\s*R\s*/i, "").replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return { raw, amount, sourceLabel: label, explicitCurrency, currencyAuthority: explicitCurrency ? "EXPLICIT" : "UNKNOWN", taxBasis: "UNKNOWN" };
};
export const normalizeTvrStock = (cell?: TvrLogicalCell): TvrStockEvidence => {
  if (!cell || cell.type === "blank" || text(cell) === "") return { rawType: "MISSING", state: "UNKNOWN" };
  if (cell.type === "error") return { raw: text(cell), rawType: "ERROR", state: "UNKNOWN" };
  const raw = text(cell), normalized = raw.toLowerCase();
  return { raw, rawType: "TEXT", state: normalized === "in stock" ? "AVAILABLE" : normalized === "low stock" ? "LOW_STOCK" : normalized === "no stock" ? "OUT_OF_STOCK" : "UNKNOWN" };
};
const profileFor = (name: string): Profile | undefined => {
  if (name === "Menu") return undefined;
  if (name === "Kelon") return { kind: "KELON_B_G", identity: [2, 3], description: 4, stock: 6, price: 7, condition: "NEW" };
  if (name === "TCL") return { kind: "TCL_B_D", identity: [2], description: 3, price: 4, condition: "NEW" };
  if (name === "Remanufactured") return { kind: "REMANUFACTURED_B_D", identity: [2], description: 3, price: 4, condition: "REMANUFACTURED" };
  if (headerlessTabs.has(name)) return { kind: "HEADERLESS_B_E", identity: [2], description: 3, stock: 4, price: 5, condition: "NEW", uncertainty: "No reliable global price header was present; numeric B/C/D/E row structure was retained with tax and currency authority unknown." };
  if (commonTabs.has(name)) return { kind: "COMMON_B_E", identity: [2], description: 3, stock: 4, price: 5, condition: name === "Clearance Stock" ? "CLEARANCE" : "NEW" };
  return undefined;
};
const rowMap = (snapshot: TvrWorkbookSnapshot, sheetName: string) => {
  const rows = new Map<number, Row>();
  for (const cell of snapshot.canonical.sheets.find((sheet) => sheet.name === sheetName)?.cells ?? []) {
    const row = rows.get(cell.row) ?? new Map<number, TvrLogicalCell>(); row.set(cell.column, cell); rows.set(cell.row, row);
  }
  return rows;
};
const knownNote = (_sheet: string, value: string) => value.length > 90 || /warranty|licen[cs]e|pricing before quoting|updated every day|E&OE|account manager|no accessories/i.test(value);
const flagsFor = (sheet: string) => sheet === "Adata" ? ["PRICE_VOLATILITY_CONFIRMATION_REQUIRED"] : sheet === "Clearance Stock" ? ["NO_WARRANTY"] : sheet === "Remanufactured" ? ["3_MONTH_WARRANTY", "NO_ACCESSORIES"] : sheet === "TCL" ? ["DEALER_TV_LICENCE_REQUIRED"] : [];

export function parseTvrSemanticWorkbook(snapshot: TvrWorkbookSnapshot, workbookName = "TVR DISTRIBUTION SHEETS"): TvrSemanticParseResult {
  const actualNames = snapshot.canonical.sheets.map((sheet) => sheet.name);
  const missing = knownTabs.filter((name) => !actualNames.includes(name));
  if (missing.length) throw new Error(`TVR_SEMANTIC_REQUIRED_TABS_MISSING:${missing.join(",")}`);
  const evidence: TvrSemanticEvidence[] = [], tabs: TvrTabReport[] = [], notes: TvrSemanticParseResult["notes"] = [];
  const totalCounts = { PRODUCT_ROW: 0, SECTION_HEADER: 0, NOTE: 0, EMPTY: 0, INVALID: 0, REVIEW_REQUIRED: 0 } satisfies Record<TvrRowClassification, number>;
  for (const tab of snapshot.tabs) {
    const rows = rowMap(snapshot, tab.name), profile = profileFor(tab.name), counts = { PRODUCT_ROW: 0, SECTION_HEADER: 0, NOTE: 0, EMPTY: 0, INVALID: 0, REVIEW_REQUIRED: 0 } satisfies Record<TvrRowClassification, number>;
    const tabNotes: string[] = []; let sectionContext: string | undefined, priceLabel: string | undefined;
    for (let rowNumber = 1; rowNumber <= tab.usedRows; rowNumber += 1) {
      const row = rows.get(rowNumber) ?? new Map<number, TvrLogicalCell>();
      const values = [...row.values()].map(text).filter(Boolean), joined = values.join(" | ");
      let classification: TvrRowClassification;
      if (!values.length) classification = "EMPTY";
      else if (!profile) classification = knownNote(tab.name, joined) ? "NOTE" : "EMPTY";
      else {
        const identityParts = profile.identity.map((column) => text(row.get(column))), description = text(row.get(profile.description));
        const priceCell = row.get(profile.price), parsedPrice = price(priceCell, priceLabel);
        if (knownNote(tab.name, joined) && !parsedPrice) { classification = "NOTE"; const candidate = text(priceCell); if (/price/i.test(candidate)) priceLabel = candidate; }
        else if (isHeader(values)) { classification = "SECTION_HEADER"; const candidate = text(priceCell); if (/price/i.test(candidate)) priceLabel = candidate; }
        else if (identityParts.some(Boolean) && !description && !parsedPrice) classification = "SECTION_HEADER";
        else if (identityParts.every(Boolean) && description && parsedPrice) {
          classification = "PRODUCT_ROW";
          const rawIdentifier = profile.kind === "KELON_B_G" ? `${identityParts[0]} + ${identityParts[1]}` : identityParts[0];
          const normalizedParts = identityParts.map(normalizeTvrIdentity), normalizedIdentifier = normalizedParts.join(" + ");
          const stock = normalizeTvrStock(profile.stock ? row.get(profile.stock) : undefined), flags = flagsFor(tab.name);
          const semanticFacts = { condition: profile.condition, normalizedIdentifier, description: description.normalize("NFKC").replace(/\s+/g, " ").trim(), amount: parsedPrice.amount, currency: parsedPrice.explicitCurrency ?? null, priceLabel: parsedPrice.sourceLabel ?? null, stock: stock.state, stockRaw: stock.raw ?? null, flags, sectionContext: sectionContext ?? null };
          const sourceFingerprint = hash(semanticFacts);
          evidence.push({ id: hash(`${snapshot.logicalFingerprint}|${tab.name}|${rowNumber}|${normalizedIdentifier}|${profile.condition}`), supplierSku: `${profile.condition}:${normalizedIdentifier}`, rawIdentifier, normalizedIdentifier,
            compositeIdentity: profile.kind === "KELON_B_G" ? { rawIndoorModel: identityParts[0], rawOutdoorModel: identityParts[1], normalizedIndoorModel: normalizedParts[0], normalizedOutdoorModel: normalizedParts[1] } : undefined,
            sourceDescription: description, workbookName, worksheetName: tab.name, sourceRow: rowNumber, sourceCells: [...profile.identity, profile.description, ...(profile.stock ? [profile.stock] : []), profile.price].map((column) => cellRef(column, rowNumber)), condition: profile.condition,
            sectionContext, sourceNotes: tab.name === "Adata" ? ["Please confirm pricing before quoting as memory pricing is changing daily"] : tab.name === "TCL" ? ["Televisions require a Dealer TV License"] : [], flags, price: parsedPrice, stock,
            rowClassification: "PRODUCT_ROW", groupClassification: "UNIQUE", conditionCollision: false, sourceFingerprint, profile: profile.kind, semanticUncertainty: profile.uncertainty });
        } else if (identityParts.some(Boolean) || description || priceCell) classification = identityParts.every(Boolean) && description && !parsedPrice ? "REVIEW_REQUIRED" : "INVALID";
        else classification = "EMPTY";
        if (classification === "SECTION_HEADER" && !isHeader(values)) sectionContext = joined;
        else if (classification === "SECTION_HEADER") { const nonHeader = values.find((value) => !/stock|price|item|description|model/i.test(value)); if (nonHeader) sectionContext = nonHeader; }
      }
      if (classification === "SECTION_HEADER" && values.length === 1) sectionContext = values[0];
      if (classification === "NOTE") { notes.push({ worksheetName: tab.name, sourceRow: rowNumber, text: joined }); tabNotes.push(joined); }
      counts[classification] += 1; totalCounts[classification] += 1;
    }
    tabs.push({ worksheetName: tab.name, usedRows: tab.usedRows, profile: profile?.kind ?? "INFORMATIONAL", counts, productRows: counts.PRODUCT_ROW, duplicateRows: 0, conflictRows: 0, notes: tabNotes });
  }
  const identityGroups = new Map<string, TvrSemanticEvidence[]>();
  for (const item of evidence) { const key = `${item.condition}|${item.normalizedIdentifier}`; identityGroups.set(key, [...(identityGroups.get(key) ?? []), item]); }
  let duplicateSameFact = 0, conflictingFacts = 0;
  for (const [key, items] of identityGroups) if (items.length > 1) {
    const fingerprints = new Set(items.map((item) => item.sourceFingerprint)), classification = fingerprints.size === 1 ? "DUPLICATE_SAME_FACT" as const : "CONFLICTING_FACTS" as const, groupId = hash(key);
    if (classification === "DUPLICATE_SAME_FACT") duplicateSameFact += 1; else conflictingFacts += 1;
    for (const item of items) { item.groupClassification = classification; item.groupId = groupId; const report = tabs.find((tab) => tab.worksheetName === item.worksheetName)!; if (classification === "DUPLICATE_SAME_FACT") report.duplicateRows += 1; else report.conflictRows += 1; }
  }
  const crossCondition = new Map<string, TvrSemanticEvidence[]>();
  for (const item of evidence) crossCondition.set(item.normalizedIdentifier, [...(crossCondition.get(item.normalizedIdentifier) ?? []), item]);
  let conditionCollisions = 0;
  for (const [identity, items] of crossCondition) if (new Set(items.map((item) => item.condition)).size > 1) { conditionCollisions += 1; const groupId = hash(identity); for (const item of items) { item.conditionCollision = true; item.conditionCollisionGroupId = groupId; } }
  const conditions = { NEW: 0, CLEARANCE: 0, REMANUFACTURED: 0 }, flagCounts: Record<string, number> = {};
  for (const item of evidence) { conditions[item.condition] += 1; for (const flag of item.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1; }
  return { workbookName, logicalFingerprint: snapshot.logicalFingerprint, evidence, tabs, notes, groups: { duplicateSameFact, conflictingFacts, conditionCollisions }, counts: totalCounts, conditions, flags: flagCounts };
}
