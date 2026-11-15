import { closeMigrationPostgres, runMigrations } from "../persistence/postgres.js";

try { const result = await runMigrations(); console.log(JSON.stringify({ success: true, ...result })); }
finally { await closeMigrationPostgres(); }
