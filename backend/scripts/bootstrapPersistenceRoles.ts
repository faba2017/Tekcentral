import { bootstrapPersistenceRoles } from "../persistence/roleBootstrap.js";

const result = await bootstrapPersistenceRoles();
console.log(JSON.stringify({ success: true, migrationRole: result.migrationRole, runtimeRole: result.runtimeRole, schema: result.schema }));
