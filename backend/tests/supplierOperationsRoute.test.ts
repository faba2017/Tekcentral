import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { operationalSupplierIds } from "../supplierRegistry.js";

const server = await readFile("backend/server.ts", "utf8");
const supplierHub = await readFile("backend/supplierHubService.ts", "utf8");
const matcherSource = String.raw`/^\/api\/admin\/suppliers\/([^/]+)\/operations$/i`;

assert.equal(server.includes(`url.pathname.match(${matcherSource})`), true, "shared supplier operations route must accept a bounded path segment");
assert.match(server, /getSupplierOperations\(supplierOperationsMatch\[1\]\.toUpperCase\(\)\)/);
assert.deepEqual([...operationalSupplierIds], ["TEKCENTRAL", "CJ", "SCOOP", "SYNTECH", "MUSTEK", "TVR"]);

const route = /^\/api\/admin\/suppliers\/([^/]+)\/operations$/i;
for (const supplier of operationalSupplierIds) assert.equal(route.exec(`/api/admin/suppliers/${supplier.toLowerCase()}/operations`)?.[1].toUpperCase(), supplier);
assert.equal(operationalSupplierIds.includes("UNSUPPORTED" as typeof operationalSupplierIds[number]), false);
assert.match(server, /if \(!result\) \{ sendJson\(response, 404, \{ error: "Supplier workspace not found\." \}\)/);
assert.doesNotMatch(supplierHub, /if \(id === "TVR"\)[\s\S]*?mappings: \{ total: 0, verified: 0,/);
assert.match(supplierHub, /if \(id === "TVR"\)[\s\S]*?mappings: \{ total: supplierMappings\.length, verified: supplierMappings\.filter/);

console.log("Supplier operations route tests passed");
