import { randomUUID } from "node:crypto";
import { AdminAiError, adminAiRetryable } from "./errors.js";
import { buildAdminAiSafeContext } from "./contextual.js";
import { ADMIN_AI_TOOL_REGISTRY, adminAiToolRegistryDto, prepareAutomationAdminAiAction } from "./controlledActions.js";
import { countAdminAiActionsSince } from "./actionRepository.js";
import { evaluateAdminAiToolPolicy, enforceAdminAiRequestPolicy, minimumAutonomy } from "./policy.js";
import type { AdminAiService } from "./service.js";
import { staffAuthorizationContextForAutomation } from "../staffAuth.js";
import { getPublicationReview } from "../productPublicationRepository.js";
import { bestEffortAlert, bestEffortResolve } from "../operationalAlertService.js";
import { recordAdminAuditBestEffort } from "../adminAuditService.js";
import {
  claimAdminAiAutomationRun, createAdminAiAutomation, createAdminAiAutomationRunOccurrence, getAdminAiAutomation,
  listAdminAiAutomations, listDueAdminAiAutomationRunRetries, listDueAdminAiAutomations, listPendingAdminAiAutomationRuns,
  listStaleAdminAiAutomationRuns, listUnprocessedAdminAiAutomationEvents, markAdminAiAutomationEventProcessed,
  markAdminAiAutomationRunEscalated, markAdminAiAutomationRunFailed, markAdminAiAutomationRunSkipped,
  markAdminAiAutomationRunSucceeded, updateAdminAiAutomation, updateAdminAiAutomationNextRun,
  recordAdminAiAutomationEvent, retireAdminAiAutomation, setAdminAiAutomationEnabled, type AdminAiAutomationDefinition, type AdminAiAutomationEvent,
} from "./automationRepository.js";
import { adminAiScheduleOccurrenceKey, nextAdminAiScheduleRun } from "./automationSchedule.js";

const LEASE_MS = 90_000;
type WorkerRuntime={enabled:boolean;active:boolean;startedAt?:string;lastCycleStartedAt?:string;lastCycleCompletedAt?:string;lastFailureAt?:string;lastFailureCode?:string};
let workerRuntime:WorkerRuntime={enabled:false,active:false};
export function getAdminAiAutomationWorkerRuntimeStatus(environment=process.env,now=new Date()){
  const enabled=environment.ADMIN_AI_AUTOMATION_WORKER_ENABLED==="true";const last=workerRuntime.lastCycleCompletedAt??workerRuntime.lastCycleStartedAt;
  const stale=enabled&&last?now.getTime()-new Date(last).getTime()>120_000:false;
  return{...workerRuntime,enabled,status:!enabled?"UNAVAILABLE":workerRuntime.lastFailureAt&&!workerRuntime.lastCycleCompletedAt?"DEGRADED":stale?"DEGRADED":last?"HEALTHY":"UNKNOWN",scope:"PROCESS_LOCAL" as const};
}
const MAX_ACTIVE_AUTOMATIONS_PER_OWNER = 25;
export const ADMIN_AI_AUTOMATION_EVENT_CATALOGUE = ["PRODUCT_READINESS_CHANGED", "ADMIN_AI_ACTION_FAILED"] as const;
export type AdminAiAutomationEventType=(typeof ADMIN_AI_AUTOMATION_EVENT_CATALOGUE)[number];
const toolFor = (toolId: string) => adminAiToolRegistryDto().find((item) => item.id === toolId);
const safeUsage = (result: Awaited<ReturnType<AdminAiService["generate"]>>) => ({ providerRequestId: result.providerRequestId, providerName: result.provider, modelName: result.model, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, reasoningTokens: result.usage?.reasoningTokens, totalTokens: result.usage?.totalTokens, latencyMs: result.latencyMs });
const failureCode = (error: unknown) => error instanceof AdminAiError ? error.code : typeof error === "object" && error && "code" in error ? String(error.code) : "ADMIN_AI_AUTOMATION_FAILED";

export async function validateAdminAiAutomationTarget(input: { toolId: string; targetType: string; targetId: string }) {
  const tool = toolFor(input.toolId);
  if (!tool || input.targetType !== tool.targetType || tool.targetType !== "PRODUCT") throw Object.assign(new Error("The automation tool or target is unsupported."), { code: "INVALID_ADMIN_AI_AUTOMATION", status: 400 });
  await getPublicationReview(input.targetId).catch(() => { throw Object.assign(new Error("The Product target was not found."), { code: "ADMIN_AI_AUTOMATION_TARGET_NOT_FOUND", status: 404 }); });
}

