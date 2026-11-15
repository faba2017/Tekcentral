import assert from "node:assert/strict";
import { closePostgres, withDistributedLock } from "../persistence/postgres.js";
import { FX_SCHEDULER_LOCK } from "../fxReconciliationJob.js";
import { SYNTECH_SCHEDULER_LOCK } from "../suppliers/syntech/syntechSyncService.js";

if (!process.env.KSEC_R4_POSTGRES_URL) {
  console.log("Scheduler PostgreSQL integration skipped: KSEC_R4_POSTGRES_URL not configured.");
  process.exit(0);
}
process.env.APP_ENV = "development";
process.env.PERSISTENCE_PROVIDER = "POSTGRES";
process.env.DATABASE_URL = process.env.KSEC_R4_POSTGRES_URL;
process.env.DATABASE_SSL_MODE = "disable";

for (const lockKey of [SYNTECH_SCHEDULER_LOCK, FX_SCHEDULER_LOCK]) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let providerCalls = 0;
  const leader = withDistributedLock(lockKey, async () => { providerCalls += 1; await held; return "done"; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const contender = await withDistributedLock(lockKey, async () => { providerCalls += 1; return "duplicate"; });
  assert.deepEqual(contender, { acquired: false });
  assert.equal(providerCalls, 1);
  release();
  assert.equal((await leader).acquired, true);
  await assert.rejects(withDistributedLock(lockKey, async () => { throw new Error("fixture failure"); }), /fixture failure/);
  const afterFailure = await withDistributedLock(lockKey, async () => "released");
  assert.deepEqual(afterFailure, { acquired: true, value: "released" });
}
await closePostgres();
console.log("PostgreSQL scheduler contention, provider deduplication and failure-release tests passed.");
