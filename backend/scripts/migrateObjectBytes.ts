import { resolve } from "node:path";
import { LocalObjectStorage } from "../storage/objectStorage.js";
import { inventoryLegacyObjects, migrateLegacyObjects } from "../storage/objectMigration.js";

const apply = process.argv.includes("--apply");
const targetIndex = process.argv.indexOf("--target-root");
const targetRoot = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined;
const inventory = await inventoryLegacyObjects();
console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", ...inventory.totals, missingReferences: inventory.missingReferences, items: inventory.items.map(({ sourceRelativePath, classification, access, targetKey, byteSize, contentHash, referenced, duplicateOf }) => ({ sourceRelativePath, classification, access, targetKey, byteSize, contentHash, referenced, duplicateOf })) }, null, 2));
if (apply) {
  if (!targetRoot) throw new Error("--target-root is required for local rehearsal apply.");
  const target = new LocalObjectStorage(resolve(targetRoot));
  const results = await migrateLegacyObjects(inventory, target);
  console.log(JSON.stringify({ copied: results.filter((item) => item.status === "COPIED").length, alreadyPresent: results.filter((item) => item.status === "ALREADY_PRESENT").length }, null, 2));
}
