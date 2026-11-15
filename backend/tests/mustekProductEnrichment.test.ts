import assert from "node:assert/strict";
import { contentIntelligence } from "../productConfigurationIntelligence.js";
import { deriveMustekMsiFreshness, resolveMustekProductEnrichment } from "../suppliers/mustek/mustekProductEnrichment.js";
import type { MustekMsiProductEvidence, MustekMsiSourceVersion } from "../suppliers/mustek/mustekMsiEvidenceParser.js";
import type { MustekNormalizedOffer } from "../suppliers/mustek/mustekOfferNormalization.js";
import type { SupplierProductMapping } from "../types.js";

const source: MustekMsiSourceVersion = { sourceId: "source-msi", sourceVersionId: "version-1", sourceFingerprint: "source-fingerprint-1", retrievedAt: "2026-11-01T08:00:00.000Z" };
const record: MustekMsiProductEvidence = {
  supplier: "MUSTEK", manufacturerContext: "MSI", supplierSku: "MSI-EXACT-1", sourceRecordIndex: 0, sourceRecordReference: "products[0]",
  categoryEvidence: { value: "Gaming notebooks", authority: "ADVISORY", sourceField: "category" },
  content: { series: "Vector 16 HX", summary: { Processor: "Intel Core i7" }, notes: ["144 Hz display"], tag: "New" },
  specifications: [{ group: "Processor", key: "Processor", value: "Intel Core i7", sourceField: "specs.Processor" }, { group: "Memory", key: "Memory", value: "16 GB", sourceField: "specs.Memory" }],
  embeddedImage: { access: "PRIVATE", kind: "EMBEDDED_DATA_URI", mediaType: "image/png", contentFingerprint: "private-image", byteSize: 100, sourceField: "imageData" },
  sourceDisplayPrice: { value: 19999, authority: "NON_AUTHORITATIVE", sourceField: "price" },
  provenance: { ...source, sourceKind: "HTML_CATALOGUE", sourceRecordReference: "products[0]", objectKey: "private/secret-object" },
  logicalIdentityFingerprint: "logical-1", evidenceFingerprint: "evidence-1",
};
const offer: MustekNormalizedOffer = {
  id: "MUSTEK:MSI-EXACT-1", supplierId: "MUSTEK", supplierIdentity: "MUSTEK:MSI-EXACT-1", supplierSku: "MSI-EXACT-1", description: "MSI Vector 16 HX", brand: "MSI", cost: 100, currency: "ZAR", taxBasis: "UNKNOWN", availability: "UNKNOWN", fulfilmentCapability: "UNKNOWN", mappingStatus: "UNMAPPED", classification: "SAFE", reviewReasons: [], normalizedOfferFingerprint: "offer-fingerprint", observedAt: source.retrievedAt, updatedAt: source.retrievedAt, provenance: { contributingEvidenceIds: ["commercial-1"], observations: [] },
};
const mapping = (status: SupplierProductMapping["status"] = "VERIFIED", productId = "product-1", supplierSku = offer.supplierSku): SupplierProductMapping => ({ id: "mapping-1", productId, supplierCode: "MUSTEK", supplierSku, supplierOfferId: offer.id, supplierProductId: offer.supplierSku, supplierProductSku: offer.supplierSku, status, createdAt: source.retrievedAt, updatedAt: source.retrievedAt });
const resolve = (mappings: SupplierProductMapping[], records = [record], offers = [offer], productId = "product-1", currentSource: MustekMsiSourceVersion | undefined = source) => resolveMustekProductEnrichment({ productId, records, offers, mappings, currentSource });

