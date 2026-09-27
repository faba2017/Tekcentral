import type { SupplierCatalogueProduct } from "../../types.js";
import type { CjCategoryNode } from "./cjTypes.js";
import { CjApiError } from "./cjErrors.js";

export interface CjPolicyCategory {
  group: string;
  tekcentralCategory: string;
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  enabled: boolean;
}

export interface CjPolicyGroup {
  name: string;
  tekcentralCategory: string;
  categories: CjPolicyCategory[];
}

export interface CjCategoryMetadata {
  categoryId: string;
  categoryName: string;
  categoryPath: string;
}

export const cjTechnologyCategoryPolicy: CjPolicyGroup[] = [
  {
    name: "Computers & Accessories",
    tekcentralCategory: "computers",
    categories: [
      ["2502190343061609600", "Computer Tablet Accessories", "Computer & Office > Office Electronics > Computer Tablet Accessories"],
      ["7D962F30-E20E-4DE9-8911-EB8AB078FB23", "Laptops", "Computer & Office > Laptop & Tablets > Laptops"],
      ["E3963C40-89BE-46AC-985D-A86FA417F6B8", "Gaming Laptops", "Computer & Office > Laptop & Tablets > Gaming Laptops"],
      ["D190FBF9-A352-48BD-9F4B-B6AB432988E5", "Tablets", "Computer & Office > Laptop & Tablets > Tablets"],
      ["25E64DFD-1ED3-4171-86CD-0C2F40052F3B", "2 in 1 Tablets", "Computer & Office > Laptop & Tablets > 2 in 1 Tablets"],
      ["EDC3EDAF-1ED7-4776-8416-E9F8F0A5B4C6", "Tablet Accessories", "Computer & Office > Tablet & Laptop Accessories > Tablet Accessories"],
      ["3F3EFC96-82B8-44C1-BF7A-2E3E7083A875", "Laptop Batteries", "Computer & Office > Tablet & Laptop Accessories > Laptop Batteries"],
    ].map(policyCategory("Computers & Accessories", "computers")),
  },
  {
    name: "Networking",
    tekcentralCategory: "networking",
    categories: [
      ["4F7EE88B-4209-42E8-A501-5F634B58BB35", "Modem-Router Combos", "Computer & Office > Networking > Modem-Router Combos"],
      ["76CD1BD4-2A0A-4D72-913C-6DAADD7E9EDB", "Wireless Routers", "Computer & Office > Networking > Wireless Routers"],
      ["9A33970D-F4BC-48EC-BEAB-FEC19C130963", "Networking Tools", "Computer & Office > Networking > Networking Tools"],
      ["C019C59C-C274-44F9-B04B-5520F1EBE5FA", "Network Cards", "Computer & Office > Networking > Network Cards"],
    ].map(policyCategory("Networking", "networking")),
  },
  {
    name: "Cables & Connectivity",
    tekcentralCategory: "accessories",
    categories: [
      ["40CC2ED1-8998-4515-9139-787CC25D42A7", "Digital Cables", "Consumer Electronics > Accessories & Parts > Digital Cables"],
      ["66D0D817-353B-492E-87A5-024091FF9000", "Audio & Video Cables", "Consumer Electronics > Accessories & Parts > Audio & Video Cables"],
      ["00134C46-B7DF-4500-A3D9-ABB7B779EFD0", "Cables", "Phones & Accessories > Mobile Phone Accessories > Cables"],
      ["5FE5E389-0B85-4592-A08D-B4AD79B164D4", "Flex Cables", "Phones & Accessories > Mobile Phone Parts > Flex Cables"],
      ["9170B3F9-5B9C-4C39-8CD6-7DC00E481D47", "Holders & Stands", "Phones & Accessories > Mobile Phone Accessories > Holders & Stands"],
    ].map(policyCategory("Cables & Connectivity", "accessories")),
  },
  {
    name: "Power & Charging",
    tekcentralCategory: "power",
    categories: [
      ["6DB79FAF-593D-4F52-B6FF-AB1D14331862", "Charger", "Consumer Electronics > Accessories & Parts > Charger"],
      ["A0D39205-3770-4F0B-91BD-65E711263577", "Batteries", "Consumer Electronics > Accessories & Parts > Batteries"],
      ["491E5474-524C-4666-BDD7-4E35E38900EA", "Power Bank", "Phones & Accessories > Mobile Phone Accessories > Power Bank"],
      ["B200FABB-A76B-4750-9957-FEA3DCB21F1F", "Chargers", "Phones & Accessories > Mobile Phone Accessories > Chargers"],
      ["2C46D1EB-148D-4DF3-8F23-EC0C5D5FDC1D", "Mobile Batteries", "Phones & Accessories > Mobile Phone Parts > Mobile Batteries"],
    ].map(policyCategory("Power & Charging", "power")),
  },
  {
    name: "Storage",
    tekcentralCategory: "accessories",
    categories: [
      ["4D3B9582-E92E-46BF-B00E-715E70FB4742", "SSD", "Computer & Office > Storage Devices > SSD"],
      ["591E8920-019B-42FA-AE0B-420052E6C4F0", "USB Flash Drives", "Computer & Office > Storage Devices > USB Flash Drives"],
      ["76B88FB8-9B37-4B55-AA09-082C5627DFE8", "HDD Enclosures", "Computer & Office > Storage Devices > HDD Enclosures"],
      ["7E65A403-CF6E-4B55-96FF-B7C3C376A47A", "Memory Cards", "Computer & Office > Storage Devices > Memory Cards"],
      ["C62BC6BF-BA2B-41ED-AB12-599A6D7FCAA5", "External Hard Drives", "Computer & Office > Storage Devices > External Hard Drives"],
    ].map(policyCategory("Storage", "accessories")),
  },
  {
    name: "Mobile Technology",
    tekcentralCategory: "smart-tech",
    categories: [
      ["0AADEC4E-024A-41DF-8801-4A0204F0E568", "Quad Core", "Phones & Accessories > Mobile Phones > Quad Core"],
      ["20278181-7942-4E22-B3CB-7CDFEE89297E", "Single SIM Card", "Phones & Accessories > Mobile Phones > Single SIM Card"],
      ["40FFAFDA-47CD-473A-B654-94D1923B15CF", "Dual SIM Card", "Phones & Accessories > Mobile Phones > Dual SIM Card"],
      ["D0E7FF56-E94C-460D-8DB1-6695458475F4", "Octa Core", "Phones & Accessories > Mobile Phones > Octa Core"],
    ].map(policyCategory("Mobile Technology", "smart-tech")),
  },
  {
    name: "Security & Cameras",
    tekcentralCategory: "security",
    categories: [
      ["0598E853-9BF7-4939-A571-2407E819C91E", "Alarm & Sensor", "Computer & Office > Security & Protection > Alarm & Sensor"],
      ["28F0E5A1-0A9A-43C5-8197-F1420A9BD10B", "Door Intercom", "Computer & Office > Security & Protection > Door Intercom"],
      ["BB57B72C-A8C6-40FF-BCBB-EAE0251273C6", "Surveillance Products", "Computer & Office > Security & Protection > Surveillance Products"],
      ["A2B55BEF-9B7D-44A0-8E80-A14FFFBBBD94", "Camera & Photo Accessories", "Consumer Electronics > Camera & Photo > Camera & Photo Accessories"],
      ["AA40156F-A334-475E-9CA0-7E5520645980", "Digital Cameras", "Consumer Electronics > Camera & Photo > Digital Cameras"],
      ["AD21D6F7-42CB-44E7-89B2-542692C7D101", "Action Cameras", "Consumer Electronics > Camera & Photo > Action Cameras"],
    ].map(policyCategory("Security & Cameras", "security")),
  },
  {
    name: "Smart Technology",
    tekcentralCategory: "smart-tech",
    categories: [
      ["11D33F89-9B90-4D1A-B977-DE229BAA7E86", "Wearable Devices", "Consumer Electronics > Smart Electronics > Wearable Devices"],
      ["36F73513-6A5A-445D-87F9-BF3D6629E649", "Smart Home Appliances", "Consumer Electronics > Smart Electronics > Smart Home Appliances"],
      ["4336FAFE-B9C9-4673-8706-BCFAE1448DA2", "Smart Wearable Accessories", "Consumer Electronics > Smart Electronics > Smart Wearable Accessories"],
      ["895CF515-0F6B-481D-8A32-604EDCBEFBED", "Smart Wristbands", "Consumer Electronics > Smart Electronics > Smart Wristbands"],
      ["C83EF2A0-8FA3-4713-9901-2FD6E4554D97", "Smart Watches", "Consumer Electronics > Smart Electronics > Smart Watches"],
      ["E95322D2-FF23-4837-A0C0-0CA686B9F062", "Smart Remote Controls", "Consumer Electronics > Smart Electronics > Smart Remote Controls"],
    ].map(policyCategory("Smart Technology", "smart-tech")),
  },
  {
    name: "Office Technology",
    tekcentralCategory: "printing-office",
    categories: [
      ["874B7C94-D225-43FE-AB79-FFAF1B800651", "Printer Supplies", "Computer & Office > Office Electronics > Printer Supplies"],
      ["C7365895-913A-4078-9946-681EFD45D2B8", "3D Printers", "Computer & Office > Office Electronics > 3D Printers"],
      ["E33443F7-144C-4CBE-8D34-C1B6256A6325", "Printers", "Computer & Office > Office Electronics > Printers"],
      ["F8024D10-AB96-4558-AC79-C49625F768DA", "Scanners", "Computer & Office > Office Electronics > Scanners"],
      ["0AC6B44A-12CC-456F-831F-54064C77D303", "Projectors", "Consumer Electronics > Home Audio & Video > Projectors"],
      ["A9B643D0-7AA9-4703-A59B-D01C4526CDF9", "Projectors & Acessories", "Consumer Electronics > Home Audio & Video > Projectors & Acessories"],
    ].map(policyCategory("Office Technology", "printing-office")),
  },
];

