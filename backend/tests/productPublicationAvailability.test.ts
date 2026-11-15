import assert from "node:assert/strict";
import { publicationSourceAvailabilityBlockers } from "../productPublicationRepository.js";

const blockers = (usableOfferCount: number, freshOfferCount: number) =>
  publicationSourceAvailabilityBlockers({ usableOfferCount, freshOfferCount });

// Purchase state does not decide source presence. These counts model fresh
// AVAILABLE, LOW_STOCK, OUT_OF_STOCK, and UNKNOWN canonical contributions.
for (const state of ["AVAILABLE_FROM_SUPPLIER", "LOW_STOCK", "OUT_OF_STOCK", "AVAILABILITY_UNKNOWN"]) {
  assert.deepEqual(blockers(1, 1), [], `${state} with fresh source evidence must not become SOURCE_NOT_AVAILABLE`);
}

assert.deepEqual(blockers(0, 0), ["SOURCE_NOT_AVAILABLE"], "no canonical source contribution remains blocked");
assert.deepEqual(blockers(1, 0), ["SOURCE_NOT_AVAILABLE"], "stale-only source evidence remains blocked");
assert.deepEqual(blockers(2, 1), [], "one fresh contributor is sufficient when another source is unavailable or unknown");
assert.deepEqual(blockers(2, 2), [], "multiple fresh supplier contributors remain source-available");

console.log("Product publication source-availability tests passed");
