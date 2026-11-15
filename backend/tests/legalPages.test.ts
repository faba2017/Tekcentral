import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");
const [app, footer, checkout, policies, contact, publicBusiness] = await Promise.all([
  read("src/App.tsx"), read("src/components/layout/AppFooter.tsx"), read("src/pages/CheckoutPage.tsx"), read("src/pages/LegalPolicyPage.tsx"), read("src/pages/ContactPage.tsx"), read("src/lib/public-business.ts"),
]);

for (const route of ["/terms", "/privacy", "/refund-policy", "/cancellation-policy", "/shipping-delivery"]) {
  assert.match(app, new RegExp(route.replace("/", "\\/")));
  assert.match(footer, new RegExp(route.replace("/", "\\/")));
  assert.match(publicBusiness, new RegExp(route.replace("/", "\\/")));
}
assert.match(checkout, /policyLinks/);
assert.match(checkout, /publicBusiness\.email\.support/);
assert.match(checkout, /publicBusiness\.phone\.href/);
assert.match(contact, /publicBusiness\.legalName/);
assert.match(contact, /publicBusiness\.registrationNumber/);
assert.match(contact, /publicBusiness\.registeredAddress\.lines/);
assert.match(contact, /publicBusiness\.websiteLabel/);
for (const key of ["general", "support", "sales", "accounts"]) {
  assert.match(contact, new RegExp(`publicBusiness\\.email\\.${key}`));
}
assert.match(contact, /publicBusiness\.phone\.href/);
assert.match(footer, /publicBusiness\.email\.support/);
assert.match(footer, /publicBusiness\.email\.sales/);
assert.match(footer, /publicBusiness\.phone\.href/);
assert.match(footer, /publicBusiness\.legalName/);
assert.match(footer, /publicBusiness\.registrationNumber/);
assert.match(policies, /policyContactKind/);
assert.match(policies, /publicBusiness\.legalName/);
assert.match(policies, /publicBusiness\.registrationNumber/);
assert.match(policies, /publicBusiness\.registeredAddress\.inline/);
assert.match(policies, /publicBusiness\.email\.accounts/);
assert.match(policies, /emailHref\(contactEmail\)/);
assert.match(policies, /PayFast hosts the payment/);
assert.match(policies, /Items in the same order may occasionally be delivered separately/);
assert.doesNotMatch(policies, /CJ Dropshipping|Scoop|Syntech|supplier SKU|cost basis|branch stock/i);
assert.doesNotMatch(`${policies}\n${contact}`, /merchant key|passphrase|api token/i);

const expectedContacts = [
  "info@tekcentral.co.za",
  "support@tekcentral.co.za",
  "sales@tekcentral.co.za",
  "accounts@tekcentral.co.za",
  "+27 87 351 1146",
  "tel:+27873511146",
];
for (const value of expectedContacts) assert.match(publicBusiness, new RegExp(value.replace(/[+]/g, "\\+")));
assert.match(publicBusiness, /`mailto:\$\{address\}`/);
for (const value of ["TEKCENTRAL (Pty) Ltd", "2026/701802/07", "6 Parklands Main Road", "Table View", "Blouberg", "7441"]) {
  assert.ok(publicBusiness.includes(value), `${value} must be in the canonical business configuration`);
}
assert.doesNotMatch(publicBusiness, /vat(Number|Registration|Registered)?\s*:/i);

const publicUiSources = `${footer}\n${checkout}\n${policies}\n${contact}`;
assert.doesNotMatch(publicUiSources, /[a-z]+@tekcentr(?:la|all|el)\.co\.za/i);
assert.doesNotMatch(publicUiSources, /takecnetral\.co\.za/i);
for (const value of expectedContacts) {
  assert.equal(publicUiSources.includes(value), false, `${value} must be consumed from publicBusiness rather than hardcoded`);
}
console.log("Commercial and legal page contract tests passed.");