const blockedResultTerms = [
  "swim",
  "swimming",
  "bikini",
  "dress",
  "skirt",
  "socks",
  "shirt",
  "scarves",
  "scarf",
  "carpet",
  "rug",
  "pet",
  "jewelry",
  "jewellery",
  "makeup",
  "wig",
  "hair",
];

const technologyTerms = [
  "usb",
  "type c",
  "type-c",
  "charger",
  "charging",
  "cable",
  "adapter",
  "hub",
  "dock",
  "ssd",
  "hdd",
  "flash",
  "memory",
  "router",
  "network",
  "wifi",
  "wireless",
  "camera",
  "security",
  "surveillance",
  "printer",
  "scanner",
  "projector",
  "power",
  "battery",
  "laptop",
  "tablet",
  "keyboard",
  "mouse",
  "speaker",
  "microphone",
  "earphone",
  "headphone",
  "smart",
  "watch",
  "ups",
  "uninterruptible",
];

function policyCategory(group: string, tekcentralCategory: string) {
  return ([categoryId, categoryName, categoryPath]: string[]): CjPolicyCategory => ({
    group,
    tekcentralCategory,
    categoryId,
    categoryName,
    categoryPath,
    enabled: true,
  });
}

export function allowedCjTechnologyCategories() {
  return cjTechnologyCategoryPolicy.flatMap((group) =>
    group.categories.filter((category) => category.enabled),
  );
}