/** Trusted server-side event publication. This is intentionally not exposed as an HTTP route. */
export async function publishTrustedAdminAiAutomationEvent(input:{eventKey:string;eventType:AdminAiAutomationEventType;entityType:"PRODUCT";entityId:string;safeMetadata?:Record<string,unknown>;originAutomationId?:string;originRunId?:string;occurredAt?:Date}){
  if(!ADMIN_AI_AUTOMATION_EVENT_CATALOGUE.includes(input.eventType))throw Object.assign(new Error("The trusted automation event type is unsupported."),{code:"INVALID_ADMIN_AI_AUTOMATION_EVENT",status:400});
  await getPublicationReview(input.entityId).catch(()=>{throw Object.assign(new Error("The Product event target was not found."),{code:"ADMIN_AI_AUTOMATION_TARGET_NOT_FOUND",status:404});});
  return recordAdminAiAutomationEvent({...input,occurredAt:input.occurredAt??new Date()});
}

export async function createValidatedAdminAiAutomation(input: Parameters<typeof createAdminAiAutomation>[0], now = new Date()) {
  await validateAdminAiAutomationTarget(input);
  if(input.triggerType==="EVENT"&&!ADMIN_AI_AUTOMATION_EVENT_CATALOGUE.includes((input.triggerConfiguration as {eventType?:string}).eventType as never))throw Object.assign(new Error("The trusted automation event type is unsupported."),{code:"INVALID_ADMIN_AI_AUTOMATION",status:400});
  const owner = await staffAuthorizationContextForAutomation(input.ownerStaffId);
  if (!owner) throw Object.assign(new Error("The automation owner must be an active staff account."), { code: "ADMIN_AI_AUTOMATION_OWNER_UNAVAILABLE", status: 409 });
  const tool=toolFor(input.toolId)!;
  if (!owner.permissions.has("admin_ai.use") || !owner.permissions.has(tool.requiredPermission)) throw Object.assign(new Error("The automation owner does not have the required permissions."), { code: "PERMISSION_DENIED", status: 403 });
  const nextRunAt = input.triggerType === "SCHEDULE" ? nextAdminAiScheduleRun(input.triggerConfiguration as never, input.timezone ?? "Africa/Johannesburg", now) : undefined;
  return createAdminAiAutomation({ ...input, enabled: false, nextRunAt }, now);
}

export async function updateValidatedAdminAiAutomation(id: string, revision: number, input: Parameters<typeof updateAdminAiAutomation>[2], now = new Date()) {
  await validateAdminAiAutomationTarget(input);
  if(input.triggerType==="EVENT"&&!ADMIN_AI_AUTOMATION_EVENT_CATALOGUE.includes((input.triggerConfiguration as {eventType?:string}).eventType as never))throw Object.assign(new Error("The trusted automation event type is unsupported."),{code:"INVALID_ADMIN_AI_AUTOMATION",status:400});
  const current = await getAdminAiAutomation(id); if (!current) throw Object.assign(new Error("Automation was not found."), { code: "ADMIN_AI_AUTOMATION_NOT_FOUND", status: 404 });
  if(current.retiredAt)throw Object.assign(new Error("Retired automations cannot be changed."),{code:"AUTOMATION_RETIRED",status:409});
  const nextRunAt = input.triggerType === "SCHEDULE" ? nextAdminAiScheduleRun(input.triggerConfiguration as never, input.timezone ?? "Africa/Johannesburg", now) : undefined;
  return updateAdminAiAutomation(id, revision, { ...input, nextRunAt }, now);
}

export async function setValidatedAdminAiAutomationEnabled(id:string,revision:number,enabled:boolean,now=new Date()){
  const current=await getAdminAiAutomation(id);if(!current)throw Object.assign(new Error("Automation was not found."),{code:"ADMIN_AI_AUTOMATION_NOT_FOUND",status:404});
  if(current.retiredAt)throw Object.assign(new Error("Retired automations cannot be enabled or disabled."),{code:"AUTOMATION_RETIRED",status:409});
  if(current.enabled===enabled)return current;
  if(enabled){const active=(await listAdminAiAutomations({ownerStaffId:current.ownerStaffId,enabled:true})).length;if(active>=MAX_ACTIVE_AUTOMATIONS_PER_OWNER)throw Object.assign(new Error(`An owner may have at most ${MAX_ACTIVE_AUTOMATIONS_PER_OWNER} active Admin AI automations.`),{code:"ADMIN_AI_AUTOMATION_LIMIT",status:409});}
  const next=enabled&&current.triggerType==="SCHEDULE"?nextAdminAiScheduleRun(current.triggerConfiguration as import("./automationRepository.js").AdminAiScheduleConfiguration,current.timezone,now):undefined;
  return setAdminAiAutomationEnabled(id,revision,enabled,now,next);
}

