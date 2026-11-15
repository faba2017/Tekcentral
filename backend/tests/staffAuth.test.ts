import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setAdminAuditStorePathForTests, listAdminAudit, recordAdminAudit } from "../adminAuditService.js";
import { __setOperationalAlertStorePathForTests } from "../operationalAlertService.js";
import { createProvisionalOpsAuthorizationContext } from "../staffAuthorization.js";
import {
  StaffAuthError, StaffAuthRateLimiter, acceptStaffInvitation, bootstrapInitialSuperAdminFromEnvironment, changeStaffPassword, disableStaffAccount, getStaffInvitation, hashStaffPassword, inspectStaffAuthStoreForTests, inviteStaff, loginStaff, logoutStaff, normalizeStaffEmail, parseStaffSessionCookie, requestStaffPasswordReset, resendStaffInvitation, resetStaffPassword, revokeAllStaffSessions, setStaffAuthStorePathForTests, staffFromSessionToken, staffSessionCookie, updateStaffAuthorizationProfile, verifyStaffPassword,
} from "../staffAuth.js";
import { sendStaffInvitationEmail, sendStaffPasswordResetEmail } from "../staffAuthMail.js";
import type { MailMessage, MailTransport } from "../mailService.js";

const directory = await mkdtemp(join(tmpdir(), "tekcentral-staff-auth-"));
const storePath = join(directory, "staff.json");
setStaffAuthStorePathForTests(storePath); __setAdminAuditStorePathForTests(join(directory, "audit.json")); __setOperationalAlertStorePathForTests(join(directory, "alerts.json"));
const testNow = new Date();
const at = (offsetMs: number) => new Date(testNow.getTime() + offsetMs);
const minute = 60_000;
const hour = 60 * minute;
const initial = at(0);
const bootstrapPassword = "Synthetic bootstrap passphrase 482!";
const bootstrapEnvironment = { BOOTSTRAP_SUPER_ADMIN_EMAIL: "OWNER@TEKCENTRAL.EXAMPLE", BOOTSTRAP_SUPER_ADMIN_PASSWORD: bootstrapPassword, BOOTSTRAP_SUPER_ADMIN_NAME: "Owner Test" } as NodeJS.ProcessEnv;
const first = await bootstrapInitialSuperAdminFromEnvironment(bootstrapEnvironment, initial); assert.equal(first.created, true); assert.equal(first.staff?.role, "SUPER_ADMIN"); assert.equal(first.staff?.mustChangePassword, true);
assert.equal((await bootstrapInitialSuperAdminFromEnvironment(bootstrapEnvironment, initial)).created, false);
assert.equal((await bootstrapInitialSuperAdminFromEnvironment({ ...bootstrapEnvironment, BOOTSTRAP_SUPER_ADMIN_EMAIL: "different@example.test" }, initial)).created, false);
const persistedAfterBootstrap = await readFile(storePath, "utf8"); assert.equal(persistedAfterBootstrap.includes(bootstrapPassword), false); assert.equal(persistedAfterBootstrap.includes("token"), false);
assert.equal(normalizeStaffEmail(" Admin@Example.Test "), "admin@example.test");
assert.equal(await verifyStaffPassword(bootstrapPassword, (await inspectStaffAuthStoreForTests()).accounts[0].passwordHash), true);

const bootstrapLogin = await loginStaff({ email: "owner@tekcentral.example", password: bootstrapPassword }, at(minute));
const ownerSession = await staffFromSessionToken(bootstrapLogin.sessionToken, at(2 * minute)); assert.ok(ownerSession); assert.equal(ownerSession?.context.actorType, "STAFF_USER"); assert.equal(ownerSession?.context.actorId, first.staff?.id); assert.equal(ownerSession?.context.role, "SUPER_ADMIN");
const storedSession = (await inspectStaffAuthStoreForTests()).sessions[0]; assert.notEqual(storedSession.tokenHash, bootstrapLogin.sessionToken); assert.equal(JSON.stringify(storedSession).includes(bootstrapLogin.sessionToken), false);
assert.equal(await staffFromSessionToken(bootstrapLogin.sessionToken, at(3 * hour), false), undefined, "two-hour inactivity must expire session");

