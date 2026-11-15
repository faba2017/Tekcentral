import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateTriggerConfiguration } from "../adminAi/automationRepository.js";
import { minimumAutonomy } from "../adminAi/policy.js";
import { adminAiToolRegistryDto } from "../adminAi/controlledActions.js";

assert.deepEqual(validateTriggerConfiguration("SCHEDULE",{kind:"DAILY",localTime:"08:00"}),{kind:"DAILY",localTime:"08:00"});
assert.deepEqual(validateTriggerConfiguration("SCHEDULE",{kind:"WEEKLY",localTime:"08:00",weekdays:[1]}),{kind:"WEEKLY",localTime:"08:00",weekdays:[1]});
assert.deepEqual(validateTriggerConfiguration("SCHEDULE",{kind:"FIXED_INTERVAL",intervalMinutes:240}),{kind:"FIXED_INTERVAL",intervalMinutes:240});
assert.throws(()=>validateTriggerConfiguration("SCHEDULE",{kind:"FIXED_INTERVAL",intervalMinutes:0}));
assert.deepEqual(validateTriggerConfiguration("EVENT",{eventType:"PRODUCT_READINESS_CHANGED",entityType:"PRODUCT",entityId:"product-1"}),{eventType:"PRODUCT_READINESS_CHANGED",entityType:"PRODUCT",entityId:"product-1"});
assert.deepEqual(validateTriggerConfiguration("EVENT",{eventType:"ADMIN_AI_ACTION_FAILED",entityType:"PRODUCT",entityId:"product-1"}),{eventType:"ADMIN_AI_ACTION_FAILED",entityType:"PRODUCT",entityId:"product-1"});
assert.equal(minimumAutonomy("AUTO","PREPARE"),"PREPARE");
assert.deepEqual(adminAiToolRegistryDto().map(({id,label,riskLevel,requiredPermission,autonomyCeiling})=>({id,label,riskLevel,requiredPermission,autonomyCeiling})),[{id:"product_draft_update",label:"Update Product draft",riskLevel:"MEDIUM",requiredPermission:"products.edit",autonomyCeiling:"PREPARE"},{id:"product_publish",label:"Publish Product",riskLevel:"HIGH",requiredPermission:"products.publish",autonomyCeiling:"PREPARE"}]);

const page=await readFile("src/pages/admin/AdminAiAutomationsPage.tsx","utf8");
for(const expected of ["DAILY","WEEKLY","FIXED_INTERVAL","PRODUCT_READINESS_CHANGED","ADMIN_AI_ACTION_FAILED","Current","Proposed","Human approval required","expires","Save changes","Confirm & apply","Delete","Automation deleted.","Previous run history and pending review actions will be retained."])assert.ok(page.includes(expected),`Missing automation UI contract: ${expected}`);
const client=await readFile("src/lib/admin-ai-automations.ts","utf8");
const combobox=await readFile("src/components/admin/AdminAiProductTargetCombobox.tsx","utf8");
assert.ok(client.includes("Automation tools could not be loaded."),"Empty or invalid registry metadata must fail visibly.");
assert.ok(client.includes("/retire"),"Delete must use the durable retirement endpoint.");
for(const expected of ['role="combobox"','role="listbox"','aria-activedescendant','ArrowDown','ArrowUp','Escape','Enter','Select a Product from the suggestions.','No matching Products found.','Products could not be loaded.','300'])assert.ok(combobox.includes(expected),`Missing Product autocomplete contract: ${expected}`);
assert.ok(client.includes("product-targets"),"Product autocomplete must use the bounded canonical target endpoint.");
assert.ok(!page.includes('apiRequest<{products:AdminInternalProduct[]}>("/api/admin/products")'),"Automation management must not load the full Product catalogue.");
assert.ok(!page.includes("dangerouslySetInnerHTML"),"Automation content must render through React text escaping.");
assert.ok(page.includes("automationDraftDirty(editBaseline,editDraft)"),"Edit save must be controlled by normalized dirty state.");
assert.ok(page.includes("ADMIN_AI_AUTOMATION_CONFLICT"),"Revision conflict must have production-safe handling.");
console.log("Admin AI automation management UI contract tests passed.");
