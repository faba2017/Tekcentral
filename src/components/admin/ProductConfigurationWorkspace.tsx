import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiExternalLink, FiFileText, FiImage, FiLock, FiPlus, FiStar, FiTrash2, FiUpload, FiX } from "react-icons/fi";
import { ConfirmationModal } from "@/components/admin/ConfirmationModal";
import { AdminAiContextPanel } from "@/components/admin/AdminAiContextPanel";
import { ApiError, apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { PricingProposal } from "@/lib/admin";
import { hasMaterialPublicationChanges } from "@/lib/publication";
import {
  productConfigurationHref,
  productOnboardingSteps,
  resolveProductOnboardingFocus,
  type ProductOnboardingReadiness,
  type ProductOnboardingStepId,
} from "@/lib/product-onboarding";
import { hasStaffPermission, useStaffSession } from "@/state/staff-session";

interface PublicationSnapshot {
  id: string; slug: string; sku?: string; name: string; brand: string; model?: string;
  category: string; categorySlug: string; subcategory?: string; price: number; currency: "ZAR";
  shortDescription: string; description?: string; overview?: string; images: string[];
  specifications: Array<{ name: string; value: string; group?: string; isKey?: boolean; source?: string; sourceUrl?: string; capturedAt?: string; approvedAt?: string; contentFingerprint?: string; origin?: string }>;
  documents?: Array<{ type: ProductDocumentType; title: string; url: string; verified: boolean; source?: string; origin?: string; filename?: string; mimeType?: "application/pdf"; size?: number; uploadedAt?: string; actor?: string }>;
  seoTitle?: string; seoDescription?: string; deliveryDisplay?: string; vatRate: number;
  availabilityDisplay: string; stockPolicySnapshot: "AUTHORITATIVE_CURRENT_STOCK";
  categoryId?: string; subcategoryId?: string; productTypeId?: string;
}

interface PublicationReview {
  state: ProductOnboardingReadiness["publicationState"];
  launchSelection?: { state: "NOT_SELECTED" | "SELECTED_FOR_LAUNCH" };
  eligibility?: { canPublish?: boolean; blockers?: string[]; warnings?: string[] };
  hasUnpublishedChanges: boolean;
  hasActiveDraft: boolean;
  supplierEnrichment?: SupplierEnrichment;
  contentSuggestions?: { specifications: PublicationSnapshot["specifications"]; documents: NonNullable<PublicationSnapshot["documents"]> };
  currentApprovedProposal?: { id: string; price?: number };
  availability: { state: string; label: string; freshness: "FRESH" | "STALE" | "UNKNOWN"; observedAt?: string; quantity?: number; purchasable: boolean; reason: string };
  draft: PublicationSnapshot;
  image?: { sourceImageUrl?: string; publicImageUrl?: string; provenance?: { originalUrl: string; sourceType: string; capturedAt: string; contentType: string; bytes: number }; gallery?: Array<{ mediaId: string; publicUrl: string; sourceImageUrl: string }> };
  contentOrigins?: Record<string, string>;
  activeVersionId?: string;
  versions: Array<{ id: string; version: number; snapshot: PublicationSnapshot }>;
  internalSource: { supplierCode: string; supplierSku: string; supplierCostExVat?: number; availability?: string; lastRefreshedAt?: string; stockSource?: string; logisticsSource?: string };
  intelligence?: {
    content: IntelligenceRecommendation[];
    media: SupplierEnrichment["imageCandidates"];
    logistics: { confidence: string; recommendations: IntelligenceRecommendation[] };
    pricing: { recommendations: IntelligenceRecommendation[]; comparison: Array<{ supplier: string; status: string; supplierCostExVat?: number; currency: string; generatedAt: string; grossMarginPercent?: number; proposalId: string }> };
  };
}

interface IntelligenceRecommendation { id:string; area:string; type:string; title:string; reason:string; confidence:string; evidence:string[]; provenance:string[]; sourceTimestamp?:string; freshness?:string; reviewStatus:string; actionId?:string }
interface EnrichmentEvidence { supplier: string; sourceField: string; retrievedAt: string }
interface SupplierEnrichment {
  title?: string; shortDescription?: string; longDescription?: string; seoTitle?: string; seoDescription?: string;
  specifications: Array<PublicationSnapshot["specifications"][number] & { evidence: EnrichmentEvidence }>;
  imageCandidates: Array<{ id: string; targetProductId?: string; url?: string; supplier: string; supplierSku?: string; supplierProductId?: string; supplierVariantId?: string; sourceType: string; association: "PRODUCT" | "EXACT_VARIANT" | "UNVERIFIED"; discoveredAt: string; candidateOrder: number; reuseEligibility: "REVIEW_REQUIRED" | "APPROVED_SOURCE" | "NOT_APPROVED"; status: "DISCOVERED" | "REVIEW_REQUIRED" | "INGESTED" | "REJECTED" | "DUPLICATE" | "INVALID"; evidence: EnrichmentEvidence; privateEvidence?: { mimeType: string; byteSize: number; contentFingerprint: string; sourceLabel: string; evidenceClassification: "PRIVATE_REVIEW_REQUIRED" }; intelligence?: { confidence:string; labels:string[]; recommendedPrimary:boolean; reason:string } }>;
  evidence: Record<string, EnrichmentEvidence>;
}

type ProductDocumentType = "DATASHEET" | "COMPLIANCE_CERTIFICATE" | "USER_MANUAL" | "INSTALLATION_GUIDE" | "WARRANTY_DOCUMENT" | "BROCHURE" | "SPECIFICATION_SHEET" | "SAFETY_DOCUMENT" | "OTHER" | "QUICK_START_GUIDE" | "WARRANTY";
const documentTypes: Array<{ value: ProductDocumentType; label: string }> = [
  { value: "DATASHEET", label: "Datasheet" }, { value: "COMPLIANCE_CERTIFICATE", label: "Compliance Certificate" }, { value: "USER_MANUAL", label: "User Manual" }, { value: "INSTALLATION_GUIDE", label: "Installation Guide" }, { value: "WARRANTY_DOCUMENT", label: "Warranty Document" }, { value: "BROCHURE", label: "Brochure" }, { value: "SPECIFICATION_SHEET", label: "Specification Sheet" }, { value: "SAFETY_DOCUMENT", label: "Safety Document" }, { value: "OTHER", label: "Other" },
];

interface PublishWorkspaceResponse {
  version: { id: string; version: number };
  publication: { state: ProductOnboardingReadiness["publicationState"]; activeVersionId?: string; versionCount: number; slug?: string };
  readiness: ProductOnboardingReadiness;
  review: PublicationReview;
}

interface ProductPricingState { proposals: PricingProposal[] }
interface TaxonomyOption { id: string; name: string; label: string; slug: string; status: "ACTIVE" | "DEPRECATED" | "ARCHIVED"; children: TaxonomyOption[]; productTypes?: TaxonomyOption[] }

type PublicationConfirmation = { action: "publish" | "unpublish" | "restore"; version?: PublicationReview["versions"][number] };
function publicationDraftIsDirty(draft: PublicationSnapshot | undefined, persistedDraft: PublicationSnapshot | undefined, review: PublicationReview | undefined) {
  if (!draft) return false;
  if (review?.state === "PUBLISHED" && !review.hasActiveDraft) return false;
  if (!review?.hasActiveDraft || !persistedDraft) return true;
  return hasMaterialPublicationChanges(draft as unknown as Record<string, unknown>, persistedDraft as unknown as Record<string, unknown>);
}

const stepCopy: Record<ProductOnboardingStepId, string> = {
  SOURCE_EVIDENCE: "Review the current supplier or manual source evidence.",
  PRODUCT_MAPPING: "Confirm this source resolves to the correct canonical Product.",
  PRODUCT_IDENTITY: "Review the customer-facing Product identity.",
  TAXONOMY: "Confirm the canonical category path used for discovery.",
  CONTENT: "Complete accurate, reviewed customer-facing content.",
  MEDIA: "Supplier image candidates stay private until ingestion. Stored gallery images are TekCentral-controlled, and PRIMARY identifies the public primary image.",
  LOGISTICS: "Confirm the evidence needed for delivery and fulfilment decisions.",
  COMMERCIAL: "Review current private cost and currency evidence.",
  PRICING: "Review the current proposal and approved selling price.",
  LAUNCH: "Make the explicit decision to include this Product in the launch assortment.",
  PREVIEW: "Inspect the actual customer-facing draft before publication.",
  PUBLICATION: "Complete the final review and create an immutable public version.",
};

const stateStyle = {
  COMPLETE: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  NOT_APPLICABLE: "border-[#E4E7EC] bg-[#F6F7F9] text-[#667085]",
  NEEDS_REVIEW: "border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]",
  BLOCKED: "border-[#FDA29B] bg-[#FFFBFA] text-[#B42318]",
  INCOMPLETE: "border-[#D0D5DD] bg-white text-[#344054]",
} as const;

function dateLabel(value?: string) {
  return value ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

function supplierMoney(value: number, currency = "ZAR") {
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#667085]">{label}</dt><dd className="mt-1 break-words text-sm font-bold text-[#101828]">{children ?? "Unavailable"}</dd></div>;
}

function RecommendationSummary({ recommendations }: { recommendations?: IntelligenceRecommendation[] }) {
  if (!recommendations?.length) return null;
  return <details className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3"><summary className="cursor-pointer text-xs font-black text-[#93370D]">Recommended review ({recommendations.length})</summary><div className="mt-3 space-y-2">{recommendations.map((item)=><div key={item.id} className="rounded-md border border-[#FEC84B] bg-white p-3"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black text-[#101828]">{item.title}</p><span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[10px] font-black text-[#475467]">{item.confidence}</span></div><p className="mt-1 text-xs font-semibold text-[#667085]">{item.reason}</p>{item.evidence.length>0&&<p className="mt-1 text-[11px] font-semibold text-[#93370D]">Evidence: {item.evidence.join(" · ")}</p>}</div>)}</div></details>;
}

function WorkspaceFeedback({ variant, message }: { variant: "error" | "success"; message: string }) {
  return <div role={variant === "error" ? "alert" : "status"} className={`rounded-md border p-3 text-sm font-bold ${variant === "error" ? "border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"}`}>{message}</div>;
}

export function ProductConfigurationLink({ productId, step, children, className, onClick, ariaLabel }: { productId: string; step?: ProductOnboardingStepId; children: ReactNode; className?: string; onClick?: () => void; ariaLabel?: string }) {
  const location = useLocation();
  return <Link to={productConfigurationHref(location.pathname, location.search, productId, step)} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;
}

export function ProductConfigurationWorkspaceHost() {
  const [params] = useSearchParams();
  const productId = params.get("productSetup") ?? "";
  return productId ? <ProductConfigurationWorkspace productId={productId} requestedStep={params.get("step")} /> : null;
}

function ProductConfigurationWorkspace({ productId, requestedStep }: { productId: string; requestedStep: string | null }) {
  const session = useStaffSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const panelRef = useRef<HTMLElement>(null);
  const requestedStepRef = useRef(requestedStep);
  const readinessRef = useRef<ProductOnboardingReadiness>();
  const priorFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const publishIdempotencyKeyRef = useRef<string>();
  const activeProductIdRef = useRef(productId);
  const [readiness, setReadiness] = useState<ProductOnboardingReadiness>();
  const [review, setReview] = useState<PublicationReview>();
  const [pricing, setPricing] = useState<ProductPricingState>();
  const [draft, setDraft] = useState<PublicationSnapshot>();
  const [persistedDraft, setPersistedDraft] = useState<PublicationSnapshot>();
  const [activeStep, setActiveStep] = useState<ProductOnboardingStepId>();
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [documentImportUrl, setDocumentImportUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<PublicationConfirmation>();
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<string[]>([]);
  const [productLoading, setProductLoading] = useState(true);
  const canEdit = hasStaffPermission(session, "products.edit");
  const canManageMedia = hasStaffPermission(session, "products.manage_media");
  const canPublish = hasStaffPermission(session, "products.publish");
  const canReadPricing = hasStaffPermission(session, "pricing.read");
  const canGeneratePricing = hasStaffPermission(session, "pricing.create_proposal");
  const canApprovePricing = hasStaffPermission(session, "pricing.approve");
  const canRejectPricing = hasStaffPermission(session, "pricing.reject");
  const canViewCost = hasStaffPermission(session, "suppliers.view_cost") || hasStaffPermission(session, "pricing.view_supplier_cost");
  const canEditDraft = canEdit && (review?.state !== "PUBLISHED" || review.hasActiveDraft);
  const hasUnsavedChanges = publicationDraftIsDirty(draft, persistedDraft, review);

  const close = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved Product changes. Discard them and close?")) return;
    const next = new URLSearchParams(location.search);
    next.delete("productSetup"); next.delete("step");
    navigate(`${location.pathname}${next.size ? `?${next}` : ""}`, { replace: false });
  }, [hasUnsavedChanges, location.pathname, location.search, navigate]);

  const load = useCallback(async (advance = false) => {
    setError("");
    const loadingProductId = productId;
    setProductLoading(true);
    try {
      const [nextReadiness, nextReview, nextPricing] = await Promise.all([
        apiRequest<ProductOnboardingReadiness>(`/api/admin/products/${encodeURIComponent(productId)}/onboarding-readiness`),
        apiRequest<PublicationReview>(`/api/admin/products/${encodeURIComponent(productId)}/publication`).catch(() => undefined),
        canReadPricing ? apiRequest<{ proposals: PricingProposal[] }>("/api/admin/pricing/proposals").then((result) => ({ proposals: result.proposals.filter((proposal) => proposal.productId === productId) })).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      if (activeProductIdRef.current !== loadingProductId) return;
      readinessRef.current = nextReadiness;
      setReadiness(nextReadiness); setReview(nextReview); setPricing(nextPricing); setDraft(nextReview?.draft); setPersistedDraft(nextReview?.hasActiveDraft || nextReview?.state === "PUBLISHED" ? nextReview.draft : undefined); setSourceImageUrl(nextReview?.image?.sourceImageUrl ?? nextReadiness.source.mediaCandidates?.[0] ?? "");
      const focus = advance ? nextReadiness.firstUnresolvedStep ?? "PUBLICATION" : resolveProductOnboardingFocus(nextReadiness, requestedStepRef.current);
      setActiveStep(focus);
    } catch (cause) {
      if (activeProductIdRef.current !== loadingProductId) return;
      setError(cause instanceof ApiError ? cause.message : "Product configuration could not be loaded.");
    } finally {
      if (activeProductIdRef.current === loadingProductId) setProductLoading(false);
    }
  }, [canReadPricing, productId]);

  useEffect(() => { requestedStepRef.current = requestedStep; }, [requestedStep]);
  useEffect(() => {
    activeProductIdRef.current = productId;
    readinessRef.current = undefined;
    const timer = window.setTimeout(() => {
      setReadiness(undefined); setReview(undefined); setPricing(undefined); setDraft(undefined); setPersistedDraft(undefined);
      setSourceImageUrl(""); setDocumentImportUrl(""); setIgnoredSuggestions([]); setBusy(""); setFeedback(""); setError(""); setConfirmation(undefined);
      setProductLoading(true);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, productId]);
  useEffect(() => {
    if (!readinessRef.current) return;
    setActiveStep(resolveProductOnboardingFocus(readinessRef.current, requestedStep));
  }, [productId, requestedStep]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!hasUnsavedChanges) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!activeStep) return;
    const frame = window.requestAnimationFrame(() => {
      const section = panelRef.current?.querySelector<HTMLElement>(`[data-onboarding-step="${activeStep}"]`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeStep]);
  useEffect(() => {
    const previousFocus = priorFocusRef.current;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [close]);

  const updateStep = (step: ProductOnboardingStepId) => {
    const alreadyActive = activeStep === step;
    setActiveStep(step);
    const next = new URLSearchParams(location.search);
    next.set("productSetup", productId);
    next.set("step", step);
    setSearchParams(next, { replace: false });
    if (alreadyActive) window.requestAnimationFrame(() => {
        const section = panelRef.current?.querySelector<HTMLElement>(`[data-onboarding-step="${step}"]`);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
        section?.focus({ preventScroll: true });
      });
  };

  const mutate = async (key: string, operation: () => Promise<unknown>, success: string) => {
    if (productLoading || activeProductIdRef.current !== productId) return;
    setBusy(key); setError(""); setFeedback("");
    try { await operation(); setFeedback(success); await load(true); window.dispatchEvent(new CustomEvent("tekcentral:product-readiness-updated", { detail: { productId } })); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "The Product could not be updated."); }
    finally { setBusy(""); }
  };

  const saveDraft = () => draft && mutate("draft", async () => {
    await apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication`, { method: "PUT", body: JSON.stringify({ snapshot: draft, contentOrigins: review?.contentOrigins ?? {}, imageProvenance: review?.image?.provenance, actor: "Admin staff" }) });
    publishIdempotencyKeyRef.current = undefined;
  }, "Product draft saved. The next unresolved step is ready.");
  const ingestImages = async (candidateUrls: string[]) => {
    if (productLoading || activeProductIdRef.current !== productId) return;
    const capacity = Math.max(0, 8 - (draft?.images.length ?? 0));
    const urls = [...new Set(candidateUrls)].slice(0, capacity);
    if (!urls.length) return;
    setBusy("image"); setError(""); setFeedback("");
    try {
      for (const candidateUrl of urls) await apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-image`, { method: "POST", body: JSON.stringify({ sourceUrl: candidateUrl, sourceType: review?.internalSource.supplierCode ?? readiness?.source.supplierCode ?? "SUPPLIER_SOURCE", actor: session.staff?.displayName ?? "Admin staff" }) });
      await load(false);
      updateStep("MEDIA");
      setFeedback(`${urls.length} image${urls.length === 1 ? "" : "s"} stored and associated with this Product gallery.`);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "The Product image could not be stored."); }
    finally { setBusy(""); }
  };
  const ingestImage = (candidateUrl = sourceImageUrl, candidateId?: string, supplier?: string) => {
    if (supplier === "TVR" && candidateId) {
      void mutate("tvr-image", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-image/tvr`, { method: "POST", body: JSON.stringify({ candidateId }) }), "TVR source image copied into the controlled Product gallery.");
      return;
    }
    if (candidateUrl.startsWith("private-candidate:")) {
      const candidateId = candidateUrl.slice("private-candidate:".length);
      void mutate("private-image", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-image/private`, { method: "POST", body: JSON.stringify({ candidateId }) }), "Private supplier image copied into the controlled Product gallery.");
      return;
    }
    void ingestImages([candidateUrl]);
  };
  const removeImage = (mediaId: string) => mutate("media-remove", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-media/${encodeURIComponent(mediaId)}`, { method: "DELETE" }), "Controlled Product media removed.");
  const uploadImage = async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    await mutate("image-upload", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-image/upload`, { method: "POST", body: JSON.stringify({ filename: file.name, mimeType: file.type, base64, actor: session.staff?.displayName ?? "Admin staff" }) }), "Uploaded image stored in the controlled Product gallery.");
  };
  const selectLaunch = () => mutate("launch", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/launch-selection`, { method: "PATCH", body: JSON.stringify({ state: "SELECTED_FOR_LAUNCH", actor: "Admin staff" }) }), "Product selected for launch review.");
  const generatePricing = () => mutate("pricing-generate", () => apiRequest(`/api/admin/pricing/products/${encodeURIComponent(productId)}/proposal`, { method: "POST", body: "{}" }), "Pricing proposal generated for routine review.");
  const decidePricing = (proposal: PricingProposal, action: "approve" | "reject") => mutate(`pricing-${action}`, () => apiRequest(`/api/admin/pricing/proposals/${encodeURIComponent(proposal.id)}/${action}`, { method: "PATCH", body: JSON.stringify({ actor: session.staff?.displayName ?? "Admin staff" }) }), `Pricing proposal ${action === "approve" ? "approved" : "rejected"}.`);
  const acceptEnrichmentField = (field: "title" | "shortDescription" | "longDescription" | "seoTitle" | "seoDescription") => {
    if (!draft || !review?.supplierEnrichment) return;
    const value = review.supplierEnrichment[field]; if (!value) return;
    const target = field === "title" ? "name" : field === "longDescription" ? "description" : field;
    setDraft({ ...draft, [target]: value });
  };
  const acceptEnrichmentSpec = (proposed: SupplierEnrichment["specifications"][number]) => {
    if (!draft || draft.specifications.some((item) => item.name.trim().toLowerCase() === proposed.name.trim().toLowerCase())) return;
    const { evidence, ...specification } = proposed;
    setDraft({ ...draft, specifications: [...draft.specifications, { ...specification, source: `${evidence.supplier} source evidence`, capturedAt: evidence.retrievedAt, origin: "APPROVED_SOURCE_DERIVED" }] });
  };
  const applyContentSuggestions = () => {
    if (!draft || !review?.contentSuggestions) return;
    const specifications = [...draft.specifications];
    for (const proposed of review.contentSuggestions.specifications) if (!specifications.some((item) => item.name.trim().toLowerCase() === proposed.name.trim().toLowerCase())) specifications.push(proposed);
    setDraft({ ...draft, specifications });
    setFeedback("Safe source-backed specifications added to the draft. Document candidates still require controlled import.");
  };
  const createNewVersion = async (targetStep: ProductOnboardingStepId = "CONTENT") => {
    if (productLoading || activeProductIdRef.current !== productId) return;
    setBusy("new-version"); setError(""); setFeedback("");
    try {
      await apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-draft/new`, { method: "POST", body: JSON.stringify({ actor: "Admin staff" }) });
      await load(false);
      updateStep(targetStep);
      setFeedback("Editable draft created from the current published version.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "The next Product version could not be prepared."); }
    finally { setBusy(""); }
  };
  const storeDocument = async (input: { file?: File; sourceUrl?: string }) => {
    if (!draft || !canManageMedia || productLoading || activeProductIdRef.current !== productId) return;
    setBusy("document"); setError(""); setFeedback("");
    try {
      let stored: { publicUrl: string; mimeType: "application/pdf"; bytes: number };
      let filename = "Imported document.pdf";
      if (input.file) {
        filename = input.file.name;
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(input.file!); });
        stored = await apiRequest<{ publicUrl: string; mimeType: "application/pdf"; bytes: number }>(`/api/admin/products/${encodeURIComponent(productId)}/publication-documents/upload`, { method: "POST", body: JSON.stringify({ filename, mimeType: input.file.type, base64 }) });
      } else {
        const sourceUrl = input.sourceUrl ?? ""; filename = sourceUrl.split("/").pop() || filename;
        stored = await apiRequest<{ publicUrl: string; mimeType: "application/pdf"; bytes: number }>(`/api/admin/products/${encodeURIComponent(productId)}/publication-documents/import`, { method: "POST", body: JSON.stringify({ sourceUrl }) });
      }
      setDraft({ ...draft, documents: [...(draft.documents ?? []), { type: "OTHER", title: filename.replace(/\.pdf$/i, ""), url: stored.publicUrl, verified: true, source: "STAFF", origin: "STAFF_EDITED", filename, mimeType: stored.mimeType, size: stored.bytes, uploadedAt: new Date().toISOString(), actor: "Admin staff" }] });
      setDocumentImportUrl(""); setFeedback("Controlled PDF stored. Save content to attach it to this Product draft.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "The Product document could not be stored."); }
    finally { setBusy(""); }
  };
  const publish = async () => {
    if (!review?.currentApprovedProposal || productLoading || activeProductIdRef.current !== productId) return;
    const idempotencyKey = publishIdempotencyKeyRef.current ?? crypto.randomUUID();
    publishIdempotencyKeyRef.current = idempotencyKey;
    setBusy("publish"); setError(""); setFeedback("");
    try {
      const result = await apiRequest<PublishWorkspaceResponse>(`/api/admin/products/${encodeURIComponent(productId)}/publish`, { method: "POST", body: JSON.stringify({ pricingProposalId: review.currentApprovedProposal.id, idempotencyKey, actor: "Admin staff" }) });
      setReadiness(result.readiness);
      setReview(result.review);
      setDraft(result.review.draft);
      setPersistedDraft(result.review.draft);
      setActiveStep("PUBLICATION");
      setFeedback(`Product published as immutable version ${result.version.version}.`);
      window.dispatchEvent(new CustomEvent("tekcentral:product-readiness-updated", { detail: { productId } }));
      publishIdempotencyKeyRef.current = undefined;
      setConfirmation(undefined);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The Product could not be published.");
      setConfirmation(undefined);
    } finally { setBusy(""); }
  };
  const unpublish = () => mutate("unpublish", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/unpublish`, { method: "POST", body: JSON.stringify({ actor: "Admin staff" }) }), "Product removed from the public storefront.").then(() => setConfirmation(undefined));
  const restoreVersion = (version: PublicationReview["versions"][number]) => {
    if (!review?.currentApprovedProposal) return;
    void mutate("restore", () => apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/publication-versions/${encodeURIComponent(version.id)}/rollback`, { method: "POST", body: JSON.stringify({ pricingProposalId: review.currentApprovedProposal!.id, idempotencyKey: crypto.randomUUID(), actor: "Admin staff" }) }), `Version ${version.version} restored as a new immutable version.`).then(() => setConfirmation(undefined));
  };

  const stepsById = useMemo(() => new Map(readiness?.steps.map((step) => [step.id, step]) ?? []), [readiness]);
  const nextActionLabel = readiness?.nextAction.label;
  return <div className="fixed inset-0 z-[80] flex justify-end bg-black/45" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-configuration-title" className="h-[100dvh] w-full overflow-y-auto bg-[#F6F7F9] shadow-2xl outline-none sm:max-w-3xl">
      <header className="sticky top-0 z-20 border-b border-[#D0D5DD] bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#176B5C]">Product configuration</p><h2 id="product-configuration-title" className="mt-1 truncate text-xl font-black text-[#101828]">{readiness?.product?.name ?? "Loading Product..."}</h2><p className="mt-1 text-xs font-semibold text-[#667085]">{readiness?.product?.sku ?? productId}{readiness?.source.supplierCode ? ` · ${readiness.source.sourceKind === "MANUAL" ? "Manual TekCentral" : readiness.source.supplierCode}` : ""}{readiness?.source.supplierSku ? ` · ${readiness.source.supplierSku}` : ""}</p></div><button type="button" onClick={close} aria-label="Close Product configuration" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#D0D5DD] bg-white"><FiX /></button></div>
        {readiness && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-md bg-[#ECFDF3] px-2.5 py-1 text-xs font-black text-[#067647]">{readiness.completedStepCount} of {readiness.totalApplicableStepCount} complete</span>{readiness.blockers.length > 0 && <span className="rounded-md bg-[#FEF3F2] px-2.5 py-1 text-xs font-black text-[#B42318]">{readiness.blockers.length} blocker{readiness.blockers.length === 1 ? "" : "s"}</span>}<span className="rounded-md border border-[#D0D5DD] bg-white px-2.5 py-1 text-xs font-black text-[#344054]">{readiness.publicationState.replace(/_/g, " ")}</span></div>}
      </header>
      <div className="space-y-4 p-4 sm:p-6">
        {error && <WorkspaceFeedback variant="error" message={error} />}{feedback && <WorkspaceFeedback variant="success" message={feedback} />}
        {productLoading && <div className="rounded-lg border border-[#E4E7EC] bg-white p-8 text-center text-sm font-bold text-[#667085]">Loading canonical readiness for {productId}...</div>}
        {readiness && <div className="rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-4"><p className="text-xs font-black uppercase text-[#175CD3]">Next action</p><p className="mt-1 font-black text-[#101828]">{readiness.nextAction.label}</p>{readiness.nextAction.id === "VIEW_STOREFRONT" && readiness.nextAction.target ? <Link to={readiness.nextAction.target} target="_blank" className="mt-3 inline-flex rounded-md bg-[#175CD3] px-3 py-2 text-xs font-black text-white">View storefront</Link> : readiness.nextAction.id === "CREATE_NEW_VERSION" ? <button type="button" onClick={() => void createNewVersion()} disabled={Boolean(busy)} className="mt-3 rounded-md bg-[#175CD3] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "new-version" ? "Preparing..." : "Create new version"}</button> : <button type="button" onClick={() => updateStep(readiness.nextAction.step)} className="mt-3 rounded-md bg-[#175CD3] px-3 py-2 text-xs font-black text-white">{nextActionLabel}</button>}</div>}
        {readiness && <AdminAiContextPanel contextType="PRODUCT" resourceId={productId} intents={["SUMMARY", "BLOCKERS", "NEXT_STEPS"]} compact />}
        {readiness && productOnboardingSteps.map((id, index) => {
          const step = stepsById.get(id); if (!step) return null;
          const expanded = activeStep === id;
          const future = readiness.firstUnresolvedStep ? productOnboardingSteps.indexOf(id) > productOnboardingSteps.indexOf(readiness.firstUnresolvedStep) : false;
          return <section key={id} tabIndex={-1} aria-labelledby={`product-configuration-step-${id}`} data-onboarding-step={id} className={`scroll-mt-28 overflow-hidden rounded-lg border bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#175CD3] ${expanded ? "border-[#469D8B] ring-2 ring-[#D5F5EE]" : "border-[#E4E7EC]"}`}>
            <button id={`product-configuration-step-${id}`} type="button" onClick={() => updateStep(id)} aria-expanded={expanded} aria-controls={`product-configuration-panel-${id}`} className="flex w-full items-center gap-3 p-4 text-left">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-black ${stateStyle[step.state]}`}>{step.state === "COMPLETE" ? <FiCheck /> : step.state === "BLOCKED" ? <FiAlertCircle /> : future ? <FiLock /> : index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-[0.08em] text-[#667085]">Step {index + 1}</span><span className="block font-black text-[#101828]">{step.label}</span></span>
              <span className={`hidden rounded-md border px-2 py-1 text-[0.65rem] font-black sm:inline ${stateStyle[step.state]}`}>{step.state.replace(/_/g, " ")}</span>{expanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
            {expanded && <div id={`product-configuration-panel-${id}`} role="region" aria-labelledby={`product-configuration-step-${id}`} className="border-t border-[#E4E7EC] p-4 sm:p-5"><p className="text-sm font-semibold leading-6 text-[#667085]">{stepCopy[id]}</p>{step.blockers.map((blocker) => <div key={blocker.code} className="mt-4 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3"><p className="text-sm font-black text-[#93370D]">{blocker.explanation}</p><p className="mt-1 text-xs font-semibold text-[#B54708]">Why it matters: {blocker.whyItMatters}</p><p className="mt-2 text-xs font-black text-[#93370D]">How to resolve: {blocker.recommendedResolution}</p></div>)}<StepBody id={id} readiness={readiness} review={review} pricing={pricing} draft={draft} setDraft={setDraft} sourceImageUrl={sourceImageUrl} setSourceImageUrl={setSourceImageUrl} documentImportUrl={documentImportUrl} setDocumentImportUrl={setDocumentImportUrl} returnTo={`${location.pathname}${location.search}`} canEdit={!productLoading && canEditDraft} canCreateVersion={!productLoading && canEdit} canManageMedia={!productLoading && canManageMedia && (review?.state !== "PUBLISHED" || review.hasActiveDraft)} canPublish={!productLoading && canPublish} canViewCost={canViewCost} canReadPricing={canReadPricing} canGeneratePricing={!productLoading && canGeneratePricing} canApprovePricing={!productLoading && canApprovePricing} canRejectPricing={!productLoading && canRejectPricing} busy={busy} hasUnsavedChanges={hasUnsavedChanges} saveDraft={saveDraft} ingestImage={ingestImage} removeImage={removeImage} ingestImages={(urls) => void ingestImages(urls)} uploadImage={uploadImage} storeDocument={storeDocument} selectLaunch={selectLaunch} generatePricing={generatePricing} decidePricing={decidePricing} createNewVersion={createNewVersion} acceptEnrichmentField={acceptEnrichmentField} acceptEnrichmentSpec={acceptEnrichmentSpec} ignoreSuggestion={(key) => setIgnoredSuggestions((current) => [...new Set([...current, key])])} ignoredSuggestions={ignoredSuggestions} applyContentSuggestions={applyContentSuggestions} requestPublish={() => setConfirmation({ action: "publish" })} requestUnpublish={() => setConfirmation({ action: "unpublish" })} requestRestore={(version) => setConfirmation({ action: "restore", version })} /></div>}
          </section>;
        })}
        {readiness && !canEdit && <p className="rounded-md border border-[#D0D5DD] bg-white p-3 text-xs font-semibold text-[#667085]">Read-only access: readiness and blockers are visible, but Product changes require additional permission.</p>}
      </div>
    </aside>
    <ConfirmationModal open={Boolean(confirmation)} title={confirmation?.action === "unpublish" ? "Unpublish Product?" : confirmation?.action === "restore" ? `Restore version ${confirmation.version?.version}?` : "Publish Product?"} description={confirmation?.action === "unpublish" ? "This removes the Product from the public storefront without deleting publication history." : confirmation?.action === "restore" ? "The selected historical snapshot will be restored as a new immutable version. Existing history remains unchanged." : `${draft?.name ?? "This Product"} will become publicly visible as a new immutable version at ${review?.currentApprovedProposal?.price === undefined ? "the approved price" : formatCurrency(review.currentApprovedProposal.price, "ZAR")}.`} confirmLabel={confirmation?.action === "unpublish" ? "Unpublish Product" : confirmation?.action === "restore" ? "Restore as new version" : "Publish to storefront"} busy={Boolean(busy)} onCancel={() => setConfirmation(undefined)} onConfirm={() => confirmation?.action === "unpublish" ? void unpublish() : confirmation?.action === "restore" && confirmation.version ? restoreVersion(confirmation.version) : void publish()} />
  </div>;
}

function StepBody({ id, readiness, review, pricing, draft, setDraft, sourceImageUrl, setSourceImageUrl, documentImportUrl, setDocumentImportUrl, returnTo, canEdit, canCreateVersion, canManageMedia, canPublish, canViewCost, canReadPricing, canGeneratePricing, canApprovePricing, canRejectPricing, busy, hasUnsavedChanges, saveDraft, ingestImage, removeImage, ingestImages, uploadImage, storeDocument, selectLaunch, generatePricing, decidePricing, createNewVersion, acceptEnrichmentField, acceptEnrichmentSpec, ignoreSuggestion, ignoredSuggestions, applyContentSuggestions, requestPublish, requestUnpublish, requestRestore }: { id: ProductOnboardingStepId; readiness: ProductOnboardingReadiness; review?: PublicationReview; pricing?: ProductPricingState; draft?: PublicationSnapshot; setDraft: (draft: PublicationSnapshot) => void; sourceImageUrl: string; setSourceImageUrl: (value: string) => void; documentImportUrl: string; setDocumentImportUrl: (value: string) => void; returnTo: string; canEdit: boolean; canCreateVersion: boolean; canManageMedia: boolean; canPublish: boolean; canViewCost: boolean; canReadPricing: boolean; canGeneratePricing: boolean; canApprovePricing: boolean; canRejectPricing: boolean; busy: string; hasUnsavedChanges: boolean; saveDraft: () => void; ingestImage: (candidateUrl?: string, candidateId?: string, supplier?: string) => void; removeImage: (mediaId: string) => Promise<void>; ingestImages: (candidateUrls: string[]) => void; uploadImage: (file: File) => Promise<void>; storeDocument: (input: { file?: File; sourceUrl?: string }) => Promise<void>; selectLaunch: () => void; generatePricing: () => void; decidePricing: (proposal: PricingProposal, action: "approve" | "reject") => void; createNewVersion: (targetStep?: ProductOnboardingStepId) => void; acceptEnrichmentField: (field: "title" | "shortDescription" | "longDescription" | "seoTitle" | "seoDescription") => void; acceptEnrichmentSpec: (specification: SupplierEnrichment["specifications"][number]) => void; ignoreSuggestion: (key: string) => void; ignoredSuggestions: string[]; applyContentSuggestions: () => void; requestPublish: () => void; requestUnpublish: () => void; requestRestore: (version: PublicationReview["versions"][number]) => void }) {
  const source = readiness.source;
  if (id === "SOURCE_EVIDENCE") return <dl className="mt-4 grid gap-4 sm:grid-cols-2"><Detail label="Source">{source.sourceKind === "MANUAL" ? "Manual TekCentral entry" : source.supplierCode}</Detail><Detail label="Source status">{source.sourceStatus}</Detail><Detail label="Source SKU">{source.supplierSku}</Detail><Detail label="Source category">{source.sourceCategory}</Detail><Detail label="Stock evidence">{source.stock ? `${source.stock.status}${source.stock.quantity === undefined ? "" : ` · ${source.stock.quantity}`}` : "Not supplied"}</Detail><Detail label="Last checked">{dateLabel(source.lastCheckedAt)}</Detail>{source.sourceUrl && <Detail label="Internal source"><a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-[#176B5C] underline">Open source <FiExternalLink className="inline" /></a></Detail>}<Detail label="Provenance">{source.sourceKind}</Detail>{source.provenance?.sourceSupplierOfferId && <Detail label="Source offer">{source.provenance.sourceSupplierOfferId}</Detail>}{source.provenance?.evidenceCount !== undefined && <Detail label="Evidence records">{source.provenance.evidenceCount}</Detail>}{source.provenance?.classification && <Detail label="Evidence classification">{source.provenance.classification}</Detail>}{source.provenance?.condition && <Detail label="Commercial context">{source.provenance.condition}</Detail>}{source.provenance?.flags && <Detail label="Source warnings">{source.provenance.flags}</Detail>}{source.provenance?.sourceVersionIds && <Detail label="Immutable source version">{source.provenance.sourceVersionIds}</Detail>}</dl>;
  if (id === "PRODUCT_MAPPING") return <div className="mt-4"><p className="text-sm font-bold">{readiness.product ? `Mapped to ${readiness.product.name ?? readiness.product.id}` : "No canonical Product mapping is available."}</p><Link to="/admin/supplier-mappings" className="mt-3 inline-flex rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black">Open mapping controls</Link></div>;
  if (id === "PRODUCT_IDENTITY") return draft ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><WorkspaceField label="Public title" value={draft.name} disabled={!canEdit} onChange={(name) => setDraft({ ...draft, name })} wide /><WorkspaceField label="Slug" value={draft.slug} disabled={!canEdit} onChange={(slug) => setDraft({ ...draft, slug })} /><WorkspaceField label="TekCentral SKU" value={draft.sku ?? ""} disabled={!canEdit} onChange={(sku) => setDraft({ ...draft, sku })} /><WorkspaceField label="Brand" value={draft.brand} disabled={!canEdit} onChange={(brand) => setDraft({ ...draft, brand })} /><WorkspaceField label="Model" value={draft.model ?? ""} disabled={!canEdit} onChange={(model) => setDraft({ ...draft, model })} />{canEdit && <button type="button" onClick={saveDraft} disabled={!hasUnsavedChanges || Boolean(busy)} className="w-fit rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Save identity</button>}</div> : <p className="mt-4 text-sm font-semibold text-[#667085]">Product identity becomes available after mapping.</p>;
  if (id === "TAXONOMY") return draft ? <TaxonomyEditor draft={draft} setDraft={setDraft} canEdit={canEdit} busy={busy} hasUnsavedChanges={hasUnsavedChanges} saveDraft={saveDraft} /> : <p className="mt-4 text-sm font-semibold text-[#667085]">Taxonomy becomes available after mapping.</p>;
  if (id === "CONTENT") return draft ? <ContentEditor draft={draft} setDraft={setDraft} review={review} setSourceImageUrl={setSourceImageUrl} canEdit={canEdit} canManageDocuments={canManageMedia} busy={busy} hasUnsavedChanges={hasUnsavedChanges} documentImportUrl={documentImportUrl} setDocumentImportUrl={setDocumentImportUrl} storeDocument={storeDocument} saveDraft={saveDraft} acceptEnrichmentField={acceptEnrichmentField} acceptEnrichmentSpec={acceptEnrichmentSpec} ignoreSuggestion={ignoreSuggestion} ignoredSuggestions={ignoredSuggestions} applyContentSuggestions={applyContentSuggestions} /> : <p className="mt-4 text-sm font-semibold text-[#667085]">Publication content becomes available after a verified Product mapping.</p>;
  if (id === "MEDIA") return <MediaEditor review={review} draft={draft} setDraft={setDraft} sourceImageUrl={sourceImageUrl} setSourceImageUrl={setSourceImageUrl} canManageMedia={canManageMedia} canCreateVersion={canCreateVersion} busy={busy} ingestImage={ingestImage} removeImage={removeImage} ingestImages={ingestImages} uploadImage={uploadImage} saveDraft={saveDraft} createNewVersion={createNewVersion} ignoredSuggestions={ignoredSuggestions} ignoreSuggestion={ignoreSuggestion} />;
  if (id === "LOGISTICS") return <div className="mt-4 space-y-4"><dl className="grid gap-4 sm:grid-cols-2"><Detail label="Evidence status">{source.logistics?.status}</Detail><Detail label="Evidence confidence">{review?.intelligence?.logistics.confidence}</Detail><Detail label="Evidence source">{source.logistics?.source}</Detail><Detail label="Observed at">{dateLabel(source.logistics?.observedAt)}</Detail><Detail label="Delivery display">{draft?.deliveryDisplay}</Detail></dl><RecommendationSummary recommendations={review?.intelligence?.logistics.recommendations} /></div>;
  if (id === "COMMERCIAL") return canViewCost ? <dl className="mt-4 grid gap-4 sm:grid-cols-2"><Detail label="Commercial status">{source.commercial?.status}</Detail><Detail label="Supplier cost">{source.commercial?.cost === undefined ? "Unavailable" : supplierMoney(source.commercial.cost, source.commercial.currency)}</Detail><Detail label="Currency">{source.commercial?.currency}</Detail><Detail label="Tax basis">{source.commercial?.taxBasis}</Detail><Detail label="Price meaning">{source.commercial?.priceMeaning?.replace(/_/g, " ")}</Detail><Detail label="Observed at">{dateLabel(source.commercial?.observedAt)}</Detail></dl> : <p className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-sm font-semibold text-[#667085]">Commercial evidence is restricted. Its readiness state remains visible without exposing supplier cost.</p>;
  if (id === "PRICING") {
    const proposals = pricing?.proposals ?? [];
    const current = proposals.find((proposal) => proposal.status === "PENDING_APPROVAL") ?? proposals.find((proposal) => proposal.status === "APPROVED") ?? proposals[0];
    const pricingHref = `/admin/pricing?product=${encodeURIComponent(readiness.product?.id ?? "")}${current ? `&proposal=${encodeURIComponent(current.id)}&view=approval` : ""}&returnTo=${encodeURIComponent(returnTo)}`;
    return <div className="mt-4 space-y-4">
      {!canReadPricing ? <p className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-sm font-semibold text-[#667085]">Pricing details are restricted for your role. Canonical readiness remains visible.</p> : <>
        <RecommendationSummary recommendations={review?.intelligence?.pricing.recommendations} />
        <dl className="grid gap-4 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-4 sm:grid-cols-2">
          <Detail label="Proposal status">{current?.status.replace(/_/g, " ") ?? "No current proposal"}</Detail>
          <Detail label="Proposed selling price">{current?.proposedSellingPriceInclVat === undefined ? "Unavailable" : formatCurrency(current.proposedSellingPriceInclVat, "ZAR")}</Detail>
          <Detail label="Approved selling price">{review?.currentApprovedProposal?.price === undefined ? "Not approved" : formatCurrency(review.currentApprovedProposal.price, "ZAR")}</Detail>
          <Detail label="Proposal reference">{current?.id ?? "Not generated"}</Detail>
          {canViewCost && <Detail label="Current supplier cost basis">{current?.costSnapshot.supplierCostExVat === undefined && current?.costSnapshot.landedCostExVat === undefined ? "Unavailable" : formatCurrency(current.costSnapshot.landedCostExVat ?? current.costSnapshot.supplierCostExVat ?? 0, "ZAR")}</Detail>}
        </dl>
        {canViewCost && Boolean(review?.intelligence?.pricing.comparison.length) && <details className="rounded-md border border-[#E4E7EC] bg-white p-3"><summary className="cursor-pointer text-xs font-black">Eligible supplier evidence ({review?.intelligence?.pricing.comparison.length})</summary><div className="mt-3 space-y-2">{review?.intelligence?.pricing.comparison.map((item)=><div key={item.proposalId} className="grid gap-1 rounded-md bg-[#F9FAFB] p-3 text-xs sm:grid-cols-4"><span className="font-black">{item.supplier}</span><span>{item.status.replace(/_/g," ")}</span><span>{item.supplierCostExVat===undefined?"Cost unavailable":supplierMoney(item.supplierCostExVat,item.currency)}</span><span>{item.grossMarginPercent===undefined?"Margin unavailable":`${item.grossMarginPercent.toFixed(2)}% margin`}</span></div>)}</div><p className="mt-2 text-[11px] font-semibold text-[#667085]">Comparison is decision support only and never changes the procurement supplier automatically.</p></details>}
        {current?.warningDetails?.some((warning) => warning.severity === "BLOCKING") && <p className="rounded-md border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm font-bold text-[#B42318]">This proposal has blocking commercial warnings. Use the full pricing review.</p>}
        <div className="flex flex-wrap gap-2">
          {!current && canGeneratePricing && <button type="button" disabled={Boolean(busy)} onClick={generatePricing} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">{busy === "pricing-generate" ? "Generating..." : "Generate pricing proposal"}</button>}
          {current?.status === "PENDING_APPROVAL" && canApprovePricing && <button type="button" disabled={Boolean(busy) || current.warningDetails?.some((warning) => warning.severity === "BLOCKING")} onClick={() => decidePricing(current, "approve")} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">{busy === "pricing-approve" ? "Approving..." : "Approve proposal"}</button>}
          {current?.status === "PENDING_APPROVAL" && canRejectPricing && <button type="button" disabled={Boolean(busy)} onClick={() => decidePricing(current, "reject")} className="rounded-md border border-[#FDA29B] px-3 py-2 text-xs font-black text-[#B42318] disabled:opacity-50">{busy === "pricing-reject" ? "Rejecting..." : "Reject proposal"}</button>}
          <Link to={pricingHref} className="inline-flex rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black">Open full pricing review</Link>
        </div>
      </>}
    </div>;
  }
  if (id === "LAUNCH") return <div className="mt-4"><p className="text-sm font-bold">{review?.launchSelection?.state === "SELECTED_FOR_LAUNCH" ? "Selected for launch review." : "Not selected for launch."}</p>{canEdit && review?.launchSelection?.state !== "SELECTED_FOR_LAUNCH" && <button type="button" onClick={selectLaunch} disabled={Boolean(busy)} className="mt-3 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">{busy === "launch" ? "Selecting..." : "Select for launch"}</button>}</div>;
  if (id === "PREVIEW") return <div className="mt-4"><p className="text-sm font-semibold text-[#667085]">Preview uses the current saved publication draft and excludes private supplier evidence.</p>{review && <Link to={`/admin/products/${encodeURIComponent(readiness.product?.id ?? "")}/publishing/preview`} target="_blank" className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] px-3 py-2 text-sm font-black">Preview Product <FiExternalLink /></Link>}</div>;
  if (id === "PUBLICATION") return <div className="mt-4 space-y-4"><dl className="grid gap-4 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-4 sm:grid-cols-2"><Detail label="Product">{draft?.name}</Detail><Detail label="Price">{review?.currentApprovedProposal?.price === undefined ? "Not approved" : formatCurrency(review.currentApprovedProposal.price, "ZAR")}</Detail><Detail label="Current version">{review?.activeVersionId ? `Version ${review.versions.find((item) => item.id === review.activeVersionId)?.version ?? review.versions.length}` : "Not published"}</Detail><Detail label="Current availability">{review?.availability ? `${review.availability.state.replace(/_/g, " ")} · ${review.availability.label}` : "Unavailable"}</Detail></dl>{review?.eligibility?.blockers?.length ? <div className="rounded-md border border-[#FDA29B] bg-[#FEF3F2] p-3"><p className="text-xs font-black text-[#B42318]">Blocking requirements</p>{review.eligibility.blockers.map((blocker) => <p key={blocker} className="mt-1 text-xs font-semibold text-[#B42318]">{blocker}</p>)}</div> : null}{review?.eligibility?.warnings?.length ? <details className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3"><summary className="cursor-pointer text-xs font-black text-[#93370D]">Recommended content ({review.eligibility.warnings.length})</summary>{review.eligibility.warnings.map((warning) => <p key={warning} className="mt-1 text-xs font-semibold text-[#B54708]">{warning}</p>)}</details> : null}{readiness.alreadyPublished ? <div className="flex flex-wrap gap-2"><Link to={`/product/${draft?.slug ?? readiness.product?.slug ?? ""}`} target="_blank" className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">View storefront</Link>{canCreateVersion && !review?.hasActiveDraft && <button type="button" onClick={() => createNewVersion()} disabled={Boolean(busy)} className="rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black disabled:opacity-50">{busy === "new-version" ? "Preparing..." : "Create new version"}</button>}{canPublish && <button type="button" onClick={requestUnpublish} disabled={Boolean(busy)} className="rounded-md border border-[#FDA29B] px-4 py-2 text-sm font-black text-[#B42318] disabled:opacity-50">Unpublish</button>}{review?.hasActiveDraft && <p className="basis-full text-xs font-semibold text-[#175CD3]">An editable next-version draft is active. The current published version remains immutable.</p>}</div> : readiness.publicationEligible ? canPublish ? hasUnsavedChanges ? <div><p className="text-sm font-semibold text-[#667085]">Save the current customer-facing draft before creating the immutable publication version.</p><button type="button" onClick={saveDraft} disabled={Boolean(busy)} className="mt-3 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">{busy === "draft" ? "Saving draft..." : "Save draft before publishing"}</button></div> : <button type="button" onClick={requestPublish} disabled={Boolean(busy)} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Publish Product</button> : <p className="text-sm font-semibold text-[#667085]">This Product is ready, but your role cannot publish.</p> : <div><p className="text-sm font-black text-[#B42318]">Publication is blocked by {readiness.blockers.length} unresolved requirement{readiness.blockers.length === 1 ? "" : "s"}.</p><p className="mt-1 text-xs font-semibold text-[#667085]">Next: {readiness.nextAction.label}</p></div>}{review?.versions.length ? <section className="border-t border-[#E4E7EC] pt-4"><h4 className="text-sm font-black">Version history</h4><div className="mt-2 divide-y divide-[#E4E7EC]">{[...review.versions].reverse().map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-black">Version {version.version} · {formatCurrency(version.snapshot.price, "ZAR")}</p><p className="mt-1 text-xs font-semibold text-[#667085]">{review.activeVersionId === version.id ? "Current immutable version" : "Historical immutable version"}</p></div>{canPublish && review.activeVersionId !== version.id && <button type="button" onClick={() => requestRestore(version)} disabled={Boolean(busy)} className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black disabled:opacity-50">Restore as new version</button>}</div>)}</div></section> : null}</div>;
  return null;
}

function MediaEditor({ review, draft, setDraft, sourceImageUrl, setSourceImageUrl, canManageMedia, canCreateVersion, busy, ingestImage, removeImage, ingestImages, uploadImage, saveDraft, createNewVersion, ignoredSuggestions, ignoreSuggestion }: { review?: PublicationReview; draft?: PublicationSnapshot; setDraft: (draft: PublicationSnapshot) => void; sourceImageUrl: string; setSourceImageUrl: (value: string) => void; canManageMedia: boolean; canCreateVersion: boolean; busy: string; ingestImage: (candidateUrl?: string, candidateId?: string, supplier?: string) => void; removeImage: (mediaId: string) => Promise<void>; ingestImages: (candidateUrls: string[]) => void; uploadImage: (file: File) => Promise<void>; saveDraft: () => void; createNewVersion: (targetStep?: ProductOnboardingStepId) => void; ignoredSuggestions: string[]; ignoreSuggestion: (key: string) => void }) {
  const candidates = review?.supplierEnrichment?.imageCandidates ?? [];
  const images = draft?.images ?? [];
  const [selectedImage, setSelectedImage] = useState(images[0]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const activeImage = selectedImage && images.includes(selectedImage) ? selectedImage : images[0];
  const capacityReached = images.length >= 8;
  const publishedReadOnly = review?.state === "PUBLISHED" && !review.hasActiveDraft;
  const mediaIdFor = (url: string) => review?.image?.gallery?.find((item) => item.publicUrl === url)?.mediaId;
  const selectable = candidates.filter((candidate) => !["INGESTED", "DUPLICATE", "INVALID", "REJECTED"].includes(ignoredSuggestions.includes(`media:${candidate.id}`) ? "REJECTED" : candidate.status) && candidate.reuseEligibility !== "NOT_APPROVED");
  const selectablePublic = selectable.filter((candidate): candidate is typeof candidate & { url: string } => Boolean(candidate.url) && candidate.supplier !== "TVR");
  const eligibleForBulk = selectablePublic.filter((candidate) => candidate.reuseEligibility === "APPROVED_SOURCE");
  const toggleCandidate = (id: string) => setSelectedCandidates((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <div className="mt-4 space-y-5">
    {candidates.some((candidate)=>candidate.intelligence?.labels.length) && <div className="flex flex-wrap gap-2" aria-label="Media intelligence summary">{[...new Set(candidates.flatMap((candidate)=>candidate.intelligence?.labels??[]))].map((label)=><span key={label} className="rounded-full border border-[#D0D5DD] bg-[#F9FAFB] px-2.5 py-1 text-[10px] font-black text-[#475467]">{label}</span>)}</div>}
    <section><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-black">Controlled Product gallery</h4><p className="mt-1 text-xs font-semibold text-[#667085]">Images stored and controlled by TekCentral. The first image is the canonical primary.</p></div><div className="text-right"><span className="rounded-md border px-2 py-1 text-xs font-black">{images.length} {images.length === 1 ? "image" : "images"} · maximum 8</span><p className="mt-2 text-[11px] font-semibold text-[#667085]">Supplier candidates: {candidates.length}</p></div></div>
      {publishedReadOnly && <div className="mt-3 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] p-3"><p className="text-xs font-bold text-[#175CD3]">This gallery belongs to the current immutable published version.</p>{canCreateVersion && <button type="button" onClick={() => createNewVersion("MEDIA")} disabled={Boolean(busy)} className="mt-2 rounded-md bg-[#175CD3] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "new-version" ? "Preparing..." : "Create new version to edit gallery"}</button>}</div>}
      {activeImage ? <div className="mt-3 overflow-hidden rounded-md border bg-[#F6F7F9] p-3"><div className="relative mx-auto aspect-[5/4] max-h-80"><img src={activeImage} alt={`${draft?.name ?? "Product"}${images[0] === activeImage ? " — primary image" : " — gallery image"}`} className="h-full w-full object-contain" />{images[0] === activeImage && <span className="absolute left-1 top-1 rounded bg-[#176B5C] px-2 py-1 text-[10px] font-black text-white">PRIMARY</span>}</div>{canManageMedia && images.length === 1 && mediaIdFor(activeImage) && <div className="mt-2 flex justify-end"><button type="button" disabled={Boolean(busy)} onClick={() => void removeImage(mediaIdFor(activeImage)!)} className="inline-flex items-center gap-1 rounded-md border border-[#FDA29B] px-3 py-2 text-xs font-black text-[#B42318] disabled:opacity-50"><FiTrash2 />{busy === "media-remove" ? "Removing..." : "Remove image"}</button></div>}</div> : <div className="mt-3 grid min-h-28 place-items-center rounded-md border border-dashed border-[#D0D5DD] text-[#667085]"><FiImage className="text-2xl" /><span className="text-xs font-bold">No controlled public image</span></div>}
      {images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Controlled Product gallery images">{images.map((image, index) => <article key={image} role="listitem" className={`w-32 shrink-0 overflow-hidden rounded-md border bg-white ${activeImage === image ? "border-[#176B5C] ring-2 ring-[#A6D8CC]" : "border-[#E4E7EC]"}`}><button type="button" onClick={() => setSelectedImage(image)} aria-pressed={activeImage === image} className="relative block h-24 w-full bg-[#F6F7F9] p-2"><img src={image} alt={`View image ${index + 1}`} className="h-full w-full object-contain" />{index === 0 && <span className="absolute left-1 top-1 rounded bg-[#176B5C] px-1.5 py-0.5 text-[9px] font-black text-white">PRIMARY</span>}</button>{canManageMedia && draft && <div className="grid grid-cols-4 gap-1 border-t p-1"><button type="button" aria-label={`Set image ${index + 1} as primary`} title="Set as primary" disabled={index === 0} onClick={() => setDraft({ ...draft, images: [image, ...draft.images.filter((item) => item !== image)] })} className="grid h-8 place-items-center rounded border disabled:opacity-30"><FiStar /></button><button type="button" aria-label={`Move image ${index + 1} left`} title="Move left" disabled={index === 0} onClick={() => { const ordered = [...draft.images]; [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]]; setDraft({ ...draft, images: ordered }); }} className="grid h-8 place-items-center rounded border disabled:opacity-30"><FiChevronLeft /></button><button type="button" aria-label={`Move image ${index + 1} right`} title="Move right" disabled={index === draft.images.length - 1} onClick={() => { const ordered = [...draft.images]; [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]]; setDraft({ ...draft, images: ordered }); }} className="grid h-8 place-items-center rounded border disabled:opacity-30"><FiChevronRight /></button><button type="button" aria-label={`Remove image ${index + 1}`} title="Remove" onClick={() => setDraft({ ...draft, images: draft.images.filter((item) => item !== image) })} className="grid h-8 place-items-center rounded border text-[#B42318]"><FiTrash2 /></button></div>}</article>)}</div>}
      {capacityReached && <p className="mt-3 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-bold text-[#93370D]">Maximum controlled gallery reached. Remove an image before adding another.</p>}
      {canManageMedia && draft && <button type="button" onClick={saveDraft} disabled={Boolean(busy)} className="mt-3 rounded-md border border-[#469D8B] px-4 py-2 text-sm font-black text-[#176B5C] disabled:opacity-50">{busy === "draft" ? "Saving..." : "Save gallery order"}</button>}
    </section>
    {candidates.length > 0 && <section className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-black">Supplier media candidates</h4><p className="mt-1 text-xs font-semibold text-[#667085]">{candidates.length} private source candidate{candidates.length === 1 ? "" : "s"}. Staff approval is required before controlled ingestion.</p></div>{canManageMedia && selectablePublic.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { ingestImages(selectablePublic.filter((candidate) => selectedCandidates.includes(candidate.id)).map((candidate) => candidate.url)); setSelectedCandidates([]); }} disabled={!selectedCandidates.length || capacityReached || Boolean(busy)} className="rounded-md border bg-white px-3 py-2 text-xs font-black disabled:opacity-50">Ingest selected</button>{eligibleForBulk.length > 0 && <button type="button" onClick={() => { ingestImages(eligibleForBulk.map((candidate) => candidate.url)); setSelectedCandidates([]); }} disabled={capacityReached || Boolean(busy)} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">Ingest all eligible</button>}</div>}</div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Private supplier media candidates">{candidates.map((candidate) => {
        const status = ignoredSuggestions.includes(`media:${candidate.id}`) ? "REJECTED" : candidate.status;
        const canIngest = canManageMedia && !["INGESTED", "DUPLICATE", "INVALID", "REJECTED"].includes(status) && candidate.reuseEligibility !== "NOT_APPROVED";
        return <article key={candidate.id} role="listitem" className="w-52 shrink-0 rounded-md border bg-white p-2">
          {candidate.url ? <img src={candidate.url} alt="Supplier media candidate" className="h-28 w-full object-contain" /> : <div className="grid h-28 place-items-center rounded bg-[#F2F4F7] p-3 text-center"><div><FiImage className="mx-auto text-2xl text-[#176B5C]" /><p className="mt-2 text-[11px] font-black">Private supplier image</p><p className="mt-1 text-[10px] font-semibold text-[#667085]">{candidate.privateEvidence?.mimeType} · {candidate.privateEvidence?.byteSize ?? 0} bytes</p></div></div>}
          <p className="mt-2 text-[11px] font-black">{status.replace(/_/g, " ")}</p>
          <p className="mt-1 text-[10px] font-semibold text-[#667085]">{candidate.association.replace(/_/g, " ")} · {candidate.sourceType.replace(/_/g, " ")}</p>
          {candidate.url && candidate.supplier !== "TVR" && canIngest && <label className="mt-2 flex items-center gap-2 text-[11px] font-black"><input type="checkbox" checked={selectedCandidates.includes(candidate.id)} onChange={() => toggleCandidate(candidate.id)} />Select</label>}
          {canManageMedia && <div className="mt-2 flex gap-1">{canIngest && <button type="button" onClick={() => ingestImage(candidate.url ?? `private-candidate:${candidate.id}`, candidate.id, candidate.supplier)} disabled={Boolean(busy) || capacityReached} className="rounded bg-[var(--tek-accent)] px-2 py-1.5 text-[11px] font-black disabled:opacity-50">{candidate.url ? "Ingest image" : "Ingest controlled copy"}</button>}{!["INGESTED", "DUPLICATE", "REJECTED"].includes(status) && <button type="button" onClick={() => ignoreSuggestion(`media:${candidate.id}`)} className="rounded border px-2 py-1.5 text-[11px] font-black">Reject</button>}</div>}
        </article>;
      })}</div>
      {selectable.some((candidate) => candidate.reuseEligibility === "REVIEW_REQUIRED") && <p className="mt-2 text-[11px] font-semibold text-[#667085]">These candidates require individual staff review. Reject is session-only and does not mutate private supplier evidence.</p>}
    </section>}
    {canManageMedia && <section className="rounded-md border border-[#E4E7EC] p-4"><h4 className="text-sm font-black">Add controlled image</h4><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Approved source image URL" value={sourceImageUrl} onChange={(event) => setSourceImageUrl(event.target.value)} placeholder="Approved HTTPS image URL" className="h-10 min-w-0 flex-1 rounded-md border border-[#D0D5DD] px-3 text-sm" /><button type="button" onClick={() => ingestImage()} disabled={!sourceImageUrl.startsWith("https://") || (draft?.images.length ?? 0) >= 8 || Boolean(busy)} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">{busy === "image" ? "Storing image..." : "Ingest approved URL"}</button></div><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black"><FiUpload />{busy === "image-upload" ? "Uploading..." : "Upload own image"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(busy) || (draft?.images.length ?? 0) >= 8} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ""; }} className="sr-only" /></label><p className="mt-2 text-xs font-semibold text-[#667085]">JPEG, PNG, WebP or GIF up to 5 MB. Invalid or duplicate media is not added twice.</p></section>}
  </div>;
}

function ContentEditor({ draft, setDraft, review, setSourceImageUrl, canEdit, canManageDocuments, busy, hasUnsavedChanges, documentImportUrl, setDocumentImportUrl, storeDocument, saveDraft, acceptEnrichmentField, acceptEnrichmentSpec, ignoreSuggestion, ignoredSuggestions, applyContentSuggestions }: { draft: PublicationSnapshot; setDraft: (draft: PublicationSnapshot) => void; review?: PublicationReview; setSourceImageUrl: (value: string) => void; canEdit: boolean; canManageDocuments: boolean; busy: string; hasUnsavedChanges: boolean; documentImportUrl: string; setDocumentImportUrl: (value: string) => void; storeDocument: (input: { file?: File; sourceUrl?: string }) => Promise<void>; saveDraft: () => void; acceptEnrichmentField: (field: "title" | "shortDescription" | "longDescription" | "seoTitle" | "seoDescription") => void; acceptEnrichmentSpec: (specification: SupplierEnrichment["specifications"][number]) => void; ignoreSuggestion: (key: string) => void; ignoredSuggestions: string[]; applyContentSuggestions: () => void }) {
  const updateSpec = (index: number, changes: Partial<PublicationSnapshot["specifications"][number]>) => setDraft({ ...draft, specifications: draft.specifications.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes, source: "STAFF", origin: "STAFF_EDITED" } : item) });
  const updateDocument = (index: number, changes: Partial<NonNullable<PublicationSnapshot["documents"]>[number]>) => setDraft({ ...draft, documents: (draft.documents ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...changes, source: "STAFF", origin: "STAFF_EDITED" } : item) });
  return <div className="mt-4 grid gap-4">
    {!canEdit && <p className="rounded-md border border-[#D0D5DD] bg-[#F9FAFB] p-3 text-xs font-semibold text-[#667085]">This is the current immutable published presentation. Create a new version before editing.</p>}
    <RecommendationSummary recommendations={review?.intelligence?.content} />
    <label className="text-xs font-black text-[#344054]">Public title<input disabled={!canEdit} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm disabled:bg-[#F2F4F7]" /></label>
    <label className="text-xs font-black text-[#344054]">Short description<textarea disabled={!canEdit} value={draft.shortDescription} onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-[#D0D5DD] p-3 text-sm disabled:bg-[#F2F4F7]" /></label>
    <label className="text-xs font-black text-[#344054]">Long description<textarea disabled={!canEdit} value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={5} className="mt-1 w-full rounded-md border border-[#D0D5DD] p-3 text-sm disabled:bg-[#F2F4F7]" /></label>
    <label className="text-xs font-black text-[#344054]">Overview / customer-facing fallback<textarea disabled={!canEdit} value={draft.overview ?? ""} onChange={(event) => setDraft({ ...draft, overview: event.target.value })} rows={4} className="mt-1 w-full rounded-md border border-[#D0D5DD] p-3 text-sm disabled:bg-[#F2F4F7]" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-[#344054]">SEO title<input disabled={!canEdit} value={draft.seoTitle ?? ""} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm disabled:bg-[#F2F4F7]" /></label><label className="text-xs font-black text-[#344054]">SEO description<input disabled={!canEdit} value={draft.seoDescription ?? ""} onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm disabled:bg-[#F2F4F7]" /></label></div>
    <label className="text-xs font-black text-[#344054]">Delivery wording<input disabled={!canEdit} value={draft.deliveryDisplay ?? ""} onChange={(event) => setDraft({ ...draft, deliveryDisplay: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm disabled:bg-[#F2F4F7]" /></label>
    {canEdit && review?.supplierEnrichment && <SourceSuggestionReview suggestion={{ ...review.supplierEnrichment, imageCandidates: review.supplierEnrichment.imageCandidates.filter((candidate) => Boolean(candidate.url)) }} draft={draft} ignored={ignoredSuggestions} acceptField={acceptEnrichmentField} acceptSpec={acceptEnrichmentSpec} ignore={ignoreSuggestion} onUseImage={(url) => { if (url) setSourceImageUrl(url); }} />}
    {canEdit && Boolean(review?.contentSuggestions?.specifications.length || review?.contentSuggestions?.documents.length) && <section className="rounded-md border border-[#A6D8CC] bg-[#F2F9F7] p-4"><h4 className="text-sm font-black">Authoritative source candidates</h4><p className="mt-1 text-xs font-semibold">Specifications: {review?.contentSuggestions?.specifications.length ?? 0} · Document candidates: {review?.contentSuggestions?.documents.length ?? 0}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={applyContentSuggestions} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Apply safe specifications</button>{review?.contentSuggestions?.documents.map((document) => <button key={document.url} type="button" onClick={() => setDocumentImportUrl(document.url)} className="rounded-md border border-[#469D8B] bg-white px-3 py-2 text-xs font-black">Prepare import: {document.title}</button>)}</div><p className="mt-2 text-[11px] font-semibold text-[#667085]">Document candidates are never attached directly; use controlled import below.</p></section>}
    <section className="border-t border-[#E4E7EC] pt-4"><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black">Specifications</h4><p className="mt-1 text-xs font-semibold text-[#667085]">Canonical TekCentral details used by Product Details.</p></div>{canEdit && <button type="button" onClick={() => setDraft({ ...draft, specifications: [...draft.specifications, { name: "", value: "", source: "STAFF", origin: "STAFF_EDITED" }] })} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-black"><FiPlus />Add</button>}</div><div className="mt-3 space-y-2">{draft.specifications.map((item, index) => <div key={`${index}-${item.name}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><input disabled={!canEdit} aria-label={`Specification ${index + 1} name`} value={item.name} onChange={(event) => updateSpec(index, { name: event.target.value })} placeholder="Specification" className="h-10 rounded-md border px-3 text-sm disabled:bg-[#F2F4F7]" /><input disabled={!canEdit} aria-label={`Specification ${index + 1} value`} value={item.value} onChange={(event) => updateSpec(index, { value: event.target.value })} placeholder="Value" className="h-10 rounded-md border px-3 text-sm disabled:bg-[#F2F4F7]" />{canEdit && <button type="button" aria-label={`Remove specification ${index + 1}`} onClick={() => setDraft({ ...draft, specifications: draft.specifications.filter((_, itemIndex) => itemIndex !== index) })} className="grid h-10 w-10 place-items-center rounded-md border text-[#B42318]"><FiTrash2 /></button>}</div>)}{!draft.specifications.length && <p className="rounded-md border border-dashed p-3 text-sm text-[#667085]">No specifications added.</p>}</div></section>
    <section className="border-t border-[#E4E7EC] pt-4"><div><h4 className="text-sm font-black">Product documents</h4><p className="mt-1 text-xs font-semibold text-[#667085]">PDF only · max 10 MB · stored and served by TekCentral.</p></div>{canManageDocuments && <div className="mt-3 flex flex-wrap gap-2 rounded-md bg-[#F6F7F9] p-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-black"><FiUpload />{busy === "document" ? "Storing..." : "Upload PDF"}<input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void storeDocument({ file }); event.target.value = ""; }} /></label><input aria-label="Trusted Product document URL" value={documentImportUrl} onChange={(event) => setDocumentImportUrl(event.target.value)} placeholder="Trusted HTTPS PDF URL" className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm" /><button type="button" onClick={() => void storeDocument({ sourceUrl: documentImportUrl })} disabled={!documentImportUrl.startsWith("https://") || Boolean(busy)} className="rounded-md border bg-white px-3 py-2 text-xs font-black disabled:opacity-50">Import PDF</button></div>}<div className="mt-3 space-y-3">{(draft.documents ?? []).map((item, index) => <article key={`${index}-${item.url}`} className="rounded-md border p-3"><div className="flex items-center gap-2"><FiFileText className="text-[#176B5C]" /><span className="text-xs font-black">{item.url.startsWith("/api/public/assets/documents/") ? "Stored by TekCentral ✓" : "Document reference"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-[170px_1fr_auto]"><select disabled={!canEdit} aria-label={`Document ${index + 1} type`} value={item.type} onChange={(event) => updateDocument(index, { type: event.target.value as ProductDocumentType })} className="h-10 rounded-md border px-2 text-sm disabled:bg-[#F2F4F7]">{documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input disabled={!canEdit} aria-label={`Document ${index + 1} title`} value={item.title} onChange={(event) => updateDocument(index, { title: event.target.value })} placeholder="Public display title" className="h-10 rounded-md border px-3 text-sm disabled:bg-[#F2F4F7]" />{canEdit && <button type="button" aria-label={`Remove document ${index + 1}`} onClick={() => setDraft({ ...draft, documents: (draft.documents ?? []).filter((_, itemIndex) => itemIndex !== index) })} className="grid h-10 w-10 place-items-center rounded-md border text-[#B42318]"><FiTrash2 /></button>}</div><p className="mt-2 text-[11px] font-semibold text-[#667085]">{item.mimeType ?? "application/pdf"}{item.size ? ` · ${Math.ceil(item.size / 1024)} KB` : ""}{item.filename ? ` · ${item.filename}` : ""}</p></article>)}{!(draft.documents?.length) && <p className="rounded-md border border-dashed p-3 text-sm text-[#667085]">No Product documents attached.</p>}</div></section>
    {canEdit && <button type="button" onClick={saveDraft} disabled={!hasUnsavedChanges || Boolean(busy)} className="w-fit rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">{busy === "draft" ? "Saving..." : "Save content"}</button>}
  </div>;
}

function WorkspaceField({ label, value, disabled, onChange, wide = false }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; wide?: boolean }) {
  return <label className={`text-xs font-black text-[#344054] ${wide ? "sm:col-span-2" : ""}`}>{label}<input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm disabled:bg-[#F2F4F7]" /></label>;
}

function TaxonomyEditor({ draft, setDraft, canEdit, busy, hasUnsavedChanges, saveDraft }: { draft: PublicationSnapshot; setDraft: (draft: PublicationSnapshot) => void; canEdit: boolean; busy: string; hasUnsavedChanges: boolean; saveDraft: () => void }) {
  const session = useStaffSession();
  const [categories, setCategories] = useState<TaxonomyOption[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    void apiRequest<{ categories: TaxonomyOption[] }>("/api/admin/product-taxonomy")
      .then((result) => { if (active) setCategories(result.categories.filter((item) => item.status === "ACTIVE")); })
      .catch(() => { if (active) setLoadError("Canonical taxonomy could not be loaded."); });
    return () => { active = false; };
  }, []);
  const category = categories.find((item) => item.id === draft.categoryId || item.slug === draft.categorySlug || item.name === draft.category);
  const subcategory = category?.children.find((item) => item.id === draft.subcategoryId || item.name === draft.subcategory);
  const productType = subcategory?.productTypes?.find((item) => item.id === draft.productTypeId);
  const chooseCategory = (id: string) => {
    const next = categories.find((item) => item.id === id);
    setDraft({ ...draft, categoryId: next?.id, category: next?.name ?? "", categorySlug: next?.slug ?? "", subcategoryId: undefined, subcategory: undefined, productTypeId: undefined });
  };
  const chooseSubcategory = (id: string) => {
    const next = category?.children.find((item) => item.id === id);
    setDraft({ ...draft, subcategoryId: next?.id, subcategory: next?.name, productTypeId: undefined });
  };
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {loadError && <div className="sm:col-span-2"><WorkspaceFeedback variant="error" message={loadError} /></div>}
    <label className="text-xs font-black text-[#344054]">Category<select aria-label="Canonical category" value={category?.id ?? ""} disabled={!canEdit || !categories.length} onChange={(event) => chooseCategory(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] bg-white px-3 text-sm disabled:bg-[#F2F4F7]"><option value="">Choose category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="text-xs font-black text-[#344054]">Subcategory<select aria-label="Canonical subcategory" value={subcategory?.id ?? ""} disabled={!canEdit || !category} onChange={(event) => chooseSubcategory(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] bg-white px-3 text-sm disabled:bg-[#F2F4F7]"><option value="">Choose subcategory</option>{category?.children.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="text-xs font-black text-[#344054] sm:col-span-2">Product type<select aria-label="Canonical Product type" value={productType?.id ?? ""} disabled={!canEdit || !subcategory} onChange={(event) => setDraft({ ...draft, productTypeId: event.target.value || undefined })} className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] bg-white px-3 text-sm disabled:bg-[#F2F4F7]"><option value="">Choose Product type</option>{subcategory?.productTypes?.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <p className="text-xs font-semibold text-[#667085] sm:col-span-2">Canonical IDs remain stable when staff rename taxonomy labels. Archived nodes cannot be selected for new Product configuration.</p>
    <div className="flex flex-wrap gap-2 sm:col-span-2">{canEdit && <button type="button" onClick={saveDraft} disabled={!hasUnsavedChanges || Boolean(busy)} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Save taxonomy</button>}{hasStaffPermission(session, "taxonomy.manage") && <Link to="/admin/taxonomy" className="rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black">Manage taxonomy</Link>}</div>
  </div>;
}

function SourceSuggestionReview({ suggestion, draft, ignored, acceptField, acceptSpec, ignore, onUseImage }: { suggestion: SupplierEnrichment; draft: PublicationSnapshot; ignored: string[]; acceptField: (field: "title" | "shortDescription" | "longDescription" | "seoTitle" | "seoDescription") => void; acceptSpec: (specification: SupplierEnrichment["specifications"][number]) => void; ignore: (key: string) => void; onUseImage: (url?: string) => void }) {
  const fields = (["title", "shortDescription", "longDescription", "seoTitle", "seoDescription"] as const).map((key) => ({ key, label: key === "title" ? "Public title" : key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), value: suggestion[key] })).filter((item) => item.value && !ignored.includes(item.key));
  const specifications = suggestion.specifications.filter((item) => !ignored.includes(`spec:${item.name}`));
  if (!fields.length && !specifications.length && !suggestion.imageCandidates.length) return null;
  return <details className="rounded-md border border-[#A6D8CC] bg-[#F2F9F7] p-4"><summary className="cursor-pointer text-sm font-black">Review source-backed suggestions</summary><p className="mt-2 text-xs font-semibold text-[#667085]">Accept, edit after applying, or ignore each suggestion. Nothing is published automatically.</p>{fields.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map((item) => <article key={item.key} className="rounded-md border bg-white p-3"><p className="text-xs font-black">{item.label}</p><p className="mt-2 line-clamp-4 text-sm leading-6 text-[#344054]">{item.value}</p><p className="mt-2 text-[11px] font-semibold text-[#667085]">{suggestion.evidence[item.key]?.supplier} · {suggestion.evidence[item.key]?.sourceField}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => acceptField(item.key)} className="rounded-md bg-[var(--tek-accent)] px-3 py-1.5 text-xs font-black">Accept</button><button type="button" onClick={() => ignore(item.key)} className="rounded-md border px-3 py-1.5 text-xs font-black">Ignore</button></div></article>)}</div>}{specifications.length > 0 && <div className="mt-4"><h5 className="text-xs font-black uppercase text-[#344054]">Suggested specifications</h5><div className="mt-2 grid gap-2 sm:grid-cols-2">{specifications.map((item) => { const exists = draft.specifications.some((current) => current.name.trim().toLowerCase() === item.name.trim().toLowerCase()); return <article key={item.name} className="rounded-md border bg-white p-3"><p className="text-xs font-black">{item.name}</p><p className="mt-1 text-sm font-semibold">{item.value}</p><div className="mt-2 flex gap-2"><button type="button" disabled={exists} onClick={() => acceptSpec(item)} className="rounded-md bg-[var(--tek-accent)] px-2.5 py-1.5 text-xs font-black disabled:opacity-50">{exists ? "Already present" : "Accept"}</button><button type="button" onClick={() => ignore(`spec:${item.name}`)} className="rounded-md border px-2.5 py-1.5 text-xs font-black">Ignore</button></div></article>; })}</div></div>}{suggestion.imageCandidates.length > 0 && <div className="mt-4"><h5 className="text-xs font-black uppercase text-[#344054]">Image candidates</h5><p className="mt-1 text-[11px] font-semibold text-[#667085]">Selecting a candidate only prepares it for controlled TekCentral ingestion in Media.</p><div className="mt-2 flex gap-3 overflow-x-auto pb-1">{suggestion.imageCandidates.map((item) => <button type="button" key={item.url} onClick={() => onUseImage(item.url)} className="w-28 shrink-0 rounded-md border bg-white p-2 text-left"><img src={item.url} alt="Source image candidate" className="h-20 w-full object-contain" /><span className="mt-2 block text-xs font-black">Use as source</span></button>)}</div></div>}</details>;
}