const ops = createProvisionalOpsAuthorizationContext();
const invite = await inviteStaff({ email: "Support@Example.Test", displayName: "Support Test", baseRole: "SUPPORT" }, ops, at(hour)); assert.equal(invite.staff.status, "INVITED");
await assert.rejects(() => loginStaff({ email: invite.staff.email, password: "Synthetic support password 482!" }), (error) => error instanceof StaffAuthError && error.code === "INVALID_CREDENTIALS");
assert.equal((await getStaffInvitation(invite.token, at(hour + minute))).email, "support@example.test");
const accepted = await acceptStaffInvitation({ token: invite.token, password: "Synthetic support password 482!", confirmPassword: "Synthetic support password 482!" }, at(hour + 2 * minute)); assert.equal(accepted.status, "ACTIVE");
await assert.rejects(() => acceptStaffInvitation({ token: invite.token, password: "Another synthetic password 482!", confirmPassword: "Another synthetic password 482!" }), (error) => error instanceof StaffAuthError && error.code === "INVITATION_INVALID");
await assert.rejects(() => loginStaff({ email: "unknown@example.test", password: "Incorrect synthetic password" }), (error) => error instanceof StaffAuthError && error.message === "Invalid email or password.");
await assert.rejects(() => loginStaff({ email: accepted.email, password: "Incorrect synthetic password" }), (error) => error instanceof StaffAuthError && error.message === "Invalid email or password.");

const resendInvite = await inviteStaff({ email: "resend@example.test", displayName: "Resend Test", baseRole: "AUDITOR" }, ops, at(hour + 10 * minute)); const resent = await resendStaffInvitation(resendInvite.staff.id, ops, at(hour + 11 * minute)); await assert.rejects(() => getStaffInvitation(resendInvite.token), /invalid or has expired/); assert.ok(await getStaffInvitation(resent.token, at(hour + 12 * minute)));
const expiredInvite = await inviteStaff({ email: "expired@example.test", displayName: "Expired Test", baseRole: "AUDITOR" }, ops, at(-47 * hour)); await assert.rejects(() => getStaffInvitation(expiredInvite.token, at(hour)), /invalid or has expired/);

const supportLoginA = await loginStaff({ email: accepted.email, password: "Synthetic support password 482!" }, at(2 * hour)); const supportLoginB = await loginStaff({ email: accepted.email, password: "Synthetic support password 482!" }, at(2 * hour + minute));
await assert.rejects(() => changeStaffPassword({ sessionToken: supportLoginA.sessionToken, currentPassword: "wrong password", newPassword: "New synthetic support password 937!", confirmPassword: "New synthetic support password 937!" }, at(2 * hour + 90_000)), (error) => error instanceof StaffAuthError && error.code === "CURRENT_PASSWORD_INVALID");
const changed = await changeStaffPassword({ sessionToken: supportLoginA.sessionToken, currentPassword: "Synthetic support password 482!", newPassword: "New synthetic support password 937!", confirmPassword: "New synthetic support password 937!" }, at(2 * hour + 2 * minute)); assert.ok(await staffFromSessionToken(changed.sessionToken, at(2 * hour + 3 * minute))); assert.equal(await staffFromSessionToken(supportLoginB.sessionToken, at(2 * hour + 3 * minute), false), undefined); await assert.rejects(() => loginStaff({ email: accepted.email, password: "Synthetic support password 482!" }), /Invalid email or password/);

const reset = await requestStaffPasswordReset(accepted.email, at(3 * hour)); assert.ok(reset); const beforeResetSession = await loginStaff({ email: accepted.email, password: "New synthetic support password 937!" }, at(3 * hour + minute)); await resetStaffPassword({ token: reset!.token, password: "Reset synthetic support password 611!", confirmPassword: "Reset synthetic support password 611!" }, at(3 * hour + 2 * minute)); assert.equal(await staffFromSessionToken(beforeResetSession.sessionToken, at(3 * hour + 3 * minute), false), undefined); await assert.rejects(() => resetStaffPassword({ token: reset!.token, password: "Reuse synthetic password 611!", confirmPassword: "Reuse synthetic password 611!" }), /invalid or has expired/); assert.equal(await requestStaffPasswordReset("missing@example.test"), undefined);
const expiredReset = await requestStaffPasswordReset(accepted.email, at(3 * hour + 10 * minute)); await assert.rejects(() => resetStaffPassword({ token: expiredReset!.token, password: "Expired synthetic password 611!", confirmPassword: "Expired synthetic password 611!" }, at(4 * hour + 1_000)), /invalid or has expired/);

await assert.rejects(() => disableStaffAccount(first.staff!.id, ops), (error) => error instanceof StaffAuthError && error.code === "LAST_SUPER_ADMIN");
await assert.rejects(() => updateStaffAuthorizationProfile(first.staff!.id, { baseRole: "SUPPORT", grantedPermissions: [], revokedPermissions: [] }, ops), (error) => error instanceof StaffAuthError && error.code === "LAST_SUPER_ADMIN");
await assert.rejects(() => updateStaffAuthorizationProfile(first.staff!.id, { baseRole: "SUPER_ADMIN", grantedPermissions: [], revokedPermissions: ["roles.manage"] }, ops), (error) => error instanceof StaffAuthError && error.code === "LAST_SUPER_ADMIN");
const supportContext = (await staffFromSessionToken((await loginStaff({ email: accepted.email, password: "Reset synthetic support password 611!" })).sessionToken))!.context; await disableStaffAccount(accepted.id, ops); assert.equal(await requestStaffPasswordReset(accepted.email), undefined); await assert.rejects(() => loginStaff({ email: accepted.email, password: "Reset synthetic support password 611!" }), /Invalid email or password/); assert.equal(supportContext.role, "SUPPORT");

