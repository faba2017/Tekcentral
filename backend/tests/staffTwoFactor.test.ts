import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setAdminAuditStorePathForTests, listAdminAudit } from "../adminAuditService.js";
import { __setOperationalAlertStorePathForTests } from "../operationalAlertService.js";
import { createProvisionalOpsAuthorizationContext } from "../staffAuthorization.js";
import { StaffAuthError, bootstrapInitialSuperAdminFromEnvironment, deferStaffTwoFactorReminder, disableStaffAccount, inspectStaffAuthStoreForTests, inviteStaff, acceptStaffInvitation, loginStaff, regenerateStaffRecoveryCodes, setStaffAuthStorePathForTests, staffFromSessionToken, staffRequiresTwoFactor, startStaffTotpEnrollment, verifyStaffTotpEnrollment, verifyStaffTwoFactorLogin } from "../staffAuth.js";
import { createOtpAuthUri, decodeBase32, encodeBase32, protectTotpSecret, revealTotpSecret, setStaffTwoFactorEncryptionKeyForTests, totpAtStep, verifyTotp } from "../staffTwoFactor.js";

const directory = await mkdtemp(join(tmpdir(), "tekcentral-staff-2fa-"));
const storePath = join(directory, "staff.json");
setStaffAuthStorePathForTests(storePath); __setAdminAuditStorePathForTests(join(directory, "audit.json")); __setOperationalAlertStorePathForTests(join(directory, "alerts.json"));
setStaffTwoFactorEncryptionKeyForTests(Buffer.alloc(32, 7));

// RFC 6238 SHA-1 vector (8 digits in the RFC); the implementation's final six digits must agree.
const vectorSecret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
assert.deepEqual(decodeBase32(vectorSecret), Buffer.from("12345678901234567890", "ascii"));
assert.equal(totpAtStep(vectorSecret, 1), "287082");
assert.equal(verifyTotp(vectorSecret, "287082", new Date(59_000)), 1);
const uri = createOtpAuthUri("owner@example.test", vectorSecret); assert.match(uri, /^otpauth:\/\/totp\/TekCentral%3Aowner%40example\.test\?/); assert.match(uri, /issuer=TekCentral/); assert.match(uri, /digits=6&period=30/);
const protectedSecret = protectTotpSecret(vectorSecret); assert.notEqual(protectedSecret.ciphertext, vectorSecret); assert.equal(revealTotpSecret(protectedSecret), vectorSecret);

const password = "Synthetic staff 2FA passphrase 482!";
const testNow = new Date();
const at = (offsetMs: number) => new Date(testNow.getTime() + offsetMs);
const minute = 60_000;
const initial = at(0);
const bootstrap = await bootstrapInitialSuperAdminFromEnvironment({ BOOTSTRAP_SUPER_ADMIN_EMAIL: "owner@example.test", BOOTSTRAP_SUPER_ADMIN_PASSWORD: password, BOOTSTRAP_SUPER_ADMIN_NAME: "Owner" } as NodeJS.ProcessEnv, initial); assert.equal(bootstrap.created, true);
const login = await loginStaff({ email: "owner@example.test", password }, at(minute)); assert.equal(login.requiresTwoFactor, false); assert.ok(login.sessionToken);
const enrollment = await startStaffTotpEnrollment(login.sessionToken, at(2 * minute)); assert.match(enrollment.otpauthUri, /otpauth:\/\/totp/);
await assert.rejects(() => verifyStaffTotpEnrollment(login.sessionToken, "000000", at(2 * minute)), (error) => error instanceof StaffAuthError && error.code === "TWO_FACTOR_INVALID");
assert.equal((await inspectStaffAuthStoreForTests()).accounts[0].twoFactorEnabled, undefined);
const enrollmentStep = Math.floor(at(2 * minute).getTime() / 30_000);
const enabled = await verifyStaffTotpEnrollment(login.sessionToken, totpAtStep(enrollment.secret, enrollmentStep), at(2 * minute)); assert.equal(enabled.staff.twoFactorEnabled, true); assert.equal(enabled.recoveryCodes.length, 10);
const persisted = await readFile(storePath, "utf8"); assert.equal(persisted.includes(enrollment.secret), false); for (const code of enabled.recoveryCodes) assert.equal(persisted.includes(code), false);

const challengedAt = at(3 * minute);
const challenged = await loginStaff({ email: "owner@example.test", password }, challengedAt); assert.equal(challenged.requiresTwoFactor, true); assert.equal(challenged.sessionToken, ""); assert.ok(challenged.challengeToken); assert.equal((await inspectStaffAuthStoreForTests()).sessions.some((item) => item.createdAt === challengedAt.toISOString()), false, "password alone must not create a session");
const loginStep = Math.floor(challengedAt.getTime() / 30_000);
const verified = await verifyStaffTwoFactorLogin({ challengeToken: challenged.challengeToken!, code: totpAtStep(enrollment.secret, loginStep), method: "TOTP_AUTHENTICATOR" }, challengedAt); assert.ok(await staffFromSessionToken(verified.sessionToken, at(3 * minute + 1_000), false));
await assert.rejects(() => verifyStaffTwoFactorLogin({ challengeToken: challenged.challengeToken!, code: totpAtStep(enrollment.secret, loginStep), method: "TOTP_AUTHENTICATOR" }, at(3 * minute + 1_000)), /invalid or expired/);

