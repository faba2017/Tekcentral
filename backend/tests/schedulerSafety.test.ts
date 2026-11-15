import assert from "node:assert/strict";
import { FX_SCHEDULER_LOCK, startFxReconciliationScheduler } from "../fxReconciliationJob.js";
import { PROCUREMENT_UNAVAILABLE_MESSAGE, procurementViability, supplierProcurementDecision } from "../supplierProcurement.js";
import { SYNTECH_SCHEDULER_LOCK, startSyntechScheduler } from "../suppliers/syntech/syntechSyncService.js";
import { deriveSupplierOrderAttention, manualProcurementBlocker } from "../supplierOrchestration.js";
import type { SupplierOrder } from "../types.js";

assert.equal(SYNTECH_SCHEDULER_LOCK, "job:syntech-scheduler");
assert.equal(FX_SCHEDULER_LOCK, "job:fx-scheduler");
assert.equal(startSyntechScheduler({ enabled: true, appRole: "web" }).enabled, false);
assert.equal(startFxReconciliationScheduler({ enabled: true, runImmediately: false, appRole: "web" }).enabled, false);
const previousNodeEnvironment = process.env.NODE_ENV; const previousFxSetting = process.env.FX_SCHEDULER_ENABLED;
process.env.NODE_ENV = "production"; process.env.FX_SCHEDULER_ENABLED = "false";
assert.equal(startFxReconciliationScheduler({ runImmediately: false, appRole: "worker" }).enabled, false);
if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnvironment;
if (previousFxSetting === undefined) delete process.env.FX_SCHEDULER_ENABLED; else process.env.FX_SCHEDULER_ENABLED = previousFxSetting;
const syntechWorker = startSyntechScheduler({ enabled: true, appRole: "worker" });
assert.equal(syntechWorker.enabled, true);
syntechWorker.stop();
const fxWorker = startFxReconciliationScheduler({ enabled: true, runImmediately: false, appRole: "worker" });
assert.equal(fxWorker.enabled, true);
fxWorker.stop();

assert.deepEqual(["SYNTECH", "SCOOP", "MUSTEK", "TVR", "CJ", "TEKCENTRAL"].map((supplier) => supplierProcurementDecision(supplier as "SYNTECH").viable), [true, true, true, true, true, true]);
assert.deepEqual(["MUSTEK", "TVR"].map((supplier) => supplierProcurementDecision(supplier as "MUSTEK").mode), ["MANUAL_SUPPORTED", "MANUAL_SUPPORTED"]);
assert.equal(supplierProcurementDecision("SYNTECH").mode, "MANUAL_SUPPORTED");
assert.equal(supplierProcurementDecision("CJ").automatic, false);
assert.equal(procurementViability([{ mode: "MANUAL_SUPPORTED", operationallyAccepted: true }]), true);
assert.equal(procurementViability([{ mode: "MANUAL_SUPPORTED", operationallyAccepted: false }, { mode: "UNSUPPORTED", operationallyAccepted: true }]), false);
assert.equal(PROCUREMENT_UNAVAILABLE_MESSAGE, "This item is temporarily unavailable for purchase.");

const syntechOrder = { id: "SO-SYNTECH-RC3", customerOrderNumber: "TC-TEST", supplierCode: "SYNTECH", supplierName: "Syntech Distribution", allocationIds: [], itemLines: [], status: "APPROVED", createdAt: "2026-11-15T00:00:00.000Z", updatedAt: "2026-11-15T01:00:00.000Z", submissionMode: "API", fulfilmentMode: "SHIP_TO_CUSTOMER", mockSubmissions: [], events: [], externalSubmission: { mode: "SYNTECH_UAT_API", status: "FAILED", lastErrorCode: "RC3", lastErrorMessage: "provider body must not be rendered" } } as SupplierOrder;
assert.equal(manualProcurementBlocker(syntechOrder), undefined);
const attention = deriveSupplierOrderAttention(syntechOrder);
assert.equal(attention[0]?.label, "Procurement action required");
assert.match(attention[0]?.detail ?? "", /Do not retry the API submission/);
assert.doesNotMatch(JSON.stringify(attention), /provider body must not be rendered/);
assert.match(manualProcurementBlocker({ ...syntechOrder, externalSubmission: { ...syntechOrder.externalSubmission!, status: "UNKNOWN_RESULT" } }) ?? "", /reconciled/);
assert.match(manualProcurementBlocker({ ...syntechOrder, status: "ORDERED", supplierOrderReference: "SYN-1" }) ?? "", /approved|already/);
assert.equal(manualProcurementBlocker({ ...syntechOrder, supplierCode: "MUSTEK", submissionMode: "MANUAL" }), undefined);
assert.equal(manualProcurementBlocker({ ...syntechOrder, supplierCode: "TVR", submissionMode: "MANUAL" }), undefined);

console.log("Scheduler role, stable-lock and supplier procurement policy tests passed.");
