import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { __setManualLogisticsStorePathForTests, getActiveManualLogisticsEvidence, listManualLogisticsEvidence, ManualLogisticsConflictError, saveManualLogisticsEvidence } from "../productManualLogisticsRepository.js";

const directory=await mkdtemp(join(tmpdir(),"tekcentral-logistics-"));
__setManualLogisticsStorePathForTests(join(directory,"evidence.json"));
try {
  const base={productId:"product-manual-logistics",supplierCode:"TEKCENTRAL",supplierIdentity:"LOCAL-1",expectedRevision:0,classification:"PACKAGE" as const,weightGrams:1850,lengthMm:650,widthMm:650,heightMm:340,actorStaffId:"staff-1",actorLabel:"Product Staff"};
  const first=await saveManualLogisticsEvidence(base);assert.equal(first.changed,true);assert.equal(first.evidence.revision,1);assert.equal((await getActiveManualLogisticsEvidence(base.productId))?.heightMm,340);
  const noop=await saveManualLogisticsEvidence({...base,expectedRevision:1});assert.equal(noop.changed,false);assert.equal((await listManualLogisticsEvidence(base.productId)).length,1);
  const second=await saveManualLogisticsEvidence({...base,expectedRevision:1,heightMm:350});assert.equal(second.changed,true);assert.equal(second.evidence.revision,2);const history=await listManualLogisticsEvidence(base.productId);assert.equal(history.length,2);assert.ok(history.find(item=>item.revision===1)?.supersededAt);
  await assert.rejects(saveManualLogisticsEvidence({...base,expectedRevision:1,heightMm:360}),ManualLogisticsConflictError);
  const partial=await saveManualLogisticsEvidence({productId:"product-partial",supplierCode:"SYNTECH",supplierIdentity:"SYN-1",expectedRevision:0,classification:"PACKAGE",heightMm:44,actorStaffId:"staff-1",actorLabel:"Product Staff"});assert.equal(partial.evidence.heightMm,44);assert.equal(partial.evidence.weightGrams,undefined);
  await assert.rejects(saveManualLogisticsEvidence({...base,productId:"invalid",weightGrams:-1}),/positive/);
  console.log("Product manual logistics evidence tests passed.");
} finally { __setManualLogisticsStorePathForTests(); await rm(directory,{recursive:true,force:true}); }
