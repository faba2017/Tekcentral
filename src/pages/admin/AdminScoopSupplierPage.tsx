import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiCheck, FiLoader, FiRefreshCw, FiSearch } from "react-icons/fi";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { ScoopLaunchReadiness } from "@/components/admin/ScoopLaunchReadiness";
import { MatchConfidence, ScoopProductCreationPanel } from "@/components/admin/ScoopProductCreationPanel";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { products as tekcentralProducts } from "@/data/catalogue";
import { ApiError, apiRequest } from "@/lib/api";
import type { PricingProposal, ScoopCatalogueProduct, ScoopCatalogueStatus, ScoopCatalogueSyncSummary, ScoopLogisticsEnrichmentSummary, SupplierMappingsResponse } from "@/lib/admin";
import type { AdminToastVariant } from "@/lib/cj-workflow";
import { upsertMapping } from "@/lib/cj-workflow";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { supplierByCode } from "@/lib/supplier-registry";
import type { SupplierProductMapping } from "@/types/order";

type Feedback = { variant: AdminToastVariant; message: string };
type MappingFilter = "ALL" | "UNMAPPED" | "SUGGESTED" | "VERIFIED" | "REJECTED" | "STALE";
type LogisticsFilter = "ALL" | "COMPLETE" | "PARTIAL" | "MISSING" | "ADMIN_OVERRIDE";
type SourceFilter = "ALL" | ScoopCatalogueProduct["reconciliationStatus"];
type EnrichmentScope = "MISSING" | "SELECTED_FOR_LAUNCH" | "VERIFIED_MAPPINGS" | "MANUFACTURER";
const pageSize = 30;

function proposalsForMapping(proposals: PricingProposal[], supplierSku: string, productId?: string) {
  return proposals.filter((proposal) => proposal.supplierId === "SCOOP" && proposal.supplierOfferId === `SCOOP:${supplierSku}` && proposal.productId === productId);
}

function proposalActionState(proposals: PricingProposal[], supplierSku: string, productId?: string) {
  const exact = proposalsForMapping(proposals, supplierSku, productId).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const active = exact.find((proposal) => proposal.status !== "SUPERSEDED" && proposal.status !== "REJECTED");
  if (!active) return { label: exact.length ? "Generate new proposal" : "Generate proposal", disabled: false, active: undefined };
  const override = active.proposalKind === "MANUAL_OVERRIDE" || Boolean(active.manualOverride);
  if (active.status === "APPROVED") return { label: override ? "Override approved ✓" : "Price approved ✓", disabled: true, active };
  return { label: override ? "Override pending" : "Proposal pending", disabled: true, active };
}

function moneyLabel(value: number | undefined, currency = "ZAR") {
  if (value === undefined) return "Unavailable";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function advisoryCandidates(offer: ScoopCatalogueProduct, search: string) {
  const generic = new Set(["network", "wireless", "bracket", "switch", "device", "product", "system"]);
  const offerTokens = new Set(normalize(offer.description).split(" ").filter((token) => token.length > 2 && !generic.has(token)));
  const term = normalize(search);
  return tekcentralProducts.map((product) => {
    const productText = normalize([product.sku, product.name, product.brand, product.category, product.subcategory, ...(product.tags ?? [])].filter(Boolean).join(" "));
    const exactSku = Boolean(product.sku && normalize(product.sku) === normalize(offer.supplierSku));
    const manufacturer = normalize(product.brand) === normalize(offer.manufacturer ?? "");
    const modelMatch = Boolean(product.model && normalize(offer.description).includes(normalize(product.model)));
    const overlapTerms = [...offerTokens].filter((token) => productText.includes(token));
    const score = (exactSku ? 100 : 0) + (modelMatch ? 50 : 0) + (manufacturer ? 30 : 0) + Math.min(overlapTerms.length * 5, 20);
    const confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = exactSku && manufacturer || modelMatch && manufacturer ? "HIGH" : manufacturer && overlapTerms.length >= 2 ? "MEDIUM" : "LOW";
    const evidence = [exactSku && "Exact SKU", modelMatch && "Model identity", manufacturer && "Manufacturer", overlapTerms.length > 0 && `Title: ${overlapTerms.join(", ")}`].filter((value): value is string => Boolean(value));
    return { product, confidenceLevel, evidence, score };
  }).filter(({ product, score }) => {
    const productText = normalize([product.sku, product.name, product.brand, product.category].filter(Boolean).join(" "));
    return (!term || productText.includes(term)) && (Boolean(term) || score > 0);
  }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)).slice(0, term ? 20 : 5);
}

function effectiveMappingStatus(product: ScoopCatalogueProduct, mapping?: SupplierProductMapping): MappingFilter {
  if (product.availability === "STALE") return "STALE";
  return mapping?.status ?? "UNMAPPED";
}

function badgeStatus(status: MappingFilter | ScoopCatalogueProduct["availability"]) {
  if (status === "VERIFIED" || status === "AVAILABLE") return "PAID";
  if (status === "REJECTED" || status === "STALE" || status === "OUT_OF_STOCK") return "CANCELLED";
  return "PENDING";
}

