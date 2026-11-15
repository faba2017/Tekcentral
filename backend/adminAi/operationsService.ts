import type { QueryResultRow } from "pg";
import { getAiAssistantSettingsView } from "../aiAccessControl.js";
import { listOperationalAlerts } from "../operationalAlertService.js";
import { query } from "../persistence/postgres.js";
import type { StaffAuthorizationContext } from "../staffAuthorization.js";
import { adminAiToolRegistryDto } from "./controlledActions.js";
import { adminAiConfigurationHealth, loadAdminAiConfig } from "./config.js";
import { getAdminAiPolicyBundle } from "./policy.js";
import { getAdminAiAutomationWorkerRuntimeStatus } from "./automationService.js";

export type AdminAiOperationalHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
type MessageRow = QueryResultRow & { generation_status:string;requested_model_role:string|null;resolved_provider:string|null;resolved_model:string|null;input_tokens:number|null;output_tokens:number|null;total_tokens:number|null;reasoning_tokens:number|null;latency_ms:number|null;fallback_used:boolean|null;created_at:Date|string };
type ActionRow = QueryResultRow & { state:string;risk_level:string;origin_type:string;owner_staff_id:string;created_at:Date|string;updated_at:Date|string };
type RunRow = QueryResultRow & { state:string;failure_code:string|null;provider_name:string|null;model_name:string|null;input_tokens:number|null;output_tokens:number|null;total_tokens:number|null;reasoning_tokens:number|null;latency_ms:number|null;retry_at:Date|string|null;lease_expires_at:Date|string|null;created_at:Date|string };
type DefinitionRow = QueryResultRow & { enabled:boolean;retired_at:Date|string|null };

const numeric=(value:unknown)=>Number(value??0);
const countBy=(values:readonly string[])=>Object.fromEntries([...new Set(values)].sort().map(value=>[value,values.filter(item=>item===value).length]));
export function percentile(values:readonly number[],fraction:number){if(!values.length)return undefined;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*fraction)-1))];}
export function classifyAdminAiHealth(input:{configured:boolean;observations:number;failures:number;fallbacks:number;p95LatencyMs?:number;criticalAlert:boolean}):AdminAiOperationalHealth{
  if(!input.configured||input.criticalAlert)return "UNAVAILABLE";
  if(!input.observations)return "UNKNOWN";
  const failureRate=input.failures/input.observations;const fallbackRate=input.fallbacks/input.observations;
  return failureRate>=0.2||fallbackRate>=0.2||(input.p95LatencyMs??0)>15_000?"DEGRADED":"HEALTHY";
}

