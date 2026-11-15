import assert from "node:assert/strict";
import { tvrIdentityEvidence } from "../suppliers/tvr/tvrProductOnboarding.js";
import type { TvrNormalizedOffer } from "../suppliers/tvr/tvrOfferNormalization.js";

const base = {
  supplierId: "TVR",
  supplierIdentity: "TVR:NEW:PRO A620M-E",
  supplierSku: "PRO A620M-E",
  catalogueSupplierSku: "NEW:PRO A620M-E",
  normalizedSupplierSku: "PRO A620M-E",
  condition: "NEW",
  description: "MSI PRO A620M-E motherboard",
} as TvrNormalizedOffer;

const fresh = tvrIdentityEvidence(base);
assert.equal(fresh.supplierSku, "PRO A620M-E");
assert.equal(fresh.supplierProductId, "PRO A620M-E");
assert.equal(fresh.model, "PRO A620M-E");
assert.equal(fresh.supplierSku.includes("NEW:"), false);

const remanufactured = tvrIdentityEvidence({ ...base, id: "TVR:REMANUFACTURED:PRO A620M-E", supplierIdentity: "TVR:REMANUFACTURED:PRO A620M-E", catalogueSupplierSku: "REMANUFACTURED:PRO A620M-E", condition: "REMANUFACTURED" });
assert.deepEqual(remanufactured, fresh, "Commercial condition must not alter canonical matching identity.");
assert.notEqual(base.catalogueSupplierSku, "REMANUFACTURED:PRO A620M-E", "Condition-qualified offer identities remain independent.");

const kelon = tvrIdentityEvidence({
  ...base,
  id: "TVR:NEW:K12/I + K12-O",
  supplierIdentity: "TVR:NEW:K12/I + K12-O",
  supplierSku: "K12/I + K12-O",
  catalogueSupplierSku: "NEW:K12/I + K12-O",
  normalizedSupplierSku: "K12/I + K12-O",
  description: "Kelon split air conditioner",
  compositeIdentity: { rawIndoorModel: "K12/I", rawOutdoorModel: "K12-O", normalizedIndoorModel: "K12/I", normalizedOutdoorModel: "K12-O" },
});
assert.equal(kelon.model, "K12/I + K12-O");
assert.equal(kelon.supplierProductId, "K12/I + K12-O");

console.log("TVR Product onboarding identity tests passed.");
