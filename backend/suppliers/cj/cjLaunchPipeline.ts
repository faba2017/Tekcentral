import { getAdminProductById, getProductCreatedFromOffer, listAdminProducts, saveInternalProduct } from "../../internalProductRepository.js";
import { listPricingProposals } from "../../pricingProposalRepository.js";
import type { SupplierOffer } from "../../supplierDomain.js";
import { getSupplierProductMappingById, listSupplierProductMappings, saveSupplierProductMapping, setSupplierProductMappingStatus, supersedeSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import type { SupplierCatalogueProduct, SupplierCatalogueVariant, SupplierProductMapping } from "../../types.js";
import { getCjCatalogueProduct, listCjCatalogueProducts, saveCjCatalogueProduct, updateCjCatalogueVariant } from "./cjCatalogueRepository.js";
import { getCjEvidenceSettings } from "./cjEvidenceSettingsRepository.js";
import { getBusinessSettings, getSupplierPolicySettings } from "../../businessSettingsRepository.js";
import { resolveFxEvidence } from "../../fxRateService.js";
import { suggestCanonicalCategory } from "../../categorySuggestionService.js";
import { canonicalTaxonomyCategory, canonicalTaxonomyPath, getCanonicalTaxonomyTree, resolveCanonicalTaxonomy } from "../../canonicalTaxonomyService.js";
import { categories } from "../../../src/data/catalogue.js";

export type CjLaunchState = "NOT_SELECTED" | "CANDIDATE" | "SELECTED_FOR_LAUNCH";

function clean(value?: string) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function proposedSku(value: string) {
  return `TC-${value.replace(/[^a-z0-9]/gi, "-").replace(/^-|-$/g, "").toUpperCase()}`;
}

export function suggestedCjPublicTitle(value: string) {
  const cleaned = value
    .replace(/\b(?:hot\s*sale|hot\s*selling|dropshipping|drop\s*shipping|wholesale|fast\s*shipping|promotional?)\b/gi, " ")
    .replace(/\.{3,}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, "")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  for (let size = Math.floor(words.length / 2); size > 0; size -= 1) {
    for (let start = 0; start + size * 2 <= words.length; start += 1) {
      const first = words.slice(start, start + size).map(clean).join(" ");
      const second = words.slice(start + size, start + size * 2).map(clean).join(" ");
      if (first && first === second) {
        words.splice(start + size, size);
        start = -1;
      }
    }
  }
  return words.join(" ");
}

export function isDemoProduct(product: { id: string; name?: string; slug?: string }) {
  return /(?:^|[-_\s])(demo|test|sample|placeholder)(?:$|[-_\s])/i.test(`${product.id} ${product.slug ?? ""} ${product.name ?? ""}`);
}

function suggestCjCategory(product: SupplierCatalogueProduct) {
  const text = clean(`${product.supplierProductName} ${product.categoryName ?? ""}`);
  const rules: { slug: string; terms: string[] }[] = [
    { slug: "cables-connectivity", terms: ["ethernet cable", "network cable", "rj45 cable", "fibre", "fiber"] },
    { slug: "networking", terms: ["router", "switch", "wifi", "access point", "network adapter"] },
    { slug: "office-business-technology", terms: ["ip phone", "voip", "printer", "scanner", "label", "office"] },
    { slug: "power-backup", terms: ["charger", "power", "ups", "inverter"] },
    { slug: "computers", terms: ["computer", "monitor", "laptop", "desktop", "dock"] },
    { slug: "security-surveillance", terms: ["camera", "security", "cctv", "nvr"] },
    { slug: "smart-home-lifestyle", terms: ["smart", "iot", "automation"] },
    { slug: "storage", terms: ["ssd", "hard drive", "storage", "nas"] },
    { slug: "peripherals-accessories", terms: ["adapter", "usb", "stand", "hub", "splitter"] },
  ];
  const matched = rules.find((rule) => rule.terms.some((term) => text.includes(term)));
  return categories.find((category) => category.slug === matched?.slug);
}

function strongCjBrand(product: SupplierCatalogueProduct) {
  const explicit = product.manufacturer?.trim() || product.brand?.trim();
  if (explicit) return { value: explicit, confidence: "HIGH" as const, source: "explicit supplier brand/manufacturer" };
  const sourceNames = [product.supplierProductName, ...product.variants.map((variant) => variant.name ?? "")].filter(Boolean);
  const words = product.supplierProductName.match(/[A-Za-z0-9]+/g) ?? [];
  const leading = words[0];
  const generic = new Set(["USB", "LED", "LCD", "HD", "FHD", "WIFI", "RJ45", "CAT5E", "CAT6", "CAT6A"]);
  const occurrences = leading ? sourceNames.filter((name) => (name.match(/[A-Za-z0-9]+/)?.[0] ?? "").toLowerCase() === leading.toLowerCase()).length : 0;
  if (leading && /^[A-Z][A-Z0-9]{2,19}$/.test(leading) && !generic.has(leading) && occurrences >= 2) {
    return { value: leading, confidence: "MEDIUM" as const, source: "repeated leading source identity token" };
  }
  return { value: "", confidence: "LOW" as const, source: "no reliable brand evidence" };
}

function variantIdentityValues(variant: SupplierCatalogueVariant) {
  const attributeEntries = Object.entries(variant.attributes ?? {}).filter(([, value]) => value.trim());
  const preferred = attributeEntries.filter(([key]) => /(?:length|size|capacity|colour|color|connector|plug|storage|memory)/i.test(key));
  const values = [...preferred.map(([, value]) => value.trim()), variant.name?.trim()].filter((value): value is string => Boolean(value));
  return [...new Map(values.map((value) => [clean(value), value])).values()];
}

function suggestedTitle(product: SupplierCatalogueProduct, variant: SupplierCatalogueVariant) {
  let title = suggestedCjPublicTitle(product.supplierProductName) || product.supplierProductName;
  for (const value of variantIdentityValues(variant)) {
    const cleanedValue = clean(value);
    if (cleanedValue && !clean(title).includes(cleanedValue)) title = `${title} ${value}`;
  }
  return suggestedCjPublicTitle(title);
}

function suggestCjSubcategory(product: SupplierCatalogueProduct, categorySlug?: string) {
  const text = clean(`${product.supplierProductName} ${product.categoryName ?? ""}`);
  const rules: Record<string, Array<{ value: string; terms: string[] }>> = {
    "cables-connectivity": [
      { value: "Network Cables", terms: ["ethernet", "network cable", "rj45", "cat5e", "cat6", "cat6a", "patch cable"] },
      { value: "Fibre Cables", terms: ["fibre", "fiber", "optical cable"] },
      { value: "USB Cables", terms: ["usb cable"] },
      { value: "Display Cables", terms: ["hdmi cable", "displayport cable"] },
    ],
    networking: [
      { value: "Routers & Mesh", terms: ["router", "mesh"] },
      { value: "Switches", terms: ["network switch", "ethernet switch"] },
      { value: "Access Points", terms: ["wifi", "wi fi", "access point"] },
      { value: "PoE Equipment", terms: ["poe"] },
    ],
    "peripherals-accessories": [
      { value: "Adapters", terms: ["adapter", "converter", "hub"] },
      { value: "Headsets", terms: ["headset"] },
      { value: "Webcams", terms: ["webcam"] },
      { value: "Keyboards", terms: ["keyboard"] },
      { value: "Mice", terms: ["mouse"] },
    ],
    storage: [{ value: "Internal SSDs", terms: ["ssd"] }, { value: "Memory Cards", terms: ["memory card"] }, { value: "USB Flash Drives", terms: ["flash drive"] }],
  };
  const match = rules[categorySlug ?? ""]?.find((rule) => rule.terms.some((term) => text.includes(term)))?.value;
  const category = categories.find((item) => item.slug === categorySlug);
  return match && category?.subcategories.includes(match) ? match : "";
}

function suggestedDescription(product: SupplierCatalogueProduct, variant: SupplierCatalogueVariant, title: string, brand: string) {
  const sourceDescription = sanitizeCjProductContent(product.description);
  if (sourceDescription) return sourceDescription;
  const text = clean(`${product.supplierProductName} ${product.categoryName ?? ""}`);
  const identity = variantIdentityValues(variant)[0];
  if (/(?:ethernet|network cable|rj45|cat5e|cat6|cat6a)/.test(text)) {
    const length = identity?.replace(/^(\d+(?:\.\d+)?)\s*m$/i, "$1 m");
    return [length, brand, "Ethernet cable for wired network connectivity."].filter(Boolean).join(" ");
  }
  return title;
}

export function sanitizeCjProductContent(value?: string) {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(?:cj\s*dropshipping|dropshipping|fast shipping|free shipping|contact (?:us|seller)|whatsapp|wechat)\b[^.!?]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactOfferId(productId: string, variantId: string) {
  return `CJ:${productId}:${variantId}`;
}

function logistics(product: SupplierCatalogueProduct, variant: SupplierCatalogueVariant) {
  if (variant.logisticsEvidence) {
    const authoritative = variant.logisticsEvidence.observations.filter((item) => item.confidence !== "LOW" && !item.blocker);
    const weight = authoritative.find((item) => item.unit === "g" && item.classification === "SHIPPING");
    const length = authoritative.find((item) => ["variantLength", "length", "staffConfirmedLength"].includes(item.field));
    const width = authoritative.find((item) => ["variantWidth", "width", "staffConfirmedWidth"].includes(item.field));
    const height = authoritative.find((item) => ["variantHeight", "height", "staffConfirmedHeight"].includes(item.field));
    const dimensions = [length, width, height];
    return {
      status: weight && dimensions.filter(Boolean).length === 3 ? "COMPLETE" as const : authoritative.length ? "PARTIAL" as const : "MISSING" as const,
      measurementScope: dimensions.some((item) => item?.classification === "PACKAGE") ? "PACKAGE" as const : "PRODUCT" as const,
      weightGrams: weight?.value,
      lengthMm: length?.value,
      widthMm: width?.value,
      heightMm: height?.value,
      source: "CJ_VARIANT" as const,
      capturedAt: variant.logisticsEvidence.reviewedAt,
    };
  }
  const weightGrams = variant.weight ?? product.weight;
  const dimensions = [variant.lengthMm, variant.widthMm, variant.heightMm];
  const hasDimensions = dimensions.every((value) => typeof value === "number" && value > 0);
  return {
    status: weightGrams || hasDimensions ? "PARTIAL" as const : "MISSING" as const,
    measurementScope: "PRODUCT" as const,
    weightGrams: undefined,
    lengthMm: undefined,
    widthMm: undefined,
    heightMm: undefined,
    source: variant.weight || hasDimensions ? "CJ_VARIANT" as const : "CJ_PRODUCT" as const,
    capturedAt: product.lastSuccessfulRefreshAt ?? product.importedAt,
  };
}

function hasStrongMappingEvidence(mapping?: SupplierProductMapping) {
  if (!mapping || mapping.status !== "VERIFIED") return false;
  if (mapping.confidenceLevel === "HIGH" && (mapping.confidence ?? 0) >= 0.9) return true;
  return ["EXACT_MANUFACTURER_MODEL", "EXACT_MANUFACTURER_SKU", "EXACT_GTIN", "EXACT_SOURCE_OFFER_IDENTITY", "STAFF_CONFIRMED_CJ_VARIANT_CREATION"].includes(mapping.matchMethod ?? "");
}

function variantIdentityStatus(product: SupplierCatalogueProduct, variant?: SupplierCatalogueVariant, mapping?: SupplierProductMapping) {
  if (!variant) return product.variants.length > 1 ? "VARIANT_AMBIGUOUS" as const : "VARIANT_REVIEW_REQUIRED" as const;
  if (mapping?.supplierVariantId && mapping.supplierVariantId !== variant.supplierVariantId) return "VARIANT_AMBIGUOUS" as const;
  if (hasStrongMappingEvidence(mapping) && mapping?.supplierVariantId === variant.supplierVariantId) return "VARIANT_VERIFIED" as const;
  return variant.identityEvidence?.status ?? (variant.supplierVariantId ? "VARIANT_REVIEW_REQUIRED" as const : "VARIANT_AMBIGUOUS" as const);
}

export function deriveCjPricingEvidence(input: { product: SupplierCatalogueProduct; variant?: SupplierCatalogueVariant; mapping?: SupplierProductMapping; supplierCurrencyEvidence?: SupplierCatalogueProduct["currencyEvidence"]; fxRate?: number; fxRateUpdatedAt?: string; fxStaleAfterHours?: number; sourcePriceFreshnessHours?: number; now?: Date }) {
  const { product, variant, mapping } = input;
  const identityVerified = hasStrongMappingEvidence(mapping);
  const variantStatus = variantIdentityStatus(product, variant, mapping);
  const currencyEvidence = variant?.currencyEvidence?.currency ? variant.currencyEvidence : product.currencyEvidence?.currency ? product.currencyEvidence : input.supplierCurrencyEvidence;
  const currency = currencyEvidence?.currency;
  const currencySource = currencyEvidence?.source ?? "UNKNOWN" as const;
  const authoritativeCost = variant?.costEvidence && ["PROCUREMENT_COST", "STOCK_UP_PRICE", "WHOLESALE_PRICE", "VARIANT_SELL_PRICE"].includes(variant.costEvidence.classification) ? variant.costEvidence : undefined;
  const logisticsResult = variant ? logistics(product, variant) : {
    status: "MISSING" as const,
    measurementScope: "PRODUCT" as const,
    weightGrams: undefined,
    lengthMm: undefined,
    widthMm: undefined,
    heightMm: undefined,
    source: "CJ_PRODUCT" as const,
    capturedAt: product.lastSuccessfulRefreshAt ?? product.importedAt,
  };
  const blockers: string[] = [];
  if (!identityVerified) blockers.push("IDENTITY_REVIEW_REQUIRED");
  if (variantStatus !== "VARIANT_VERIFIED") blockers.push(variantStatus);
  if (!currency || currencySource === "UNKNOWN") blockers.push("CURRENCY_UNKNOWN");
  const fxAgeHours = input.fxRateUpdatedAt ? ((input.now ?? new Date()).getTime() - new Date(input.fxRateUpdatedAt).getTime()) / 3_600_000 : undefined;
  const fxStale = fxAgeHours !== undefined && fxAgeHours > (input.fxStaleAfterHours ?? 24);
  if (currency && currency !== "ZAR" && (!input.fxRate || !input.fxRateUpdatedAt)) blockers.push("FX_RATE_REQUIRED");
  else if (currency && currency !== "ZAR" && fxStale) blockers.push("FX_RATE_STALE");
  if (!authoritativeCost || authoritativeCost.amount <= 0 || authoritativeCost.currency !== currency) blockers.push("AUTHORITATIVE_COST_MISSING");
  const sourcePriceAgeHours = authoritativeCost ? ((input.now ?? new Date()).getTime() - new Date(authoritativeCost.capturedAt).getTime()) / 3_600_000 : undefined;
  if (authoritativeCost && authoritativeCost.classification !== "PROCUREMENT_COST" && sourcePriceAgeHours !== undefined && sourcePriceAgeHours > (input.sourcePriceFreshnessHours ?? 24)) blockers.push("SOURCE_PRICE_STALE");
  if (logisticsResult.status !== "COMPLETE") blockers.push(logisticsResult.status === "PARTIAL" ? "LOGISTICS_PARTIAL" : "LOGISTICS_MISSING");
  const nextAction = blockers.includes("IDENTITY_REVIEW_REQUIRED") ? "Resolve product mapping" : blockers.some((item) => item.startsWith("VARIANT_")) ? "Select sellable variant" : blockers.includes("CURRENCY_UNKNOWN") ? "Confirm CJ currency" : blockers.includes("AUTHORITATIVE_COST_MISSING") ? "Record procurement cost" : blockers.includes("SOURCE_PRICE_STALE") ? "Refresh CJ source price" : blockers.includes("FX_RATE_REQUIRED") || blockers.includes("FX_RATE_STALE") ? "Refresh FX" : blockers.some((item) => item.startsWith("LOGISTICS_")) ? "Resolve variant logistics" : "Review pricing";
  return { status: blockers.length ? "BLOCKED" as const : "READY_FOR_PRICING" as const, identityStatus: identityVerified ? "IDENTITY_VERIFIED" as const : "IDENTITY_REVIEW_REQUIRED" as const, variantStatus, currency: currency ?? null, currencySource, costStatus: authoritativeCost ? "AUTHORITATIVE" as const : "MISSING" as const, authoritativeCost: authoritativeCost?.amount, costSourceField: authoritativeCost?.sourceField, normalizedCostZar: authoritativeCost && currency ? currency === "ZAR" ? authoritativeCost.amount : input.fxRate ? Math.round(authoritativeCost.amount * input.fxRate * 100) / 100 : undefined : undefined, fxStatus: !currency ? "NOT_EVALUATED" as const : currency === "ZAR" ? "NOT_REQUIRED" as const : fxStale ? "STALE" as const : input.fxRate && input.fxRateUpdatedAt ? "CONFIGURED" as const : "REQUIRED" as const, logistics: logisticsResult, blockers, nextAction, demoProductWarning: Boolean(mapping?.productId?.toLowerCase().includes("demo")) };
}

export async function selectCjEvidenceVariant(input: { supplierProductId: string; supplierVariantId: string; evidenceNote: string; actor?: string }) {
  if (!input.evidenceNote.trim()) throw new Error("Variant selection requires evidence.");
  const product = await getCjCatalogueProduct(input.supplierProductId);
  const variant = product?.variants.find((item) => item.supplierVariantId === input.supplierVariantId);
  if (!product || !variant) throw new Error("Exact CJ product variant not found.");
  const now = new Date().toISOString();
  return saveCjCatalogueProduct({ ...product, evidenceSelection: { selectedVariantId: variant.supplierVariantId, selectedAt: now, selectedBy: input.actor ?? "TekCentral Staff", evidenceNote: input.evidenceNote.trim(), history: [...(product.evidenceSelection?.history ?? []), { previousVariantId: product.evidenceSelection?.selectedVariantId, selectedVariantId: variant.supplierVariantId, actor: input.actor ?? "TekCentral Staff", evidence: input.evidenceNote.trim(), timestamp: now }] }, variants: product.variants.map((item) => item.supplierVariantId === variant.supplierVariantId ? { ...item, identityEvidence: { status: "VARIANT_VERIFIED", source: "ADMIN_CONFIRMED", evidence: [...(item.identityEvidence?.evidence ?? []), input.evidenceNote.trim()], reviewedAt: now } } : item) });
}

export async function mapCjVariantToExistingProduct(input: { supplierProductId: string; supplierVariantId: string; productId: string; previousMappingId?: string; evidenceNote: string; sourceReference: string; confirmDemoProduct?: boolean; actor?: string }) {
  if (!input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Mapping requires evidence and source reference.");
  const [product, target] = await Promise.all([getCjCatalogueProduct(input.supplierProductId), getAdminProductById(input.productId)]);
  const variant = product?.variants.find((item) => item.supplierVariantId === input.supplierVariantId);
  if (!product || !variant || !target) throw new Error("CJ variant or TekCentral Product not found.");
  if (isDemoProduct(target) && !input.confirmDemoProduct) throw new Error("This mapping points to a demo/test Product. Explicit confirmation is required.");
  const existingMappings = (await listSupplierProductMappings()).filter((mapping) => mapping.supplierCode === "CJ" && mapping.supplierProductId === input.supplierProductId && mapping.supplierVariantId === input.supplierVariantId && !["SUPERSEDED", "REJECTED"].includes(mapping.status ?? ""));
  const activeSameTarget = existingMappings.find((mapping) => mapping.productId === input.productId);
  if (activeSameTarget?.status === "VERIFIED") return { previous: undefined, replacement: activeSameTarget };
  if (existingMappings.some((mapping) => mapping.productId !== input.productId) && !input.previousMappingId) throw new Error("Existing active mapping must be explicitly replaced.");
  if (input.previousMappingId) {
    const previous = await getSupplierProductMappingById(input.previousMappingId);
    if (!previous || previous.supplierCode !== "CJ" || previous.supplierProductId !== input.supplierProductId || previous.supplierVariantId !== input.supplierVariantId) throw new Error("Previous mapping does not belong to this exact CJ PID and VID.");
  }
  const now = new Date().toISOString();
  const replacement = { productId: target.id, supplierCode: "CJ" as const, supplierSku: variant.supplierVariantSku ?? product.supplierSku ?? variant.supplierVariantId, supplierOfferId: exactOfferId(product.supplierProductId, variant.supplierVariantId), supplierProductId: product.supplierProductId, supplierProductSku: product.supplierSku, supplierVariantId: variant.supplierVariantId, supplierVariantSku: variant.supplierVariantSku, status: "VERIFIED" as const, confidence: 1, confidenceLevel: "HIGH" as const, matchMethod: "STAFF_CONFIRMED_EXACT_IDENTITY", evidence: [input.evidenceNote.trim(), `Source: ${input.sourceReference.trim()}`, `Exact VID ${variant.supplierVariantId}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "CJ_EVIDENCE_REVIEW", reviewHistory: [{ previousStatus: "REVIEW_REQUIRED" as const, newStatus: "VERIFIED" as const, actor: input.actor ?? "TekCentral Staff", evidence: `${input.evidenceNote.trim()} (${input.sourceReference.trim()})`, timestamp: now }] };
  return input.previousMappingId ? supersedeSupplierProductMapping({ previousMappingId: input.previousMappingId, replacement, actor: input.actor, evidence: `Replaced after staff identity review: ${input.evidenceNote.trim()}` }) : { previous: undefined, replacement: await saveSupplierProductMapping(replacement) };
}

export async function verifyCjVariantEvidence(input: { supplierProductId: string; supplierVariantId: string; evidenceNote: string; actor?: string }) {
  return selectCjEvidenceVariant(input);
}

export async function verifyCjExistingMappingEvidence(input: { mappingId: string; evidenceNote: string; sourceReference: string; actor?: string }) {
  if (!input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Mapping verification requires an evidence note and source reference.");
  const mapping = await getSupplierProductMappingById(input.mappingId);
  if (!mapping || mapping.supplierCode !== "CJ" || !mapping.supplierProductId || !mapping.supplierVariantId) throw new Error("Exact CJ mapping not found.");
  const product = await getCjCatalogueProduct(mapping.supplierProductId);
  const variant = product?.variants.find((item) => item.supplierVariantId === mapping.supplierVariantId);
  if (!product || !variant) throw new Error("Mapped CJ PID/VID is not present in the refreshed catalogue.");
  return saveSupplierProductMapping({ ...mapping, status: "VERIFIED", confidence: 1, confidenceLevel: "HIGH", matchMethod: "STAFF_CONFIRMED_EXACT_IDENTITY", evidence: [...(mapping.evidence ?? []), input.evidenceNote.trim(), `Source: ${input.sourceReference.trim()}`, `Exact VID ${variant.supplierVariantId}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: new Date().toISOString(), source: "CJ_EVIDENCE_REVIEW", reviewHistory: [...(mapping.reviewHistory ?? []), { previousStatus: mapping.status, newStatus: "VERIFIED", actor: input.actor ?? "TekCentral Staff", evidence: `${input.evidenceNote.trim()} (${input.sourceReference.trim()})`, timestamp: new Date().toISOString() }] });
}

export async function confirmCjProcurementCost(input: { supplierProductId: string; supplierVariantId: string; amount: number; currency: string; evidenceType?: string; evidenceNote: string; sourceReference: string; actor?: string }) {
  const currency = input.currency.trim().toUpperCase();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Authoritative procurement cost must be positive.");
  if (!/^[A-Z]{3}$/.test(currency) || !input.evidenceType?.trim() || !input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Procurement cost requires currency, evidence type, evidence note and source reference.");
  const [product, settings] = await Promise.all([getCjCatalogueProduct(input.supplierProductId), getCjEvidenceSettings()]);
  const variant = product?.variants.find((item) => item.supplierVariantId === input.supplierVariantId);
  if (!product || !variant) throw new Error("CJ product or variant not found.");
  const confirmedCurrency = variant.currencyEvidence?.currency ?? product.currencyEvidence?.currency ?? settings.accountCurrency?.currency;
  if (confirmedCurrency && confirmedCurrency !== currency) throw new Error(`Procurement cost currency must match confirmed supplier currency ${confirmedCurrency}.`);
  const now = new Date().toISOString();
  const updated = await updateCjCatalogueVariant(input.supplierProductId, input.supplierVariantId, (variant) => ({ ...variant, currency, currencyEvidence: variant.currencyEvidence?.source === "API_FIELD" ? variant.currencyEvidence : { currency, source: "ADMIN_CONFIRMED", sourceReference: input.sourceReference.trim(), evidenceNote: input.evidenceNote.trim(), confidence: "HIGH", confirmedAt: now, confirmedBy: input.actor ?? "TekCentral Staff" }, costEvidence: { amount: input.amount, currency, sourceField: input.evidenceType!.trim(), endpoint: input.sourceReference.trim(), classification: "PROCUREMENT_COST", confidence: "HIGH", capturedAt: now, sourceFingerprint: `ADMIN:${now}`, evidenceNote: input.evidenceNote.trim(), actor: input.actor ?? "TekCentral Staff" } }));
  if (!updated) throw new Error("CJ product or variant not found.");
  return updated;
}

export async function confirmCjVariantLogistics(input: { supplierProductId: string; supplierVariantId: string; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number; classification: "PRODUCT" | "PACKAGE" | "SHIPPING"; evidenceNote: string; sourceReference: string; actor?: string }) {
  const values = [input.weightGrams, input.lengthMm, input.widthMm, input.heightMm];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) throw new Error("Complete logistics evidence requires positive weight and dimensions.");
  if (!input.evidenceNote.trim() || !input.sourceReference.trim()) throw new Error("Logistics confirmation requires an evidence note and source reference.");
  const now = new Date().toISOString();
  const fingerprint = `ADMIN:${now}:${input.sourceReference.trim()}`;
  const observations = [
    { field: "staffConfirmedWeight", value: input.weightGrams, unit: "g" as const, classification: "SHIPPING" as const, confidence: "HIGH" as const, sourceFingerprint: fingerprint, capturedAt: now },
    ...[["staffConfirmedLength", input.lengthMm], ["staffConfirmedWidth", input.widthMm], ["staffConfirmedHeight", input.heightMm]].map(([field, value]) => ({ field: String(field), value: Number(value), unit: "mm" as const, classification: input.classification, confidence: "HIGH" as const, sourceFingerprint: fingerprint, capturedAt: now })),
  ];
  const updated = await updateCjCatalogueVariant(input.supplierProductId, input.supplierVariantId, (variant) => ({ ...variant, weight: input.weightGrams, lengthMm: input.lengthMm, widthMm: input.widthMm, heightMm: input.heightMm, logisticsEvidence: { observations: [...(variant.logisticsEvidence?.observations ?? []), ...observations], status: "COMPLETE", reviewedAt: now }, launch: variant.launch ? { ...variant.launch, logistics: { status: "COMPLETE", measurementScope: input.classification === "PACKAGE" ? "PACKAGE" : "PRODUCT", weightGrams: input.weightGrams, lengthMm: input.lengthMm, widthMm: input.widthMm, heightMm: input.heightMm, source: "ADMIN", capturedAt: now } } : variant.launch }));
  if (!updated) throw new Error("CJ product or variant not found.");
  return updated;
}

export async function auditCjEvidenceCohort() {
  const products = await listCjCatalogueProducts();
  const mappings = (await listSupplierProductMappings()).filter((mapping) => mapping.supplierCode === "CJ");
  const downgraded: string[] = [];
  for (const mapping of mappings) {
    if (mapping.status === "VERIFIED" && !hasStrongMappingEvidence(mapping)) {
      await setSupplierProductMappingStatus(mapping.id!, historicalCjMappingReviewStatus(mapping), { evidence: "Phase 12.1 evidence audit: historical mapping lacked exact identity evidence." });
      downgraded.push(mapping.id!);
    } else if (mapping.status === "REVIEW_REQUIRED" && !mapping.reviewHistory?.length && !hasStrongMappingEvidence(mapping)) {
      await saveSupplierProductMapping({ ...mapping, reviewHistory: [{ previousStatus: "VERIFIED", newStatus: "REVIEW_REQUIRED", actor: "TekCentral Staff", evidence: "Phase 12.1 evidence audit: historical mapping lacked exact identity evidence.", timestamp: mapping.updatedAt }] });
    }
  }
  let variantsRequiringReview = 0;
  for (const product of products) {
    const variants = product.variants.map((variant) => {
      if (variant.identityEvidence?.source !== "CJ_API" || variant.identityEvidence.status !== "VARIANT_VERIFIED") return variant;
      variantsRequiringReview += 1;
      return { ...variant, identityEvidence: { ...variant.identityEvidence, status: "VARIANT_REVIEW_REQUIRED" as const, evidence: [...variant.identityEvidence.evidence, "VID existence alone does not verify the intended sellable variant."] } };
    });
    if (variants.some((variant, index) => variant !== product.variants[index])) await saveCjCatalogueProduct({ ...product, variants });
  }
  return { controlledProducts: products.length, downgradedMappings: downgraded, variantsRequiringReview };
}

export function cjVariantToSupplierOffer(product: SupplierCatalogueProduct, variant: SupplierCatalogueVariant, mapping?: SupplierProductMapping): SupplierOffer {
  return {
    id: exactOfferId(product.supplierProductId, variant.supplierVariantId),
    tekcentralProductId: mapping?.productId ?? "",
    supplierId: "CJ",
    supplierProductId: product.supplierProductId,
    supplierVariantId: variant.supplierVariantId,
    supplierSku: variant.supplierVariantSku ?? product.supplierSku,
    cost: variant.price ?? product.supplierPrice ?? null,
    currency: variant.currency ?? product.currency,
    availability: variant.stockTotal === undefined ? "UNKNOWN" : variant.stockTotal > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    fulfilmentCapability: "SUPPORTED",
    mappingStatus: mapping?.status ?? "UNMAPPED",
    lastVerifiedAt: mapping?.verifiedAt ?? product.lastSuccessfulRefreshAt,
    metadata: {
      supplierTitle: product.supplierProductName,
      supplierProductSku: product.supplierSku,
      supplierVariantSku: variant.supplierVariantSku,
      brand: product.brand,
      manufacturer: product.manufacturer,
      manufacturerPartNumber: product.manufacturerPartNumber,
      model: product.model,
      gtin: product.gtin,
      ean: product.ean,
      upc: product.upc,
      sourceCategory: product.categoryName,
      imageUrl: variant.imageUrl ?? product.imageUrl,
      attributes: variant.attributes,
      logistics: variant.launch?.logistics ?? logistics(product, variant),
      sourceFingerprint: variant.rawSourceFingerprint,
    },
  };
}

export function exactCjProductIdentityMatches(product: SupplierCatalogueProduct, candidate: Awaited<ReturnType<typeof listAdminProducts>>[number]) {
  const candidateIdentity = candidate as typeof candidate & { manufacturerPartNumber?: string; gtin?: string; ean?: string; upc?: string };
  const sourceCodes = [product.gtin, product.ean, product.upc].map(clean).filter(Boolean);
  const candidateCodes = [candidateIdentity.gtin, candidateIdentity.ean, candidateIdentity.upc].map(clean).filter(Boolean);
  if (sourceCodes.some((code) => candidateCodes.includes(code))) return true;
  const manufacturerSku = clean(product.manufacturerPartNumber);
  if (manufacturerSku && manufacturerSku === clean(candidateIdentity.manufacturerPartNumber ?? candidate.model)) return true;
  const manufacturer = clean(product.manufacturer ?? product.brand);
  const model = clean(product.model ?? product.manufacturerPartNumber);
  if (!manufacturer || !model) return false;
  return clean(candidate.brand) === manufacturer && clean(candidate.model) === model;
}

export function historicalCjMappingReviewStatus(mapping: SupplierProductMapping) {
  return hasStrongMappingEvidence(mapping) ? "VERIFIED" as const : "REVIEW_REQUIRED" as const;
}

export async function previewCjProductMapping(input: { supplierProductId: string; supplierVariantId: string }) {
  const product = await getCjCatalogueProduct(input.supplierProductId);
  const variant = product?.variants.find((item) => item.supplierVariantId === input.supplierVariantId);
  if (!product || !variant) throw new Error("CJ product and exact variant are required.");
  const offerId = exactOfferId(product.supplierProductId, variant.supplierVariantId);
  const existingFromOffer = await getProductCreatedFromOffer(offerId);
  const [adminProducts, allMappings] = await Promise.all([listAdminProducts(), listSupplierProductMappings()]);
  const mappings = allMappings.filter((mapping) => mapping.supplierCode === "CJ" && mapping.supplierProductId === product.supplierProductId && mapping.supplierVariantId === variant.supplierVariantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const current = mappings.find((mapping) => mapping.status !== "SUPERSEDED" && mapping.status !== "REJECTED");
  const exactMatches = adminProducts.filter((candidate) => exactCjProductIdentityMatches(product, candidate));
  const match = existingFromOffer ?? exactMatches[0];
  const sourceTokens = new Set(clean(`${product.supplierProductName} ${variant.name ?? ""}`).split(" ").filter((token) => token.length > 3));
  const candidates = adminProducts.map((candidate) => {
    const exactIdentity = exactCjProductIdentityMatches(product, candidate);
    const candidateTokens = clean(`${candidate.name} ${candidate.brand} ${candidate.model ?? ""} ${candidate.sku ?? ""}`).split(" ");
    const overlap = candidateTokens.filter((token) => sourceTokens.has(token)).length;
    const supplierCodes = [...new Set(allMappings.filter((mapping) => mapping.productId === candidate.id && mapping.status !== "SUPERSEDED").map((mapping) => mapping.supplierCode))];
    return { product: { id: candidate.id, name: candidate.name, sku: candidate.sku, brand: candidate.brand, model: candidate.model, category: candidate.category, publicationStatus: "publicationStatus" in candidate ? candidate.publicationStatus : "LEGACY_CATALOGUE" }, exactIdentity, confidence: exactIdentity ? "HIGH" as const : overlap >= 2 ? "MEDIUM" as const : "LOW" as const, evidence: exactIdentity ? ["Exact manufacturer/model, manufacturer SKU or GTIN identity"] : overlap ? [`${overlap} descriptive term(s) overlap; staff review required`] : ["No strong identity evidence"], supplierCodes, demoProduct: isDemoProduct(candidate) };
  }).filter((candidate) => candidate.exactIdentity || candidate.confidence !== "LOW").sort((a, b) => Number(b.exactIdentity) - Number(a.exactIdentity) || (b.confidence === "MEDIUM" ? 1 : 0) - (a.confidence === "MEDIUM" ? 1 : 0)).slice(0, 12);
  const sharedCategorySuggestion = await suggestCanonicalCategory({ supplierId: "CJ", sourceCategoryId: product.categoryId, sourceCategoryLabel: product.categoryName, productName: `${product.supplierProductName} ${variant.name ?? ""}`, supplierSku: variant.supplierVariantSku ?? product.supplierSku, brand: product.brand ?? product.manufacturer, specifications: Object.entries(variant.attributes ?? {}).map(([name, value]) => ({ name, value })) });
  const canonicalPath=await canonicalTaxonomyPath({categoryId:sharedCategorySuggestion.suggestedCategoryId,subcategoryId:sharedCategorySuggestion.suggestedSubcategoryId,productTypeId:sharedCategorySuggestion.suggestedProductTypeId}); const canonicalCategorySuggestion = canonicalPath.category;
  const legacyCategorySuggestion = suggestCjCategory(product);
  const categorySuggestion = canonicalCategorySuggestion ?? legacyCategorySuggestion;
  const subcategorySuggestion = canonicalPath.subcategory?.name ?? suggestCjSubcategory(product, categorySuggestion?.slug);
  const brandSuggestion = strongCjBrand(product);
  const titleSuggestion = suggestedTitle(product, variant);
  const descriptionSuggestion = suggestedDescription(product, variant, titleSuggestion, brandSuggestion.value);
  const sourceSku = variant.supplierVariantSku ?? product.supplierSku ?? variant.supplierVariantId;
  const action = match ? "MAP_EXISTING" as const : "CREATE_NEW" as const;
  const canonicalCategories=await getCanonicalTaxonomyTree();
  return {
    proposalVersion: 2 as const,
    proposalFingerprint: `${product.rawSourceFingerprint}:${variant.rawSourceFingerprint ?? variant.supplierVariantId}:v2`,
    action,
    confidence: match ? "HIGH" as const : "LOW" as const,
    reason: match ? "An exact supplier-neutral Product match exists; map this CJ offer to it." : "No exact Product identity match was found. Staff may review and create a supplier-neutral Product.",
    product,
    variant,
    offer: cjVariantToSupplierOffer(product, variant, current),
    currentMapping: current,
    currentMappedProduct: current ? await getAdminProductById(current.productId) : undefined,
    existingProduct: match,
    candidates,
    proposal: {
      name: titleSuggestion,
      brand: brandSuggestion.value,
      model: product.model ?? product.manufacturerPartNumber ?? "",
      categorySlug: categorySuggestion?.slug ?? "",
      categoryName: canonicalCategorySuggestion?.label ?? legacyCategorySuggestion?.name,
      subcategory: subcategorySuggestion,
      proposedSku: proposedSku(sourceSku),
      imageUrl: variant.imageUrl ?? product.imageUrl,
      shortDescription: descriptionSuggestion,
      categoryReviewRequired: !categorySuggestion,
      categorySuggestion: sharedCategorySuggestion,
      variantAttributes: variant.attributes ?? {},
      evidenceNote: `Suggested from CJ product title, exact selected variant${variant.name ? ` (${variant.name})` : ""}, supplier category and structured product attributes. Review completed before Product creation.`,
      sourceReference: `CJ PID ${product.supplierProductId} / VID ${variant.supplierVariantId}`,
      fieldConfidence: {
        title: variantIdentityValues(variant).length ? "HIGH" as const : "MEDIUM" as const,
        brand: brandSuggestion.confidence,
        model: product.model || product.manufacturerPartNumber ? "HIGH" as const : "LOW" as const,
        category: categorySuggestion ? "HIGH" as const : "LOW" as const,
        subcategory: subcategorySuggestion ? "HIGH" as const : "LOW" as const,
        description: descriptionSuggestion !== titleSuggestion ? "HIGH" as const : "LOW" as const,
      },
      evidenceSummary: [product.manufacturer && `Manufacturer: ${product.manufacturer}`, product.brand && `Brand: ${product.brand}`, !product.manufacturer && !product.brand && brandSuggestion.value && `Brand inferred from ${brandSuggestion.source}: ${brandSuggestion.value}`, product.model && `Model: ${product.model}`, product.manufacturerPartNumber && `Manufacturer part number: ${product.manufacturerPartNumber}`, product.categoryName && `Supplier category: ${product.categoryName}`, ...Object.entries(variant.attributes ?? {}).map(([key, value]) => `${key}: ${value}`), variant.name && `Selected variant: ${variant.name}`, product.gtin && `GTIN: ${product.gtin}`, `CJ PID: ${product.supplierProductId}`, `Exact VID: ${variant.supplierVariantId}`].filter((item): item is string => Boolean(item)),
    },
    categories: canonicalCategories.map(({ slug, name, children }) => ({ slug, name, subcategories:children.map((item)=>item.name) })),
  };
}

const cjProductCreationLocks = new Map<string, Promise<Awaited<ReturnType<typeof createTekCentralProductFromCjUnlocked>>>>();

export async function createTekCentralProductFromCj(input: { supplierProductId: string; supplierVariantId: string; name: string; categorySlug: string; subcategory?: string; brand?: string; model?: string; shortDescription?: string; evidenceNote?: string; sourceReference?: string; previousMappingId?: string; confirmDemoProduct?: boolean; confirmed: boolean; actor?: string }) {
  const key = exactOfferId(input.supplierProductId.trim(), input.supplierVariantId.trim());
  const pending = cjProductCreationLocks.get(key);
  if (pending) return pending;
  const operation = createTekCentralProductFromCjUnlocked(input).finally(() => cjProductCreationLocks.delete(key));
  cjProductCreationLocks.set(key, operation);
  return operation;
}

async function createTekCentralProductFromCjUnlocked(input: { supplierProductId: string; supplierVariantId: string; name: string; categorySlug: string; subcategory?: string; brand?: string; model?: string; shortDescription?: string; evidenceNote?: string; sourceReference?: string; previousMappingId?: string; confirmDemoProduct?: boolean; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("STAFF_CONFIRMATION_REQUIRED");
  const preview = await previewCjProductMapping(input);
  const suppliedBrand = input.brand?.trim() || undefined;
  const suppliedModel = input.model?.trim() || undefined;
  if (!input.evidenceNote?.trim() || !input.sourceReference?.trim()) throw new Error("Product creation and mapping require evidence and a source reference.");
  const offerId = preview.offer.id;
  const existing = preview.existingProduct ?? await getProductCreatedFromOffer(offerId);
  const now = new Date().toISOString();
  if (existing) {
    if (isDemoProduct(existing) && !input.confirmDemoProduct) throw new Error("This target appears to be a demo/test Product and should not normally be used for production supplier mapping.");
    const replacement = { productId: existing.id, supplierCode: "CJ" as const, supplierSku: preview.offer.supplierSku ?? preview.variant.supplierVariantId, supplierOfferId: offerId, supplierProductId: preview.product.supplierProductId, supplierProductSku: preview.product.supplierSku, supplierVariantId: preview.variant.supplierVariantId, supplierVariantSku: preview.variant.supplierVariantSku, status: "VERIFIED" as const, confidence: 1, confidenceLevel: "HIGH" as const, matchMethod: "EXACT_MANUFACTURER_MODEL", evidence: [preview.reason, input.evidenceNote.trim(), `Source: ${input.sourceReference.trim()}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "CJ_PRODUCT_CREATION" };
    const mappingResult = input.previousMappingId ? await supersedeSupplierProductMapping({ previousMappingId: input.previousMappingId, replacement, actor: input.actor, evidence: `Replaced after exact Product review: ${input.evidenceNote.trim()}` }) : { previous: undefined, replacement: await saveSupplierProductMapping(replacement) };
    return { product: existing, mapping: mappingResult.replacement, previousMapping: mappingResult.previous, created: false };
  }
  const category = await canonicalTaxonomyCategory(input.categorySlug);
  if (!category) throw new Error("CATEGORY_CONFIRMATION_REQUIRED");
  const subcategoryNode=input.subcategory?category.children.find((item)=>item.id===input.subcategory||item.slug===input.subcategory||item.name.toLowerCase()===input.subcategory?.toLowerCase()):undefined; if (input.subcategory && !subcategoryNode) throw new Error("INVALID_SUBCATEGORY");
  const brand = suppliedBrand ?? preview.product.manufacturer ?? preview.product.brand ?? "Unbranded";
  const model = suppliedModel ?? preview.product.model ?? preview.product.manufacturerPartNumber;
  if (!input.name.trim()) throw new Error("PRODUCT_TITLE_CONFIRMATION_REQUIRED");
  const sourceSku = preview.variant.supplierVariantSku ?? preview.product.supplierSku ?? preview.variant.supplierVariantId;
  const imageUrl = preview.variant.imageUrl ?? preview.product.imageUrl;
  const description = sanitizeCjProductContent(input.shortDescription) || preview.proposal.shortDescription || input.name.trim();
  const taxonomy = await resolveCanonicalTaxonomy({ name: input.name.trim(), sku: sourceSku, categoryId:category.id,subcategoryId:subcategoryNode?.id,taxonomyVersion:1,taxonomyStatus:"VERIFIED" });
  const product = await saveInternalProduct({ slug: slugify(input.name), sku: proposedSku(sourceSku), name: input.name.trim(), brand, model: model || undefined, manufacturerPartNumber: preview.product.manufacturerPartNumber, gtin: preview.product.gtin, ean: preview.product.ean, upc: preview.product.upc, category: category.name, categorySlug: category.slug, subcategory: input.subcategory, ...taxonomy, shortDescription: description, images: imageUrl ? [imageUrl] : [], publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "CJ", sourceSupplierOfferId: offerId, sourceSupplierSku: sourceSku, sourceDescription: preview.product.supplierProductName, sourceCategory: { supplierId: "CJ", sourceCategoryId: preview.product.categoryId, sourceCategoryLabel: preview.product.categoryName }, manufacturer: preview.product.manufacturer, sourceImage: imageUrl ? { source: "CJ", originalUrl: imageUrl, capturedAt: now } : undefined } });
  const mappingInput = { productId: product.id, supplierCode: "CJ" as const, supplierSku: sourceSku, supplierOfferId: offerId, supplierProductId: preview.product.supplierProductId, supplierProductSku: preview.product.supplierSku, supplierVariantId: preview.variant.supplierVariantId, supplierVariantSku: preview.variant.supplierVariantSku, status: "VERIFIED" as const, confidence: 1, confidenceLevel: "HIGH" as const, matchMethod: "STAFF_CONFIRMED_CJ_VARIANT_CREATION", evidence: ["Created from exact CJ product and variant identity", `VID ${preview.variant.supplierVariantId}`, `Brand ${brand}`, ...(model ? [`Model ${model}`] : []), input.evidenceNote.trim(), `Source: ${input.sourceReference.trim()}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "CJ_PRODUCT_CREATION" };
  const mappingResult = input.previousMappingId
    ? await supersedeSupplierProductMapping({ previousMappingId: input.previousMappingId, replacement: mappingInput, actor: input.actor, evidence: `Replaced by staff-confirmed Product creation: ${input.evidenceNote?.trim() ?? "exact identity reviewed"}` })
    : { previous: undefined, replacement: await saveSupplierProductMapping(mappingInput) };
  return { product, mapping: mappingResult.replacement, previousMapping: mappingResult.previous, created: true };
}

export async function setCjVariantLaunchState(input: { supplierProductId: string; supplierVariantId: string; state: CjLaunchState; actor?: string }) {
  const now = new Date().toISOString();
  const updated = await updateCjCatalogueVariant(input.supplierProductId, input.supplierVariantId, (variant, product) => ({ ...variant, launch: { state: input.state, updatedAt: now, updatedBy: input.actor ?? "Admin staff", logistics: variant.launch?.logistics ?? logistics(product, variant) } }));
  if (!updated) throw new Error("CJ product or variant not found.");
  return updated;
}

export function latestCjProposal(proposals: Awaited<ReturnType<typeof listPricingProposals>>, offerId: string, productId?: string) {
  return proposals.filter((proposal) => proposal.supplierId === "CJ" && proposal.supplierOfferId === offerId && (!productId || proposal.productId === productId) && proposal.status !== "REJECTED" && proposal.status !== "SUPERSEDED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

export async function getCjVariantLaunchReadiness(product: SupplierCatalogueProduct, variant: SupplierCatalogueVariant, mapping?: SupplierProductMapping, productLaunchState?: "NOT_SELECTED" | "SELECTED_FOR_LAUNCH") {
  const offer = cjVariantToSupplierOffer(product, variant, mapping);
  const proposal = latestCjProposal(await listPricingProposals(), offer.id, mapping?.productId);
  const blockers: string[] = [];
  const sourceCurrency = variant.costEvidence?.currency ?? variant.currency ?? product.currency;
  const [settings, supplierPolicy, supplierEvidence, fx] = await Promise.all([
    getBusinessSettings(),
    getSupplierPolicySettings(),
    getCjEvidenceSettings(),
    sourceCurrency ? resolveFxEvidence(sourceCurrency) : Promise.resolve({ rate: undefined, capturedAt: undefined }),
  ]);
  const evidence = deriveCjPricingEvidence({ product, variant, mapping, supplierCurrencyEvidence: supplierEvidence.accountCurrency, fxRate: fx.rate, fxRateUpdatedAt: fx.capturedAt, fxStaleAfterHours: settings.pricing.fxStaleAfterHours, sourcePriceFreshnessHours: supplierPolicy.sourcePriceFreshnessHours });
  if ((productLaunchState ?? variant.launch?.state) !== "SELECTED_FOR_LAUNCH") blockers.push("NOT_SELECTED");
  if (mapping?.status !== "VERIFIED" || mapping.supplierVariantId !== variant.supplierVariantId || evidence.identityStatus !== "IDENTITY_VERIFIED") blockers.push("MAPPING_NOT_VERIFIED");
  if ((variant.launch?.logistics ?? logistics(product, variant)).status !== "COMPLETE") blockers.push("LOGISTICS_INCOMPLETE");
  blockers.push(...evidence.blockers.filter((blocker) => !blockers.includes(blocker)));
  if (!proposal) blockers.push("PRICING_MISSING");
  else if (proposal.status !== "APPROVED") blockers.push("PRICING_NOT_APPROVED");
  if (offer.availability === "OUT_OF_STOCK") blockers.push("OFFER_UNAVAILABLE");
  const nextAction = blockers.includes("NOT_SELECTED") ? "Select for launch" : blockers.includes("MAPPING_NOT_VERIFIED") ? "Match or create product" : blockers.includes("LOGISTICS_INCOMPLETE") ? "Resolve logistics" : blockers.includes("PRICING_MISSING") || blockers.includes("PRICING_NOT_APPROVED") ? "Review pricing" : "Review & Publish";
  return { status: blockers.length ? "NOT_READY" as const : "READY_FOR_PUBLISH_REVIEW" as const, blockers, nextAction, offer, proposal, evidence };
}
