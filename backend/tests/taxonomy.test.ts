import assert from "node:assert/strict";
import { applyVerifiedSupplierCategoryMapping, normalizeSupplierSourcePath, suggestSupplierCategoryMapping } from "../supplierCategoryMappingRepository.js";
import { findTaxonomyCategory, legacyCategoryAliases, productTaxonomy, resolveProductTaxonomy, taxonomyPath } from "../../src/lib/product-taxonomy.js";
import { suggestCanonicalCategory } from "../categorySuggestionService.js";
import { MAX_PRODUCT_IMAGES, moveProductImage, normalizeProductImages, publicProductMedia } from "../../src/lib/product-media.js";
import { bootstrapTaxonomyNodes } from "../canonicalTaxonomyRepository.js";
import { getCanonicalTaxonomyTree } from "../canonicalTaxonomyService.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

assert.equal(productTaxonomy.length, 13);
assert.equal(new Set(productTaxonomy.map((item) => item.id)).size, 13);
assert.equal(new Set(productTaxonomy.map((item) => item.slug)).size, 13);
assert.ok(productTaxonomy.every((item) => item.children.length > 0));
assert.equal(legacyCategoryAliases["printing-office"].categorySlug, "office-business-technology");
assert.equal(findTaxonomyCategory("security")?.slug, "security-surveillance");

const bootstrapNodes = bootstrapTaxonomyNodes();
assert.ok(bootstrapNodes.length > productTaxonomy.length);
assert.equal(new Set(bootstrapNodes.map((node) => node.id)).size, bootstrapNodes.length);
assert.ok(bootstrapNodes.every((node) => node.revision === 1 && node.status === "ACTIVE"));
for (const category of productTaxonomy) {
  const migrated = bootstrapNodes.find((node) => node.id === category.id);
  assert.equal(migrated?.slug, category.slug, `bootstrap preserves ${category.id}`);
}
const canonicalTree = await getCanonicalTaxonomyTree({ includeInactive: true });
assert.ok(canonicalTree.some((node) => node.slug === "computer-components"));
const components = canonicalTree.find((node) => node.slug === "computer-components");
assert.ok(components?.children.some((node) => node.slug === "cpus"));

