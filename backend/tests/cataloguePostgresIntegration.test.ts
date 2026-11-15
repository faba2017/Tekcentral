import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closePostgres, query } from "../persistence/postgres.js";
import { importCatalogue, readLegacyCatalogue, verifyCatalogue } from "../persistence/catalogueMigration.js";
import { readCatalogueProducts, readPublicationStore, readRows, readSupplierStore, replaceCatalogueProducts, replaceMedia, replacePricing, replacePublicationStore, replaceSupplierStore } from "../persistence/catalogueRepository.js";
import { createPublicationDraftFromActiveVersion, getPublicationReview, listPublicProducts, publishSavedDraft, savePublicationDraft } from "../productPublicationRepository.js";
import { getProductOnboardingReadiness } from "../productOnboardingService.js";

const mode = process.argv[2];
if (mode === "snapshot") {
  const [products, publications, pricing, media, cj] = await Promise.all([readCatalogueProducts<Record<string, unknown>>(), readPublicationStore<Record<string, unknown>>(), readRows<Record<string, unknown>>("catalogue_pricing_proposals", "id"), readRows<Record<string, unknown>>("catalogue_media_records", "id"), readSupplierStore<Record<string, unknown>>("CJ")]);
  process.stdout.write(JSON.stringify({ product: products.find((row) => row.id === process.env.TEST_PRODUCT_ID), publications: publications.publications.length, pricing: pricing.some((row) => row.id === "catalogue-cross-process-price"), media: media.some((row) => row.publicUrl === "/api/public/assets/products/cross-process.jpg"), cj: cj.products.find((row) => row.supplierProductId === process.env.TEST_CJ_ID) })); await closePostgres(); process.exit(0);
}
const child = () => new Promise<string>((resolve, reject) => { const processChild = spawn(process.execPath, [process.argv[1], "snapshot"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] }); let out = ""; let error = ""; processChild.stdout.on("data", (value) => out += String(value)); processChild.stderr.on("data", (value) => error += String(value)); processChild.on("exit", (code) => code === 0 ? resolve(out) : reject(new Error(error))); });
const truncate = async () => { for (const table of ["catalogue_import_runs", "catalogue_media_records", "catalogue_merchandising_audit", "catalogue_promotions", "catalogue_merchandising_sections", "catalogue_pricing_proposals", "catalogue_category_mappings", "catalogue_product_mappings", "catalogue_supplier_offers", "catalogue_supplier_state", "catalogue_publication_audit", "catalogue_publication_drafts", "catalogue_publication_versions", "catalogue_publications", "catalogue_products"]) await query(`DELETE FROM ${table}`); };

