import { catalogueFingerprint, catalogueSummary, importCatalogue, inspectLegacyMedia, readLegacyCatalogue } from "../persistence/catalogueMigration.js";
const source = await readLegacyCatalogue(); const apply = process.argv.includes("--apply");
console.log(JSON.stringify(apply ? { mode: "APPLY", ...(await importCatalogue(source)), mediaInspection: await inspectLegacyMedia(source) } : { mode: "DRY_RUN", fingerprint: catalogueFingerprint(source), ...catalogueSummary(source), mediaInspection: await inspectLegacyMedia(source) }, null, 2));