export async function retireValidatedAdminAiAutomation(id:string,revision:number,actorStaffId:string,now=new Date()){
  return retireAdminAiAutomation(id,revision,actorStaffId,now);
}

function eventMatches(definition: AdminAiAutomationDefinition, event: AdminAiAutomationEvent) {
  if (definition.retiredAt || definition.triggerType !== "EVENT") return false;
  const config = definition.triggerConfiguration as { eventType: string; entityType?: string; entityId?: string };
  return config.eventType === event.eventType && (!config.entityType || config.entityType === event.entityType) && (!config.entityId || config.entityId === event.entityId) && definition.id !== event.originAutomationId;
}

export async function materializeAdminAiAutomationOccurrences(now = new Date()) {
  let created = 0;
  for (const definition of await listDueAdminAiAutomations(now)) {
    const dueAt = new Date(definition.nextRunAt!);
    const occurrence = await createAdminAiAutomationRunOccurrence({ automationId: definition.id, occurrenceKey: adminAiScheduleOccurrenceKey(definition.id, dueAt), triggerType: "SCHEDULE", occurredAt: dueAt }, now);
    if (occurrence.created) created += 1;
    const schedule = definition.triggerConfiguration as import("./automationRepository.js").AdminAiScheduleConfiguration;
    const next = nextAdminAiScheduleRun(schedule, definition.timezone, now, schedule.kind === "FIXED_INTERVAL" ? now : undefined);
    await updateAdminAiAutomationNextRun(definition.id, definition.revision, next, now).catch(() => undefined);
  }
  const eventDefinitions = (await listAdminAiAutomations({ enabled: true })).filter((item) => item.triggerType === "EVENT");
  for (const event of await listUnprocessedAdminAiAutomationEvents()) {
    for (const definition of eventDefinitions.filter((item) => eventMatches(item, event))) {
      const occurrence = await createAdminAiAutomationRunOccurrence({ automationId: definition.id, occurrenceKey: `event:${event.id}`, triggerType: "EVENT", occurredAt: new Date(event.occurredAt), eventId: event.id }, now);
      if (occurrence.created) created += 1;
    }
    await markAdminAiAutomationEventProcessed(event.id, now);
  }
  return created;
}