const workspaceSource = await readFile(resolve(process.cwd(), "src/components/admin/ProductConfigurationWorkspace.tsx"), "utf8");
assert.match(workspaceSource, /Canonical category/);
assert.match(workspaceSource, /Canonical subcategory/);
assert.match(workspaceSource, /Canonical Product type/);
assert.match(workspaceSource, /taxonomy\.manage/);
const taxonomyAdminSource = await readFile(resolve(process.cwd(), "src/pages/admin/AdminTaxonomyPage.tsx"), "utf8");
assert.match(taxonomyAdminSource, /Move/);
assert.match(taxonomyAdminSource, /Historical publication versions remain unchanged/);
for (const runtimeFile of [
  "src/state/catalogue.tsx",
  "src/lib/catalogue.ts",
  "src/pages/admin/AdminProductsPage.tsx",
  "src/pages/admin/AdminMerchandisingPage.tsx",
  "backend/internalProductRepository.ts",
  "backend/productPublicationRepository.ts",
  "backend/merchandisingService.ts",
  "backend/seoService.ts",
  "backend/zeus/catalogueSearch.ts",
  "backend/suppliers/tekcentral/tekcentralManualProductOperations.ts",
  "backend/suppliers/scoop/scoopProductCreation.ts",
  "backend/suppliers/cj/cjLaunchPipeline.ts",
]) {
  const runtimeSource=(await readFile(resolve(process.cwd(), runtimeFile), "utf8")).split("\n").filter((line)=>!line.startsWith("import type ")).join("\n");
  assert.doesNotMatch(runtimeSource, /from ["'][^"']*product-taxonomy/, `${runtimeFile} must use the runtime registry`);
}

const cases = [
  ["Managed network switch", "networking", "switches", "managed-switches"],
  ["Cat6 Ethernet cable", "cables-connectivity", "network-cables", "cat6"],
  ["Fibre patch lead", "cables-connectivity", "fibre-cables", undefined],
  ["Yealink T54W IP Phone", "office-business-technology", "business-communication", "ip-phones"],
  ["Grandstream HT812 VoIP ATA", "office-business-technology", "business-communication", "voip-gateways-atas"],
  ["Yealink CP965 Conference Phone", "office-business-technology", "business-communication", "conference-phones"],
  ["HP LaserJet multifunction printer", "office-business-technology", "printers", "multifunction-printers"],
  ["Thermal receipt printer", "office-business-technology", "pos-business-devices", "receipt-printers"],
  ["1TB Internal SSD", "storage", "internal-ssds", undefined],
  ["AMD Ryzen 7 5800X 8-Core AM4 CPU", "computer-components", "cpus", undefined],
] as const;
for (const [name, category, subcategory, productType] of cases) {
  const path = taxonomyPath(resolveProductTaxonomy({ name }));
  assert.equal(path.category?.slug, category, name);
  assert.equal(path.subcategory?.slug, subcategory, name);
  assert.equal(path.productType?.slug, productType, name);
}

const unknown = resolveProductTaxonomy({ name: "Unclear supplier item" });
assert.equal(unknown.taxonomyStatus, "UNMAPPED");
const suggestion = suggestSupplierCategoryMapping({ supplierId: "FUTURE_SUPPLIER", sourceCategoryLabel: "Business IP phones", productName: "SIP IP phone" });
assert.equal(suggestion.status, "REVIEW_REQUIRED");
assert.equal(taxonomyPath(suggestion).productType?.slug, "ip-phones");
const verified = { ...suggestion, status: "VERIFIED" as const, taxonomyStatus: "VERIFIED" as const };
assert.equal(applyVerifiedSupplierCategoryMapping(undefined, verified)?.taxonomyStatus, "VERIFIED");
assert.equal(applyVerifiedSupplierCategoryMapping({ ...unknown, taxonomyStatus: "VERIFIED" }, suggestion)?.taxonomyStatus, "VERIFIED");

for (const supplierId of ["SCOOP_TEST", "SYNTECH_TEST", "CJ_TEST", "TEKCENTRAL_TEST"]) {
  const result = await suggestCanonicalCategory({ supplierId, sourceCategoryLabel: "Wireless networking", productName: "Indoor wireless access point" });
  assert.ok(result.suggestedCategoryId);
  assert.equal(taxonomyPath({ categoryId: result.suggestedCategoryId!, subcategoryId: result.suggestedSubcategoryId, productTypeId: result.suggestedProductTypeId, taxonomyVersion: 1, taxonomyStatus: "REVIEW_REQUIRED" }).subcategory?.slug, "access-points");
  assert.notEqual(result.confidence, "NONE");
}
assert.equal((await suggestCanonicalCategory({ supplierId: "GENERIC_TEST", sourceCategoryLabel: "Accessories" })).confidence, "NONE");
assert.equal((await suggestCanonicalCategory({ supplierId: "GENERIC_TEST", sourceCategoryLabel: "Electronics" })).confidence, "NONE");
assert.equal(normalizeSupplierSourcePath("  Networking / Wireless  > Access Points "), "networking > wireless > access points");
assert.equal(normalizeSupplierSourcePath("Networking|Wireless→Access Points"), "networking > wireless > access points");
assert.notEqual(normalizeSupplierSourcePath("Networking > Access Points"), normalizeSupplierSourcePath("Networking > Routers"));

const normalizedImages = normalizeProductImages(["https://example.com/a.jpg", "https://example.com/a.jpg", "/api/public/assets/products/b.webp", "http://unsafe.test/c.jpg", ...Array.from({ length: 10 }, (_, index) => `https://example.com/${index}.jpg`)]);
assert.equal(normalizedImages.length, MAX_PRODUCT_IMAGES);
assert.equal(normalizedImages.includes("http://unsafe.test/c.jpg"), false);
assert.deepEqual(moveProductImage(["https://example.com/a.jpg", "https://example.com/b.jpg"], 1, 0), ["https://example.com/b.jpg", "https://example.com/a.jpg"]);
const media = publicProductMedia("Test Product", ["https://example.com/a.jpg", "https://example.com/b.jpg"]);
assert.equal(media.filter((item) => item.isPrimary).length, 1);
assert.equal(media[1].displayOrder, 1);
assert.match(media[1].altText, /view 2/);

console.log("Taxonomy tests passed.");
