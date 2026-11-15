import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyEffectivePromotions,
  getAdminMerchandising,
  resolveHomepage,
  saveHomepageSection,
  savePromotion,
  setMerchandisingStorePathForTests,
  type PublicProductLike,
} from "../merchandisingService.js";

const products: PublicProductLike[] = [
  { id: "prod-router", name: "Office Router", sku: "RTR-1", price: 1_500, categoryId: "CAT_NETWORKING", availability: { purchasable: true } },
  { id: "prod-ap", name: "Office Access Point", sku: "AP-1", price: 1_000, categoryId: "CAT_NETWORKING", availability: { purchasable: true } },
  { id: "prod-laptop", name: "Business Laptop", sku: "PC-1", price: 12_000, categoryId: "CAT_COMPUTERS", availability: { purchasable: false } },
];

async function main() {
  const directory = await mkdtemp(join(tmpdir(), "tekcentral-merchandising-"));
  setMerchandisingStorePathForTests(join(directory, "merchandising.json"));
  try {
    const initial = await resolveHomepage(products);
    const featured = initial.sections.find((section) => section.key === "featured");
    assert.equal(featured, undefined, "publishing alone must not feature a Product");

    const admin = await getAdminMerchandising(products);
    const featuredConfig = admin.sections.find((section) => section.key === "featured");
    assert.ok(featuredConfig);
    await saveHomepageSection({ ...featuredConfig, productIds: ["prod-ap", "prod-router"] }, products);
    const configured = await resolveHomepage(products);
    const configuredFeatured = configured.sections.find((section) => section.key === "featured");
    assert.ok(configuredFeatured?.type === "PRODUCT_LIST");
    assert.deepEqual(configuredFeatured.products.map((product) => product.id), ["prod-ap", "prod-router"]);

    const essentialsConfig = admin.sections.find((section) => section.key === "essentials");
    assert.ok(essentialsConfig);
    await saveHomepageSection({ ...essentialsConfig, productIds: ["prod-router"] }, products);
    const fallback = await resolveHomepage(products);
    const configuredEssentials = fallback.sections.find((section) => section.key === "essentials");
    assert.ok(configuredEssentials?.type === "PRODUCT_LIST");
    assert.deepEqual(configuredEssentials.products.map((product) => product.id), ["prod-router", "prod-ap"]);

    await assert.rejects(
      () => saveHomepageSection({ ...featuredConfig, productIds: ["not-published"] }, products),
      /UNPUBLISHED_PRODUCT/,
    );

    const promotion = {
      id: "spring-sale",
      name: "Spring sale",
      internalReference: "SPRING-1",
      enabled: true,
      startsAt: "2026-10-20T00:00:00.000Z",
      endsAt: "2026-11-20T00:00:00.000Z",
      badgeText: "Sale",
      publicLabel: "Limited-time price",
      products: [{ productId: "prod-router", promotionalPrice: 1_250 }],
    };
    await savePromotion(promotion, products);
    assert.equal((await applyEffectivePromotions(products, new Date("2026-10-19T23:59:59.000Z")))[0].price, 1_500);
    const active = await applyEffectivePromotions(products, new Date("2026-10-26T12:00:00.000Z"));
    assert.equal(active[0].price, 1_250);
    assert.equal(active[0].regularPrice, 1_500);
    assert.equal(active[0].promotion?.badgeText, "Sale");
    assert.equal((await applyEffectivePromotions(products, new Date("2026-11-20T00:00:00.000Z")))[0].price, 1_500);

    const cheaperRegular = products.map((product) => product.id === "prod-router" ? { ...product, price: 1_200 } : product);
    assert.equal((await applyEffectivePromotions(cheaperRegular, new Date("2026-10-26T12:00:00.000Z")))[0].price, 1_200, "invalid promotion drift must not override the regular price");

    await assert.rejects(
      () => savePromotion({ ...promotion, id: "overlap", products: [{ productId: "prod-router", promotionalPrice: 1_200 }] }, products),
      /PROMOTION_CONFLICT/,
    );
    await assert.rejects(
      () => savePromotion({ ...promotion, id: "bad-price", enabled: false, products: [{ productId: "prod-router", promotionalPrice: 1_500 }] }, products),
      /INVALID_PROMOTIONAL_PRICE/,
    );

    console.log("Merchandising tests passed");
  } finally {
    setMerchandisingStorePathForTests();
    await rm(directory, { recursive: true, force: true });
  }
}

void main();
