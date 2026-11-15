import type { ReactNode } from "react";
import { FiBox } from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";
import { AdminStatusBadge } from "@/components/admin/AdminShell";
import { AdminIdentityCell } from "@/components/admin/AdminTable";
import { productConfigurationHref, type ProductOnboardingReadiness } from "@/lib/product-onboarding";
import type { CanonicalAvailabilitySummary } from "@/lib/admin";

const words = (value: string) => value.replace(/_/g, " ");

export function SupplierProductIdentity({ imageUrl, supplierTitle, brand, canonicalName, canonicalSku, reference }: { imageUrl?: string; supplierTitle: string; brand?: string; canonicalName?: string; canonicalSku?: string; reference?: string }) {
  return <AdminIdentityCell className="max-w-[340px]" imageUrl={imageUrl} imageAlt="" fallback={<FiBox aria-hidden="true" />} primary={supplierTitle} primaryTitle={supplierTitle} secondary={[brand, reference].filter(Boolean).join(" · ")} tertiary={canonicalName ? `TekCentral: ${canonicalName}${canonicalSku ? ` · ${canonicalSku}` : ""}` : undefined} />;
}

export function SupplierMappingStatus({ status = "UNMAPPED" }: { status?: string }) {
  return <AdminStatusBadge label={words(status)} status={status === "VERIFIED" ? "APPROVED" : status === "REJECTED" || status === "INVALID" ? "FAILED" : "PENDING"} />;
}

export function SupplierProductReadiness({ readiness }: { readiness?: ProductOnboardingReadiness }) {
  if (!readiness) return <><AdminStatusBadge label="Mapping required" status="PENDING" /><span className="mt-1 block text-xs text-[#667085]">Canonical readiness starts after mapping.</span></>;
  const label = readiness.publicationState === "PUBLISHED" ? "Published" : readiness.publicationEligible ? "Ready for publish review" : `${readiness.completedStepCount} of ${readiness.totalApplicableStepCount}`;
  return <><AdminStatusBadge label={label} status={readiness.publicationEligible || readiness.alreadyPublished ? "APPROVED" : "PENDING"} />{readiness.blockers.length > 0 && <span className="mt-1 block text-xs text-[#667085]">{readiness.blockers.length} blocker{readiness.blockers.length === 1 ? "" : "s"}</span>}</>;
}

export function SupplierAvailability({ supplierLabel, supplierQuantity, observedAt, canonical }: { supplierLabel: string; supplierQuantity?: number; observedAt?: string; canonical?: CanonicalAvailabilitySummary }) {
  return <div className="min-w-36 text-xs"><p className="font-black">Supplier: {supplierQuantity ?? supplierLabel}</p>{observedAt && <p className="mt-1 text-[#667085]">Observed {new Date(observedAt).toLocaleDateString("en-ZA")}</p>}<p className={`mt-1 font-black ${canonical?.freshness === "STALE" ? "text-[#B54708]" : "text-[#176B5C]"}`}>TekCentral: {canonical ? words(canonical.state) : "Mapping required"}</p>{canonical && <p className="mt-1 text-[#667085]">Evidence: {words(canonical.freshness)}</p>}</div>;
}

export function SupplierCommercialEvidence({ cost, currency, label = "Supplier cost", secondary }: { cost?: number; currency?: string; label?: string; secondary?: ReactNode }) {
  return <div className="min-w-32 text-xs"><p className="font-black">{cost === undefined ? "Restricted or unavailable" : `${currency ?? ""} ${cost.toFixed(2)}`.trim()}</p><p className="mt-1 text-[#667085]">{label}</p>{secondary && <div className="mt-1 text-[#667085]">{secondary}</div>}</div>;
}

export function SupplierProductNextAction({ readiness, productId, storefrontSlug, unmappedLabel = "Review & map", onUnmapped }: { readiness?: ProductOnboardingReadiness; productId?: string; storefrontSlug?: string; unmappedLabel?: string; onUnmapped?: () => void }) {
  const location = useLocation();
  const className = "inline-flex rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black text-[var(--tek-accent-ink)]";
  if (!readiness || !productId) return <button type="button" onClick={onUnmapped} className={className}>{unmappedLabel}</button>;
  if (readiness.nextAction.id === "VIEW_STOREFRONT" && storefrontSlug) return <Link to={`/product/${storefrontSlug}`} className={className}>View storefront</Link>;
  return <Link to={productConfigurationHref(location.pathname, location.search, productId, readiness.nextAction.step)} className={className}>{readiness.nextAction.label}</Link>;
}
