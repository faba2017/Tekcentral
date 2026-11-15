import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { bootstrapInitialSuperAdminFromEnvironment, inviteStaff, acceptStaffInvitation, changeStaffPassword, loginStaff, staffFromSessionToken } from "../staffAuth.js";
import { closePostgres, query } from "../persistence/postgres.js";
import { getCanonicalTaxonomyTree } from "../canonicalTaxonomyService.js";
import { normalizeCurrentMustekCatalogue } from "../suppliers/mustek/mustekCatalogueService.js";
import { listAdminAudit, recordAdminAudit } from "../adminAuditService.js";
import type { MustekEvidenceRow } from "../suppliers/mustek/mustekOfferNormalization.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Mustek actor attribution integration requires an isolated *_test PostgreSQL database.");

const port = 18_787;
const origin = `http://127.0.0.1:${port}`;
const superPassword = "Mustek actor test password 482!";
let server: ChildProcess | undefined;

const cookie = (token: string) => `tc_staff_session=${encodeURIComponent(token)}`;
const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, { ...init, headers: { Origin: origin, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${origin}/live`)).ok) return; } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test backend did not become ready.");
};

try {
  await query("TRUNCATE admin_audit, staff_pre_auth_challenges, staff_auth_tokens, staff_sessions, staff_accounts, catalogue_product_mappings, catalogue_supplier_offers, catalogue_supplier_state, catalogue_products RESTART IDENTITY CASCADE");
  const bootstrapped = await bootstrapInitialSuperAdminFromEnvironment({ BOOTSTRAP_SUPER_ADMIN_EMAIL: "mustek-owner@example.test", BOOTSTRAP_SUPER_ADMIN_PASSWORD: superPassword, BOOTSTRAP_SUPER_ADMIN_NAME: "Mustek Test Owner", PERSISTENCE_PROVIDER: "POSTGRES", DATABASE_URL: databaseUrl });
  assert.equal(bootstrapped.created, true);
  const initialOwnerLogin = await loginStaff({ email: "mustek-owner@example.test", password: superPassword });
  assert.equal(initialOwnerLogin.requiresTwoFactor, false);
  const ownerLogin = await changeStaffPassword({ sessionToken: initialOwnerLogin.sessionToken, currentPassword: superPassword, newPassword: "Mustek owner accepted password 704!", confirmPassword: "Mustek owner accepted password 704!" });
  const owner = await staffFromSessionToken(ownerLogin.sessionToken, new Date(), false);
  assert.ok(owner);
  const invitation = await inviteStaff({ email: "mustek-support@example.test", displayName: "Mustek Test Support", baseRole: "SUPPORT" }, owner.context);
  await acceptStaffInvitation({ token: invitation.token, password: "Mustek support password 593!", confirmPassword: "Mustek support password 593!" });
  const supportLogin = await loginStaff({ email: invitation.staff.email, password: "Mustek support password 593!" });

  const evidence: MustekEvidenceRow = { evidenceId: "actor-evidence-1", sourceId: "actor-source", sourceVersionId: "actor-version", sourceFingerprint: "actor-source-fingerprint", supplierSku: "ACTOR-100", sourceDescription: "Actor Attribution Test Router", sourceBrand: "TestBrand", dealerCost: 100, currency: "ZAR", taxBasis: "UNKNOWN", workbookName: "Actor Test.xlsx", worksheetName: "Products", sourceRow: 2, observedAt: new Date().toISOString() };
  await normalizeCurrentMustekCatalogue([evidence]);
  const category = (await getCanonicalTaxonomyTree({ includeInactive: false }))[0];
  assert.ok(category);
  await closePostgres();

  server = spawn(process.execPath, ["backend-dist/backend/server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ADMIN_ORIGIN: origin, FX_RECONCILIATION_ENABLED: "false", SYNTECH_SCHEDULER_ENABLED: "false", BOOTSTRAP_SUPER_ADMIN_EMAIL: "", BOOTSTRAP_SUPER_ADMIN_PASSWORD: "" }, stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer();

  const createPath = "/api/admin/suppliers/mustek/products/ACTOR-100/create-product";
  const createBody = JSON.stringify({ sku: "ACTOR-100", name: "Actor Attribution Test Router", brand: "TestBrand", shortDescription: "Controlled integration fixture.", categoryId: category.id, confirmed: true, duplicateOverrideConfirmed: true });
  assert.equal((await request(createPath, { method: "POST", body: createBody })).status, 401);
  assert.equal((await request(createPath, { method: "POST", body: createBody, headers: { Cookie: cookie(supportLogin.sessionToken) } })).status, 403);
  const createdResponse = await request(createPath, { method: "POST", body: createBody, headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  if (createdResponse.status !== 201) assert.fail(`Expected create status 201, received ${createdResponse.status}: ${await createdResponse.text()}`);
  const created = await createdResponse.json() as { mapping: { id: string; status: string }; product: { id: string }; reused: boolean };
  assert.equal(created.reused, false);
  assert.equal(created.mapping.status, "VERIFIED");

  const publicationPath = `/api/admin/products/${encodeURIComponent(created.product.id)}/publication`;
  const publicationResponse = await request(publicationPath, { headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  if (publicationResponse.status !== 200) assert.fail(`Expected publication review status 200, received ${publicationResponse.status}: ${await publicationResponse.text()}`);
  const publication = await publicationResponse.json() as { draft: Record<string, unknown> & { images: string[] } };
  const draftSnapshot = { ...publication.draft, images: ["https://example.test/controlled-fixture.png"] };
  const auditCountBeforeDeniedDrafts = (await listAdminAudit({ page: 1, pageSize: 100 })).records.filter((item) => item.entityId === created.product.id && item.actionType === "PRODUCT_CONTENT_UPDATED").length;
  assert.equal((await request(publicationPath, { method: "PUT", body: JSON.stringify({ snapshot: draftSnapshot }) })).status, 401);
  assert.equal((await request(publicationPath, { method: "PUT", body: JSON.stringify({ snapshot: draftSnapshot }), headers: { Cookie: cookie(supportLogin.sessionToken) } })).status, 403);
  assert.equal((await listAdminAudit({ page: 1, pageSize: 100 })).records.filter((item) => item.entityId === created.product.id && item.actionType === "PRODUCT_CONTENT_UPDATED").length, auditCountBeforeDeniedDrafts);
  const draftResponse = await request(publicationPath, { method: "PUT", body: JSON.stringify({ snapshot: draftSnapshot, actor: "Spoofed browser actor" }), headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(draftResponse.status, 200, await draftResponse.text());
  const contentDraftResponse = await request(publicationPath, { method: "PUT", body: JSON.stringify({ snapshot: { ...draftSnapshot, shortDescription: "Authenticated staff content update." }, actor: "Spoofed browser actor" }), headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(contentDraftResponse.status, 200, await contentDraftResponse.text());

  const mediaUploadPath = `/api/admin/products/${encodeURIComponent(created.product.id)}/publication-image/upload`;
  const mediaBody = JSON.stringify({ filename: "controlled.png", mimeType: "image/png", base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString("base64"), actor: "Spoofed browser actor" });
  assert.equal((await request(mediaUploadPath, { method: "POST", body: mediaBody })).status, 401);
  assert.equal((await request(mediaUploadPath, { method: "POST", body: mediaBody, headers: { Cookie: cookie(supportLogin.sessionToken) } })).status, 403);
  const mediaResponse = await request(mediaUploadPath, { method: "POST", body: mediaBody, headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(mediaResponse.status, 201, await mediaResponse.text());
  const privateMediaPath = `/api/admin/products/${encodeURIComponent(created.product.id)}/publication-image/private`;
  assert.equal((await request(privateMediaPath, { method: "POST", body: JSON.stringify({ candidateId: "missing-private-candidate" }), headers: { Cookie: cookie(supportLogin.sessionToken) } })).status, 403);

  let audits = await listAdminAudit({ page: 1, pageSize: 100 });
  const productAudit = audits.records.find((item) => item.actionType === "PRODUCT_CREATED_FROM_SUPPLIER_OFFER" && item.entityId === created.product.id);
  const mappingAudit = audits.records.find((item) => item.actionType === "SUPPLIER_MAPPING_VERIFIED" && item.entityId === created.mapping.id);
  for (const event of [productAudit, mappingAudit]) {
    assert.ok(event);
    assert.equal(event.actorType, "STAFF_USER");
    assert.equal(event.actorId, owner.context.actorId);
    assert.equal(event.actorLabel, owner.context.actorLabel);
    assert.equal(event.actorRole, owner.context.role);
  }
  const contentAudit = audits.records.find((item) => item.actionType === "PRODUCT_CONTENT_UPDATED" && item.entityId === created.product.id);
  assert.ok(contentAudit);
  assert.equal(contentAudit.actorType, "STAFF_USER");
  assert.equal(contentAudit.actorId, owner.context.actorId);
  assert.equal(contentAudit.actorLabel, owner.context.actorLabel);
  assert.equal(contentAudit.actorRole, owner.context.role);
  assert.notEqual(contentAudit.actorLabel, "Spoofed browser actor");
  const primaryAudit = audits.records.find((item) => item.actionType === "PRODUCT_PRIMARY_IMAGE_CHANGED" && item.entityId === created.product.id);
  assert.ok(primaryAudit);
  assert.equal(primaryAudit.actorType, "STAFF_USER");
  assert.equal(primaryAudit.actorId, owner.context.actorId);
  assert.equal(primaryAudit.actorLabel, owner.context.actorLabel);
  const mediaAudit = audits.records.find((item) => item.actionType === "PRODUCT_MEDIA_UPLOADED" && item.entityId === created.product.id);
  assert.ok(mediaAudit);
  assert.equal(mediaAudit.actorType, "STAFF_USER");
  assert.equal(mediaAudit.actorId, owner.context.actorId);
  assert.equal(mediaAudit.actorLabel, owner.context.actorLabel);
  assert.notEqual(mediaAudit.actorLabel, "Spoofed browser actor");

  const creationCount = audits.records.filter((item) => item.actionType === "PRODUCT_CREATED_FROM_SUPPLIER_OFFER" && item.entityId === created.product.id).length;
  const reusedResponse = await request(createPath, { method: "POST", body: createBody, headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(reusedResponse.status, 200);
  audits = await listAdminAudit({ page: 1, pageSize: 100 });
  assert.equal(audits.records.filter((item) => item.actionType === "PRODUCT_CREATED_FROM_SUPPLIER_OFFER" && item.entityId === created.product.id).length, creationCount);

  const rejectResponse = await request(`/api/admin/supplier-mappings/${encodeURIComponent(created.mapping.id)}/reject`, { method: "PATCH", headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(rejectResponse.status, 200, await rejectResponse.text());
  const verifyResponse = await request(`/api/admin/supplier-mappings/${encodeURIComponent(created.mapping.id)}/verify`, { method: "PATCH", headers: { Cookie: cookie(ownerLogin.sessionToken) } });
  assert.equal(verifyResponse.status, 200, await verifyResponse.text());
  audits = await listAdminAudit({ page: 1, pageSize: 100 });
  for (const actionType of ["SUPPLIER_MAPPING_REJECTED", "SUPPLIER_MAPPING_VERIFIED"]) {
    const event = audits.records.find((item) => item.actionType === actionType && item.entityId === created.mapping.id);
    assert.ok(event);
    assert.equal(event.actorType, "STAFF_USER");
    assert.equal(event.actorId, owner.context.actorId);
    assert.equal(event.actorRole, "SUPER_ADMIN");
  }

  const successEvents = audits.records.filter((item) => ["PRODUCT_CREATED_FROM_SUPPLIER_OFFER", "SUPPLIER_MAPPING_VERIFIED"].includes(item.actionType));
  assert.equal(successEvents.some((item) => item.actorId === invitation.staff.id), false);
  await recordAdminAudit({ category: "ACTIVITY", actorType: "SYSTEM", actorId: "must-be-stripped", subsystem: "SYSTEM", actionType: "ACTOR_SYSTEM_REGRESSION", entityType: "SYSTEM", entityId: "actor-test", entityLabel: "Actor test", summary: "System actor regression fixture.", targetRoute: "/admin/audit" });
  await recordAdminAudit({ category: "AUDIT", actorType: "OPS", actorId: "must-be-stripped", subsystem: "SYSTEM", actionType: "ACTOR_OPS_REGRESSION", entityType: "SYSTEM", entityId: "actor-test", entityLabel: "Actor test", summary: "Ops actor regression fixture.", targetRoute: "/admin/audit" });
  audits = await listAdminAudit({ page: 1, pageSize: 100 });
  const system = audits.records.find((item) => item.actionType === "ACTOR_SYSTEM_REGRESSION");
  const ops = audits.records.find((item) => item.actionType === "ACTOR_OPS_REGRESSION");
  assert.equal(system?.actorType, "SYSTEM"); assert.equal(system?.actorId, undefined);
  assert.equal(ops?.actorType, "OPS"); assert.equal(ops?.actorId, undefined);
  console.log("Mustek authenticated actor PostgreSQL integration tests passed.");
} finally {
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]); }
  await closePostgres();
}
