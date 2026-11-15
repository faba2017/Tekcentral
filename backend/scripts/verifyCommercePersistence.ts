import { readLegacyCommerce, verifyCommerce } from "../persistence/commerceMigration.js";
const result=await verifyCommerce(await readLegacyCommerce());console.log(JSON.stringify(result,null,2));if(!result.success)process.exitCode=1;