export async function executeAdminAiAutomationRun(runId: string, service: AdminAiService, workerId: string, now = new Date()) {
  const claim = await claimAdminAiAutomationRun(runId, workerId, LEASE_MS, now); if (!claim.claimed) return claim.run;
  const run = claim.run; const definition = await getAdminAiAutomation(run.automationId);
  if (definition?.retiredAt) return markAdminAiAutomationRunSkipped(run.id, workerId, { safeResult: { outcome: "SKIPPED", reason: "AUTOMATION_RETIRED" } }, now);
  if (!definition?.enabled) return markAdminAiAutomationRunSkipped(run.id, workerId, { safeResult: { outcome: "SKIPPED", reason: "AUTOMATION_DISABLED" } }, now);
  const owner = await staffAuthorizationContextForAutomation(definition.ownerStaffId);
  if (!owner) return markAdminAiAutomationRunSkipped(run.id, workerId, { safeResult: { outcome: "SKIPPED", reason: "OWNER_UNAVAILABLE" } }, now);
  const tool=toolFor(definition.toolId);
  if(!tool)return markAdminAiAutomationRunSkipped(run.id,workerId,{safeResult:{outcome:"SKIPPED",reason:"TOOL_REMOVED"}},now);
  const requested = minimumAutonomy(definition.requestedAutonomy, tool.autonomyCeiling);
  const preparedSince = await countAdminAiActionsSince(definition.ownerStaffId, "PREPARED", new Date(now.getTime() - 3_600_000));
  const policy = await evaluateAdminAiToolPolicy({ staff: owner, tool, requestedBehavior: requested, now, preparedActionsLastHour: preparedSince, executionsLastHour: 0 });
  if (!policy.allowed || requested === "OFF") return markAdminAiAutomationRunSkipped(run.id, workerId, { policyDecision: policy, safeResult: { outcome: "SKIPPED", reasons: policy.denialReasons } }, now);
  try {
    const requestPolicy = await enforceAdminAiRequestPolicy(owner, [tool], now);
    const context = await buildAdminAiSafeContext({ contextType: "PRODUCT", resourceId: definition.targetId, intent: requested === "OBSERVE" ? "SUMMARY" : "NEXT_STEPS" }, owner);
    const registeredTool=ADMIN_AI_TOOL_REGISTRY[definition.toolId as keyof typeof ADMIN_AI_TOOL_REGISTRY];
    if(!registeredTool)return markAdminAiAutomationRunSkipped(run.id,workerId,{safeResult:{outcome:"SKIPPED",reason:"TOOL_REMOVED"}},now);
    const prepareInstruction=registeredTool.id==="product_publish"?"Prepare exactly one canonical Product publication review action by calling the supplied controlled tool. Do not claim the Product is published and do not invent readiness, pricing or availability facts.":"Prepare exactly one evidence-grounded Product draft wording improvement by calling the supplied controlled tool. Do not answer with prose instead of the tool call and do not invent facts.";
    const result = await service.generate({ callerFeature: "admin-ai-automation", modelRole: requested === "PREPARE" ? "PRIMARY" : "ROUTINE", messages: [{ role: "user", content: requested === "OBSERVE" ? "Summarize the supplied Product state without recommending or changing anything." : requested === "SUGGEST" ? "Suggest concise, evidence-grounded next steps. Do not claim to have changed anything." : prepareInstruction }], contextBlocks: [{ label: `${context.contextType}: ${context.title}`.slice(0, 80), content: JSON.stringify({ resourceId: context.resourceId, provenance: context.provenance, facts: context.facts }).slice(0, 4_000) }], tools: requested === "PREPARE" ? [{ name: registeredTool.id, description: registeredTool.description, inputSchema: registeredTool.inputSchema as unknown as Record<string,unknown> }] : [], reasoningEffort: requested === "PREPARE" ? "LOW" : undefined, maxOutputTokens: Math.min(requested === "PREPARE" ? 1_200 : 800, requestPolicy.maxTokensPerRequest), temperature: 0.1, metadata: { automationId: definition.id, runId: run.id } });
    if (requested === "PREPARE") {
      if (result.toolCalls?.length !== 1) return markAdminAiAutomationRunEscalated(run.id, workerId, { policyDecision: policy, safeResult: { outcome: "REVIEW_REQUIRED", reason: "NO_SINGLE_CONTROLLED_ACTION" }, escalationState: "ATTENTION_REQUIRED", ...safeUsage(result) }, new Date());
      const action = await prepareAutomationAdminAiAction({ ownerStaffId: definition.ownerStaffId, automationRunId: run.id, targetId: definition.targetId, staff: owner, toolCall: result.toolCalls[0], now });
      return markAdminAiAutomationRunEscalated(run.id, workerId, { policyDecision: policy, safeResult: { outcome: "AWAITING_CONFIRMATION", actionId: action.id, summary: result.text.slice(0, 1_500) }, escalationState: "REVIEW_REQUIRED", ...safeUsage(result) }, new Date());
    }
    return markAdminAiAutomationRunSucceeded(run.id, workerId, { policyDecision: policy, safeResult: { outcome: requested, summary: result.text.slice(0, 4_000) }, ...safeUsage(result) }, new Date());
  } catch (error) {
    const code = failureCode(error); const transient = error instanceof AdminAiError && adminAiRetryable(error.code); const exhausted = run.attemptCount >= run.maxAttempts;
    if(!transient||exhausted)await bestEffortAlert({type:"ADMIN_AI_AUTOMATION_PROVIDER_FAILURE",severity:"WARNING",subsystem:"SYSTEM",title:"Admin AI automation provider failures require review",summary:`Admin AI automation could not complete after its bounded policy (${code}).`,entityType:"ADMIN_AI_TOOL",entityId:definition.toolId,targetRoute:"/admin/settings/health",recommendedAction:"Review provider health, automation run history and current Admin AI policy.",diagnosticCode:"ADMIN_AI_AUTOMATION_PROVIDER_FAILURE"});
    return markAdminAiAutomationRunFailed(run.id, workerId, code, { safeResult: { outcome: "FAILED", retryable: transient && !exhausted }, retryAt: transient && !exhausted ? new Date(now.getTime() + Math.min(30 * 60_000, 60_000 * 2 ** (run.attemptCount - 1))) : undefined }, new Date());
  }
}

