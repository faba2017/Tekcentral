import assert from "node:assert/strict";
import { classifyAdminAiHealth,percentile } from "../adminAi/operationsService.js";
import { getAdminAiAutomationWorkerRuntimeStatus } from "../adminAi/automationService.js";
import { permissionForAdminRequest } from "../adminAuthorizationPolicy.js";

assert.equal(percentile([],0.95),undefined);
assert.equal(percentile([100,300,200],0.95),300);
assert.equal(classifyAdminAiHealth({configured:false,observations:10,failures:0,fallbacks:0,criticalAlert:false}),"UNAVAILABLE");
assert.equal(classifyAdminAiHealth({configured:true,observations:0,failures:0,fallbacks:0,criticalAlert:false}),"UNKNOWN");
assert.equal(classifyAdminAiHealth({configured:true,observations:10,failures:0,fallbacks:0,p95LatencyMs:1000,criticalAlert:false}),"HEALTHY");
assert.equal(classifyAdminAiHealth({configured:true,observations:10,failures:2,fallbacks:0,criticalAlert:false}),"DEGRADED");
assert.equal(classifyAdminAiHealth({configured:true,observations:10,failures:0,fallbacks:0,criticalAlert:true}),"UNAVAILABLE");
assert.equal(permissionForAdminRequest("GET","/api/admin/admin-ai/operations"),"settings.zeus");
assert.notEqual(permissionForAdminRequest("GET","/api/admin/admin-ai/operations"),"admin_ai.use");
assert.equal(getAdminAiAutomationWorkerRuntimeStatus({ADMIN_AI_AUTOMATION_WORKER_ENABLED:"false"}).status,"UNAVAILABLE");
console.log("Admin AI operations tests passed.");
