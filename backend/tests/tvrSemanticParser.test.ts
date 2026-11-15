import assert from "node:assert/strict";
import type { TvrLogicalCell, TvrWorkbookSnapshot } from "../suppliers/tvr/tvrWorkbookSnapshot.js";
import { normalizeTvrIdentity, normalizeTvrStock, parseTvrSemanticWorkbook } from "../suppliers/tvr/tvrSemanticParser.js";

const names = ["Menu", "Adata", "Canon", "Drives", "Eaton UPS", "Equip", "CPU", "Genius ", "Huntkey", "HTC", "Kelon", "Logitech", "Lexar", "MSI", "Monitors", "Notebooks", "Tenda", "TCL", "GGX", "Roccat", "Software", "Thermaltake", "Samsung ", "Clearance Stock", "Remanufactured"];
type CellInput = [row: number, column: number, type: TvrLogicalCell["type"], value: string | number | boolean];
const data: Record<string, CellInput[]> = Object.fromEntries(names.map((name) => [name, []]));
const add = (sheet: string, ...cells: CellInput[]) => data[sheet].push(...cells);
add("Menu", [1, 2, "text", "The Pricelist is updated every day, but is also subject to E&OE. Always check pricing with your account manager."]);
add("Adata", [1, 2, "text", "Please confirm pricing before quoting as memory pricing is changing daily"], [1, 4, "text", "Stock Level"], [1, 5, "text", "Price Excl"], [2, 2, "text", " AD-1  "], [2, 3, "text", "Memory"], [2, 4, "text", "In Stock"], [2, 5, "text", "R 3,398.00"]);
add("Canon", [1, 2, "text", "Ink"], [2, 2, "text", "5220B001"], [2, 3, "text", "CL-441"], [2, 4, "text", "Low Stock"], [2, 5, "number", 100], [3, 2, "text", "5220B001"], [3, 3, "text", "CL-441 XL"], [3, 4, "text", "Low Stock"], [3, 5, "number", 100]);
add("Drives", [1, 2, "text", "Section"], [2, 3, "text", "Missing identity"], [2, 5, "number", 20], [3, 2, "text", "BAD-PRICE"], [3, 3, "text", "Review me"], [3, 5, "text", "TBC"]);
add("Equip", [1, 2, "text", "133483"], [1, 3, "text", "Adapter"], [1, 4, "error", "#N/A"], [1, 5, "number", 98], [2, 2, "text", "133483"], [2, 3, "text", "Adapter"], [2, 4, "error", "#N/A"], [2, 5, "number", 98]);
add("CPU", [4, 2, "text", "CPU-1"], [4, 3, "text", "Processor"], [4, 4, "text", "No Stock"], [4, 5, "number", 500]);
add("MSI", [1, 2, "text", "PRO A620M-E"], [1, 3, "text", "New board"], [1, 4, "text", "In Stock"], [1, 5, "number", 1500]);
add("Kelon", [1, 2, "text", "Indoor Model"], [1, 3, "text", "Outdoor Model"], [1, 4, "text", "Description"], [1, 6, "text", "Stock Level"], [1, 7, "text", "Price"], [2, 2, "text", "K12/I"], [2, 3, "text", "K12-O"], [2, 4, "text", "Split AC"], [2, 6, "text", "No stock"], [2, 7, "number", 5500]);
add("TCL", [1, 2, "text", "Televisions require a Dealer TV License"], [2, 2, "text", "Model"], [2, 3, "text", "Description"], [2, 4, "text", "Price"], [3, 2, "text", "55P8K"], [3, 3, "text", "55 inch TV"], [3, 4, "number", 5800], [4, 1, "text", "Warranty terms and conditions apply."]);
add("Clearance Stock", [1, 3, "text", "Clearance Items Carry No Warranty"], [2, 2, "text", "CLEAR-1"], [2, 3, "text", "Clearance item"], [2, 4, "text", "In Stock"], [2, 5, "number", 5]);
add("Remanufactured", [1, 2, "text", "Remanufactured items carry a 3 month warranty and have no accessories."], [2, 2, "text", "PRO A620M-E"], [2, 3, "text", "Reman board"], [2, 4, "number", 1190], [3, 2, "text", "PRO A620M-E"], [3, 3, "text", "Reman board"], [3, 4, "number", 1190]);