export async function getAdminAiOperations(staff:StaffAuthorizationContext,environment:NodeJS.ProcessEnv=process.env,now=new Date()){
  const since7d=new Date(now.getTime()-7*86_400_000).toISOString();
  const [messages,actions,runs,definitions,conversationCount,alerts,access,policy]=await Promise.all([
    query<MessageRow>("SELECT generation_status,requested_model_role,resolved_provider,resolved_model,input_tokens,output_tokens,total_tokens,reasoning_tokens,latency_ms,fallback_used,created_at FROM admin_ai_messages WHERE role='ASSISTANT' AND created_at >= $1",[since7d]),
    query<ActionRow>("SELECT state,risk_level,origin_type,owner_staff_id,created_at,updated_at FROM admin_ai_actions WHERE created_at >= $1 OR state IN ('AWAITING_CONFIRMATION','EXECUTING')",[since7d]),
    query<RunRow>("SELECT state,failure_code,provider_name,model_name,input_tokens,output_tokens,total_tokens,reasoning_tokens,latency_ms,retry_at,lease_expires_at,created_at FROM admin_ai_automation_runs WHERE created_at >= $1 OR state IN ('PENDING','RUNNING')",[since7d]),
    query<DefinitionRow>("SELECT enabled,retired_at FROM admin_ai_automations"),
    query<{count:string}>("SELECT count(*)::text count FROM admin_ai_conversations"),
    listOperationalAlerts(),getAiAssistantSettingsView(staff,environment),getAdminAiPolicyBundle(staff.actorId??"",adminAiToolRegistryDto()),
  ]);
  const configHealth=adminAiConfigurationHealth(environment);let config:ReturnType<typeof loadAdminAiConfig>|undefined;try{config=loadAdminAiConfig(environment);}catch{config=undefined;}
  const assistant=messages.rows;const automation=runs.rows;const observations=assistant.length+automation.length;
  const failures=assistant.filter(row=>row.generation_status==="FAILED").length+automation.filter(row=>row.state==="FAILED").length;
  const fallbacks=assistant.filter(row=>row.fallback_used).length;
  const latencies=[...assistant,...automation].map(row=>row.latency_ms).filter((value):value is number=>value!==null);
  const p95=percentile(latencies,.95);const relevantAlerts=alerts.filter(item=>item.type.startsWith("ADMIN_AI_")&&item.status!=="RESOLVED");
  const criticalAlert=relevantAlerts.some(item=>item.severity==="CRITICAL"&&item.type.includes("PROVIDER"));
  const overall=classifyAdminAiHealth({configured:configHealth.status==="CONFIGURED",observations,failures,fallbacks,p95LatencyMs:p95,criticalAlert});
  const roleHealth=(role:"PRIMARY"|"ROUTINE")=>{const rows=assistant.filter(item=>item.requested_model_role===role);return classifyAdminAiHealth({configured:Boolean(role==="PRIMARY"?config?.primaryModel:config?.routineModel),observations:rows.length,failures:rows.filter(item=>item.generation_status==="FAILED").length,fallbacks:rows.filter(item=>item.fallback_used).length,p95LatencyMs:percentile(rows.map(item=>item.latency_ms).filter((value):value is number=>value!==null),.95),criticalAlert});};
  const windows=[{key:"hour",ms:3_600_000},{key:"today",ms:86_400_000},{key:"sevenDays",ms:7*86_400_000}];
  const usage=Object.fromEntries(windows.map(window=>{const cutoff=now.getTime()-window.ms;const m=assistant.filter(row=>new Date(row.created_at).getTime()>=cutoff);const r=automation.filter(row=>new Date(row.created_at).getTime()>=cutoff);return[window.key,{requests:m.length+r.length,inputTokens:[...m,...r].reduce((sum,row)=>sum+numeric(row.input_tokens),0),outputTokens:[...m,...r].reduce((sum,row)=>sum+numeric(row.output_tokens),0),reasoningTokens:[...m,...r].reduce((sum,row)=>sum+numeric(row.reasoning_tokens),0),totalTokens:[...m,...r].reduce((sum,row)=>sum+numeric(row.total_tokens),0)}];}));
  const worker=getAdminAiAutomationWorkerRuntimeStatus(environment,now);const staleLeases=automation.filter(row=>row.state==="RUNNING"&&row.lease_expires_at&&new Date(row.lease_expires_at).getTime()<=now.getTime()).length;
  return {checkedAt:now.toISOString(),timezone:"Africa/Johannesburg",health:overall,access,provider:{status:overall,configurationStatus:configHealth.status,provider:config?.provider??"digitalocean",roles:[{role:"PRIMARY",model:config?.primaryModel,status:roleHealth("PRIMARY")},{role:"ROUTINE",model:config?.routineModel,status:roleHealth("ROUTINE")},{role:"FALLBACK",model:config?.fallbackModel,status:config?.fallbackModel?(fallbacks?overall:"UNKNOWN"):"UNAVAILABLE"}]},usage,latency:{averageMs:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):undefined,p95Ms:p95,sampleSize:latencies.length},chat:{conversations:numeric(conversationCount.rows[0]?.count),states:countBy(assistant.map(row=>row.generation_status)),fallbacks},actions:{states:countBy(actions.rows.map(row=>row.state)),risks:countBy(actions.rows.map(row=>row.risk_level)),origins:countBy(actions.rows.map(row=>row.origin_type)),awaitingConfirmation:actions.rows.filter(row=>row.state==="AWAITING_CONFIRMATION").length,highRiskAwaitingConfirmation:actions.rows.filter(row=>row.state==="AWAITING_CONFIRMATION"&&row.risk_level==="HIGH").length},automations:{definitions:{active:definitions.rows.filter(row=>row.enabled&&!row.retired_at).length,disabled:definitions.rows.filter(row=>!row.enabled&&!row.retired_at).length,retired:definitions.rows.filter(row=>Boolean(row.retired_at)).length},runStates:countBy(automation.map(row=>row.state)),failureCodes:countBy(automation.map(row=>row.failure_code).filter((value):value is string=>Boolean(value))),dueRetries:automation.filter(row=>row.retry_at&&new Date(row.retry_at).getTime()<=now.getTime()).length,staleLeases,worker},failures:{provider:failures,governance:actions.rows.filter(row=>row.state==="CANCELLED"||row.state==="EXPIRED").length,note:"Provider/system failures are distinct from policy denials, cancellations and expiry."},limits:{platform:policy.platform.policy.limits,staff:policy.staff.policy.limits,operatingWindow:{platform:policy.platform.policy.operatingWindow,staff:policy.staff.policy.operatingWindow},maxRisk:{platform:policy.platform.policy.maxRisk,staff:policy.staff.policy.maxRisk}},alerts:relevantAlerts.slice(0,12).map(item=>({id:item.id,type:item.type,severity:item.severity,status:item.status,title:item.title,summary:item.summary,lastSeenAt:item.lastSeenAt,targetRoute:item.targetRoute})),cost:{available:false,message:"Cost tracking unavailable: reliable provider billing metadata is not supplied by the current inference response contract."},retention:{message:"Chat, action and automation history is retained until explicit deletion or retirement. Existing operational-event retention applies; no cleanup or migration is introduced by this view."}};
}

export const __adminAiOperationsTest={countBy};