export function allowedCjTechnologyCategoryIds() {
  return new Set(allowedCjTechnologyCategories().map((category) => category.categoryId));
}

export function assertCjTechnologyPolicyAvailable() {
  if (allowedCjTechnologyCategories().length === 0) {
    throw new CjApiError(
      "CJ_TECH_POLICY_UNAVAILABLE",
      "TekCentral technology catalogue policy is temporarily unavailable.",
    );
  }
}

export function findPolicyCategory(categoryId?: string, categoryName?: string) {
  const allowed = allowedCjTechnologyCategories();
  if (categoryId) {
    const byId = allowed.find((category) => category.categoryId === categoryId);
    if (byId) return byId;
  }
  const normalized = normalizeText(categoryName);
  return allowed.find((category) => normalizeText(category.categoryName) === normalized);
}

export function technologyPolicyResponse(categories: CjCategoryNode[]) {
  const allowed = allowedCjTechnologyCategoryIds();
  return {
    mode: "technology" as const,
    groups: cjTechnologyCategoryPolicy.map((group) => ({
      name: group.name,
      tekcentralCategory: group.tekcentralCategory,
      categories: group.categories.filter((category) => category.enabled),
    })),
    categories: filterCategoryTree(categories, allowed),
  };
}

export function filterCategoryTree(categories: CjCategoryNode[], allowedIds: Set<string>): CjCategoryNode[] {
  return categories
    .map((category) => {
      const children = filterCategoryTree(category.children, allowedIds);
      const isAllowed = Boolean(category.categoryId && allowedIds.has(category.categoryId));
      if (!isAllowed && children.length === 0) return undefined;
      return { ...category, children };
    })
    .filter((category): category is CjCategoryNode => Boolean(category));
}

