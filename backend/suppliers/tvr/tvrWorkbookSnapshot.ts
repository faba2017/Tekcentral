import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

export type TvrLogicalCellType = "blank" | "text" | "number" | "boolean" | "error";
export interface TvrLogicalCell { row: number; column: number; type: TvrLogicalCellType; value?: string | number | boolean; formula?: string }
export interface TvrTabMetadata { name: string; index: number; fingerprint: string; usedRows: number; usedColumns: number; nonEmptyCells: number; nonEmptyRows: number; formulaCount: number; errorCellCount: number }
export interface TvrWorkbookSnapshot { logicalFingerprint: string; tabs: TvrTabMetadata[]; canonical: { sheets: Array<{ name: string; index: number; cells: TvrLogicalCell[] }> } }

const decode = (bytes?: Uint8Array) => bytes ? new TextDecoder().decode(bytes) : "";
const xml = (value: string) => value.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const columnNumber = (reference: string) => [...reference.replace(/\d/g, "")].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
const richText = (value: string) => [...value.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xml(match[1])).join("");

function sharedStrings(value: string) {
  return [...value.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => richText(match[1]));
}

function logicalValue(type: string | undefined, raw: string, inline: string, shared: string[]): Pick<TvrLogicalCell, "type" | "value"> {
  if (type === "s") return { type: "text", value: shared[Number(raw)] ?? "" };
  if (type === "inlineStr" || type === "str") return { type: "text", value: type === "inlineStr" ? richText(inline) : xml(raw) };
  if (type === "b") return { type: "boolean", value: raw === "1" || raw.toLowerCase() === "true" };
  if (type === "e") return { type: "error", value: xml(raw) };
  if (type === "z" || (!raw && !inline)) return { type: "blank" };
  const number = Number(raw);
  return Number.isFinite(number) ? { type: "number", value: number } : { type: "text", value: xml(raw) };
}

function parseCells(value: string, shared: string[]) {
  const cells: TvrLogicalCell[] = [];
  const pattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const match of value.matchAll(pattern)) {
    const attributes = match[1], body = match[2] ?? "", reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
    if (!reference) continue;
    const row = Number(reference.replace(/\D/g, "")), column = columnNumber(reference);
    const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
    const raw = xml(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
    const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
    const cell = logicalValue(type, raw, body, shared);
    cells.push({ row, column, ...cell, ...(formula === undefined ? {} : { formula: xml(formula) }) });
  }
  return cells.sort((a, b) => a.row - b.row || a.column - b.column);
}

export function parseTvrLogicalWorkbook(bytes: Uint8Array): TvrWorkbookSnapshot {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("INVALID_XLSX_SIGNATURE");
  let archive: Record<string, Uint8Array>;
  try { archive = unzipSync(bytes); } catch { throw new Error("INVALID_XLSX_CONTAINER"); }
  const workbook = decode(archive["xl/workbook.xml"]), relationships = decode(archive["xl/_rels/workbook.xml.rels"]);
  if (!workbook || !relationships) throw new Error("INVALID_XLSX_WORKBOOK_STRUCTURE");
  const relations = new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1] ?? "";
    const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1] ?? "";
    return [id, target];
  }));
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match, index) => {
    const name = xml(/\bname="([^"]*)"/.exec(match[1])?.[1] ?? "");
    const relationId = /\br:id="([^"]+)"/.exec(match[1])?.[1] ?? "";
    const target = relations.get(relationId)?.replace(/^\//, "").replace(/^xl\//, "");
    if (!name || !target) throw new Error("INVALID_XLSX_SHEET_RELATIONSHIP");
    return { name, index, path: `xl/${target}` };
  });
  if (!sheets.length) throw new Error("INVALID_XLSX_SHEETS_MISSING");
  const shared = sharedStrings(decode(archive["xl/sharedStrings.xml"]));
  const canonicalSheets = sheets.map((sheet) => {
    const worksheet = decode(archive[sheet.path]);
    if (!worksheet) throw new Error("INVALID_XLSX_WORKSHEET_MISSING");
    return { name: sheet.name, index: sheet.index, cells: parseCells(worksheet, shared) };
  });
  const tabs = canonicalSheets.map((sheet) => {
    const meaningful = sheet.cells.filter((cell) => cell.type !== "blank" || cell.formula !== undefined);
    const canonical = JSON.stringify(sheet);
    return { name: sheet.name, index: sheet.index, fingerprint: hash(canonical), usedRows: meaningful.reduce((max, cell) => Math.max(max, cell.row), 0), usedColumns: meaningful.reduce((max, cell) => Math.max(max, cell.column), 0), nonEmptyCells: meaningful.length, nonEmptyRows: new Set(meaningful.map((cell) => cell.row)).size, formulaCount: sheet.cells.filter((cell) => cell.formula !== undefined).length, errorCellCount: sheet.cells.filter((cell) => cell.type === "error").length };
  });
  const canonical = { sheets: canonicalSheets };
  return { logicalFingerprint: hash(JSON.stringify(canonical)), tabs, canonical };
}