const temporary = await inviteStaff({ email: "session@example.test", displayName: "Session Test", baseRole: "AUDITOR" }, ops); await acceptStaffInvitation({ token: temporary.token, password: "Synthetic session password 482!", confirmPassword: "Synthetic session password 482!" }); const temporaryLogin = await loginStaff({ email: temporary.staff.email, password: "Synthetic session password 482!" }); await revokeAllStaffSessions(temporary.staff.id, ops); assert.equal(await staffFromSessionToken(temporaryLogin.sessionToken, new Date(), false), undefined); await logoutStaff(temporaryLogin.sessionToken);

const sent: MailMessage[] = []; const mail: MailTransport = { async send(message) { sent.push(message); } }; const previousOrigin = process.env.ADMIN_ORIGIN; process.env.ADMIN_ORIGIN = "https://admin.tekcentral.co.za"; await sendStaffInvitationEmail(mail, { email: "invite@example.test", displayName: "Invite Test", token: "synthetic-invite-token", expiresAt: at(16 * hour).toISOString() }); await sendStaffPasswordResetEmail(mail, { email: "reset@example.test", displayName: "Reset Test", token: "synthetic-reset-token", expiresAt: at(4.5 * hour).toISOString() }); assert.equal(sent.length, 2); assert.equal(sent.every((item) => item.fromEmail === "support@tekcentral.co.za" && item.replyTo === "support@tekcentral.co.za"), true); assert.match(sent[0].text, /admin\.tekcentral\.co\.za\/accept-invite\?token=/); assert.match(sent[1].text, /admin\.tekcentral\.co\.za\/reset-password\?token=/); if (previousOrigin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = previousOrigin;

const limiter = new StaffAuthRateLimiter(); limiter.check("login:user@example.test:127.0.0.1", 2, 60_000, 1); limiter.check("login:user@example.test:127.0.0.1", 2, 60_000, 2); assert.throws(() => limiter.check("login:user@example.test:127.0.0.1", 2, 60_000, 3), (error) => error instanceof StaffAuthError && error.code === "RATE_LIMITED");
const cookie = staffSessionCookie("opaque-token", true); assert.match(cookie, /tc_staff_session=opaque-token/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Secure/); assert.equal(parseStaffSessionCookie(cookie), "opaque-token");

const storeText = await readFile(storePath, "utf8"); for (const secret of [bootstrapPassword, invite.token, resent.token, reset!.token, "synthetic-invite-token", "synthetic-reset-token"]) assert.equal(storeText.includes(secret), false);
const serialized = JSON.stringify(ownerSession); for (const forbidden of ["passwordHash", "tokenHash", "inviteToken", "resetToken"]) assert.equal(serialized.includes(forbidden), false);
const audit = await listAdminAudit({ page: 1, pageSize: 100 }); assert.ok(audit.records.some((item) => item.actionType === "STAFF_LOGIN_SUCCEEDED" && item.actorType === "STAFF_USER")); assert.ok(audit.records.some((item) => item.actionType === "STAFF_BOOTSTRAP_CREATED" && item.actorType === "SYSTEM")); assert.ok(audit.filters.actors.includes("STAFF_USER"));
await recordAdminAudit({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "SYSTEM", actionType: "AUTOMATED_TEST", entityType: "SYSTEM", entityId: "test", entityLabel: "Test", summary: "Automated event.", targetRoute: "/admin/audit" }); const afterSystem = await listAdminAudit({ page: 1, pageSize: 100 }); assert.equal(afterSystem.records.find((item) => item.actionType === "AUTOMATED_TEST")?.actorType, "SYSTEM");

const appSource = await readFile("src/App.tsx", "utf8"); assert.doesNotMatch(appSource, /\/admin\/register/); for (const route of ["/admin/login", "/admin/forgot-password", "/admin/reset-password", "/admin/accept-invite", "/admin/change-password", "/admin/account"]) assert.ok(appSource.includes(route));
const serverSource = await readFile("backend/server.ts", "utf8"); assert.match(serverSource, /url\.pathname\.startsWith\("\/api\/admin\/auth\/"\).*enforceAdminMutationOrigin/); assert.match(serverSource, /StaffAuthRateLimiter/); assert.doesNotMatch(serverSource, /\/api\/admin\/register/);
await rm(directory, { recursive: true, force: true }); setStaffAuthStorePathForTests(); __setAdminAuditStorePathForTests(); __setOperationalAlertStorePathForTests();
void hashStaffPassword;
console.log("Staff authentication tests passed.");