export function annotateTechnologyProduct(product: SupplierCatalogueProduct, query = "") {
  const policyCategory = findPolicyCategory(product.categoryId, product.categoryName);
  return {
    ...product,
    categoryName: policyCategory?.categoryPath ?? product.categoryName,
    tekcentralCategoryGroup: policyCategory?.group,
    tekcentralRelevanceScore: scoreCjTechnologyProduct(product, query, policyCategory),
  };
}

export function enrichCjProductCategory(
  product: SupplierCatalogueProduct,
  categoryLookup: Map<string, CjCategoryMetadata>,
) {
  const metadata = product.categoryId ? categoryLookup.get(product.categoryId) : undefined;
  if (!metadata) return product;
  return {
    ...product,
    categoryName: metadata.categoryPath,
  };
}

export function createCjCategoryLookup(categories: CjCategoryNode[]) {
  const lookup = new Map<string, CjCategoryMetadata>();
  const visit = (nodes: CjCategoryNode[], parentPath = "") => {
    for (const node of nodes) {
      const categoryPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
      if (node.categoryId) {
        lookup.set(node.categoryId, {
          categoryId: node.categoryId,
          categoryName: node.name,
          categoryPath,
        });
      }
      visit(node.children, categoryPath);
    }
  };
  visit(categories);
  return lookup;
}

export function isCjProductAllowedForTekCentral(product: SupplierCatalogueProduct) {
  return Boolean(product.categoryId && allowedCjTechnologyCategoryIds().has(product.categoryId));
}

export function applyCjCatalogueScope(
  products: SupplierCatalogueProduct[],
  scope: "technology" | "all",
  query = "",
  categoryLookup?: Map<string, CjCategoryMetadata>,
) {
  if (scope === "technology") assertCjTechnologyPolicyAvailable();
  const annotatedProducts = products.map((product) => {
    const enriched = categoryLookup ? enrichCjProductCategory(product, categoryLookup) : product;
    return annotateTechnologyProduct(enriched, query);
  });
  const categoryResolvedCount = annotatedProducts.filter((product) => Boolean(product.categoryId)).length;
  const technologyAllowedCount = annotatedProducts.filter(isCjProductAllowedForTekCentral).length;
  if (scope === "all") {
    return {
      products: annotatedProducts,
      categoryResolvedCount,
      technologyAllowedCount,
    };
  }
  return {
    products: annotatedProducts
      .filter((product) =>
        isCjProductAllowedForTekCentral(product) && technologyMatches(product, query),
      )
      .sort((a, b) => (b.tekcentralRelevanceScore ?? 0) - (a.tekcentralRelevanceScore ?? 0)),
    categoryResolvedCount,
    technologyAllowedCount,
  };
}

export function scoreCjTechnologyProduct(
  product: SupplierCatalogueProduct,
  query = "",
  policyCategory = findPolicyCategory(product.categoryId, product.categoryName),
) {
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const haystack = normalizeText([
    product.supplierProductName,
    product.supplierSku,
    product.categoryName,
    policyCategory?.categoryPath,
  ].filter(Boolean).join(" "));
  let score = policyCategory ? 40 : 0;
  for (const token of tokens) {
    if (!token) continue;
    if (hasToken(haystack, token)) score += token.length <= 3 ? 18 : 12;
    else if (token.length > 3 && haystack.includes(token)) score += 4;
  }
  if (technologyTerms.some((term) => haystack.includes(term))) score += 12;
  if (blockedResultTerms.some((term) => hasToken(haystack, term))) score -= 80;
  return score;
}

export function technologyMatches(product: SupplierCatalogueProduct, query = "") {
  if (!isCjProductAllowedForTekCentral(product)) return false;
  const policyCategory = findPolicyCategory(product.categoryId);
  const score = scoreCjTechnologyProduct(product, query, policyCategory);
  return Boolean(policyCategory) && score >= 35;
}

export function normalizeText(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function hasToken(haystack: string, token: string) {
  if (!token) return false;
  return new RegExp(`(^| )${escapeRegExp(token)}($| )`).test(haystack);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