export async function runAdminAiAutomationCycle(service: AdminAiService, workerId = `admin-ai-worker-${randomUUID()}`, now = new Date()) {
  await materializeAdminAiAutomationOccurrences(now);
  const staleRuns=await listStaleAdminAiAutomationRuns(now);if(staleRuns.length)await bestEffortAlert({type:"ADMIN_AI_AUTOMATION_STALE_RUNS",severity:"WARNING",subsystem:"SYSTEM",title:"Admin AI automation leases became stale",summary:`${staleRuns.length} automation run lease(s) required bounded recovery.`,entityType:"ADMIN_AI_AUTOMATION_WORKER",entityId:"runtime",targetRoute:"/admin/settings/ai-assistant/operations",recommendedAction:"Review worker health and automation run history.",diagnosticCode:"ADMIN_AI_AUTOMATION_STALE_RUNS"});else await bestEffortResolve({type:"ADMIN_AI_AUTOMATION_STALE_RUNS",subsystem:"SYSTEM",entityType:"ADMIN_AI_AUTOMATION_WORKER",entityId:"runtime",diagnosticCode:"ADMIN_AI_AUTOMATION_STALE_RUNS"});
  for (const stale of staleRuns) { if(stale.preparedActionId)await markAdminAiAutomationRunEscalated(stale.id,stale.leaseOwner!,{safeResult:{outcome:"AWAITING_CONFIRMATION",actionId:stale.preparedActionId,reason:"STALE_LEASE_AFTER_PREPARE"},escalationState:"REVIEW_REQUIRED"},now).catch(()=>undefined);else await markAdminAiAutomationRunFailed(stale.id, stale.leaseOwner!, "STALE_LEASE_RECOVERED", { retryAt: stale.attemptCount < stale.maxAttempts ? now : undefined, safeResult: { outcome: "FAILED", reason: "STALE_LEASE" } }, now).catch(() => undefined); }
  const candidates = [...await listPendingAdminAiAutomationRuns(), ...await listDueAdminAiAutomationRunRetries(now)];
  for (const candidate of candidates) { const completed=await executeAdminAiAutomationRun(candidate.id, service, workerId, now);if(completed.state!=="RUNNING"&&completed.state!=="PENDING")await recordAdminAuditBestEffort({category:"ACTIVITY",actorType:"SYSTEM",subsystem:"SYSTEM",actionType:"ADMIN_AI_AUTOMATION_RUN_COMPLETED",entityType:"ADMIN_AI_AUTOMATION_RUN",entityId:completed.id,entityLabel:completed.id,summary:`Admin AI automation run completed as ${completed.state}.`,metadata:[{label:"Automation ID",value:completed.automationId},{label:"State",value:completed.state},{label:"Attempt",value:completed.attemptCount},{label:"Escalation",value:completed.escalationState}],targetRoute:"/admin/settings/ai-assistant/automations",idempotencyKey:`admin-ai-automation-run:${completed.id}:${completed.state}:${completed.attemptCount}`}); }
  return { processed: candidates.length };
}

export function startAdminAiAutomationWorker(service: AdminAiService, environment = process.env) {
  const enabled = environment.ADMIN_AI_AUTOMATION_WORKER_ENABLED === "true";
  workerRuntime={enabled,active:false,...(enabled?{startedAt:new Date().toISOString()}:{})};
  if (!enabled) return { enabled: false, stop: () => undefined };
  let active = false; const workerId = `admin-ai-worker-${process.pid}-${randomUUID()}`;
  const alertIdentity={type:"ADMIN_AI_AUTOMATION_WORKER_FAILED",subsystem:"SYSTEM" as const,entityType:"ADMIN_AI_AUTOMATION_WORKER",entityId:"runtime",diagnosticCode:"ADMIN_AI_AUTOMATION_WORKER_FAILED"};
  const tick = async () => { if (active) return; active = true;workerRuntime={...workerRuntime,active:true,lastCycleStartedAt:new Date().toISOString()}; try { await runAdminAiAutomationCycle(service, workerId);workerRuntime={...workerRuntime,lastCycleCompletedAt:new Date().toISOString(),lastFailureAt:undefined,lastFailureCode:undefined}; await bestEffortResolve(alertIdentity); } catch (error) { const code=failureCode(error);workerRuntime={...workerRuntime,lastFailureAt:new Date().toISOString(),lastFailureCode:code};console.error("Admin AI automation cycle failed", { code });await bestEffortAlert({...alertIdentity,severity:"WARNING",title:"Admin AI automation worker failed",summary:`The scheduled Admin AI worker could not complete a processing cycle (${code}).`,targetRoute:"/admin/settings/ai-assistant/operations",recommendedAction:"Review Admin AI automation runtime health and retry after the underlying service recovers."}); } finally { active = false;workerRuntime={...workerRuntime,active:false}; } };
  const timer = setInterval(() => void tick(), 30_000); timer.unref(); void tick();
  return { enabled: true, stop: () => clearInterval(timer) };
}

export const __adminAiAutomationServiceTest={eventMatches};
