import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { __resetSupplierSourceRegistryForTests, saveSupplierSource, setSupplierSourceState, validateSupplierSourceUrl } from "../supplierSourceRegistry.js";
import { mustekInventorySummary, mustekSourceManifest } from "../suppliers/mustek/mustekSourceManifest.js";
import { parseMustekWorkbook } from "../suppliers/mustek/mustekWorkbookParser.js";
import { mustekEvidenceObjectKey } from "../suppliers/mustek/mustekSourceService.js";

process.env.PERSISTENCE_PROVIDER="LOCAL";
const valid=await validateSupplierSourceUrl("MUSTEK","https://shop.mustek.co.za/downloads/pricelists/test.xlsx",async()=>["102.67.136.44"]);
assert.equal(valid,"https://shop.mustek.co.za/downloads/pricelists/test.xlsx");
await assert.rejects(()=>validateSupplierSourceUrl("MUSTEK","https://example.com/test.xlsx",async()=>["93.184.216.34"]),/SOURCE_HOST_NOT_ALLOWED/);
await assert.rejects(()=>validateSupplierSourceUrl("MUSTEK","https://shop.mustek.co.za/test.xlsx",async()=>["127.0.0.1"]),/SOURCE_PRIVATE_ADDRESS_BLOCKED/);
await assert.rejects(()=>validateSupplierSourceUrl("MUSTEK","http://shop.mustek.co.za/test.xlsx",async()=>["102.67.136.44"]),/SOURCE_HTTPS_REQUIRED/);
assert.deepEqual(mustekInventorySummary,{priceLists:28,htmlCatalogues:1,marketingAssets:45,incentivesIgnored:3,total:74});
assert.equal(mustekSourceManifest.some(item=>"INCENTIVE" in item||item.sourceUrl.includes("/incentives/")),false);

__resetSupplierSourceRegistryForTests();
const source=await saveSupplierSource({supplierCode:"MUSTEK",label:"Uploaded test",purpose:"PRICE_LIST",transport:"FILE_UPLOAD",format:"XLSX",fileReference:"private/test.xlsx",state:"DISABLED",priority:100,isPrimary:false,expectedMimeTypes:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],hints:{},syncEnabled:false,revisionMetadata:{}},"tester");
assert.equal(source.state,"DISABLED");
await assert.rejects(()=>setSupplierSourceState(source.id,"ACTIVE",true,"tester",false),/CONFIRMATION/);
assert.equal((await setSupplierSourceState(source.id,"ACTIVE",true,"tester",true)).state,"ACTIVE");
assert.equal(mustekEvidenceObjectKey({...source,sourceUrl:"https://shop.mustek.co.za/downloads/Acer%20Price%20List.xlsx",fileReference:undefined},"abc123"),`supplier-evidence/mustek/${source.id}/abc123/Acer-Price-List.xlsx`);

const workbook=`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const rels=`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`;
const sheet=(rows:string)=>`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
const inline=(ref:string,value:string)=>`<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const bytes=zipSync({"xl/workbook.xml":strToU8(workbook),"xl/_rels/workbook.xml.rels":strToU8(rels),"xl/worksheets/sheet1.xml":strToU8(sheet(`<row r="1">${inline("A1","Part No")}${inline("B1","Description")}${inline("C1","Price excl. VAT")}${inline("D1","Weblink")}</row><row r="2">${inline("A2","SKU-1")}${inline("B2","Router")}${inline("C2","100.00")}${inline("D2","https://manufacturer.example/router")}</row><row r="3">${inline("A3","SKU-1")}${inline("B3","Router duplicate")}</row>`)),"xl/worksheets/sheet2.xml":strToU8(sheet(`<row r="1">${inline("A1","Notes only")}</row>`))});
const audit=parseMustekWorkbook(bytes,"known-pattern.xlsx");
assert.equal(audit.worksheetCount,2);assert.deepEqual(audit.worksheetNames,["Products","Notes"]);assert.deepEqual(audit.candidateDataSheets,["Products"]);assert.deepEqual(audit.ignoredSheets,["Notes"]);assert.equal(audit.evidence.length,2);assert.equal(audit.evidence[0].supplierSku,"SKU-1");assert.equal(audit.evidence[0].dealerCost,100);assert.equal(audit.evidence[0].taxBasis,"EXCLUSIVE");assert.ok(audit.warnings.some(item=>item.includes("duplicate SKU")));
assert.throws(()=>parseMustekWorkbook(strToU8("<html>Error</html>"),"fake.xlsx"),/SIGNATURE/);
console.log("Mustek source registry tests passed");
