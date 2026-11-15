import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { LocalObjectStorage } from "../storage/objectStorage.js";
import { inventoryLegacyObjects, migrateLegacyObjects } from "../storage/objectMigration.js";

const root = await mkdtemp(resolve(tmpdir(), "tekcentral-object-migration-"));
try {
  const source = resolve(root, "source"), data = resolve(root, "data"), targetRoot = resolve(root, "target");
  await mkdir(resolve(source, "products"), { recursive: true });
  await mkdir(resolve(source, "documents"), { recursive: true });
  await mkdir(data, { recursive: true });
  await writeFile(resolve(source, "products", "legacy.jpg"), "image-bytes");
  await writeFile(resolve(source, "documents", "legacy.pdf"), "%PDF-document");
  await writeFile(resolve(data, "references.json"), JSON.stringify({ image: "/api/public/assets/products/legacy.jpg", missing: "/api/public/assets/documents/missing.pdf" }));
  const inventory = await inventoryLegacyObjects({ sourceRoot: source, dataRoot: data });
  assert.equal(inventory.totals.files, 2);
  assert.equal(inventory.totals.referenced, 1);
  assert.deepEqual(inventory.missingReferences, ["documents/missing.pdf"]);
  const storage = new LocalObjectStorage(targetRoot);
  const first = await migrateLegacyObjects(inventory, storage);
  assert.equal(first.filter((item) => item.status === "COPIED").length, 2);
  const second = await migrateLegacyObjects(inventory, storage);
  assert.equal(second.filter((item) => item.status === "ALREADY_PRESENT").length, 2);
  for (const item of inventory.items) assert.deepEqual(Buffer.from((await storage.readObject(item.targetKey, item.access))!), await readFile(item.sourcePath));
  console.log("Object-byte migration inventory and idempotency tests passed.");
} finally { await rm(root, { recursive: true, force: true }); }