export function AdminScoopSupplierPage() {
  usePageTitle("Scoop catalogue | TekCentral Ops");
  const [searchParams, setSearchParams] = useSearchParams();
  const supplier = supplierByCode("SCOOP");
  const [products, setProducts] = useState<ScoopCatalogueProduct[]>([]);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);
  const [pricingProposals, setPricingProposals] = useState<PricingProposal[]>([]);
  const [sync, setSync] = useState<ScoopCatalogueSyncSummary>();
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("ALL");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("ALL");
  const [logisticsFilter, setLogisticsFilter] = useState<LogisticsFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [enrichment, setEnrichment] = useState<ScoopLogisticsEnrichmentSummary>();
  const [enrichmentResults, setEnrichmentResults] = useState<{ supplierSku: string; manufacturer?: string; model?: string; identityConfidence?: string; source?: string; status: string; failureReason?: string; shippingBasis?: string; cached: boolean; readinessChanged: boolean }[]>([]);
  const [enrichmentScope, setEnrichmentScope] = useState<EnrichmentScope>("MISSING");
  const [selectedSku, setSelectedSku] = useState(() => searchParams.get("sku") ?? "");
  const [productSearch, setProductSearch] = useState("");
  const [selectedTekcentralProductId, setSelectedTekcentralProductId] = useState("");
  const [productCreationOpen, setProductCreationOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState({ load: true, sync: false, mapping: false, proposal: false, enrichment: false });
  const [feedback, setFeedback] = useState<Feedback>();
  const [logisticsEditor, setLogisticsEditor] = useState<{ weightUnit: "g" | "kg"; weight: string; length: string; width: string; height: string }>();
  const [importCsv, setImportCsv] = useState("");
  const [importPreview, setImportPreview] = useState<{ importFingerprint: string; rows: { rowNumber: number; sku: string; status?: string; errors: string[] }[]; summary: { rowsRead: number; matched: number; complete: number; partial: number; rejected: number; unknownSkus: number } }>();
  const [websiteImport, setWebsiteImport] = useState("");
  const [websitePreview, setWebsitePreview] = useState<{ importFingerprint: string; rows: { rowNumber: number; sku: string; title: string; status: "VALID" | "REJECTED"; errors: string[] }[]; summary: { rowsRead: number; valid: number; rejected: number } }>();
  const proposalRequestInFlight = useRef(false);

  const load = async () => {
    const [productsResponse, statusResponse, mappingsResponse, proposalsResponse] = await Promise.all([
      apiRequest<{ products: ScoopCatalogueProduct[] }>("/api/admin/suppliers/scoop/products"),
      apiRequest<ScoopCatalogueStatus>("/api/admin/suppliers/scoop/status"),
      apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=SCOOP"),
      apiRequest<{ proposals: PricingProposal[] }>("/api/admin/pricing/proposals"),
    ]);
    setProducts(productsResponse.products);
    setSync(statusResponse.lastSync);
    setEnrichment(statusResponse.lastEnrichment);
    setMappings(mappingsResponse.mappings);
    setPricingProposals(proposalsResponse.proposals);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ products: ScoopCatalogueProduct[] }>("/api/admin/suppliers/scoop/products"),
      apiRequest<ScoopCatalogueStatus>("/api/admin/suppliers/scoop/status"),
      apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=SCOOP"),
      apiRequest<{ proposals: PricingProposal[] }>("/api/admin/pricing/proposals"),
    ]).then(([productsResponse, statusResponse, mappingsResponse, proposalsResponse]) => {
      if (!active) return;
      setProducts(productsResponse.products);
      setSync(statusResponse.lastSync);
      setEnrichment(statusResponse.lastEnrichment);
      setMappings(mappingsResponse.mappings);
      setPricingProposals(proposalsResponse.proposals);
    }).catch((error) => {
      if (active) setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Scoop catalogue is not available." });
    }).finally(() => {
      if (active) setLoading((current) => ({ ...current, load: false }));
    });
    return () => { active = false; };
  }, []);

  const mappingBySku = useMemo(() => {
    const result = new Map<string, SupplierProductMapping>();
    for (const mapping of mappings) {
      const current = result.get(mapping.supplierSku);
      const mappingIsVerified = mapping.status === "VERIFIED";
      const currentIsVerified = current?.status === "VERIFIED";
      if (
        !current ||
        (mappingIsVerified && !currentIsVerified) ||
        (mappingIsVerified === currentIsVerified && mapping.updatedAt > current.updatedAt)
      ) result.set(mapping.supplierSku, mapping);
    }
    return result;
  }, [mappings]);

  const manufacturers = useMemo(() => [...new Set(products.map((product) => product.manufacturer).filter((value): value is string => Boolean(value)))].sort(), [products]);
  const metrics = useMemo(() => ({
    total: products.length,
    unmapped: products.filter((product) => !mappingBySku.has(product.supplierSku)).length,
    suggested: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "SUGGESTED").length,
    verified: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "VERIFIED").length,
    rejected: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "REJECTED").length,
    stale: products.filter((product) => product.availability === "STALE").length,
    inStock: products.filter((product) => product.availability === "AVAILABLE").length,
    outOfStock: products.filter((product) => product.availability === "OUT_OF_STOCK").length,
    logisticsComplete: products.filter((product) => product.logisticsMetadata?.status === "COMPLETE").length,
    logisticsPartial: products.filter((product) => ["WEIGHT_ONLY", "DIMENSIONS_ONLY"].includes(product.logisticsMetadata?.status ?? "")).length,
    logisticsMissing: products.filter((product) => !product.logisticsMetadata || ["MISSING", "INVALID"].includes(product.logisticsMetadata.status)).length,
    logisticsAdmin: products.filter((product) => product.logisticsMetadata?.source === "ADMIN" || product.logisticsMetadata?.source === "ADMIN_IMPORT").length,
    logisticsPage: products.filter((product) => product.logisticsMetadata?.source === "SUPPLIER_PRODUCT_PAGE").length,
    logisticsOther: products.filter((product) => ["SUPPLIER_FEED", "MANUFACTURER", "UNKNOWN"].includes(product.logisticsMetadata?.source ?? "")).length,
    mapped: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "VERIFIED").length,
    mappedInStock: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "VERIFIED" && product.availability === "AVAILABLE").length,
    shippingReadyMapped: products.filter((product) => mappingBySku.get(product.supplierSku)?.status === "VERIFIED" && product.logisticsMetadata?.status === "COMPLETE").length,
    launchSelected: products.filter((product) => product.launchAssortment?.state === "SELECTED_FOR_LAUNCH").length,
    launchSelectedComplete: products.filter((product) => product.launchAssortment?.state === "SELECTED_FOR_LAUNCH" && product.logisticsMetadata?.status === "COMPLETE").length,
    xmlBacked: products.filter((product) => product.sourceObservations.some((source) => source.sourceType === "XML_FEED" && source.active)).length,
    websiteBacked: products.filter((product) => product.sourceObservations.some((source) => source.sourceType === "WEBSITE" && source.active)).length,
    both: products.filter((product) => product.reconciliationStatus === "BOTH").length,
    websiteOnly: products.filter((product) => product.reconciliationStatus === "WEBSITE_ONLY").length,
    xmlOnly: products.filter((product) => product.reconciliationStatus === "XML_ONLY").length,
    conflicts: products.filter((product) => product.reconciliationStatus === "SOURCE_MISMATCH").length,
  }), [mappingBySku, products]);

  const filteredProducts = useMemo(() => {
    const term = normalize(search);
    return products.filter((product) => {
      const mapping = mappingBySku.get(product.supplierSku);
      return (!term || normalize([product.supplierSku, product.description, product.manufacturer].filter(Boolean).join(" ")).includes(term))
        && (manufacturer === "ALL" || product.manufacturer === manufacturer)
        && (mappingFilter === "ALL" || effectiveMappingStatus(product, mapping) === mappingFilter)
        && (sourceFilter === "ALL" || product.reconciliationStatus === sourceFilter)
        && (logisticsFilter === "ALL" || (logisticsFilter === "COMPLETE" ? product.logisticsMetadata?.status === "COMPLETE" : logisticsFilter === "PARTIAL" ? ["WEIGHT_ONLY", "DIMENSIONS_ONLY"].includes(product.logisticsMetadata?.status ?? "") : logisticsFilter === "ADMIN_OVERRIDE" ? product.logisticsMetadata?.source === "ADMIN" : !product.logisticsMetadata || ["MISSING", "INVALID"].includes(product.logisticsMetadata.status)));
    });
  }, [manufacturer, logisticsFilter, mappingBySku, mappingFilter, products, search, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const pageProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const selectedOffer = products.find((product) => product.supplierSku === selectedSku);
  const selectedMapping = selectedOffer ? mappingBySku.get(selectedOffer.supplierSku) : undefined;
  const selectedProposalAction = selectedOffer ? proposalActionState(pricingProposals, selectedOffer.supplierSku, selectedMapping?.productId) : undefined;
  const selectedTekcentralProduct = tekcentralProducts.find((product) => product.id === (selectedTekcentralProductId || selectedMapping?.productId));
  const candidates = selectedOffer ? advisoryCandidates(selectedOffer, productSearch) : [];
  const workspaceView = searchParams.get("view") === "launch" ? "LAUNCH_READINESS" : "CATALOGUE";
  const blockerFocus = searchParams.get("focus");

  useEffect(() => {
    if (!selectedOffer || !blockerFocus) return;
    const target = document.getElementById("scoop-selected-workflow");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }, [blockerFocus, selectedOffer]);

  const setWorkspaceView = (view: "CATALOGUE" | "LAUNCH_READINESS") => {
    const next = new URLSearchParams(searchParams);
    if (view === "LAUNCH_READINESS") next.set("view", "launch");
    else next.delete("view");
    next.delete("focus");
    setSearchParams(next);
  };

  const openCatalogueWorkflow = (supplierSku: string, focus: "mapping" | "logistics" | "pricing") => {
    setSelectedSku(supplierSku);
    setSelectedTekcentralProductId(mappingBySku.get(supplierSku)?.productId ?? "");
    setProductSearch("");
    setSearchParams({ view: "catalogue", sku: supplierSku, focus, return: "launch" });
  };

  const syncCatalogue = async () => {
    setLoading((current) => ({ ...current, sync: true }));
    setFeedback(undefined);
    try {
      const response = await apiRequest<{ sync: ScoopCatalogueSyncSummary }>("/api/admin/suppliers/scoop/sync", { method: "POST" });
      setSync(response.sync);
      await load();
      setPage(1);
      setFeedback({ variant: "success", message: "Scoop catalogue sync completed." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Scoop catalogue sync failed." });
    } finally {
      setLoading((current) => ({ ...current, sync: false }));
    }
  };

  const enrichLogistics = async () => {
    setLoading((current) => ({ ...current, enrichment: true })); setFeedback(undefined);
    const request = enrichmentScope === "SELECTED_FOR_LAUNCH" ? { limit: 25, selectedForLaunchOnly: true, missingOnly: true } : enrichmentScope === "VERIFIED_MAPPINGS" ? { limit: 25, verifiedMappingsOnly: true, missingOnly: true } : enrichmentScope === "MANUFACTURER" ? { limit: 25, manufacturer: manufacturer === "ALL" ? undefined : manufacturer, missingOnly: true } : { limit: 25, missingOnly: true };
    try { const response = await apiRequest<{ summary: ScoopLogisticsEnrichmentSummary; products: typeof enrichmentResults }>("/api/admin/suppliers/scoop/logistics/enrich", { method: "POST", body: JSON.stringify(request) }); setEnrichment(response.summary); setEnrichmentResults(response.products); await load(); setFeedback({ variant: response.summary.failed ? "warning" : "success", message: `Logistics enrichment processed ${response.summary.processed}. Complete ${response.summary.complete}, partial ${response.summary.partial}, missing ${response.summary.missing}, failed ${response.summary.failed}.` }); }
    catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Scoop logistics enrichment failed." }); }
    finally { setLoading((current) => ({ ...current, enrichment: false })); }
  };

  const openLogisticsEditor = () => {
    if (!selectedOffer) return; const metadata = selectedOffer.logisticsMetadata?.source === "ADMIN" ? selectedOffer.logisticsMetadata : undefined;
    setLogisticsEditor({ weightUnit: "g", weight: metadata?.weightGrams?.toString() ?? "", length: metadata?.lengthMm?.toString() ?? "", width: metadata?.widthMm?.toString() ?? "", height: metadata?.heightMm?.toString() ?? "" });
  };
  const saveLogisticsOverride = async (clear = false) => {
    if (!selectedOffer || (!clear && !logisticsEditor)) return;
    try {
      await apiRequest(`/api/admin/suppliers/scoop/products/${encodeURIComponent(selectedOffer.supplierSku)}/logistics/admin`, { method: "PATCH", body: JSON.stringify(clear ? { clear: true } : { weightGrams: logisticsEditor!.weight ? Number(logisticsEditor!.weight) * (logisticsEditor!.weightUnit === "kg" ? 1000 : 1) : undefined, lengthMm: logisticsEditor!.length ? Number(logisticsEditor!.length) : undefined, widthMm: logisticsEditor!.width ? Number(logisticsEditor!.width) : undefined, heightMm: logisticsEditor!.height ? Number(logisticsEditor!.height) : undefined }) });
      await load(); setLogisticsEditor(undefined); setFeedback({ variant: "success", message: clear ? "Admin logistics override cleared. The next trusted source is now effective." : "Admin logistics override saved." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Logistics override could not be saved." }); }
  };
  const previewLogisticsImport = async () => {
    try { const response = await apiRequest<typeof importPreview>("/api/admin/suppliers/scoop/logistics/import/preview", { method: "POST", body: JSON.stringify({ csv: importCsv }) }); setImportPreview(response); setFeedback({ variant: response!.summary.rejected ? "warning" : "info", message: response!.summary.rejected ? "Import preview contains rejected rows. Correct them before applying." : "Import preview is valid. Review it before applying." }); }
    catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "CSV preview failed." }); }
  };
  const applyLogisticsImport = async () => {
    if (!importPreview) return; try { const result = await apiRequest<{ updated: number; unchanged: number }>("/api/admin/suppliers/scoop/logistics/import/apply", { method: "POST", body: JSON.stringify({ csv: importCsv, importFingerprint: importPreview.importFingerprint }) }); await load(); setImportPreview(undefined); setImportCsv(""); setFeedback({ variant: "success", message: `Logistics import applied. Updated ${result.updated}; unchanged ${result.unchanged}.` }); }
    catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "CSV import failed." }); }
  };
  const previewWebsiteImport = async () => {
    try {
      const preview = await apiRequest<NonNullable<typeof websitePreview>>("/api/admin/suppliers/scoop/website-import/preview", { method: "POST", body: JSON.stringify({ content: websiteImport }) });
      setWebsitePreview(preview); setFeedback({ variant: preview.summary.rejected ? "warning" : "info", message: preview.summary.rejected ? "Website import contains rejected rows." : "Website discovery import is ready for review." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Website discovery preview failed." }); }
  };
  const applyWebsiteImport = async () => {
    if (!websitePreview) return;
    try {
      const result = await apiRequest<{ discovered: number; newWebsiteOnly: number; mergedWithXml: number; unchanged: number; conflicts: number }>("/api/admin/suppliers/scoop/website-import/apply", { method: "POST", body: JSON.stringify({ content: websiteImport, importFingerprint: websitePreview.importFingerprint }) });
      await load(); setWebsiteImport(""); setWebsitePreview(undefined); setPage(1);
      setFeedback({ variant: result.conflicts ? "warning" : "success", message: `Website import applied. New ${result.newWebsiteOnly}; merged ${result.mergedWithXml}; unchanged ${result.unchanged}; conflicts ${result.conflicts}.` });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Website discovery import failed." }); }
  };
  const exportMissingTemplate = async () => { const response = await apiRequest<{ filename: string; csv: string }>("/api/admin/suppliers/scoop/logistics/missing-template"); const url = URL.createObjectURL(new Blob([response.csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = response.filename; anchor.click(); URL.revokeObjectURL(url); };
  const acquireManufacturerData = async () => {
    const candidates = [...products].filter((product) => product.logisticsMetadata?.status !== "COMPLETE").sort((a, b) => Number(mappingBySku.get(b.supplierSku)?.status === "VERIFIED") - Number(mappingBySku.get(a.supplierSku)?.status === "VERIFIED") || Number(b.availability === "AVAILABLE") - Number(a.availability === "AVAILABLE")).slice(0, 25).map((product) => product.supplierSku);
    try { const response = await apiRequest<{ results: { outcome: string }[] }>("/api/admin/suppliers/scoop/logistics/manufacturer", { method: "POST", body: JSON.stringify({ skus: candidates }) }); await load(); setFeedback({ variant: "success", message: `Manufacturer acquisition completed. ${response.results.filter((result) => result.outcome === "UPDATED").length} exact records updated.` }); }
    catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Manufacturer acquisition failed." }); }
  };
  const enrichSelectedLogistics = async (manufacturerOnly = false) => {
    if (!selectedOffer) return;
    setLoading((current) => ({ ...current, enrichment: true })); setFeedback(undefined);
    try {
      if (manufacturerOnly) {
        const response = await apiRequest<{ results: { outcome: string; reason?: string }[] }>("/api/admin/suppliers/scoop/logistics/manufacturer", { method: "POST", body: JSON.stringify({ skus: [selectedOffer.supplierSku] }) });
        const result = response.results[0];
        setFeedback({ variant: result?.outcome === "FAILED" ? "warning" : "success", message: result?.outcome === "FAILED" ? `Manufacturer lookup: ${result.reason?.replace(/_/g, " ") ?? "no exact record found"}.` : "Exact manufacturer logistics data checked." });
      } else {
        const response = await apiRequest<{ summary: ScoopLogisticsEnrichmentSummary }>("/api/admin/suppliers/scoop/logistics/enrich", { method: "POST", body: JSON.stringify({ skus: [selectedOffer.supplierSku], limit: 1, force: true }) });
        setEnrichment(response.summary); setFeedback({ variant: response.summary.failed ? "warning" : "success", message: "Selected product logistics enrichment completed." });
      }
      await load();
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Logistics enrichment failed." }); }
    finally { setLoading((current) => ({ ...current, enrichment: false })); }
  };

  const suggestMapping = async () => {
    if (!selectedOffer || !selectedTekcentralProductId) return;
    setLoading((current) => ({ ...current, mapping: true }));
    try {
      const response = await apiRequest<{ mapping: SupplierProductMapping }>("/api/admin/supplier-mappings/scoop/suggest", { method: "POST", body: JSON.stringify({ tekcentralProductId: selectedTekcentralProductId, supplierSku: selectedOffer.supplierSku }) });
      setMappings((current) => upsertMapping(current, response.mapping));
      setFeedback({ variant: "success", message: "Suggested mapping saved for staff verification." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Scoop mapping could not be suggested." });
    } finally {
      setLoading((current) => ({ ...current, mapping: false }));
    }
  };

  const updateMapping = async (action: "verify" | "reject") => {
    if (!selectedMapping?.id) return;
    setLoading((current) => ({ ...current, mapping: true }));
    try {
      const confirmWeakMatch = action === "verify" && selectedMapping.confidenceLevel === "LOW"
        ? window.confirm("This appears to be a weak product match. Confirm that both records represent the same physical product before verifying.")
        : false;
      if (action === "verify" && selectedMapping.confidenceLevel === "LOW" && !confirmWeakMatch) return;
      const response = await apiRequest<{ mapping: SupplierProductMapping }>(`/api/admin/supplier-mappings/${encodeURIComponent(selectedMapping.id)}/${action}`, { method: "PATCH", ...(action === "verify" && selectedMapping.confidenceLevel === "LOW" ? { body: JSON.stringify({ confirmWeakMatch }) } : {}) });
      setMappings((current) => upsertMapping(current, response.mapping));
      setFeedback({ variant: "success", message: action === "verify" ? "Scoop mapping verified." : "Scoop mapping rejected." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Scoop mapping update failed." });
    } finally {
      setLoading((current) => ({ ...current, mapping: false }));
    }
  };

  const generateProposal = async () => {
    if (!selectedOffer || !selectedMapping || selectedMapping.status !== "VERIFIED" || selectedProposalAction?.disabled || proposalRequestInFlight.current) return;
    proposalRequestInFlight.current = true;
    setLoading((current) => ({ ...current, proposal: true }));
    try {
      await apiRequest<{ proposal: PricingProposal }>("/api/admin/pricing/proposals/scoop", { method: "POST", body: JSON.stringify({ productId: selectedMapping.productId, supplierSku: selectedOffer.supplierSku }) });
      await load();
      setFeedback({ variant: "success", message: "Pricing proposal generated for approval. No storefront price was changed." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Pricing proposal could not be generated." });
    } finally { proposalRequestInFlight.current = false; setLoading((current) => ({ ...current, proposal: false })); }
  };

  return (
    <AdminShell>
      <AdminPageHeader eyebrow="Supplier catalogue" title="Scoop Distribution" description="Review Scoop offers, map products and compare supplier pricing without changing storefront prices." actions={<div className="grid w-full gap-2 sm:grid-cols-[minmax(180px,1fr)_auto] xl:flex xl:w-auto xl:flex-nowrap xl:items-center"><select aria-label="Logistics enrichment scope" value={enrichmentScope} disabled={loading.enrichment} onChange={(event) => setEnrichmentScope(event.target.value as EnrichmentScope)} className="h-11 min-w-0 rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-black disabled:opacity-60"><option value="MISSING">Missing logistics</option><option value="SELECTED_FOR_LAUNCH">Selected for launch</option><option value="VERIFIED_MAPPINGS">Verified mappings</option><option value="MANUFACTURER" disabled={manufacturer === "ALL"}>Current manufacturer</option></select><button type="button" onClick={enrichLogistics} disabled={loading.enrichment} className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#469D8B] bg-white px-4 text-sm font-black text-[#176B5C] disabled:cursor-wait disabled:opacity-70">{loading.enrichment && <FiLoader className="animate-spin" aria-hidden="true" />}{loading.enrichment ? "Enriching logistics..." : "Enrich logistics data"}</button><button type="button" onClick={syncCatalogue} disabled={loading.sync} className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--tek-accent)] px-4 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-wait disabled:opacity-70 sm:col-span-2 xl:col-span-1">{loading.sync ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiRefreshCw aria-hidden="true" />}{loading.sync ? "Syncing catalogue..." : "Sync Scoop catalogue"}</button></div>} />
      {supplier && <SupplierWorkspaceNav supplier={supplier} />}

      <div className="mt-6 inline-flex rounded-md border border-[#E4E7EC] bg-white p-1" aria-label="Scoop workspace view">
        <button type="button" onClick={() => setWorkspaceView("CATALOGUE")} className={`rounded px-4 py-2 text-sm font-black ${workspaceView === "CATALOGUE" ? "bg-[#E8F4F1] text-[#176B5C]" : "text-[#727986]"}`}>Catalogue</button>
        <button type="button" onClick={() => setWorkspaceView("LAUNCH_READINESS")} className={`rounded px-4 py-2 text-sm font-black ${workspaceView === "LAUNCH_READINESS" ? "bg-[#E8F4F1] text-[#176B5C]" : "text-[#727986]"}`}>Launch readiness</button>
      </div>

      {workspaceView === "LAUNCH_READINESS" ? <ScoopLaunchReadiness initialSearch={searchParams.get("sku") ?? ""} onSearchChange={(supplierSku) => { const next = new URLSearchParams(searchParams); if (supplierSku) next.set("sku", supplierSku); else next.delete("sku"); next.set("view", "launch"); setSearchParams(next, { replace: true }); }} onOpenWorkflow={openCatalogueWorkflow} /> : <>

      {searchParams.get("return") === "launch" && <div className="mt-6"><Link to={`/admin/suppliers/scoop?view=launch${selectedSku ? `&sku=${encodeURIComponent(selectedSku)}` : ""}`} className="inline-flex rounded-md border border-[#469D8B] bg-white px-3 py-2 text-sm font-black text-[#176B5C]">Back to Launch readiness</Link></div>}

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Canonical offers" value={metrics.total} /><Metric label="XML backed" value={metrics.xmlBacked} /><Metric label="Website backed" value={metrics.websiteBacked} /><Metric label="Both sources" value={metrics.both} /><Metric label="Website only" value={metrics.websiteOnly} /><Metric label="XML only" value={metrics.xmlOnly} /><Metric label="Conflicts" value={metrics.conflicts} /><Metric label="Stale" value={metrics.stale} />
      </section>
      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Total offers" value={metrics.total} /><Metric label="Logistics complete" value={metrics.logisticsComplete} /><Metric label="Logistics partial" value={metrics.logisticsPartial} /><Metric label="Logistics missing" value={metrics.logisticsMissing} /><Metric label="Launch complete" value={`${metrics.launchSelectedComplete}/${metrics.launchSelected}`} /></section>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-lg font-black">Logistics data acquisition</h2><p className="mt-1 text-sm font-semibold text-[#727986]">Import exact measurements by Scoop SKU or acquire supported exact manufacturer records.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void exportMissingTemplate()} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black">Export missing-data template</button><button type="button" onClick={() => void acquireManufacturerData()} className="rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C]">Acquire manufacturer data</button></div></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-sm font-black">Logistics CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((csv) => { setImportCsv(csv); setImportPreview(undefined); }); }} className="mt-2 block w-full rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-semibold" /></label><button type="button" onClick={() => void previewLogisticsImport()} disabled={!importCsv} className="self-end rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:bg-[#E4E7EC]">Preview import</button></div>{importPreview && <div className="mt-4 rounded-md border border-[#E4E7EC] p-4"><p className="text-sm font-black">Rows {importPreview.summary.rowsRead} · Matched {importPreview.summary.matched} · Complete {importPreview.summary.complete} · Partial {importPreview.summary.partial} · Rejected {importPreview.summary.rejected} · Unknown {importPreview.summary.unknownSkus}</p>{importPreview.rows.filter((row) => row.errors.length).slice(0, 10).map((row) => <p key={row.rowNumber} className="mt-2 text-xs font-semibold text-[#B42318]">Row {row.rowNumber}, {row.sku || "missing SKU"}: {row.errors.join(" ")}</p>)}<button type="button" onClick={() => void applyLogisticsImport()} disabled={importPreview.summary.rejected > 0} className="mt-4 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:bg-[#E4E7EC]">Apply import</button></div>}</section>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Website discovery import</h2><p className="mt-1 text-sm font-semibold text-[#727986]">Preview and apply an approved CSV or JSON capture. This does not bypass Scoop website protection or import dealer credentials.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-sm font-black">Approved website export<input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((content) => { setWebsiteImport(content); setWebsitePreview(undefined); }); }} className="mt-2 block w-full rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-semibold" /></label><button type="button" onClick={() => void previewWebsiteImport()} disabled={!websiteImport} className="self-end rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:bg-[#E4E7EC]">Preview discovery</button></div>{websitePreview && <div className="mt-4 rounded-md border border-[#E4E7EC] p-4"><p className="text-sm font-black">Rows {websitePreview.summary.rowsRead} · Valid {websitePreview.summary.valid} · Rejected {websitePreview.summary.rejected}</p>{websitePreview.rows.filter((row) => row.errors.length).slice(0, 10).map((row) => <p key={row.rowNumber} className="mt-2 text-xs font-semibold text-[#B42318]">Row {row.rowNumber}, {row.sku || "missing SKU"}: {row.errors.join(" ")}</p>)}<button type="button" onClick={() => void applyWebsiteImport()} disabled={websitePreview.summary.rejected > 0} className="mt-4 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:bg-[#E4E7EC]">Apply website import</button></div>}</section>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_170px_170px_180px]">
          <label className="text-sm font-black">Search Scoop offers<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="SKU, description or manufacturer" className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold" /></label>
          <label className="text-sm font-black">Manufacturer<select value={manufacturer} onChange={(event) => { setManufacturer(event.target.value); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold"><option value="ALL">All manufacturers</option>{manufacturers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-sm font-black">Mapping state<select value={mappingFilter} onChange={(event) => { setMappingFilter(event.target.value as MappingFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">{["ALL", "UNMAPPED", "SUGGESTED", "VERIFIED", "REJECTED", "STALE"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
          <label className="text-sm font-black">Logistics data<select value={logisticsFilter} onChange={(event) => { setLogisticsFilter(event.target.value as LogisticsFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">{["ALL", "COMPLETE", "PARTIAL", "MISSING", "ADMIN_OVERRIDE"].map((item) => <option key={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
          <label className="text-sm font-black">Source state<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as SourceFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">{["ALL", "XML_ONLY", "WEBSITE_ONLY", "BOTH", "SOURCE_MISMATCH", "STALE"].map((item) => <option key={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
        </div>
        {sync && <p className="mt-3 text-xs font-semibold text-[#727986]">Last sync {formatDateTime(sync.lastSyncedAt)} · Fetched {sync.fetched} · Updated {sync.updated} · Stale {sync.stale}</p>}
        {enrichment && <div className="mt-2 text-xs font-semibold text-[#727986]"><p>Last logistics enrichment {formatDateTime(enrichment.lastEnrichmentAt)} · Processed {enrichment.processed} · Complete {enrichment.complete} · Partial {enrichment.partial} · Missing {enrichment.missing} · Failed {enrichment.failed} · Cached {enrichment.cached}</p>{enrichment.bySource && <p className="mt-1">Sources: {Object.entries(enrichment.bySource).map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`).join(" · ")}</p>}{enrichment.failureReasons && Object.keys(enrichment.failureReasons).length > 0 && <p className="mt-1">Failure reasons: {Object.entries(enrichment.failureReasons).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, count]) => `${reason.replace(/_/g, " ")} ${count}`).join(" · ")}</p>}</div>}
        {enrichmentResults.length > 0 && <details className="mt-3 rounded-md border border-[#E4E7EC] bg-white p-3"><summary className="cursor-pointer text-xs font-black">Processed product results</summary><div className="mt-3 max-h-64 overflow-y-auto divide-y divide-[#E4E7EC]">{enrichmentResults.map((result) => <div key={result.supplierSku} className="grid gap-1 py-2 text-xs sm:grid-cols-[110px_1fr_120px]"><span className="font-black">{result.supplierSku}</span><span>{result.manufacturer ?? "Unknown"}{result.model ? ` · ${result.model}` : ""} · {result.source?.replace(/_/g, " ") ?? "No source"} · {result.identityConfidence ?? "No confidence"} · {result.shippingBasis?.replace(/_/g, " ") ?? "No shipping basis"}</span><span className="font-black">{result.status}{result.readinessChanged ? " · readiness updated" : ""}{result.failureReason ? ` · ${result.failureReason.replace(/_/g, " ")}` : ""}</span></div>)}</div></details>}
        {feedback && <div className="mt-4"><AdminFeedback {...feedback} /></div>}
      </section>

      {selectedOffer && <section id="scoop-selected-workflow" tabIndex={-1} className="mt-6 grid gap-5 rounded-lg outline-none [&>div:last-child]:order-4 focus:ring-2 focus:ring-[#469D8B] xl:grid-cols-[minmax(0,1.22fr)_minmax(360px,1fr)]">
        <div className="order-1 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm xl:col-span-2">
          {blockerFocus && <div className="mb-4"><AdminFeedback variant="info" message={`${blockerFocus === "mapping" ? "Mapping" : blockerFocus === "logistics" ? "Logistics metadata" : "Pricing proposal"} workflow opened for ${selectedOffer.supplierSku}.`} /></div>}
          <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-[#E4E7EC] bg-[#F6F7F9]">{selectedOffer.imageUrl ? <img src={selectedOffer.imageUrl} alt="" className="h-full w-full object-contain" /> : <span className="px-2 text-center text-xs font-semibold text-[#727986]">Image unavailable</span>}</div><div><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Selected Scoop offer</p><h2 className="mt-1 text-lg font-black">{selectedOffer.description}</h2><p className="mt-1 text-sm font-semibold text-[#727986]">{selectedOffer.manufacturer ?? "Manufacturer unknown"} · SKU {selectedOffer.supplierSku}</p></div><div className="flex flex-wrap gap-2"><AdminStatusBadge label={effectiveMappingStatus(selectedOffer, selectedMapping)} status={badgeStatus(effectiveMappingStatus(selectedOffer, selectedMapping))} /><AdminStatusBadge label={`Logistics ${selectedOffer.logisticsMetadata?.status ?? "MISSING"}`} status={selectedOffer.logisticsMetadata?.status === "COMPLETE" ? "PAID" : "PENDING"} /></div></div><div className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-[#F6F7F9] p-2 text-center"><Stock label="CPT" value={selectedOffer.branchStock.CPT} /><Stock label="JHB" value={selectedOffer.branchStock.JHB} /><Stock label="DBN" value={selectedOffer.branchStock.DBN} /><Stock label="Total" value={selectedOffer.totalStock} /></div></div></div>
          {selectedMapping?.status === "VERIFIED" && <div className="mt-4 rounded-md border border-[#A6D8CC] bg-[#F2F9F7] p-3"><p className="text-xs font-black uppercase text-[#176B5C]">Current verified mapping</p><p className="mt-1 text-sm font-black">{selectedTekcentralProduct?.name ?? selectedMapping.productId}</p><p className="mt-1 text-xs font-semibold text-[#3F4652]">TekCentral product {selectedMapping.productId}{selectedMapping.verifiedAt ? ` · Verified ${formatDateTime(selectedMapping.verifiedAt)}` : ""}</p></div>}
          {selectedOffer.availability === "STALE" && <div className="mt-4"><AdminFeedback variant="warning" message="This offer is absent from the latest Scoop feed. Its mapping is preserved for review." /></div>}
          {selectedOffer.reconciliationStatus === "WEBSITE_ONLY" && <div className="mt-4"><AdminFeedback variant="warning" message="Website-discovered product. XML dealer pricing and structured stock are not currently available. Mapping and logistics work may continue, but commercial and publish readiness remain blocked." /></div>}
          {selectedOffer.reconciliationStatus === "SOURCE_MISMATCH" && <div className="mt-4"><AdminFeedback variant="warning" message={`Source identity requires review. ${selectedOffer.reconciliationConflict?.reasons.join(" ") ?? "XML and website observations conflict."}`} /></div>}
          <div className="mt-4 border-t border-[#E4E7EC] pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-black">Logistics metadata</h3><p className="mt-1 text-xs font-semibold text-[#727986]">{selectedOffer.logisticsMetadata ? `${selectedOffer.logisticsMetadata.status === "COMPLETE" ? "Complete" : "Partial"} · ${logisticsSourceLabel(selectedOffer.logisticsMetadata.source)}` : "Missing"}</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void enrichSelectedLogistics()} disabled={loading.enrichment} className="rounded-md border border-[#469D8B] px-3 py-2 text-xs font-black text-[#176B5C] disabled:opacity-60">Retry enrichment</button><button type="button" onClick={() => void enrichSelectedLogistics(true)} disabled={loading.enrichment} className="rounded-md border border-[#469D8B] px-3 py-2 text-xs font-black text-[#176B5C] disabled:opacity-60">Find manufacturer data</button><button type="button" onClick={openLogisticsEditor} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black">{selectedOffer.logisticsMetadata?.source === "ADMIN" ? "Edit override" : "Add override"}</button>{selectedOffer.logisticsMetadata?.source === "ADMIN" && <button type="button" onClick={() => void saveLogisticsOverride(true)} className="rounded-md border border-[#FDA29B] px-3 py-2 text-xs font-black text-[#B42318]">Clear override</button>}</div>
            </div>
            <p className="mt-2 text-xs font-semibold text-[#727986]">Manual override is the exception path when authoritative automatic data is unavailable.</p>
            {selectedOffer.logisticsLastAttemptAt && <p className="mt-2 text-xs font-semibold text-[#727986]">Last attempt {formatDateTime(selectedOffer.logisticsLastAttemptAt)}{selectedOffer.logisticsLastFailure ? ` · ${selectedOffer.logisticsLastFailure.replace(/_/g, " ")}` : ""}</p>}
            {selectedOffer.logisticsMetadata && <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-md bg-[#F6F7F9] p-3 text-xs sm:grid-cols-2 lg:grid-cols-3"><Provenance label="Source" value={logisticsSourceLabel(selectedOffer.logisticsMetadata.source)} /><Provenance label="Manufacturer / model" value={[selectedOffer.logisticsMetadata.manufacturer, selectedOffer.logisticsMetadata.model].filter(Boolean).join(" · ") || "Not recorded"} /><Provenance label="Identity confidence" value={selectedOffer.logisticsMetadata.identityConfidence ?? "Not recorded"} /><Provenance label="Shipping basis" value={selectedOffer.logisticsMetadata.shippingBasis?.replace(/_/g, " ") ?? "Not recorded"} /><Provenance label="Product / shipping measurements" value={measurementLabel(selectedOffer.logisticsMetadata.weightGrams, selectedOffer.logisticsMetadata.lengthMm, selectedOffer.logisticsMetadata.widthMm, selectedOffer.logisticsMetadata.heightMm)} /><Provenance label="Package measurements" value={measurementLabel(selectedOffer.logisticsMetadata.packageWeightGrams, selectedOffer.logisticsMetadata.packageLengthMm, selectedOffer.logisticsMetadata.packageWidthMm, selectedOffer.logisticsMetadata.packageHeightMm)} /><Provenance label="Captured" value={formatDateTime(selectedOffer.logisticsMetadata.capturedAt)} />{selectedOffer.logisticsMetadata.sourceReference && <div><dt className="font-black text-[#727986]">Source URL</dt><dd className="mt-1"><a href={selectedOffer.logisticsMetadata.sourceReference} target="_blank" rel="noreferrer" className="font-black text-[#176B5C] underline">Open authoritative source</a></dd></div>}</dl>}
            {logisticsEditor && <div className="mt-4 grid gap-3 border-t border-[#E4E7EC] pt-4 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-black">Weight<input type="number" min="0" value={logisticsEditor.weight} onChange={(event) => setLogisticsEditor({ ...logisticsEditor, weight: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3" /></label><label className="text-xs font-black">Unit<select value={logisticsEditor.weightUnit} onChange={(event) => setLogisticsEditor({ ...logisticsEditor, weightUnit: event.target.value as "g" | "kg" })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3"><option value="g">grams</option><option value="kg">kilograms</option></select></label>{(["length", "width", "height"] as const).map((field) => <label key={field} className="text-xs font-black capitalize">{field} (mm)<input type="number" min="0" value={logisticsEditor[field]} onChange={(event) => setLogisticsEditor({ ...logisticsEditor, [field]: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3" /></label>)}<div className="flex items-end gap-2 lg:col-span-5"><button type="button" onClick={() => void saveLogisticsOverride()} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black">Save</button><button type="button" onClick={() => setLogisticsEditor(undefined)} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black">Cancel</button></div></div>}
          </div>
        </div>
        <div className="order-2 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm xl:row-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FiSearch aria-hidden="true" /><h2 className="text-lg font-black">Match existing TekCentral product</h2></div><p className="mt-1 text-xs font-semibold text-[#727986]">Choose an exact equivalent and preserve confidence review.</p></div><button type="button" onClick={() => { setProductCreationOpen(true); window.setTimeout(() => document.getElementById("scoop-product-creation")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }} disabled={selectedMapping?.status === "VERIFIED"} className="rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C] disabled:border-[#E4E7EC] disabled:text-[#727986]">Create new TekCentral product</button></div>
            <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search TekCentral SKU, name, brand or category" className="mt-3 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold" />
            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-md border border-[#E4E7EC]">
              {candidates.map(({ product, confidenceLevel, evidence }) => <button key={product.id} type="button" onClick={() => setSelectedTekcentralProductId(product.id)} className={`flex w-full items-start justify-between gap-3 border-b border-[#E4E7EC] px-3 py-3 text-left last:border-0 ${selectedTekcentralProductId === product.id ? "bg-[#E8F4F1]" : "bg-white hover:bg-[#F6F7F9]"}`}><span><span className="block text-sm font-black">{product.name}</span><span className="mt-1 block text-xs font-semibold text-[#727986]">{product.sku ?? product.id} · {product.brand} · {product.category}</span><span className="mt-1 block text-xs font-semibold text-[#727986]">{evidence.join(" · ") || "No strong identity evidence"}</span></span><MatchConfidence level={confidenceLevel} /></button>)}
              {candidates.length === 0 && <p className="p-4 text-sm font-semibold text-[#727986]">Search to choose an existing TekCentral product. No equivalence is assumed automatically.</p>}
            </div>
            {selectedTekcentralProduct && <p className="mt-3 text-sm font-semibold">Selected: <span className="font-black">{selectedTekcentralProduct.name}</span></p>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={suggestMapping} disabled={!selectedTekcentralProductId || loading.mapping || selectedMapping?.status === "VERIFIED"} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]">Save as Suggested</button><button type="button" onClick={() => updateMapping("verify")} disabled={!selectedMapping?.id || selectedMapping.status === "VERIFIED" || loading.mapping} className="inline-flex items-center gap-2 rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]"><FiCheck aria-hidden="true" />Verify mapping</button><button type="button" onClick={() => updateMapping("reject")} disabled={!selectedMapping?.id || selectedMapping.status === "REJECTED" || loading.mapping} className="rounded-md border border-[#FDA29B] px-3 py-2 text-sm font-black text-[#B42318] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:text-[#727986]">Reject</button><button type="button" onClick={generateProposal} disabled={selectedMapping?.status !== "VERIFIED" || loading.proposal || selectedProposalAction?.disabled} className="rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:bg-[#F2F4F7] disabled:text-[#727986]">{loading.proposal ? "Generating..." : selectedProposalAction?.label ?? "Generate proposal"}</button></div>
            {selectedMapping && <p className="mt-3 text-xs font-semibold text-[#727986]">SupplierOffer {selectedMapping.supplierOfferId ?? `SCOOP:${selectedMapping.supplierSku}`} · TekCentral product {selectedMapping.productId}{selectedMapping.verifiedAt ? ` · Verified ${formatDateTime(selectedMapping.verifiedAt)}` : ""}</p>}
        </div>
        <ScoopProductCreationPanel supplierSku={selectedOffer.supplierSku} hasVerifiedMapping={selectedMapping?.status === "VERIFIED"} open={productCreationOpen} onOpenChange={setProductCreationOpen} onCreated={(product, mapping) => { setMappings((current) => upsertMapping(current, mapping)); setSelectedTekcentralProductId(product.id); setFeedback({ variant: "success", message: "Internal product created and exact Scoop mapping verified. Launch readiness has been refreshed." }); }} />
        <div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm xl:col-start-2 xl:row-start-2"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Internal pricing reference</p><h2 className="mt-1 text-base font-black">Scoop price comparison</h2><dl className="mt-3 grid gap-x-5 sm:grid-cols-2"><PriceRow label="Dealer excl VAT" value={moneyLabel(selectedOffer.pricing.supplierCostExVat)} /><PriceRow label="Dealer incl VAT" value={moneyLabel(selectedOffer.pricing.supplierCostInclVat)} /><PriceRow label="Retail incl VAT" value={moneyLabel(selectedOffer.pricing.referenceRetailInclVat)} /><PriceRow label="Retail spread" value={moneyLabel(selectedOffer.pricing.retailGrossSpreadVsCostInclVat)} secondary /></dl><p className="mt-2 text-xs font-semibold leading-5 text-[#727986]">Internal reference only. No storefront price is changed.</p></div>
      </section>}

      <section className="mt-6 overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="hidden grid-cols-[120px_1.5fr_110px_140px_130px_110px_100px] gap-3 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#727986] xl:grid"><span>SKU</span><span>Offer</span><span>Stock</span><span>Dealer excl VAT</span><span>Logistics</span><span>Mapping</span><span>Action</span></div>
        <div className="divide-y divide-[#E4E7EC]">
          {loading.load && <p className="p-6 text-sm font-semibold text-[#727986]">Loading Scoop catalogue...</p>}
          {!loading.load && pageProducts.map((product) => {
            const mapping = mappingBySku.get(product.supplierSku);
            const mappingState = effectiveMappingStatus(product, mapping);
            const proposalState = proposalActionState(pricingProposals, product.supplierSku, mapping?.productId);
            const reviewing = selectedSku === product.supplierSku;
            const reviewed = mapping?.status === "VERIFIED";
            const reviewLabel = reviewing ? "Reviewing" : reviewed ? "Reviewed ✓" : "Review";
            return <article key={product.supplierSku} className={`grid gap-3 px-4 py-4 xl:grid-cols-[120px_1.5fr_110px_140px_130px_110px_100px] xl:items-center ${reviewing ? "bg-[#F2F9F7]" : ""}`}>
              <p className="break-all text-sm font-black">{product.supplierSku}</p>
              <div className="grid grid-cols-[48px_1fr] gap-3"><span className="h-12 w-12 overflow-hidden rounded-md bg-[#F6F7F9]">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}</span><span><span className="block text-sm font-semibold text-[#3F4652]">{product.description}</span><span className="mt-1 block text-xs font-semibold text-[#727986]">{product.manufacturer ?? "Unknown manufacturer"}</span><span className="mt-1 inline-flex rounded bg-[#F2F4F7] px-2 py-0.5 text-[10px] font-black text-[#3F4652]">{sourceStatusLabel(product.reconciliationStatus)}</span>{product.launchAssortment?.state === "SELECTED_FOR_LAUNCH" && <span className="mt-1 block text-xs font-black text-[#176B5C]">Selected for launch</span>}</span></div>
              <p className="text-sm font-black">{product.totalStock ?? "Unknown"}<span className="block text-xs font-semibold text-[#727986]">{product.availability.replace(/_/g, " ")}</span></p>
              <p className="text-sm font-black">{moneyLabel(product.dealerPriceExVat)}</p>
              <p className="text-xs font-black">{product.logisticsMetadata?.status ?? "MISSING"}<span className="mt-1 block font-semibold text-[#727986]">{product.logisticsMetadata?.weightGrams ? `${product.logisticsMetadata.weightGrams} g` : "No weight"}</span></p>
              <div><AdminStatusBadge label={mappingState} status={badgeStatus(mappingState)} />{mapping?.status === "VERIFIED" && <span className="mt-1 block text-[11px] font-semibold text-[#727986]">{proposalState.active?.status === "APPROVED" ? "Pricing approved" : proposalState.active ? "Pricing pending" : "No active price"}</span>}</div>
              <button type="button" onClick={() => { setSelectedSku(product.supplierSku); setSelectedTekcentralProductId(mapping?.productId ?? ""); setProductSearch(""); }} aria-current={reviewing ? "true" : undefined} className={`rounded-md border px-3 py-2 text-sm font-black ${reviewing ? "border-[#469D8B] bg-[#E8F4F1] text-[#176B5C]" : reviewed ? "border-[#E4E7EC] bg-[#F2F4F7] text-[#3F4652]" : "border-[#E4E7EC] bg-white"}`}>{reviewLabel}</button>
            </article>;
          })}
          {!loading.load && pageProducts.length === 0 && <p className="p-6 text-sm font-semibold text-[#727986]">No Scoop offers match these filters.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3"><p className="text-xs font-semibold text-[#727986]">Showing {pageProducts.length} of {filteredProducts.length} offers · Page {page} of {totalPages}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:text-[#727986]">Previous</button><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:text-[#727986]">Next</button></div></div>
      </section>
      </>}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) { return <div className="rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>; }
function Stock({ label, value }: { label: string; value: number | undefined }) { return <div><p className="text-xs font-black text-[#727986]">{label}</p><p className="mt-1 text-sm font-black">{value ?? "Unknown"}</p></div>; }
function PriceRow({ label, value, secondary = false }: { label: string; value: string; secondary?: boolean }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className={`text-sm font-semibold ${secondary ? "text-[#727986]" : "text-[#3F4652]"}`}>{label}</dt><dd className="text-sm font-black">{value}</dd></div>; }
function Provenance({ label, value }: { label: string; value: string }) { return <div><dt className="font-black text-[#727986]">{label}</dt><dd className="mt-1 font-semibold text-[#3F4652]">{value}</dd></div>; }
function measurementLabel(weight?: number, length?: number, width?: number, height?: number) { const dimensions = length && width && height ? `${length} x ${width} x ${height} mm` : "dimensions unavailable"; return `${weight ? `${weight} g` : "weight unavailable"} · ${dimensions}`; }
function logisticsSourceLabel(source: NonNullable<ScoopCatalogueProduct["logisticsMetadata"]>["source"]) { return source === "ADMIN" ? "Admin" : source === "ADMIN_IMPORT" ? "Admin CSV import" : source === "SUPPLIER_FEED" ? "Supplier feed" : source === "MANUFACTURER" ? "Manufacturer" : source === "SUPPLIER_PRODUCT_PAGE" ? "Scoop product page" : "Unknown"; }
function sourceStatusLabel(status: ScoopCatalogueProduct["reconciliationStatus"]) { return status === "BOTH" ? "XML + Website" : status === "XML_ONLY" ? "XML" : status === "WEBSITE_ONLY" ? "Website" : status === "SOURCE_MISMATCH" ? "Conflict" : "Stale"; }
