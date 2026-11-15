import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import type { ObjectAccess, ObjectStorage } from "./objectStorage.js";

export type ObjectMigrationClassification = "PRODUCT_PUBLIC_IMAGE" | "PRODUCT_PUBLIC_DOCUMENT" | "PRIVATE_DOCUMENT";
export interface ObjectMigrationItem {
  sourcePath: string;
  sourceRelativePath: string;
  classification: ObjectMigrationClassification;
  access: ObjectAccess;
  targetKey: string;
  contentType: string;
  byteSize: number;
  contentHash: string;
  referenced: boolean;
  duplicateOf?: string;
}
export interface ObjectMigrationInventory {
  items: ObjectMigrationItem[];
  missingReferences: string[];
  totals: { files: number; bytes: number; referenced: number; unreferenced: number; duplicates: number; missingReferences: number };
}

const mime = (extension: string) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf" }[extension.toLowerCase()] ?? "application/octet-stream");
const slash = (value: string) => value.split(sep).join("/");

async function filesBelow(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesBelow(resolve(root, entry.name)) : [resolve(root, entry.name)]));
    return nested.flat().sort();
  } catch { return []; }
}

async function collectReferences(dataRoot: string) {
  const references = new Set<string>();
  for (const path of await filesBelow(dataRoot)) {
    if (extname(path).toLowerCase() !== ".json") continue;
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/\/api\/public\/assets\/(products|documents)\/([a-zA-Z0-9._-]+)/g)) references.add(`${match[1]}/${match[2]}`);
  }
  return references;
}

export async function inventoryLegacyObjects(options: { sourceRoot?: string; dataRoot?: string } = {}): Promise<ObjectMigrationInventory> {
  const sourceRoot = resolve(options.sourceRoot ?? resolve(process.cwd(), ".data", "public-assets"));
  const dataRoot = resolve(options.dataRoot ?? resolve(process.cwd(), ".data"));
  const references = await collectReferences(dataRoot);
  const paths = (await filesBelow(sourceRoot)).filter((path) => path !== resolve(sourceRoot, "image-records.json"));
  const seen = new Map<string, string>();
  const items: ObjectMigrationItem[] = [];
  for (const sourcePath of paths) {
    const sourceRelativePath = slash(relative(sourceRoot, sourcePath));
    const [directory] = sourceRelativePath.split("/");
    if (directory !== "products" && directory !== "documents" && directory !== "private") continue;
    const bytes = await readFile(sourcePath);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const extension = extname(sourcePath).toLowerCase();
    const access: ObjectAccess = directory === "private" ? "PRIVATE" : "PUBLIC";
    const classification: ObjectMigrationClassification = directory === "products" ? "PRODUCT_PUBLIC_IMAGE" : directory === "documents" ? "PRODUCT_PUBLIC_DOCUMENT" : "PRIVATE_DOCUMENT";
    const targetKey = directory === "private" ? `documents/${contentHash}${extension}` : `${directory}/${contentHash}${extension}`;
    const duplicateOf = seen.get(`${access}:${contentHash}`);
    if (!duplicateOf) seen.set(`${access}:${contentHash}`, targetKey);
    items.push({ sourcePath, sourceRelativePath, classification, access, targetKey, contentType: mime(extension), byteSize: (await stat(sourcePath)).size, contentHash, referenced: references.has(sourceRelativePath), duplicateOf });
  }
  const available = new Set(items.filter((item) => item.access === "PUBLIC").map((item) => item.sourceRelativePath));
  const missingReferences = [...references].filter((reference) => !available.has(reference)).sort();
  return { items, missingReferences, totals: { files: items.length, bytes: items.reduce((sum, item) => sum + item.byteSize, 0), referenced: items.filter((item) => item.referenced).length, unreferenced: items.filter((item) => !item.referenced).length, duplicates: items.filter((item) => item.duplicateOf).length, missingReferences: missingReferences.length } };
}

export async function migrateLegacyObjects(inventory: ObjectMigrationInventory, target: ObjectStorage) {
  const results: Array<{ targetKey: string; status: "COPIED" | "ALREADY_PRESENT" }> = [];
  for (const item of inventory.items) {
    const existing = await target.readObject(item.targetKey, item.access);
    if (existing) {
      const existingHash = createHash("sha256").update(existing).digest("hex");
      if (existingHash !== item.contentHash) throw new Error(`OBJECT_DESTINATION_CONFLICT:${item.targetKey}`);
      results.push({ targetKey: item.targetKey, status: "ALREADY_PRESENT" });
      continue;
    }
    const bytes = new Uint8Array(await readFile(item.sourcePath));
    await target.storeObject({ key: item.targetKey, access: item.access, bytes, contentType: item.contentType, expectedHash: item.contentHash });
    results.push({ targetKey: item.targetKey, status: "COPIED" });
  }
  return results;
}