const snapshot: TvrWorkbookSnapshot = {
  logicalFingerprint: "fixture-logical-fingerprint",
  tabs: names.map((name, index) => { const cells = data[name]; return { name, index, fingerprint: `tab-${index}`, usedRows: Math.max(1, ...cells.map((cell) => cell[0])), usedColumns: Math.max(1, ...cells.map((cell) => cell[1])), nonEmptyCells: cells.length, nonEmptyRows: new Set(cells.map((cell) => cell[0])).size, formulaCount: 0, errorCellCount: cells.filter((cell) => cell[2] === "error").length }; }),
  canonical: { sheets: names.map((name, index) => ({ name, index, cells: data[name].map(([row, column, type, value]) => ({ row, column, type, value })) })) },
};

const result = parseTvrSemanticWorkbook(snapshot);
assert.deepEqual(result.tabs.map((tab) => tab.worksheetName), names);
assert.equal(result.tabs.find((tab) => tab.worksheetName === "Genius ")?.productRows, 0);
assert.equal(result.tabs.find((tab) => tab.worksheetName === "Samsung ")?.productRows, 0);
assert.equal(result.notes.some((note) => note.worksheetName === "Menu" && /E&OE/.test(note.text)), true);
const adata = result.evidence.find((row) => row.worksheetName === "Adata")!;
assert.equal(adata.normalizedIdentifier, "AD-1"); assert.equal(adata.price.amount, 3398); assert.equal(adata.price.explicitCurrency, "ZAR"); assert.equal(adata.price.sourceLabel, "Price Excl"); assert.equal(adata.price.taxBasis, "UNKNOWN"); assert.equal(adata.stock.state, "AVAILABLE"); assert.equal(adata.flags.includes("PRICE_VOLATILITY_CONFIRMATION_REQUIRED"), true);
assert.equal(result.groups.conflictingFacts, 1); assert.equal(result.evidence.filter((row) => row.normalizedIdentifier === "5220B001").every((row) => row.groupClassification === "CONFLICTING_FACTS"), true);
assert.equal(result.groups.duplicateSameFact, 2); assert.equal(result.evidence.filter((row) => row.normalizedIdentifier === "133483").length, 2); assert.equal(result.evidence.find((row) => row.normalizedIdentifier === "133483")?.stock.state, "UNKNOWN");
assert.equal(result.tabs.find((tab) => tab.worksheetName === "Drives")?.counts.INVALID, 1); assert.equal(result.tabs.find((tab) => tab.worksheetName === "Drives")?.counts.REVIEW_REQUIRED, 1);
const cpu = result.evidence.find((row) => row.worksheetName === "CPU")!; assert.equal(cpu.profile, "HEADERLESS_B_E"); assert.equal(cpu.semanticUncertainty?.includes("tax and currency authority unknown"), true); assert.equal(cpu.price.explicitCurrency, undefined);
const kelon = result.evidence.find((row) => row.worksheetName === "Kelon")!; assert.equal(kelon.normalizedIdentifier, "K12/I + K12-O"); assert.equal(kelon.compositeIdentity?.rawIndoorModel, "K12/I"); assert.equal(kelon.compositeIdentity?.rawOutdoorModel, "K12-O");
const tcl = result.evidence.find((row) => row.worksheetName === "TCL")!; assert.equal(tcl.flags.includes("DEALER_TV_LICENCE_REQUIRED"), true); assert.equal(tcl.stock.state, "UNKNOWN");
const clearance = result.evidence.find((row) => row.condition === "CLEARANCE")!; assert.equal(clearance.flags.includes("NO_WARRANTY"), true);
const reman = result.evidence.filter((row) => row.condition === "REMANUFACTURED"); assert.equal(reman.length, 2); assert.equal(reman.every((row) => row.flags.includes("3_MONTH_WARRANTY") && row.flags.includes("NO_ACCESSORIES")), true); assert.equal(reman.every((row) => row.stock.quantity === undefined), true);
assert.equal(result.groups.conditionCollisions, 1); assert.equal(result.evidence.filter((row) => row.normalizedIdentifier === "PRO A620M-E").every((row) => row.conditionCollision), true);
assert.equal(normalizeTvrIdentity("  ab  12-x "), "AB 12-X");
assert.equal(normalizeTvrStock({ row: 1, column: 1, type: "error", value: "#N/A" }).state, "UNKNOWN");
assert.equal(normalizeTvrStock(undefined).state, "UNKNOWN");
assert.throws(() => parseTvrSemanticWorkbook({ ...snapshot, canonical: { sheets: snapshot.canonical.sheets.filter((sheet) => sheet.name !== "TCL") } }), /TVR_SEMANTIC_REQUIRED_TABS_MISSING/);
assert.equal(JSON.stringify(result).includes("supplierOffer"), false);

console.log("TVR semantic parser tests passed");
