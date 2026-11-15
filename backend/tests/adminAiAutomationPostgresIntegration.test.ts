import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { createAutomationPreparedAction } from "../adminAi/actionRepository.js";
import {
  AdminAiAutomationConflictError,
  claimAdminAiAutomationRun,
  createAdminAiAutomation,
  createAdminAiAutomationRunOccurrence,
  getAdminAiAutomation,
  getAdminAiAutomationEventByKey,
  getAdminAiAutomationRun,
  listAdminAiAutomations,
  listDueAdminAiAutomations,
  listDueAdminAiAutomationRunRetries,
  listStaleAdminAiAutomationRuns,
  markAdminAiAutomationRunFailed,
  recordAdminAiAutomationEvent,
  retireAdminAiAutomation,
  setAdminAiAutomationEnabled,
  updateAdminAiAutomation,
} from "../adminAi/automationRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";

let databaseUrl=process.env.DATABASE_URL;
if(databaseUrl&&!/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)&&process.env.RUN_ADMIN_AI_AUTOMATION_POSTGRES_INTEGRATION==="1"){
  const source=new URL(databaseUrl);const baseName=source.pathname.slice(1);const testName=`${baseName}_h68a_test`;if(!/^[a-zA-Z0-9_]+$/.test(testName))throw new Error("Derived test database name is invalid.");
  const adminUrl=new URL(source);adminUrl.pathname="/postgres";const client=new pg.Client({connectionString:adminUrl.toString(),ssl:process.env.DATABASE_SSL_MODE==="require"?{rejectUnauthorized:false}:false});await client.connect();try{await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",[testName]);await client.query(`DROP DATABASE IF EXISTS "${testName}"`);await client.query(`CREATE DATABASE "${testName}"`);}finally{await client.end();}source.pathname=`/${testName}`;databaseUrl=source.toString();process.env.DATABASE_URL=databaseUrl;
}
if(!databaseUrl||!/_test(?:\?|$)/.test(new URL(databaseUrl).pathname))throw new Error("Admin AI automation persistence integration requires an isolated *_test PostgreSQL database.");
const suffix=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const owner=`admin-ai-automation-owner-${suffix}`;
const creator=`admin-ai-automation-creator-${suffix}`;
const origin=new Date("2026-11-14T08:00:00.000Z");
const migrationsDirectory=resolve(process.cwd(),"backend","persistence","migrations");

async function migrateThrough0012(){
  await query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text NOT NULL)");
  const files=(await readdir(migrationsDirectory)).filter(name=>/^00(?:0[1-9]|1[0-2]).*\.sql$/.test(name)).sort();
  for(const file of files){
    const applied=(await query("SELECT 1 FROM schema_migrations WHERE version=$1",[file])).rows[0];if(applied)continue;
    const sql=await readFile(resolve(migrationsDirectory,file),"utf8");await query(sql);await query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",[file,createHash("sha256").update(sql).digest("hex")]);
  }
}

const definitionInput=(overrides:Record<string,unknown>={})=>({ownerStaffId:owner,createdByStaffId:creator,name:"Review one Product",enabled:false,triggerType:"SCHEDULE" as const,triggerConfiguration:{kind:"DAILY",localTime:"08:30"},toolId:"product_draft_update",targetType:"PRODUCT",targetId:"product-automation-fixture",contextDefinition:{contextType:"PRODUCT",resourceId:"product-automation-fixture"},requestedAutonomy:"AUTO" as const,timezone:"Africa/Johannesburg",nextRunAt:new Date("2026-11-15T06:30:00.000Z"),...overrides});
const actionInput=(runId:string)=>({ownerStaffId:owner,automationRunId:runId,toolId:"product_draft_update",targetType:"PRODUCT",targetId:"product-automation-fixture",safeInput:{changes:{overview:"A bounded fixture overview that uses canonical evidence only."}},safePreview:{actionLabel:"Update Product draft",targetLabel:"Fixture Product",changes:[{field:"overview",before:"Old",after:"New"}],warnings:[]},baselineFingerprint:"fixture-baseline-001",requiredPermission:"products.edit",riskLevel:"MEDIUM" as const,expiresAt:new Date(origin.getTime()+3_600_000)});

