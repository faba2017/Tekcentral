import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { __setAdminAuditStorePathForTests } from "../adminAuditService.js";
import { __setOperationalAlertStorePathForTests } from "../operationalAlertService.js";
import { acceptStaffInvitation, disableStaffAccount, enableStaffAccount, getStaffInvitation, hashStaffPassword, inviteStaff, loginStaff, requestStaffPasswordReset, resetStaffPassword, staffFromSessionToken, updateStaffAuthorizationProfile, verifyStaffTwoFactorLogin, type StaffAccount } from "../staffAuth.js";
import { mutatePostgresStaffStore } from "../persistence/staffRepository.js";
import { closePostgres, postgresReady, query } from "../persistence/postgres.js";
import { consumeSharedRateLimit } from "../persistence/rateLimit.js";
import { persistenceReadiness } from "../persistence/health.js";
import { resolveEffectivePermissions } from "../staffRbac.js";
import { encodeBase32, protectTotpSecret, setStaffTwoFactorEncryptionKeyForTests, totpAtStep } from "../staffTwoFactor.js";
import { createProvisionalOpsAuthorizationContext } from "../staffAuthorization.js";

const mode=process.argv[2]; const temp=process.env.TEST_TEMP_DIR; if(temp){__setAdminAuditStorePathForTests(join(temp,"audit.json"));__setOperationalAlertStorePathForTests(join(temp,"alerts.json"));} setStaffTwoFactorEncryptionKeyForTests(Buffer.alloc(32,7));
if(mode==="session"){const value=await staffFromSessionToken(process.env.TEST_SESSION_TOKEN,new Date(),false);process.stdout.write(value?JSON.stringify({valid:true,hasPermission:value.context.permissions.has("products.edit")}):JSON.stringify({valid:false}));await closePostgres();process.exit(0);}
if(mode==="two-factor"){try{await verifyStaffTwoFactorLogin({challengeToken:process.env.TEST_CHALLENGE!,code:process.env.TEST_CODE!,method:"TOTP_AUTHENTICATOR"},new Date(process.env.TEST_NOW!));process.stdout.write("VERIFIED");}catch(error){process.stdout.write(error instanceof Error?error.message:"FAILED");}await closePostgres();process.exit(0);}
if(mode==="rate"){const value=await consumeSharedRateLimit({keyHash:process.env.TEST_RATE_KEY!,limit:3,windowSeconds:300});process.stdout.write(value.allowed?"ALLOWED":"BLOCKED");await closePostgres();process.exit(0);}
const run=(childMode:string,env:Record<string,string>)=>new Promise<string>((resolvePromise,reject)=>{const child=spawn(process.execPath,[process.argv[1],childMode],{env:{...process.env,...env},stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",x=>out+=String(x));child.stderr.on("data",x=>err+=String(x));child.on("exit",code=>code===0?resolvePromise(out):reject(new Error(`child ${code}: ${err}`)));});

const directory=await mkdtemp(join(tmpdir(),"tekcentral-staff-postgres-"));__setAdminAuditStorePathForTests(join(directory,"audit.json"));__setOperationalAlertStorePathForTests(join(directory,"alerts.json"));
const now=new Date();const password="Postgres staff test password 482!";const passwordHash=await hashStaffPassword(password);const ownerId=randomUUID();const userId=randomUUID();const secret=encodeBase32(Buffer.from("12345678901234567890","ascii"));
const owner:StaffAccount={id:ownerId,email:"owner-pg@example.test",normalizedEmail:"owner-pg@example.test",displayName:"Owner PG",status:"ACTIVE",passwordHash,baseRole:"SUPER_ADMIN",grantedPermissions:[],revokedPermissions:[],mustChangePassword:false,twoFactorEnabled:true,twoFactorSecret:protectTotpSecret(secret),recoveryCodeHashes:[],createdAt:now.toISOString(),updatedAt:now.toISOString()};
const user:StaffAccount={id:userId,email:"staff-pg@example.test",normalizedEmail:"staff-pg@example.test",displayName:"Staff PG",status:"ACTIVE",passwordHash,baseRole:"SUPPORT",grantedPermissions:["products.edit"],revokedPermissions:[],mustChangePassword:false,createdAt:now.toISOString(),updatedAt:now.toISOString()};
await mutatePostgresStaffStore(store=>{store.accounts.push(owner,user);});
assert.equal(resolveEffectivePermissions(user).has("products.edit"),true);assert.equal(resolveEffectivePermissions({...user,revokedPermissions:["products.edit"]}).has("products.edit"),false,"revocation must win over grant");
const login=await loginStaff({email:user.email,password},now);assert.equal(login.requiresTwoFactor,false);const childEnv={TEST_TEMP_DIR:directory};
assert.deepEqual(JSON.parse(await run("session",{...childEnv,TEST_SESSION_TOKEN:login.sessionToken})),{valid:true,hasPermission:true});
const actor=createProvisionalOpsAuthorizationContext();await updateStaffAuthorizationProfile(userId,{baseRole:"SUPPORT",grantedPermissions:["products.edit"],revokedPermissions:["products.edit"]},actor);
assert.deepEqual(JSON.parse(await run("session",{...childEnv,TEST_SESSION_TOKEN:login.sessionToken})),{valid:true,hasPermission:false},"permission revoke must propagate");
await disableStaffAccount(userId,actor);
assert.deepEqual(JSON.parse(await run("session",{...childEnv,TEST_SESSION_TOKEN:login.sessionToken})),{valid:false});
await enableStaffAccount(userId,actor);

const invited=await inviteStaff({email:`invite-${userId}@example.test`,displayName:"Invited PG",baseRole:"AUDITOR"},actor);assert.equal((await getStaffInvitation(invited.token)).email,invited.staff.email);await acceptStaffInvitation({token:invited.token,password,confirmPassword:password});await assert.rejects(()=>acceptStaffInvitation({token:invited.token,password,confirmPassword:password}),/invalid or has expired/);const inviteLogin=await loginStaff({email:invited.staff.email,password});const reset=await requestStaffPasswordReset(invited.staff.email);assert.ok(reset);await resetStaffPassword({token:reset!.token,password:"Reset postgres staff password 731!",confirmPassword:"Reset postgres staff password 731!"});assert.equal(await staffFromSessionToken(inviteLogin.sessionToken,new Date(),false),undefined);await assert.rejects(()=>resetStaffPassword({token:reset!.token,password,confirmPassword:password}),/invalid or has expired/);

const challengeTime=new Date(Math.ceil(Date.now()/30_000)*30_000);const challenged=await loginStaff({email:owner.email,password},challengeTime);assert.equal(challenged.requiresTwoFactor,true);const code=totpAtStep(secret,Math.floor(challengeTime.getTime()/30_000));assert.equal(await run("two-factor",{...childEnv,TEST_CHALLENGE:challenged.challengeToken!,TEST_CODE:code,TEST_NOW:challengeTime.toISOString()}),"VERIFIED");assert.match(await run("two-factor",{...childEnv,TEST_CHALLENGE:challenged.challengeToken!,TEST_CODE:code,TEST_NOW:challengeTime.toISOString()}),/invalid or expired/);
const rateKey=createHash("sha256").update(`staff-rate-${ownerId}`).digest("hex");assert.equal(await run("rate",{...childEnv,TEST_RATE_KEY:rateKey}),"ALLOWED");assert.equal((await consumeSharedRateLimit({keyHash:rateKey,limit:3,windowSeconds:300})).allowed,true);assert.equal(await run("rate",{...childEnv,TEST_RATE_KEY:rateKey}),"ALLOWED");assert.equal((await consumeSharedRateLimit({keyHash:rateKey,limit:3,windowSeconds:300})).allowed,false);
await closePostgres();assert.equal((await staffFromSessionToken((await loginStaff({email:user.email,password})).sessionToken,new Date(),false))?.staff.id,userId);
await query("DELETE FROM staff_accounts WHERE id=ANY($1::text[])",[[ownerId,userId,invited.staff.id]]);await query("DELETE FROM rate_limit_buckets WHERE key_hash=$1",[rateKey]);await closePostgres();const working=process.env.DATABASE_URL;process.env.DATABASE_URL="postgres://tekcentral:local-development-only@127.0.0.1:59999/tekcentral_staff_test";assert.equal((await postgresReady()).ready,false);assert.equal((await persistenceReadiness()).ready,false);await assert.rejects(()=>staffFromSessionToken("unavailable"));process.env.DATABASE_URL=working;await closePostgres();
setStaffTwoFactorEncryptionKeyForTests();__setAdminAuditStorePathForTests();__setOperationalAlertStorePathForTests();await rm(directory,{recursive:true,force:true});console.log("Staff PostgreSQL multi-instance integration tests passed.");
