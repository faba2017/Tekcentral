import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { supplierRegistry, operationalSupplierIds } from "../supplierRegistry.js";
import { __resetSupplierSourceRegistryForTests, saveSupplierSource, setSupplierSourceState, validateSupplierSourceUrl } from "../supplierSourceRegistry.js";
import { __setAdminAuditStorePathForTests, listAdminAudit } from "../adminAuditService.js";
import { parseTvrLogicalWorkbook } from "../suppliers/tvr/tvrWorkbookSnapshot.js";
import { tvrSourceManifest, TVR_COMMERCIAL_WORKBOOK_ID, TVR_PUBLIC_CATALOGUE_ID } from "../suppliers/tvr/tvrSourceManifest.js";
import { fetchTvrWorkbookResponse } from "../suppliers/tvr/tvrSourceService.js";

function workbook(input: { names?: string[]; value?: string; formula?: string; error?: string; noise?: string } = {}) {
  const names = input.names ?? ["Menu", "Genius ", "Samsung "];
  const sheets = names.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const relationships = names.map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const first = `<row r="1"><c r="A1" t="inlineStr"><is><t>${input.value ?? "Router"}</t></is></c><c r="B1"><v>12.5</v></c><c r="C1" t="b"><v>1</v></c>${input.formula === undefined ? "" : `<c r="D1"><f>${input.formula}</f><v>25</v></c>`}${input.error === undefined ? "" : `<c r="E1" t="e"><v>${input.error}</v></c>`}</row>`;
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships>${relationships}</Relationships>`),
    ...Object.fromEntries(names.map((_, index) => [`xl/worksheets/sheet${index + 1}.xml`, strToU8(`<?xml version="1.0"?><worksheet><sheetData>${index === 0 ? first : ""}</sheetData></worksheet>`)])),
    ...(input.noise ? { "docProps/core.xml": strToU8(input.noise), "xl/styles.xml": strToU8(`<styleSheet marker="${input.noise}"/>`) } : {}),
  };
  return zipSync(files, { level: input.noise ? 9 : 1 });
}

assert.equal(supplierRegistry.TVR.displayName, "TVR Distribution");
assert.equal(operationalSupplierIds.includes("TVR"), true);
assert.deepEqual(tvrSourceManifest.map((source) => [source.id, source.format]), [[TVR_COMMERCIAL_WORKBOOK_ID, "XLSX"], [TVR_PUBLIC_CATALOGUE_ID, "HTML"]]);

const publicAddress = async () => ["142.250.70.174"];
assert.match(await validateSupplierSourceUrl("TVR", tvrSourceManifest[0].sourceUrl, publicAddress), /^https:\/\/docs\.google\.com/);
assert.match(await validateSupplierSourceUrl("TVR", "https://doc-0k-sheets.googleusercontent.com/export.xlsx", publicAddress, { redirect: true }), /googleusercontent\.com/);
await assert.rejects(() => validateSupplierSourceUrl("TVR", "https://evil.example/export.xlsx", publicAddress, { redirect: true }), /SOURCE_HOST_NOT_ALLOWED/);
await assert.rejects(() => validateSupplierSourceUrl("TVR", "http://docs.google.com/export.xlsx", publicAddress), /SOURCE_HTTPS_REQUIRED/);
await assert.rejects(() => validateSupplierSourceUrl("TVR", tvrSourceManifest[0].sourceUrl, async () => ["127.0.0.1"]), /SOURCE_PRIVATE_ADDRESS_BLOCKED/);

const redirects: string[] = [];
const redirected = await fetchTvrWorkbookResponse(tvrSourceManifest[0].sourceUrl, (async (url: string | URL | Request) => {
  redirects.push(String(url));
  return redirects.length === 1 ? new Response(null, { status: 307, headers: { location: "https://doc-0k-sheets.googleusercontent.com/export.xlsx" } }) : new Response(workbook(), { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}) as typeof fetch, publicAddress);
assert.equal(redirected.status, 200);
assert.equal(redirects.length, 2);
await assert.rejects(() => fetchTvrWorkbookResponse(tvrSourceManifest[0].sourceUrl, (async () => new Response(null, { status: 307, headers: { location: "https://evil.example/export.xlsx" } })) as typeof fetch, publicAddress), /SOURCE_HOST_NOT_ALLOWED/);

const baseline = parseTvrLogicalWorkbook(workbook({ formula: "B1*2", error: "#N/A" }));
const regenerated = parseTvrLogicalWorkbook(workbook({ formula: "B1*2", error: "#N/A", noise: "regenerated-package-metadata" }));
assert.equal(baseline.logicalFingerprint, regenerated.logicalFingerprint, "package/style noise must not create a logical version");
assert.deepEqual(baseline.tabs.map((tab) => tab.name), ["Menu", "Genius ", "Samsung "]);
assert.equal(baseline.tabs[0].formulaCount, 1);
assert.equal(baseline.tabs[0].errorCellCount, 1);
assert.notEqual(baseline.logicalFingerprint, parseTvrLogicalWorkbook(workbook({ value: "Switch", formula: "B1*2", error: "#N/A" })).logicalFingerprint);
assert.notEqual(baseline.logicalFingerprint, parseTvrLogicalWorkbook(workbook({ names: ["Menu", "Samsung ", "Genius "], formula: "B1*2", error: "#N/A" })).logicalFingerprint);
assert.notEqual(baseline.logicalFingerprint, parseTvrLogicalWorkbook(workbook({ names: ["Menu", "Genius", "Samsung "], formula: "B1*2", error: "#N/A" })).logicalFingerprint);
assert.notEqual(baseline.logicalFingerprint, parseTvrLogicalWorkbook(workbook({ formula: "B1*3", error: "#N/A" })).logicalFingerprint);
assert.notEqual(baseline.logicalFingerprint, parseTvrLogicalWorkbook(workbook({ formula: "B1*2", error: "#DIV/0!" })).logicalFingerprint);
assert.throws(() => parseTvrLogicalWorkbook(strToU8("not a workbook")), /INVALID_XLSX_SIGNATURE/);

process.env.PERSISTENCE_PROVIDER = "LOCAL";
__resetSupplierSourceRegistryForTests();
__setAdminAuditStorePathForTests(`/tmp/tekcentral-tvr-audit-${process.pid}.json`);
const source = await saveSupplierSource({ supplierCode: "TVR", label: "Actor test", purpose: "PRICE_LIST", transport: "FILE_UPLOAD", format: "XLSX", fileReference: "private/tvr-test.xlsx", state: "DISABLED", priority: 1, isPrimary: false, expectedMimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], hints: {}, syncEnabled: false, revisionMetadata: {} }, { actorType: "STAFF_USER", actorId: "staff-tvr-1", actorLabel: "TVR Operator", actorRole: "SUPER_ADMIN" });
await setSupplierSourceState(source.id, "ACTIVE", true, { actorType: "STAFF_USER", actorId: "staff-tvr-1", actorLabel: "TVR Operator", actorRole: "SUPER_ADMIN" }, true);
const audit = await listAdminAudit({ page: 1, pageSize: 20 });
assert.equal(audit.records[0].actorType, "STAFF_USER");
assert.equal(audit.records[0].actorId, "staff-tvr-1");
assert.equal(audit.records[0].actorRole, "SUPER_ADMIN");
__setAdminAuditStorePathForTests(undefined);

console.log("TVR source registry and logical workbook tests passed");