try{
  await migrateThrough0012();
  for(const [id,email] of [[owner,`${owner}@example.test`],[creator,`${creator}@example.test`]])await query("INSERT INTO staff_accounts(id,email,normalized_email,display_name,status,base_role,created_at,updated_at) VALUES($1,$2,$2,$3,'ACTIVE','SUPER_ADMIN',$4,$4)",[id,email,id,origin.toISOString()]);
  const legacyConversationId=`legacy-conversation-${suffix}`;const legacyTurnId=`legacy-turn-${suffix}`;const legacyActionId=`legacy-action-${suffix}`;
  await query("INSERT INTO admin_ai_conversations(id,owner_staff_id,title,status,created_at,updated_at) VALUES($1,$2,'Legacy action','ACTIVE',$3,$3)",[legacyConversationId,owner,origin.toISOString()]);
  await query("INSERT INTO admin_ai_messages(id,conversation_id,turn_id,sequence,role,content,generation_status,created_at,updated_at) VALUES($1,$2,$3,1,'USER','Prepare this action','COMPLETED',$4,$4),($5,$2,$3,2,'ASSISTANT','Prepared.','COMPLETED',$4,$4)",[`legacy-user-${suffix}`,legacyConversationId,legacyTurnId,origin.toISOString(),`legacy-assistant-${suffix}`]);
  await query("INSERT INTO admin_ai_actions(id,conversation_id,turn_id,owner_staff_id,tool_id,state,target_type,target_id,safe_input,safe_preview,baseline_fingerprint,required_permission,risk_level,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,'product_draft_update','AWAITING_CONFIRMATION','PRODUCT','product-legacy','{}','{}','legacy-baseline-001','products.edit','MEDIUM',$5,$6,$6)",[legacyActionId,legacyConversationId,legacyTurnId,owner,new Date(origin.getTime()+86_400_000).toISOString(),origin.toISOString()]);

  const migration=await runMigrations();assert.deepEqual(migration.executed,["0013_admin_ai_automation_foundation.sql","0014_admin_ai_automation_retirement.sql"]);assert.deepEqual((await runMigrations()).executed,[]);
  const migrated=(await query<{origin_type:string;automation_run_id:string|null}>("SELECT origin_type,automation_run_id FROM admin_ai_actions WHERE id=$1",[legacyActionId])).rows[0];assert.deepEqual(migrated,{origin_type:"CHAT",automation_run_id:null});

  const daily=await createAdminAiAutomation(definitionInput(),origin);assert.equal(daily.revision,1);assert.equal(daily.requestedAutonomy,"AUTO");assert.equal(daily.enabled,false);assert.equal((await getAdminAiAutomation(daily.id))?.id,daily.id);
  const weekly=await createAdminAiAutomation(definitionInput({name:"Weekly review",triggerConfiguration:{kind:"WEEKLY",localTime:"09:00",weekdays:[5,1,1]}}),origin).catch(error=>error);assert.equal((weekly as {code?:string}).code,"INVALID_ADMIN_AI_AUTOMATION");
  const weeklyValid=await createAdminAiAutomation(definitionInput({name:"Weekly review",triggerConfiguration:{kind:"WEEKLY",localTime:"09:00",weekdays:[5,1]}}),origin);assert.deepEqual(weeklyValid.triggerConfiguration,{kind:"WEEKLY",localTime:"09:00",weekdays:[1,5]});
  const interval=await createAdminAiAutomation(definitionInput({name:"Interval review",triggerConfiguration:{kind:"FIXED_INTERVAL",intervalMinutes:60}}),origin);assert.equal(interval.triggerType,"SCHEDULE");
  await assert.rejects(()=>createAdminAiAutomation(definitionInput({triggerConfiguration:{kind:"FIXED_INTERVAL",intervalMinutes:59}})),/invalid/i);
  await assert.rejects(()=>createAdminAiAutomation(definitionInput({timezone:"Not/A_Zone"})),/Timezone is invalid/);
  const updated=await updateAdminAiAutomation(daily.id,1,{name:"Updated Product review",enabled:true,triggerType:"SCHEDULE",triggerConfiguration:{kind:"DAILY",localTime:"10:00"},toolId:"product_draft_update",targetType:"PRODUCT",targetId:"product-automation-fixture",contextDefinition:{contextType:"PRODUCT",resourceId:"product-automation-fixture"},requestedAutonomy:"PREPARE",timezone:"Africa/Johannesburg",nextRunAt:new Date("2026-11-15T08:00:00.000Z")},new Date(origin.getTime()+1_000));assert.equal(updated.revision,2);assert.equal(updated.enabled,true);
  await assert.rejects(()=>updateAdminAiAutomation(daily.id,1,{name:"Stale",enabled:true,triggerType:"SCHEDULE",triggerConfiguration:{kind:"DAILY",localTime:"10:00"},toolId:"product_draft_update",targetType:"PRODUCT",targetId:"product-automation-fixture",contextDefinition:{},requestedAutonomy:"PREPARE",timezone:"Africa/Johannesburg"}),error=>error instanceof AdminAiAutomationConflictError);
  const noOpEnabled=await setAdminAiAutomationEnabled(daily.id,2,true);assert.equal(noOpEnabled.revision,2);assert.equal((await listAdminAiAutomations({ownerStaffId:owner})).length,3);

  const eventAutomation=await createAdminAiAutomation(definitionInput({name:"Event Product review",triggerType:"EVENT",triggerConfiguration:{eventType:"PRODUCT_READINESS_CHANGED",entityType:"PRODUCT",entityId:"product-automation-fixture"},nextRunAt:undefined}),origin);
  const eventResults=await Promise.all([recordAdminAiAutomationEvent({eventKey:`product-readiness:${suffix}`,eventType:"PRODUCT_READINESS_CHANGED",entityType:"PRODUCT",entityId:"product-automation-fixture",safeMetadata:{readiness:"READY_FOR_REVIEW"},occurredAt:origin},origin),recordAdminAiAutomationEvent({eventKey:`product-readiness:${suffix}`,eventType:"PRODUCT_READINESS_CHANGED",entityType:"PRODUCT",entityId:"product-automation-fixture",safeMetadata:{readiness:"READY_FOR_REVIEW"},occurredAt:origin},origin)]);assert.equal(eventResults.filter(item=>item.created).length,1);assert.equal(eventResults[0].event.id,eventResults[1].event.id);assert.equal((await getAdminAiAutomationEventByKey(`product-readiness:${suffix}`))?.id,eventResults[0].event.id);

  const occurrenceKey=`${eventAutomation.id}:${eventResults[0].event.id}`;const occurrences=await Promise.all([createAdminAiAutomationRunOccurrence({automationId:eventAutomation.id,occurrenceKey,triggerType:"EVENT",eventId:eventResults[0].event.id,occurredAt:origin}),createAdminAiAutomationRunOccurrence({automationId:eventAutomation.id,occurrenceKey,triggerType:"EVENT",eventId:eventResults[0].event.id,occurredAt:origin})]);assert.equal(occurrences.filter(item=>item.created).length,1);assert.equal(occurrences[0].run.id,occurrences[1].run.id);
  const claims=await Promise.all([claimAdminAiAutomationRun(occurrences[0].run.id,"worker-a",60_000,origin),claimAdminAiAutomationRun(occurrences[0].run.id,"worker-b",60_000,origin)]);assert.equal(claims.filter(item=>item.claimed).length,1);const winner=claims.find(item=>item.claimed)!;assert.equal(winner.run.attemptCount,1);
  const actionResults=await Promise.all([createAutomationPreparedAction(actionInput(winner.run.id),new Date(origin.getTime()+1_000)),createAutomationPreparedAction(actionInput(winner.run.id),new Date(origin.getTime()+1_001))]);assert.equal(actionResults[0].id,actionResults[1].id);assert.equal(actionResults[0].originType,"AUTOMATION");assert.equal(actionResults[0].conversationId,undefined);assert.equal(actionResults[0].automationRunId,winner.run.id);assert.equal((await getAdminAiAutomationRun(winner.run.id))?.preparedActionId,actionResults[0].id);
  const retiredWithAction=await retireAdminAiAutomation(eventAutomation.id,eventAutomation.revision,creator,new Date(origin.getTime()+5_000));assert.equal(retiredWithAction.changed,true);assert.equal((await getAdminAiAutomationRun(winner.run.id))?.preparedActionId,actionResults[0].id);assert.equal((await query<{count:string}>("SELECT count(*)::text count FROM admin_ai_actions WHERE id=$1 AND state='AWAITING_CONFIRMATION'",[actionResults[0].id])).rows[0].count,"1");

  const retryOccurrence=await createAdminAiAutomationRunOccurrence({automationId:daily.id,occurrenceKey:`${daily.id}:retry`,triggerType:"SCHEDULE",occurredAt:origin,maxAttempts:3});assert.equal((await claimAdminAiAutomationRun(retryOccurrence.run.id,"retry-worker",60_000,origin)).claimed,true);const failed=await markAdminAiAutomationRunFailed(retryOccurrence.run.id,"retry-worker","PROVIDER_TEMPORARY",{retryAt:new Date(origin.getTime()+60_000)},new Date(origin.getTime()+1_000));assert.equal(failed.attemptCount,1);assert.equal((await listDueAdminAiAutomationRunRetries(new Date(origin.getTime()+60_001))).length>=1,true);const retryClaim=await claimAdminAiAutomationRun(retryOccurrence.run.id,"retry-worker-2",60_000,new Date(origin.getTime()+60_001));assert.equal(retryClaim.claimed,true);assert.equal(retryClaim.run.attemptCount,2);assert.equal((await query<{count:string}>("SELECT count(*)::text count FROM admin_ai_automation_runs WHERE id=$1",[retryOccurrence.run.id])).rows[0].count,"1");

  const staleOccurrence=await createAdminAiAutomationRunOccurrence({automationId:daily.id,occurrenceKey:`${daily.id}:stale`,triggerType:"SCHEDULE",occurredAt:origin});await claimAdminAiAutomationRun(staleOccurrence.run.id,"stale-worker",10_000,origin);assert.equal((await listStaleAdminAiAutomationRuns(new Date(origin.getTime()+10_001))).some(run=>run.id===staleOccurrence.run.id),true);

  const retirementActor=creator;const retirementTime=new Date(origin.getTime()+20_000);const beforeRetirement=(await getAdminAiAutomation(daily.id))!;const retired=await retireAdminAiAutomation(daily.id,beforeRetirement.revision,retirementActor,retirementTime);assert.equal(retired.changed,true);assert.equal(retired.automation.enabled,false);assert.equal(retired.automation.retiredAt,retirementTime.toISOString());assert.equal(retired.automation.retiredByStaffId,retirementActor);assert.equal(retired.automation.revision,beforeRetirement.revision+1);assert.equal(retired.automation.nextRunAt,undefined);
  const repeated=await retireAdminAiAutomation(daily.id,beforeRetirement.revision,retirementActor,new Date(retirementTime.getTime()+1_000));assert.equal(repeated.changed,false);assert.equal(repeated.automation.revision,retired.automation.revision);assert.equal(repeated.automation.retiredAt,retirementTime.toISOString());
  const disabledBeforeRetirement=(await getAdminAiAutomation(interval.id))!;assert.equal(disabledBeforeRetirement.enabled,false);const retiredDisabled=await retireAdminAiAutomation(interval.id,disabledBeforeRetirement.revision,creator,new Date(retirementTime.getTime()+2_000));assert.equal(retiredDisabled.changed,true);assert.equal(retiredDisabled.automation.enabled,false);assert.equal(retiredDisabled.automation.revision,disabledBeforeRetirement.revision+1);
  assert.equal((await listAdminAiAutomations({ownerStaffId:owner})).some(item=>item.id===daily.id),false);assert.equal((await listAdminAiAutomations({ownerStaffId:owner,includeRetired:true})).some(item=>item.id===daily.id),true);assert.equal((await listDueAdminAiAutomations(new Date("2027-01-01T00:00:00.000Z"))).some(item=>item.id===daily.id),false);assert.equal((await getAdminAiAutomation(daily.id))?.id,daily.id);
  await assert.rejects(()=>setAdminAiAutomationEnabled(daily.id,retired.automation.revision,true),error=>(error as {code?:string}).code==="AUTOMATION_RETIRED");await assert.rejects(()=>updateAdminAiAutomation(daily.id,retired.automation.revision,{name:"Forbidden retired edit",enabled:false,triggerType:"SCHEDULE",triggerConfiguration:{kind:"DAILY",localTime:"10:00"},toolId:"product_draft_update",targetType:"PRODUCT",targetId:"product-automation-fixture",contextDefinition:{contextType:"PRODUCT",resourceId:"product-automation-fixture"},requestedAutonomy:"PREPARE",timezone:"Africa/Johannesburg"}),error=>(error as {code?:string}).code==="AUTOMATION_RETIRED");

  for(const invalid of [
    {sql:"INSERT INTO admin_ai_actions(id,origin_type,owner_staff_id,tool_id,state,target_type,target_id,safe_input,safe_preview,baseline_fingerprint,required_permission,risk_level,expires_at,created_at,updated_at) VALUES('invalid-no-origin','CHAT',$1,'product_draft_update','AWAITING_CONFIRMATION','PRODUCT','x','{}','{}','baseline-001','products.edit','MEDIUM',now()+interval '1 hour',now(),now())",params:[owner]},
    {sql:`UPDATE admin_ai_actions SET origin_type='AUTOMATION',automation_run_id=$1 WHERE id=$2`,params:[winner.run.id,legacyActionId]},
    {sql:`UPDATE admin_ai_actions SET origin_type='CHAT',conversation_id=$1,turn_id=$2 WHERE id=$3`,params:[legacyConversationId,`legacy-turn-${suffix}`,actionResults[0].id]},
  ])await assert.rejects(()=>query(invalid.sql,invalid.params),error=>(error as {code?:string}).code==="23514");
  assert.equal(Number((await query<{count:string}>("SELECT count(*)::text count FROM admin_audit WHERE entity_type ILIKE '%AUTOMATION%' OR action_type ILIKE '%AUTOMATION%'",[])).rows[0].count),0);
  const forbiddenColumns=["prompt","reasoning","raw_request","raw_response","provider_payload","credentials","auth_token"];
  for(const table of ["admin_ai_automations","admin_ai_automation_events","admin_ai_automation_runs"]){const columns=(await query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_name=$1",[table])).rows.map(row=>row.column_name);for(const column of forbiddenColumns)assert.equal(columns.includes(column),false,`${table} must not contain ${column}`);}
  await query("DELETE FROM admin_ai_conversations WHERE id=$1",[legacyConversationId]);assert.equal(Number((await query<{count:string}>("SELECT count(*)::text count FROM admin_ai_actions WHERE id=$1",[legacyActionId])).rows[0].count),0);assert.equal((await getAdminAiAutomationRun(winner.run.id))?.preparedActionId,actionResults[0].id,"conversation deletion must not affect automation actions");
  console.log("Admin AI automation PostgreSQL persistence tests passed.");
}finally{
  await query("UPDATE admin_ai_automation_runs SET prepared_action_id=NULL WHERE automation_id IN (SELECT id FROM admin_ai_automations WHERE owner_staff_id=$1)",[owner]).catch(()=>undefined);
  await query("DELETE FROM admin_ai_actions WHERE automation_run_id IN (SELECT r.id FROM admin_ai_automation_runs r JOIN admin_ai_automations a ON a.id=r.automation_id WHERE a.owner_staff_id=$1)",[owner]).catch(()=>undefined);
  await query("DELETE FROM admin_ai_automation_runs WHERE automation_id IN (SELECT id FROM admin_ai_automations WHERE owner_staff_id=$1)",[owner]).catch(()=>undefined);
  await query("DELETE FROM admin_ai_automation_events WHERE event_key LIKE $1",[`%${suffix}%`]).catch(()=>undefined);
  await query("DELETE FROM admin_ai_automations WHERE owner_staff_id=$1",[owner]).catch(()=>undefined);
  await query("DELETE FROM admin_ai_conversations WHERE owner_staff_id=$1",[owner]).catch(()=>undefined);
  await query("DELETE FROM staff_accounts WHERE id=ANY($1::text[])",[[owner,creator]]).catch(()=>undefined);
  await closePostgres();
}
