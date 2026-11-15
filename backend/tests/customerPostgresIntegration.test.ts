import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { customerFromSessionToken, logoutCustomer, registerCustomer, setZeusAccountDataConsent } from "../customerAuth.js";
import { closePostgres, postgresReady, query } from "../persistence/postgres.js";
import { consumeSharedRateLimit } from "../persistence/rateLimit.js";
import { persistenceReadiness } from "../persistence/health.js";

const mode = process.argv[2];
if (mode === "child-session") {
  const customer = await customerFromSessionToken(process.env.TEST_SESSION_TOKEN);
  process.stdout.write(customer ? "VALID" : "INVALID");
  await closePostgres();
  process.exit(0);
}
if (mode === "child-rate") {
  const result = await consumeSharedRateLimit({ keyHash: process.env.TEST_RATE_KEY!, limit: 3, windowSeconds: 300 });
  process.stdout.write(result.allowed ? "ALLOWED" : "BLOCKED");
  await closePostgres();
  process.exit(0);
}

const runChild = (childMode: string, extraEnv: Record<string,string>) => new Promise<string>((resolvePromise,reject) => {
  const child=spawn(process.execPath,[process.argv[1],childMode],{env:{...process.env,...extraEnv},stdio:["ignore","pipe","pipe"]}); let output=""; let error=""; child.stdout.on("data",(chunk)=>output+=String(chunk)); child.stderr.on("data",(chunk)=>error+=String(chunk)); child.on("exit",(code)=>code===0?resolvePromise(output):reject(new Error(`child failed ${code}: ${error}`)));
});

const suffix = Date.now().toString(36);
const registration = await registerCustomer({ firstName:"Persistence",lastName:"Test",email:`persistence-${suffix}@example.test`,password:"DurableTest12345" });
await setZeusAccountDataConsent(registration.sessionToken,true);
assert.equal(await runChild("child-session",{TEST_SESSION_TOKEN:registration.sessionToken}),"VALID");
await closePostgres();
assert.equal((await customerFromSessionToken(registration.sessionToken))?.id,registration.customer.id,"session must survive pool/process restart");
await logoutCustomer(registration.sessionToken);
assert.equal(await runChild("child-session",{TEST_SESSION_TOKEN:registration.sessionToken}),"INVALID","revocation must be visible to another process");

const rateKey=createHash("sha256").update(`customer-postgres-integration-${suffix}`).digest("hex");
assert.equal(await runChild("child-rate",{TEST_RATE_KEY:rateKey}),"ALLOWED");
assert.equal((await consumeSharedRateLimit({keyHash:rateKey,limit:3,windowSeconds:300})).allowed,true);
assert.equal(await runChild("child-rate",{TEST_RATE_KEY:rateKey}),"ALLOWED");
assert.equal((await consumeSharedRateLimit({keyHash:rateKey,limit:3,windowSeconds:300})).allowed,false,"combined cross-process attempts must share one bucket");

await query("DELETE FROM customers WHERE id=$1",[registration.customer.id]);
await query("DELETE FROM rate_limit_buckets WHERE key_hash=$1",[rateKey]);
await closePostgres();
const workingUrl=process.env.DATABASE_URL;
process.env.DATABASE_URL="postgres://tekcentral:local-development-only@127.0.0.1:59999/tekcentral_customer_test";
assert.equal((await postgresReady()).ready,false);
const failedReadiness = await persistenceReadiness();
assert.equal(failedReadiness.ready,false);
assert.equal(failedReadiness.checks.database.ready,false);
await assert.rejects(()=>customerFromSessionToken(registration.sessionToken));
process.env.DATABASE_URL=workingUrl;
await closePostgres();
console.log("Customer PostgreSQL multi-instance integration tests passed.");
