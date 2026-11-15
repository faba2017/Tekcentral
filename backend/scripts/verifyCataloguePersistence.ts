import { readLegacyCatalogue, verifyCatalogue } from "../persistence/catalogueMigration.js";
const result = await verifyCatalogue(await readLegacyCatalogue()); console.log(JSON.stringify(result, null, 2)); if (!result.success) process.exitCode = 1;
