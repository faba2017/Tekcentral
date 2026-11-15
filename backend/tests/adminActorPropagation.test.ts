import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createStaffAuthorizationContext, staffAuditActor } from "../staffAuthorization.js";

const owner = createStaffAuthorizationContext({ actorId: "staff-owner-uuid", actorLabel: "Owner One", profile: { baseRole: "SUPER_ADMIN", grantedPermissions: [], revokedPermissions: [] } });
const operator = createStaffAuthorizationContext({ actorId: "staff-operator-uuid", actorLabel: "Operator Two", profile: { baseRole: "OPERATIONS", grantedPermissions: [], revokedPermissions: [] } });
assert.deepEqual(staffAuditActor(owner), { actorType: "STAFF_USER", actorId: "staff-owner-uuid", actorLabel: "Owner One", actorRole: "SUPER_ADMIN" });
assert.deepEqual(staffAuditActor(operator), { actorType: "STAFF_USER", actorId: "staff-operator-uuid", actorLabel: "Operator Two", actorRole: "OPERATIONS" });
assert.notEqual(staffAuditActor(owner).actorId, staffAuditActor(operator).actorId);

const source = (path: string) => readFile(resolve(process.cwd(), "backend", path), "utf8");
const server = await source("server.ts");
assert.doesNotMatch(server, /recordAdminAuditBestEffort\(\{[^\n]*actorType:\s*["']OPS["']/);
assert.doesNotMatch(server, /actor:\s*body\.actor/);
assert.doesNotMatch(server, /addInternalNote\([^\n]*body\.authorLabel/);
assert.match(server, /staffAuditActor\(staff!\.context\)/);
assert.match(server, /actorType:\s*"SYSTEM"[^\n]*SUPPLIER_REFRESH_COMPLETED/);

const alerts = await source("operationalAlertService.ts");
assert.match(alerts, /acknowledgeAlert\(id: string, actor: HumanAuditActor\)/);
assert.match(alerts, /resolveAlert\(id: string, actor: HumanAuditActor\)/);
assert.doesNotMatch(alerts, /ALERT_ACKNOWLEDGED[^\n]*actorType:\s*"OPS"/);

const contact = await source("contactMessagingService.ts");
assert.match(contact, /auditActor\?: Pick<AuditInput/);
assert.doesNotMatch(contact, /CONTACT_REPLY_(?:SENT|FAILED)[^\n]*actorType:\s*"OPS"/);

const syntech = await source("suppliers/syntech/syntechOrderAdapter.ts");
assert.match(syntech, /auditActor: Pick<AuditInput/);
assert.doesNotMatch(syntech, /SYNTECH_UAT_[A-Z_]+[^\n]*actorType:\s*"OPS"/);
console.log("Authenticated Admin actor propagation tests passed.");
