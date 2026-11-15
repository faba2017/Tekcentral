import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { storeMigrationInventory } from "../persistence/storeInventory.js";

const root = resolve(process.cwd(), ".data"); const records: { file: string; domain: string; authoritative: boolean; exists: boolean; count?: number; fingerprint?: string; error?: string }[] = [];
for (const entry of storeMigrationInventory.filter((item) => !item.file.includes("*"))) { try { const bytes = await readFile(resolve(root, entry.file)); const parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>; const arrays = Object.values(parsed).filter(Array.isArray); records.push({ file: entry.file, domain: entry.domain, authoritative: entry.authoritative, exists: true, count: arrays.reduce((sum, value) => sum + value.length, 0), fingerprint: createHash("sha256").update(bytes).digest("hex").slice(0, 16) }); } catch (error) { const missing = (error as NodeJS.ErrnoException).code === "ENOENT"; records.push({ file: entry.file, domain: entry.domain, authoritative: entry.authoritative, exists: false, error: missing ? undefined : "INVALID_OR_UNREADABLE" }); } }
console.log(JSON.stringify({ mode: "DRY_RUN", source: ".data", records, authoritativeStoresFound: records.filter((item) => item.authoritative && item.exists).length, validationFailures: records.filter((item) => item.error).length }, null, 2));
