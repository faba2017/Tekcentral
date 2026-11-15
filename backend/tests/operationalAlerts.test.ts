import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setOperationalAlertStorePathForTests, acknowledgeAlert, getOperationalAlert, listOperationalAlerts, raiseOrUpdateAlert, resolveAlertsByFingerprint } from "../operationalAlertService.js";
import { __setAdminAuditStorePathForTests } from "../adminAuditService.js";

const directory = await mkdtemp(join(tmpdir(), "tekcentral-alerts-")); const path = join(directory, "alerts.json"); __setOperationalAlertStorePathForTests(path); __setAdminAuditStorePathForTests(join(directory, "audit.json"));
const shipping = { type: "SHIPPING_RATE_CALCULATION_FAILED", severity: "CRITICAL" as const, subsystem: "SHIPPING" as const, title: "Shipping calculation blocked checkout", summary: "No rate returned.", targetRoute: "/admin/settings/shipping", recommendedAction: "Check shipping configuration", diagnosticCode: "SHIPPING_PROVIDER_TIMEOUT", customerImpactCount: 1 };
for (let index = 0; index < 10; index += 1) await raiseOrUpdateAlert(shipping);
let alerts = await listOperationalAlerts(); assert.equal(alerts.length, 1); assert.equal(alerts[0].occurrenceCount, 10); assert.equal(alerts[0].customerImpactCount, 10); assert.equal(alerts[0].severity, "CRITICAL");
const staffActor = { actorType: "STAFF_USER" as const, actorId: "staff-alert-reviewer", actorLabel: "Alert Reviewer", actorRole: "OPERATIONS" };
const originalAlertId = alerts[0].id; const acknowledged = await acknowledgeAlert(originalAlertId, staffActor); assert.equal(acknowledged?.status, "ACKNOWLEDGED"); assert.equal(acknowledged?.occurrenceCount, 10);
await resolveAlertsByFingerprint(shipping); alerts = await listOperationalAlerts(); assert.equal(alerts[0].status, "RESOLVED");
await raiseOrUpdateAlert(shipping); alerts = await listOperationalAlerts({ status: "OPEN" }); assert.equal(alerts.length, 1); assert.equal(alerts[0].id, originalAlertId); assert.equal(alerts[0].occurrenceCount, 11); assert.equal(alerts[0].resolvedAt, undefined);
const fixtures = [["PAYMENT_INITIALIZATION_FAILED", "CRITICAL", "PAYMENTS", "/admin/settings/payments"], ["OUTBOUND_EMAIL_FAILED", "WARNING", "EMAIL", "/admin/contact/example"], ["SUPPLIER_FEED_STALE", "WARNING", "SUPPLIERS", "/admin/suppliers"], ["ZEUS_PROVIDER_FAILURE_SPIKE", "WARNING", "ZEUS", "/admin/reports/zeus"], ["CJ_COST_MOVEMENT_REVIEW", "WARNING", "PRICING", "/admin/pricing?view=fx-impact"], ["CJ_COST_MOVEMENT_CRITICAL", "CRITICAL", "PRICING", "/admin/pricing?view=fx-impact"]] as const;
for (const [type, severity, subsystem, targetRoute] of fixtures) { const alert = await raiseOrUpdateAlert({ type, severity, subsystem, title: type, summary: "Safe operational summary", targetRoute, recommendedAction: "Review", diagnosticCode: type }); assert.equal(alert.severity, severity); assert.equal(alert.targetRoute, targetRoute); }
const unsafe = await raiseOrUpdateAlert({ type: "PAYMENT_CALLBACK_VERIFICATION_FAILED", severity: "CRITICAL", subsystem: "PAYMENTS", title: "Secret signature token password", summary: "merchant key and authorization failed", targetRoute: "https://malicious.example", recommendedAction: "Review", diagnosticCode: "PAYFAST_SIGNATURE_INVALID", entityType: "ORDER", entityId: "TC-TEST" });
assert.equal(unsafe.targetRoute, "/admin/alerts"); assert.doesNotMatch(`${unsafe.title} ${unsafe.summary}`, /secret|signature|token|password|merchant key|authorization/i);
const detail = await getOperationalAlert(unsafe.id); assert.ok(detail?.events.length); const persisted = await readFile(path, "utf8"); assert.doesNotMatch(persisted, /malicious\.example|merchant key|authorization failed/i);
__setOperationalAlertStorePathForTests(); __setAdminAuditStorePathForTests(); await rm(directory, { recursive: true, force: true });
console.log("Operational alert tests passed.");