const exact = resolve([mapping()]);
assert.ok(exact);
assert.equal(exact.freshness, "FRESH");
assert.equal(exact.enrichment.evidence.title.sourceId, source.sourceId);
assert.equal(exact.enrichment.evidence.title.sourceVersionId, source.sourceVersionId);
assert.equal(exact.enrichment.evidence.title.sourceVersionFingerprint, source.sourceFingerprint);
assert.equal(exact.enrichment.title, "MSI Vector 16 HX");
assert.equal(exact.enrichment.category, undefined, "advisory category must not enter canonical taxonomy suggestions");
assert.equal(exact.enrichment.imageCandidates.length, 1, "exact private media should be exposed as a controlled review candidate");
assert.equal(exact.enrichment.imageCandidates[0]?.url, undefined, "private evidence must not expose a browser-fetchable URL");
assert.equal(exact.enrichment.imageCandidates[0]?.sourceType, "PRIVATE_SUPPLIER_EVIDENCE");
assert.equal(exact.enrichment.imageCandidates[0]?.privateEvidence?.contentFingerprint, record.embeddedImage?.contentFingerprint);
assert.equal(exact.enrichment.imageCandidates[0]?.id, resolve([mapping()])?.enrichment.imageCandidates[0]?.id, "candidate identity must be deterministic");
assert.equal(JSON.stringify(exact.enrichment).includes("private/secret-object"), false);
assert.equal(JSON.stringify(exact.enrichment).includes("data:image"), false);
assert.equal(JSON.stringify(exact.enrichment).includes("19999"), false, "non-authoritative display price must remain isolated");
assert.equal(exact.enrichment.specifications.find((item) => item.name === "Memory")?.evidence.sourceField, "specs.Memory");

for (const status of ["SUGGESTED", "REJECTED", "UNMAPPED", "REVIEW_REQUIRED"] as const) assert.equal(resolve([mapping(status)]), undefined, `${status} mapping must not attach evidence`);
assert.equal(resolve([]), undefined);
assert.equal(resolve([mapping("VERIFIED", "product-2")]), undefined, "evidence must not attach to another Product");
assert.equal(resolve([mapping("VERIFIED", "product-1", "FUZZY-SKU")]), undefined, "title similarity cannot replace exact SKU identity");
assert.equal(resolve([{ ...mapping(), supplierOfferId: "MUSTEK:OTHER" }]), undefined, "exact SupplierOffer identity is required");

const recommendations = contentIntelligence(exact.enrichment, { name: "Staff title", shortDescription: "Staff short copy", description: "Staff overview", specifications: [{ name: "Processor", value: "Intel Core i5", origin: "STAFF_AUTHORED" }] });
assert.ok(recommendations.some((item) => item.type === "SPECIFICATION" && item.confidence === "CONFLICT"));
assert.ok(recommendations.some((item) => item.type === "SPECIFICATION" && item.confidence === "STRONG"));
assert.equal(recommendations.every((item) => item.freshness === "FRESH"), true);
const redundant = contentIntelligence(exact.enrichment, { name: exact.enrichment.title!, shortDescription: exact.enrichment.shortDescription!, description: exact.enrichment.longDescription, specifications: exact.enrichment.specifications.map((item) => ({ name: item.name, value: item.value })) });
assert.equal(redundant.length, 0);

const staleSource = { ...source, sourceVersionId: "version-2", sourceFingerprint: "source-fingerprint-2" };
assert.equal(deriveMustekMsiFreshness(source, staleSource), "STALE");
assert.equal(deriveMustekMsiFreshness(source, undefined), "UNKNOWN");
const stale = resolve([mapping()], [record], [offer], "product-1", staleSource)!;
assert.equal(contentIntelligence(stale.enrichment, { name: "Staff title", shortDescription: "Staff copy", specifications: [] }).every((item) => item.freshness === "STALE"), true);
assert.equal(resolve([mapping()])?.enrichment.fingerprint, resolve([mapping()])?.enrichment.fingerprint, "same source facts must remain deterministic");
const changed = resolve([mapping()], [{ ...record, content: { ...record.content, notes: ["Changed source fact"] }, evidenceFingerprint: "evidence-2" }])!;
assert.notEqual(changed.enrichment.fingerprint, exact.enrichment.fingerprint);

const staffDraft = { name: "Staff title", shortDescription: "Staff short copy", description: "Staff overview", specifications: [{ name: "Processor", value: "Staff-selected value", origin: "STAFF_AUTHORED" }] };
const before = JSON.stringify(staffDraft);
contentIntelligence(changed.enrichment, staffDraft);
assert.equal(JSON.stringify(staffDraft), before, "read-time recommendations must not mutate staff content");
assert.equal(resolve([mapping()], [])?.enrichment, undefined, "disappearing evidence must not manufacture replacement content");

console.log("Mustek shared Product enrichment adapter tests passed.");