await truncate(); const source = await readLegacyCatalogue(); const imported = await importCatalogue(source); assert.equal(imported.imported, true); assert.equal((await verifyCatalogue(source)).success, true);
const publicPayload = JSON.stringify(await listPublicProducts()); for (const forbidden of ["supplierCode", "supplierCost", "costSnapshot", "stockByWarehouse", "procurement"]) assert.equal(publicPayload.includes(forbidden), false, `public catalogue leaked ${forbidden}`);
const products = await readCatalogueProducts<Record<string, unknown>>(); const product = products[0]; assert.ok(product); product.launchSelection = { state: "SELECTED_FOR_LAUNCH", updatedAt: new Date().toISOString(), updatedBy: "Persistence test" }; await replaceCatalogueProducts(products);
const cj = await readSupplierStore<Record<string, unknown>>("CJ"); const cjProduct = cj.products[0]; assert.ok(cjProduct); cjProduct.persistenceTestMarker = "visible-cross-process"; await replaceSupplierStore("CJ", cj);
const pricing = await readRows<Record<string, unknown>>("catalogue_pricing_proposals", "id"); await replacePricing([...pricing, { ...pricing[0], id: "catalogue-cross-process-price", status: "DRAFT", generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
const publicationStore = await readPublicationStore<Record<string, unknown>>(); await replacePublicationStore(publicationStore);
const media = await readRows<Record<string, unknown>>("catalogue_media_records", "id"); const baseMedia = media[0]; assert.ok(baseMedia); await replaceMedia([...media, { ...baseMedia, publicUrl: "/api/public/assets/products/cross-process.jpg", sourceImageUrl: "https://example.test/cross-process.jpg", internalProductId: product.id, storedAt: new Date().toISOString() }]);
process.env.TEST_PRODUCT_ID = String(product.id); process.env.TEST_CJ_ID = String(cjProduct.supplierProductId); const snapshot = JSON.parse(await child()) as { product: Record<string, unknown>; pricing: boolean; media: boolean; cj: Record<string, unknown> }; assert.equal((snapshot.product.launchSelection as { state: string }).state, "SELECTED_FOR_LAUNCH"); assert.equal(snapshot.pricing, true); assert.equal(snapshot.media, true); assert.equal(snapshot.cj.persistenceTestMarker, "visible-cross-process");

const publication = source.publications.publications[0]; const version = (publication.versions as Record<string, unknown>[])[0]; const insert = () => query("INSERT INTO catalogue_publication_versions(id,product_id,version,status,published_at,idempotency_key,payload) VALUES($1,$2,$3,'PUBLISHED',now(),$4,$5::jsonb)", [`concurrent-${Math.random()}`, publication.internalProductId, 999, `concurrent-${Math.random()}`, JSON.stringify(version)]);
const outcomes = await Promise.allSettled([insert(), insert()]); assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1); assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text AS count FROM catalogue_publication_versions WHERE product_id=$1 AND version=999", [publication.internalProductId])).rows[0].count), 1);

let publicationReview: Awaited<ReturnType<typeof getPublicationReview>> | undefined;
let publicationProductId: string | undefined;
for (const candidate of source.publications.publications) {
  try {
    const candidateProductId = String(candidate.internalProductId);
    const review = await getPublicationReview(candidateProductId);
    if (review.state === "PUBLISHED" && review.currentApprovedProposal && review.eligibility.canPublish) { publicationReview = review; publicationProductId = candidateProductId; break; }
  } catch { /* Imported legacy rows may not all have a current supplier context. */ }
}
assert.ok(publicationReview, "Expected one imported published Product with current canonical publication evidence.");
assert.ok(publicationProductId);
const publicationProducts = await readCatalogueProducts<Record<string, unknown>>();
const publicationProduct = publicationProducts.find((item) => item.id === publicationProductId);
assert.ok(publicationProduct);
publicationProduct.taxonomyStatus = "VERIFIED";
await replaceCatalogueProducts(publicationProducts);
const historicalVersion = publicationReview.versions.find((item) => item.id === publicationReview.activeVersionId)!;
const historicalSnapshot = structuredClone(historicalVersion.snapshot);
const draft = await createPublicationDraftFromActiveVersion(publicationProductId, "PostgreSQL integration");
const changedSnapshot = {
  ...draft.snapshot,
  shortDescription: `${draft.snapshot.shortDescription} PostgreSQL publication validation.`,
  specifications: [...draft.snapshot.specifications, { name: "Persistence validation", value: "PostgreSQL", source: "STAFF" as const, origin: "STAFF_EDITED" as const }],
  documents: [...(draft.snapshot.documents ?? []), { type: "SPECIFICATION_SHEET" as const, title: "PostgreSQL validation sheet", url: "/api/public/assets/documents/postgres-validation.pdf", verified: true, filename: "postgres-validation.pdf", mimeType: "application/pdf" as const, size: 2048, source: "STAFF" as const, origin: "STAFF_EDITED" as const }],
};
await savePublicationDraft({ internalProductId: publicationProductId, snapshot: changedSnapshot, actor: "PostgreSQL integration" });
const published = await publishSavedDraft({ internalProductId: publicationProductId, pricingProposalId: publicationReview.currentApprovedProposal!.id, idempotencyKey: "postgres-publication-lifecycle", actor: "PostgreSQL integration" });
const publishedReview = await getPublicationReview(publicationProductId);
assert.equal(publishedReview.state, "PUBLISHED");
assert.equal(publishedReview.hasActiveDraft, false);
assert.equal(published.snapshot.specifications.some((item) => item.name === "Persistence validation" && item.value === "PostgreSQL"), true);
assert.equal(published.snapshot.documents?.some((item) => item.type === "SPECIFICATION_SHEET" && item.filename === "postgres-validation.pdf" && item.mimeType === "application/pdf" && item.size === 2048), true);
assert.deepEqual(publishedReview.versions.find((item) => item.id === historicalVersion.id)?.snapshot, historicalSnapshot);
const scoopStore = await readSupplierStore<Record<string, unknown>>("SCOOP");
const refreshedOffer = scoopStore.products.find((item) => item.supplierSku === published.supplierSku);
assert.ok(refreshedOffer);
const refreshedAt = new Date().toISOString();
refreshedOffer.lastSyncedAt = refreshedAt;
refreshedOffer.staleAt = undefined;
refreshedOffer.availability = "AVAILABLE";
refreshedOffer.sourceObservations = ((refreshedOffer.sourceObservations as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({ ...item, active: true, lastSeenAt: refreshedAt, lastSuccessfulRefreshAt: refreshedAt }));
await replaceSupplierStore("SCOOP", scoopStore);
const refreshedReview = await getPublicationReview(publicationProductId);
const refreshedPublicProduct = (await listPublicProducts()).find((item) => item.id === publicationProductId);
assert.equal(refreshedReview.availability.state, "IN_STOCK");
assert.equal(refreshedReview.availability.state, refreshedPublicProduct?.availability.state);
assert.equal(refreshedReview.availability.purchasable, refreshedPublicProduct?.availability.purchasable);
assert.equal(refreshedReview.versions.length, publishedReview.versions.length);
const onboarding = await getProductOnboardingReadiness(publicationProductId);
assert.equal(onboarding.completedStepCount, 12);
assert.equal(onboarding.totalApplicableStepCount, 12);
const nextDraft = await createPublicationDraftFromActiveVersion(publicationProductId, "PostgreSQL integration");
assert.equal(nextDraft.snapshot.shortDescription, published.snapshot.shortDescription);
assert.equal((await getPublicationReview(publicationProductId)).hasActiveDraft, true);
assert.deepEqual((await getPublicationReview(publicationProductId)).versions.find((item) => item.id === historicalVersion.id)?.snapshot, historicalSnapshot);

await closePostgres(); const configured = process.env.DATABASE_URL; process.env.DATABASE_URL = "postgres://tekcentral:local-development-only@127.0.0.1:59999/tekcentral_catalogue_test"; await assert.rejects(() => readCatalogueProducts()); await assert.rejects(() => replacePricing([])); process.env.DATABASE_URL = configured; await closePostgres(); process.env.DATABASE_URL = configured; await truncate(); await closePostgres();
console.log("Catalogue PostgreSQL multi-instance integration tests passed.");
