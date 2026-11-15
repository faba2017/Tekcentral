import { getCanonicalTaxonomyTree } from "./canonicalTaxonomyService.js";
const origin = () => (process.env.PUBLIC_STOREFRONT_ORIGIN ?? "https://tekcentral.co.za").replace(/\/$/, "");
const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character]!);
const staticPaths = ["/", "/shop", "/business", "/about", "/contact", "/zeus", "/terms", "/privacy", "/refund-policy", "/cancellation-policy", "/shipping-delivery"];

export async function buildSitemap(products: Array<{ slug: string; categorySlug?: string; categoryId?: string; subcategoryId?: string; productTypeId?: string }>) {
  const paths = new Set(staticPaths);
  const taxonomy = await getCanonicalTaxonomyTree({ storefrontOnly: true });
  products.forEach((product) => {
    paths.add(`/product/${product.slug}`);
    const category = taxonomy.find((item) => item.id === product.categoryId || item.slug === product.categorySlug);
    if (!category) return;
    paths.add(`/shop/${category.slug}`);
    const subcategory = category.children.find((item) => item.id === product.subcategoryId);
    if (!subcategory) return;
    paths.add(`/shop/${category.slug}/${subcategory.slug}`);
    const productType = subcategory.productTypes?.find((item) => item.id === product.productTypeId);
    if (productType) paths.add(`/shop/${category.slug}/${subcategory.slug}/${productType.slug}`);
  });
  const urls = [...paths].sort().map((path) => `<url><loc>${escapeXml(`${origin()}${path}`)}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function buildRobots() { return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /orders\nDisallow: /order/\nDisallow: /payment/\nDisallow: /compare\n\nSitemap: ${origin()}/sitemap.xml\n`; }
