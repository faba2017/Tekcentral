import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { StaffStore } from "../staffAuth.js";
import { importPostgresStaffStore } from "../persistence/staffRepository.js";
import { closePostgres } from "../persistence/postgres.js";

const raw=await readFile(resolve(process.cwd(),process.env.PERSISTENCE_SOURCE_DIR?.trim()||".data","staff-auth.json"),"utf8");
const fingerprint=createHash("sha256").update(raw).digest("hex"); const parsed=JSON.parse(raw) as Partial<StaffStore>;
if(parsed.version!==1||!Array.isArray(parsed.accounts)||!Array.isArray(parsed.sessions)||!Array.isArray(parsed.invitations)||!Array.isArray(parsed.passwordResets))throw new Error("STAFF_MIGRATION_SOURCE_INVALID");
const store:StaffStore={version:1,accounts:parsed.accounts,sessions:parsed.sessions,invitations:parsed.invitations,passwordResets:parsed.passwordResets,preAuthChallenges:Array.isArray(parsed.preAuthChallenges)?parsed.preAuthChallenges:[]};
const duplicate=(v:string[])=>v.length!==new Set(v).size; if(duplicate(store.accounts.map(x=>x.id))||duplicate(store.accounts.map(x=>x.normalizedEmail))||duplicate([...store.sessions,...store.invitations,...store.passwordResets,...store.preAuthChallenges].map(x=>x.tokenHash)))throw new Error("STAFF_MIGRATION_SOURCE_CONFLICT");
const ids=new Set(store.accounts.map(x=>x.id)); if([...store.sessions,...store.invitations,...store.passwordResets,...store.preAuthChallenges].some(x=>!ids.has(x.staffUserId)))throw new Error("STAFF_MIGRATION_RELATIONSHIP_INVALID");
const summary={mode:process.argv.includes("--apply")?"APPLY":"DRY_RUN",fingerprint:fingerprint.slice(0,16),accounts:store.accounts.length,sessions:store.sessions.length,invitations:store.invitations.length,passwordResets:store.passwordResets.length,preAuthChallenges:store.preAuthChallenges.length,twoFactorEnabled:store.accounts.filter(x=>x.twoFactorEnabled).length,recoveryCodeHashes:store.accounts.reduce((n,x)=>n+(x.recoveryCodeHashes?.length??0),0)};
if(summary.mode==="DRY_RUN")console.log(JSON.stringify(summary,null,2)); else try{console.log(JSON.stringify({...summary,result:await importPostgresStaffStore(store,fingerprint)},null,2));}finally{await closePostgres();}
