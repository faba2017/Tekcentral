import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getInternalProduct } from "./internalProductRepository.js";
import { listPricingProposals } from "./pricingProposalRepository.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { deriveScoopLaunchReadiness, latestScoopProposal } from "./suppliers/scoop/scoopLaunchReadiness.js";
import { findIngestedPublicImage, ingestPublicProductImage } from "./publicImageIngestion.js";
import { preparePublicationContentDefaults, type PublicationContentOrigins } from "./publicationContentDefaults.js";
import { hasMaterialPublicChanges } from "./publicationSnapshot.js";

export type PublicationState = "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED";
export interface PublicProductSnapshot {
  id: string; slug: string; sku?: string; name: string; brand: string; model?: string;
  category: string; categorySlug: string; subcategory?: string; price: number; currency: "ZAR";
  shortDescription: string; description?: string; images: string[];
  specifications: { name: string; value: string }[]; seoTitle?: string; seoDescription?: string;
  deliveryDisplay?: string; vatRate: number; availabilityDisplay: string; stockPolicySnapshot: "AUTHORITATIVE_CURRENT_STOCK";
}
export interface PublicationVersion {
  id: string; version: number; internalProductId: string; createdAt: string; createdBy: string;
  status: "PUBLISHED"; publishedAt: string; publishedBy: string;
  pricingProposalId: string; mappingId: string; supplierCode: string; supplierSku: string;
  sourceReadinessSnapshot: { status: string; blockers: string[]; checkedAt: string };
  sourceMappingSnapshot: { mappingId: string; supplierCode: string; supplierSku: string; verifiedAt?: string };
  imageProvenance?: { originalUrl: string; sourceType: string; capturedAt: string; contentType: string; bytes: number };
  contentOrigins?: PublicationContentOrigins;
  previousVersionId?: string; rollbackSourceVersionId?: string; idempotencyKey: string;
  snapshot: PublicProductSnapshot;
}
export interface ProductPublication {
  internalProductId: string; state: Exclude<PublicationState, "READY_FOR_PUBLISH_REVIEW" | "NOT_PUBLISHED">;
  activeVersionId?: string; updatedAt: string; versions: PublicationVersion[];
}
export interface PublicationAuditEntry { id: string; internalProductId: string; action: "PUBLISHED" | "UNPUBLISHED" | "ROLLED_BACK"; actor: string; at: string; versionId?: string; }
export interface PublicationEligibility { canPublish: boolean; blockers: string[]; warnings: string[]; }
interface Store { version: 1; publications: ProductPublication[]; audit: PublicationAuditEntry[]; }
const path = () => resolve(process.cwd(), ".data", "product-publications.json");
async function readStore(): Promise<Store> { try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.publications) ? value : { version: 1, publications: [], audit: [] }; } catch { return { version: 1, publications: [], audit: [] }; } }
async function writeStore(store: Store) { const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function publicationContext(internalProductId: string) {
  const product = await getInternalProduct(internalProductId);
  if (!product) throw new Error("Internal product not found.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.productId === internalProductId && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified supplier mapping is required before publication.");
  if (mapping.supplierCode !== "SCOOP") throw new Error("Publication readiness is not available for this supplier yet.");
  const offer = await getScoopCatalogueProduct(mapping.supplierSku);
  if (!offer) throw new Error("Mapped supplier offer not found.");
  const proposal = latestScoopProposal(await listPricingProposals(), offer.supplierSku, internalProductId);
  const readiness = deriveScoopLaunchReadiness({ product: offer, mapping, proposal });
  return { product, mapping, offer, proposal, readiness };
}

export async function getPublicationSummary(internalProductId: string) {
  const record = (await readStore()).publications.find((item) => item.internalProductId === internalProductId);
  if (record) return { state: record.state as PublicationState, activeVersionId: record.activeVersionId, versionCount: record.versions.length, slug: record.versions.find((item) => item.id === record.activeVersionId)?.snapshot.slug };
  try { const context = await publicationContext(internalProductId); return { state: (context.readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "READY_FOR_PUBLISH_REVIEW" : "NOT_PUBLISHED") as PublicationState, versionCount: 0 }; }
  catch { return { state: "NOT_PUBLISHED" as PublicationState, versionCount: 0 }; }
}

export async function getPublicationReview(internalProductId: string) {
  const context = await publicationContext(internalProductId);
  const store = await readStore();
  const publication = store.publications.find((item) => item.internalProductId === internalProductId);
  const active = publication?.versions.find((item) => item.id === publication.activeVersionId);
  const defaults: PublicProductSnapshot = active?.snapshot ?? {
    id: context.product.id, slug: context.product.slug, sku: context.product.sku, name: context.product.name,
    brand: context.product.brand, model: context.product.model, category: context.product.category,
    categorySlug: context.product.categorySlug, subcategory: context.product.subcategory,
    price: context.proposal?.proposedSellingPriceInclVat ?? 0, currency: "ZAR",
    shortDescription: context.product.shortDescription, description: context.product.description,
    images: context.product.images, specifications: [], vatRate: context.proposal?.vatRatePercent ?? 15,
    availabilityDisplay: "Current stock status", stockPolicySnapshot: "AUTHORITATIVE_CURRENT_STOCK",
  };
  const supplierSourceImageUrl = context.product.provenance.sourceImage?.originalUrl ?? active?.imageProvenance?.originalUrl ?? defaults.images[0];
  const storedImage = await findIngestedPublicImage({ internalProductId, sourceUrl: supplierSourceImageUrl?.startsWith("https://") ? supplierSourceImageUrl : undefined }) ?? await findIngestedPublicImage({ internalProductId });
  const sourceImageUrl = storedImage?.sourceImageUrl ?? supplierSourceImageUrl;
  const existingControlledUrl = defaults.images[0]?.startsWith("/api/public/assets/products/") ? defaults.images[0] : undefined;
  const publicImageUrl = storedImage?.publicUrl ?? existingControlledUrl;
  const prepared = preparePublicationContentDefaults({ product: context.product, draft: { ...defaults, images: publicImageUrl ? [publicImageUrl, ...defaults.images.slice(1)] : defaults.images, price: context.proposal?.status === "APPROVED" ? context.proposal.proposedSellingPriceInclVat ?? 0 : 0 }, origins: active?.contentOrigins });
  const draft = prepared.draft;
  const eligibility = derivePublicationEligibility({
    draft,
    readinessStatus: context.readiness.status,
    readinessBlockers: context.readiness.blockers,
    hasApprovedPrice: context.proposal?.status === "APPROVED" && context.proposal.proposedSellingPriceInclVat !== undefined,
    publicImageUrl,
  });
  return {
    state: publication?.state ?? (context.readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "READY_FOR_PUBLISH_REVIEW" : "NOT_PUBLISHED"),
    readiness: context.readiness, currentApprovedProposal: context.proposal?.status === "APPROVED" ? { id: context.proposal.id, price: context.proposal.proposedSellingPriceInclVat } : undefined,
    draft,
    image: { sourceImageUrl, publicImageUrl, provenance: storedImage?.provenance ?? active?.imageProvenance },
    contentOrigins: prepared.origins,
    eligibility,
    hasUnpublishedChanges: active ? hasMaterialPublicChanges(draft, active.snapshot) : true,
    activeVersionId: publication?.activeVersionId, versions: publication?.versions ?? [],
    audit: store.audit.filter((item) => item.internalProductId === internalProductId),
    internalSource: { supplierCode: context.mapping.supplierCode, supplierSku: context.offer.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: context.proposal?.costSnapshot.supplierCostExVat, grossProfit: context.proposal?.grossProfit, grossMarginPercent: context.proposal?.grossMarginPercent, availability: context.offer.availability, lastRefreshedAt: context.offer.lastSyncedAt, stockSource: context.offer.sourceObservations.find((item) => item.active)?.sourceType, logisticsSource: context.offer.logisticsMetadata?.source },
  };
}

export function derivePublicationEligibility(input: { draft: PublicProductSnapshot; readinessStatus: string; readinessBlockers: string[]; hasApprovedPrice: boolean; publicImageUrl?: string }): PublicationEligibility {
  const blockers = input.readinessStatus === "READY_FOR_PUBLISH_REVIEW" ? [] : input.readinessBlockers.map((item) => item.replace(/_/g, " "));
  if (!input.hasApprovedPrice) blockers.push("A current approved price is required.");
  if (!input.draft.name.trim()) blockers.push("Public title is required.");
  if (!input.draft.slug.trim()) blockers.push("Public slug is required.");
  if (!input.draft.brand.trim()) blockers.push("Brand is required.");
  if (!input.draft.category.trim() || !input.draft.categorySlug.trim()) blockers.push("Public category and category slug are required.");
  if (!input.publicImageUrl?.startsWith("/api/public/assets/products/")) blockers.push("TekCentral-controlled primary image is missing.");
  const warnings = [
    input.draft.shortDescription.trim().toLowerCase() === input.draft.name.trim().toLowerCase() ? "Short description is identical to the product title." : "",
    !input.draft.description?.trim() ? "Long description is empty." : "",
    !input.draft.specifications.some((item) => item.name.trim() && item.value.trim()) ? "No public specifications have been added." : "",
    !input.draft.seoTitle?.trim() ? "SEO title is empty." : "",
    !input.draft.seoDescription?.trim() ? "SEO description is empty." : "",
    !input.draft.deliveryDisplay?.trim() ? "Delivery display wording is empty." : "",
  ].filter(Boolean);
  return { canPublish: blockers.length === 0, blockers, warnings };
}

function validateSnapshot(snapshot: PublicProductSnapshot) {
  if (!snapshot.name.trim() || !snapshot.slug.trim() || !snapshot.brand.trim() || !snapshot.category.trim() || !snapshot.categorySlug.trim()) throw new Error("Title, slug, brand and category are required.");
  if (!snapshot.images[0]) throw new Error("A primary image is required.");
}

export async function publishProduct(input: { internalProductId: string; pricingProposalId: string; idempotencyKey: string; actor?: string; imageProvenance?: PublicationVersion["imageProvenance"]; contentOrigins?: PublicationContentOrigins; snapshot: Omit<PublicProductSnapshot, "id" | "price" | "currency"> }) {
  const context = await publicationContext(input.internalProductId);
  if (context.readiness.status !== "READY_FOR_PUBLISH_REVIEW") throw new Error(`Product is not ready for publication: ${context.readiness.blockers.join(", ")}`);
  if (!context.proposal || context.proposal.status !== "APPROVED" || context.proposal.id !== input.pricingProposalId || context.proposal.proposedSellingPriceInclVat === undefined) throw new Error("The current approved pricing proposal is required.");
  const store = await readStore();
  const existingByKey = store.publications.flatMap((item) => item.versions).find((item) => item.internalProductId === input.internalProductId && item.idempotencyKey === input.idempotencyKey);
  if (existingByKey) return existingByKey;
  const snapshot: PublicProductSnapshot = { ...input.snapshot, id: context.product.id, price: context.proposal.proposedSellingPriceInclVat, currency: "ZAR" };
  validateSnapshot(snapshot);
  if (!snapshot.images[0].startsWith("/api/public/assets/products/")) throw new Error("Publish requires a TekCentral-controlled primary image. Ingest the source image first.");
  const publication = store.publications.find((item) => item.internalProductId === input.internalProductId);
  const activeVersion = publication?.versions.find((item) => item.id === publication.activeVersionId);
  if (publication?.state === "PUBLISHED" && activeVersion && !hasMaterialPublicChanges(snapshot, activeVersion.snapshot)) throw new Error("No public changes to publish.");
  const duplicateSlug = store.publications.flatMap((item) => item.versions).find((item) => item.internalProductId !== input.internalProductId && item.snapshot.slug === snapshot.slug);
  if (duplicateSlug) throw new Error("Public product slug is already in use.");
  if (!context.mapping.id) throw new Error("Verified mapping identity is missing.");
  const now = new Date().toISOString(); const actor = input.actor?.trim() || "Admin staff";
  let nextPublication = publication;
  const version: PublicationVersion = { id: id("publication"), version: (nextPublication?.versions.length ?? 0) + 1, internalProductId: input.internalProductId, createdAt: now, createdBy: actor, status: "PUBLISHED", publishedAt: now, publishedBy: actor, pricingProposalId: context.proposal.id, mappingId: context.mapping.id, supplierCode: context.mapping.supplierCode, supplierSku: context.offer.supplierSku, sourceReadinessSnapshot: { status: context.readiness.status, blockers: [...context.readiness.blockers], checkedAt: now }, sourceMappingSnapshot: { mappingId: context.mapping.id, supplierCode: context.mapping.supplierCode, supplierSku: context.offer.supplierSku, verifiedAt: context.mapping.verifiedAt }, imageProvenance: input.imageProvenance, contentOrigins: input.contentOrigins, previousVersionId: nextPublication?.activeVersionId, idempotencyKey: input.idempotencyKey, snapshot };
  if (nextPublication) { nextPublication = { ...nextPublication, state: "PUBLISHED", activeVersionId: version.id, updatedAt: now, versions: [...nextPublication.versions, version] }; store.publications = store.publications.map((item) => item.internalProductId === input.internalProductId ? nextPublication! : item); }
  else { nextPublication = { internalProductId: input.internalProductId, state: "PUBLISHED", activeVersionId: version.id, updatedAt: now, versions: [version] }; store.publications.push(nextPublication); }
  store.audit.unshift({ id: id("publication-audit"), internalProductId: input.internalProductId, action: "PUBLISHED", actor, at: now, versionId: version.id });
  await writeStore(store); return version;
}

export async function unpublishProduct(internalProductId: string, actor = "Admin staff") { const store = await readStore(); const publication = store.publications.find((item) => item.internalProductId === internalProductId); if (!publication) throw new Error("Published product not found."); if (publication.state === "UNPUBLISHED") return publication; const now = new Date().toISOString(); publication.state = "UNPUBLISHED"; publication.updatedAt = now; store.audit.unshift({ id: id("publication-audit"), internalProductId, action: "UNPUBLISHED", actor, at: now, versionId: publication.activeVersionId }); await writeStore(store); return publication; }

export async function rollbackProduct(input: { internalProductId: string; sourceVersionId: string; pricingProposalId: string; idempotencyKey: string; actor?: string }) {
  const store = await readStore(); const publication = store.publications.find((item) => item.internalProductId === input.internalProductId); const source = publication?.versions.find((item) => item.id === input.sourceVersionId); if (!publication || !source) throw new Error("Publication version not found.");
  const context = await publicationContext(input.internalProductId); if (!context.proposal || context.proposal.status !== "APPROVED" || context.proposal.id !== input.pricingProposalId) throw new Error("The current approved pricing proposal is required.");
  if (context.proposal.proposedSellingPriceInclVat !== source.snapshot.price) throw new Error("Rollback blocked: the current approved price does not match this version.");
  const sourceImage = source.snapshot.images[0];
  const ingested = sourceImage?.startsWith("https://") ? await ingestPublicProductImage({ internalProductId: input.internalProductId, sourceUrl: sourceImage, sourceType: source.supplierCode }) : undefined;
  const rollbackSnapshot = ingested ? { ...source.snapshot, images: [ingested.publicUrl, ...source.snapshot.images.slice(1)] } : source.snapshot;
  const version = await publishProduct({ internalProductId: input.internalProductId, pricingProposalId: input.pricingProposalId, idempotencyKey: input.idempotencyKey, actor: input.actor, imageProvenance: ingested?.provenance ?? source.imageProvenance, contentOrigins: source.contentOrigins, snapshot: rollbackSnapshot });
  const updated = await readStore(); const target = updated.publications.find((item) => item.internalProductId === input.internalProductId)!; const index = target.versions.findIndex((item) => item.id === version.id); target.versions[index] = { ...target.versions[index], rollbackSourceVersionId: source.id }; const audit = updated.audit.find((item) => item.versionId === version.id); if (audit) audit.action = "ROLLED_BACK"; await writeStore(updated); return target.versions[index];
}

function stockStatus(availability?: string, totalStock?: number) { if (availability === "STALE" || availability === "UNKNOWN") return "unknown" as const; if (typeof totalStock === "number") return totalStock > 0 ? "in-stock" as const : "out-of-stock" as const; return availability === "AVAILABLE" ? "in-stock" as const : availability === "OUT_OF_STOCK" ? "out-of-stock" as const : "unknown" as const; }
export async function listPublicProducts() {
  const store = await readStore(); const result = [];
  for (const publication of store.publications.filter((item) => item.state === "PUBLISHED" && item.activeVersionId)) {
    const version = publication.versions.find((item) => item.id === publication.activeVersionId); if (!version) continue;
    const offer = version.supplierCode === "SCOOP" ? await getScoopCatalogueProduct(version.supplierSku) : undefined;
    result.push({ ...version.snapshot, isDemoPrice: false, stockStatus: stockStatus(offer?.availability, offer?.totalStock), catalogueSource: "PUBLISHED" as const });
  }
  return result;
}
export async function getPublicProductBySlug(slug: string) { return (await listPublicProducts()).find((item) => item.slug === slug); }
export async function getPublicationPreview(internalProductId: string) {
  const publication = (await readStore()).publications.find((item) => item.internalProductId === internalProductId);
  const version = publication?.versions.find((item) => item.id === publication.activeVersionId) ?? publication?.versions.at(-1);
  if (!publication || !version) return undefined;
  const offer = version.supplierCode === "SCOOP" ? await getScoopCatalogueProduct(version.supplierSku) : undefined;
  const storedImage = await findIngestedPublicImage({ internalProductId });
  const snapshot = storedImage ? { ...version.snapshot, images: [storedImage.publicUrl, ...version.snapshot.images.slice(1)] } : version.snapshot;
  return {
    product: { ...snapshot, isDemoPrice: false, stockStatus: stockStatus(offer?.availability, offer?.totalStock), catalogueSource: "PUBLISHED" as const },
    publicationState: publication.state,
    versionNumber: version.version,
  };
}
export async function getPublishedBackendProduct(productId: string) { const item = (await listPublicProducts()).find((product) => product.id === productId); return item ? { productId: item.id, slug: item.slug, sku: item.sku, name: item.name, brand: item.brand, price: item.price, stockStatus: item.stockStatus } : undefined; }