const recoveryChallenge = await loginStaff({ email: "owner@example.test", password }, at(4 * minute)); const recovery = enabled.recoveryCodes[0]; const recovered = await verifyStaffTwoFactorLogin({ challengeToken: recoveryChallenge.challengeToken!, code: recovery, method: "RECOVERY_CODE" }, at(4 * minute + 1_000)); assert.ok(recovered.sessionToken);
const reusedChallenge = await loginStaff({ email: "owner@example.test", password }, at(5 * minute)); await assert.rejects(() => verifyStaffTwoFactorLogin({ challengeToken: reusedChallenge.challengeToken!, code: recovery, method: "RECOVERY_CODE" }, at(5 * minute + 1_000)), (error) => error instanceof StaffAuthError && error.code === "RECOVERY_CODE_INVALID");
const regeneratedAt = at(7 * minute); const regenerated = await regenerateStaffRecoveryCodes({ sessionToken: recovered.sessionToken, password, code: totpAtStep(enrollment.secret, Math.floor(regeneratedAt.getTime() / 30_000)) }, regeneratedAt); assert.equal(regenerated.recoveryCodes.length, 10); const regeneratedChallenge = await loginStaff({ email: "owner@example.test", password }, at(8 * minute)); await assert.rejects(() => verifyStaffTwoFactorLogin({ challengeToken: regeneratedChallenge.challengeToken!, code: enabled.recoveryCodes[1], method: "RECOVERY_CODE" }, at(8 * minute + 1_000)), /invalid/);

const ops = createProvisionalOpsAuthorizationContext(); const invited = await inviteStaff({ email: "support@example.test", displayName: "Support", baseRole: "SUPPORT" }, ops); await acceptStaffInvitation({ token: invited.token, password, confirmPassword: password }); const supportLogin = await loginStaff({ email: invited.staff.email, password }); const reminder7 = await deferStaffTwoFactorReminder(supportLogin.sessionToken, 7, initial); assert.equal(reminder7.twoFactorReminderAt, new Date(initial.getTime() + 7 * 86_400_000).toISOString()); const reminder14 = await deferStaffTwoFactorReminder(supportLogin.sessionToken, 14, initial); assert.equal(reminder14.twoFactorReminderAt, new Date(initial.getTime() + 14 * 86_400_000).toISOString());
assert.equal(staffRequiresTwoFactor((await inspectStaffAuthStoreForTests()).accounts.find((item) => item.id === bootstrap.staff!.id)!, true), true); assert.equal(staffRequiresTwoFactor((await inspectStaffAuthStoreForTests()).accounts.find((item) => item.id === invited.staff.id)!, true), false);

const pending = await loginStaff({ email: "owner@example.test", password }, at(6 * minute)); await disableStaffAccount(bootstrap.staff!.id, ops, at(6 * minute + 1_000)).catch((error) => { if (!(error instanceof StaffAuthError && error.code === "LAST_SUPER_ADMIN")) throw error; });
await assert.rejects(() => verifyStaffTwoFactorLogin({ challengeToken: "expired", code: "123456", method: "TOTP_AUTHENTICATOR" }, at(20 * minute)), /invalid or expired/); assert.ok(pending.challengeToken);

const audits = await listAdminAudit({ page: 1, pageSize: 100 }); assert.ok(audits.records.some((item) => item.actionType === "STAFF_2FA_ENROLLMENT_STARTED")); assert.ok(audits.records.some((item) => item.actionType === "STAFF_2FA_ENABLED")); assert.ok(audits.records.some((item) => item.actionType === "STAFF_2FA_RECOVERY_CODE_USED")); assert.equal(JSON.stringify(audits).includes(enrollment.secret), false); assert.equal(JSON.stringify(audits).includes(recovery), false);

const source = `${await readFile("backend/staffAuth.ts", "utf8")}\n${await readFile("src/pages/admin/AdminStaffAccountPage.tsx", "utf8")}`; for (const excluded of ["Twilio", "SMS_OTP", "phone OTP"]) assert.equal(source.includes(excluded), false);
await rm(directory, { recursive: true, force: true }); setStaffAuthStorePathForTests(); setStaffTwoFactorEncryptionKeyForTests(); __setAdminAuditStorePathForTests(); __setOperationalAlertStorePathForTests();
console.log("Staff two-factor authentication tests passed.");
