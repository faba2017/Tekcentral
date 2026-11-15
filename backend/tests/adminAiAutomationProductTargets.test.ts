import assert from "node:assert/strict";
import { searchAdminAiAutomationProductTargets } from "../adminAi/automationProductTargets.js";

const products=[
  {id:"product-draft",name:"Ubiquiti airCube",sku:"TC-ACB-ISP"},
  {id:"product-published",name:"MikroTik Router",sku:"TC-RTR-100"},
  {id:"product-blocked",name:"Office Access Point",sku:"TC-AP-200"},
  {id:"product-noneditable",name:"Retired Product",sku:"TC-OLD-1"},
] as never;
const review=(id:string)=>{
  if(id==="product-noneditable")throw new Error("Product is not editable.");
  if(id==="product-published")return {state:"PUBLISHED",readiness:{status:"READY_FOR_PUBLISH_REVIEW",blockers:[]}};
  if(id==="product-blocked")return {state:"NOT_PUBLISHED",readiness:{status:"NOT_READY",blockers:["CONTENT_REQUIRED"]}};
  return {state:"NOT_PUBLISHED",readiness:{status:"NOT_READY",blockers:[]}};
};
const dependencies={listProducts:async()=>products,getReview:async(id:string)=>review(id) as never};

const initial=await searchAdminAiAutomationProductTargets({limit:20},dependencies as never);
assert.deepEqual(initial.products.map(item=>item.id),["product-published","product-blocked","product-draft"]);
assert.equal(initial.products.some(item=>item.id==="product-noneditable"),false);
assert.equal(initial.products.find(item=>item.id==="product-published")?.readinessSummary,"Published");
assert.equal(initial.products.find(item=>item.id==="product-blocked")?.readinessSummary,"Needs review");
assert.equal(initial.products.find(item=>item.id==="product-draft")?.readinessSummary,"Draft");

const name=await searchAdminAiAutomationProductTargets({query:"ubi"},dependencies as never);
assert.deepEqual(name.products.map(item=>item.id),["product-draft"]);
const sku=await searchAdminAiAutomationProductTargets({query:"acb-isp"},dependencies as never);
assert.deepEqual(sku.products.map(item=>item.id),["product-draft"]);
const selected=await searchAdminAiAutomationProductTargets({query:"nothing",selectedId:"product-published"},dependencies as never);
assert.equal(selected.products.length,0);assert.equal(selected.selected?.id,"product-published");
assert.equal((await searchAdminAiAutomationProductTargets({query:"<script>"},dependencies as never)).products.length,0);
assert.equal((await searchAdminAiAutomationProductTargets({limit:1},dependencies as never)).products.length,1);
console.log("Admin AI automation Product target tests passed.");
