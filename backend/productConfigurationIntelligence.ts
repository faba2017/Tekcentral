import type { PricingProposal } from "./pricingProposalRepository.js";
import type { SupplierMediaCandidate, SupplierProductEnrichmentSuggestion } from "./supplierProductEnrichment.js";

export type ProductIntelligenceArea = "CONTENT" | "MEDIA" | "LOGISTICS" | "PRICING";
export type ProductIntelligenceConfidence = "VERIFIED" | "STRONG" | "PARTIAL" | "STALE" | "MISSING" | "CONFLICT";
export type ProductRecommendationStatus = "NEW" | "REVIEWED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "RESOLVED";
export interface ProductRecommendation<T = unknown> {
  id: string;
  area: ProductIntelligenceArea;
  type: string;
  title: string;
  reason: string;
  confidence: ProductIntelligenceConfidence;
  evidence: string[];
  provenance: string[];
  sourceTimestamp?: string;
  freshness?: "FRESH" | "STALE" | "UNKNOWN";
  reviewStatus: ProductRecommendationStatus;
  recommendedValue?: T;
  actionId?: string;
}

const normalizedSpec = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function contentIntelligence(enrichment: SupplierProductEnrichmentSuggestion, current: { name: string; shortDescription: string; description?: string; specifications: Array<{ name: string; value: string; origin?: string }> }) {
  const recommendations: ProductRecommendation[] = [];
  const fields = [["title", "Public title", enrichment.title, current.name], ["shortDescription", "Short description", enrichment.shortDescription, current.shortDescription], ["longDescription", "Long description", enrichment.longDescription, current.description]] as const;
  for (const [type, title, suggested, existing] of fields) if (suggested?.trim() && suggested.trim() !== existing?.trim()) { const source = enrichment.evidence[type]; recommendations.push({ id:`content:${type}`,area:"CONTENT",type,title:`Suggested ${title.toLowerCase()}`,reason:"Supplier evidence contains a normalized value that differs from the current draft.",confidence:source?.freshness === "STALE" ? "STALE" : "STRONG",evidence:[source?.sourceField ?? "supplier source field"],provenance:[source?.supplier ?? "supplier evidence"],sourceTimestamp:source?.retrievedAt,freshness:source?.freshness ?? "FRESH",reviewStatus:"NEW",recommendedValue:suggested,actionId:"ACCEPT_CONTENT_RECOMMENDATION" }); }
  const existing = new Map(current.specifications.map((item) => [normalizedSpec(item.name), normalizedSpec(item.value)]));
  for (const spec of enrichment.specifications) {
    const key=normalizedSpec(spec.name), value=normalizedSpec(spec.value);
    if (!key || !value || existing.get(key)===value) continue;
    recommendations.push({id:`content:spec:${key}`,area:"CONTENT",type:"SPECIFICATION",title:`Suggested specification: ${spec.name}`,reason:existing.has(key)?"Source evidence conflicts with the current specification and requires review.":"Structured supplier evidence contains this explicit specification.",confidence:existing.has(key)?"CONFLICT":spec.evidence.freshness === "STALE"?"STALE":"STRONG",evidence:[`${spec.name}: ${spec.value}`,spec.evidence.sourceField],provenance:[spec.evidence.supplier],sourceTimestamp:spec.evidence.retrievedAt,freshness:spec.evidence.freshness ?? "FRESH",reviewStatus:"NEW",recommendedValue:{name:spec.name,value:spec.value},actionId:"ACCEPT_SPECIFICATION"});
  }
  return recommendations;
}

const safeMediaUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==="https:"&&/\.(?:jpe?g|png|webp|gif)(?:$|[?#])/i.test(url.href);}catch{return false;}};
export function mediaIntelligence(candidates: SupplierMediaCandidate[], controlledUrls: string[] = []) {
  const seen=new Set<string>();
  const ranked=candidates.map((candidate)=>{
    const normalized=candidate.url?.trim().toLowerCase() ?? `private:${candidate.id}`;
    const duplicate=seen.has(normalized)||Boolean(candidate.url && controlledUrls.includes(candidate.url))||candidate.status==="DUPLICATE"; seen.add(normalized);
    const privateCandidate=candidate.sourceType==="PRIVATE_SUPPLIER_EVIDENCE"&&Boolean(candidate.privateEvidence);
    const broken=candidate.status==="INVALID"||(!privateCandidate&&(!candidate.url||!safeMediaUrl(candidate.url)));
    const recommendedPrimary=!broken&&!duplicate&&candidate.association==="EXACT_VARIANT"&&candidate.reuseEligibility!=="NOT_APPROVED";
    const labels=[recommendedPrimary&&"Recommended primary",candidate.association==="EXACT_VARIANT"&&"Exact variant",candidate.association==="PRODUCT"&&"Product-level only",duplicate&&"Duplicate",broken&&"Broken",candidate.reuseEligibility==="REVIEW_REQUIRED"&&"Review required"].filter((item):item is string=>Boolean(item));
    return {...candidate,intelligence:{confidence:broken?"MISSING" as const:duplicate?"CONFLICT" as const:candidate.association==="EXACT_VARIANT"?"STRONG" as const:"PARTIAL" as const,labels,recommendedPrimary,reason:broken?"The candidate URL or prior validation is invalid.":duplicate?"The same media is already represented in this Product workflow.":candidate.association==="EXACT_VARIANT"?"The supplier associated this image with the exact selected variant.":"The image is associated only with the broader Product and requires staff review."}};
  });
  ranked.sort((a,b)=>Number(b.intelligence.recommendedPrimary)-Number(a.intelligence.recommendedPrimary)||a.candidateOrder-b.candidateOrder);
  return ranked;
}

export function logisticsIntelligence(input:{status?:string;source?:string;observedAt?:string;freshness?:string;weightKnown?:boolean;dimensionsKnown?:boolean;conflicts?:Array<{field:string;sources:string[]}>}){
  const recommendations:ProductRecommendation[]=[]; const conflicts=input.conflicts??[];
  if(conflicts.length) recommendations.push({id:"logistics:conflict",area:"LOGISTICS",type:"CONFLICT",title:"Logistics evidence conflicts",reason:"Eligible evidence sources disagree and require staff review.",confidence:"CONFLICT",evidence:conflicts.map(item=>`${item.field}: ${item.sources.join(" vs ")}`),provenance:[input.source??"multiple sources"],sourceTimestamp:input.observedAt,freshness:input.freshness==="STALE"?"STALE":"UNKNOWN",reviewStatus:"NEW",actionId:"REVIEW_LOGISTICS"});
  if(input.freshness==="STALE") recommendations.push({id:"logistics:stale",area:"LOGISTICS",type:"REFRESH",title:"Refresh stale supplier evidence",reason:"Delivery decisions should use current logistics evidence.",confidence:"STALE",evidence:[input.observedAt??"Observation time unavailable"],provenance:[input.source??"supplier evidence"],sourceTimestamp:input.observedAt,freshness:"STALE",reviewStatus:"NEW",actionId:"REFRESH_SOURCE"});
  if(input.status!=="COMPLETE") recommendations.push({id:"logistics:incomplete",area:"LOGISTICS",type:"COMPLETE_EVIDENCE",title:"Complete logistics evidence",reason:"The current logistics evidence is not complete.",confidence:input.status==="PARTIAL"?"PARTIAL":"MISSING",evidence:[`Status: ${input.status??"MISSING"}`],provenance:[input.source??"not recorded"],sourceTimestamp:input.observedAt,freshness:input.freshness==="STALE"?"STALE":"UNKNOWN",reviewStatus:"NEW",actionId:"COMPLETE_LOGISTICS"});
  if(input.weightKnown===false) recommendations.push({id:"logistics:weight",area:"LOGISTICS",type:"MISSING_WEIGHT",title:"Add verified shipping weight",reason:"No authoritative shipping weight is present in current evidence.",confidence:"MISSING",evidence:["Weight not recorded"],provenance:[input.source??"supplier evidence"],sourceTimestamp:input.observedAt,freshness:input.freshness==="STALE"?"STALE":"UNKNOWN",reviewStatus:"NEW",actionId:"COMPLETE_LOGISTICS"});
  if(input.dimensionsKnown===false) recommendations.push({id:"logistics:dimensions",area:"LOGISTICS",type:"MISSING_DIMENSIONS",title:"Add verified package dimensions",reason:"No authoritative package dimensions are present in current evidence.",confidence:"MISSING",evidence:["Package dimensions not recorded"],provenance:[input.source??"supplier evidence"],sourceTimestamp:input.observedAt,freshness:input.freshness==="STALE"?"STALE":"UNKNOWN",reviewStatus:"NEW",actionId:"COMPLETE_LOGISTICS"});
  return {confidence:conflicts.length?"CONFLICT" as const:input.freshness==="STALE"?"STALE" as const:input.status==="COMPLETE"?"STRONG" as const:input.status==="PARTIAL"?"PARTIAL" as const:"MISSING" as const,recommendations};
}

export function pricingIntelligence(input:{proposals:PricingProposal[];approvedPrice?:number;fxImpact?:{classification:string;currentGrossMarginPercent?:number;recommendedPrice?:number}}){
  const active=input.proposals.find(item=>item.status==="PENDING_APPROVAL")??input.proposals.find(item=>item.status==="APPROVED")??input.proposals[0]; const recommendations:ProductRecommendation[]=[];
  if(!active) recommendations.push({id:"pricing:generate",area:"PRICING",type:"GENERATE",title:"Generate pricing proposal",reason:"No current canonical pricing proposal exists.",confidence:"MISSING",evidence:[],provenance:["canonical pricing engine"],freshness:"UNKNOWN",reviewStatus:"NEW",actionId:"GENERATE_PRICING"});
  else if(active.status==="PENDING_APPROVAL") recommendations.push({id:"pricing:approve",area:"PRICING",type:"APPROVAL",title:"Approve current proposal",reason:"The canonical proposal is awaiting an authorized pricing decision.",confidence:active.warningDetails?.some(item=>item.severity==="BLOCKING")?"CONFLICT":"STRONG",evidence:[...active.warnings,`Gross margin ${active.grossMarginPercent?.toFixed(2)??"unknown"}%`],provenance:[active.supplierId,"canonical pricing engine"],sourceTimestamp:active.generatedAt,freshness:"FRESH",reviewStatus:"NEW",actionId:"REVIEW_PRICING"});
  if(input.fxImpact) recommendations.push({id:"pricing:fx-impact",area:"PRICING",type:"FX_MOVEMENT",title:`FX impact requires ${input.fxImpact.classification.toLowerCase()} review`,reason:"Existing CJ FX movement policy classified the current cost movement.",confidence:input.fxImpact.classification==="CRITICAL"?"CONFLICT":"STALE",evidence:[input.fxImpact.currentGrossMarginPercent===undefined?"Current margin unavailable":`Current gross margin ${input.fxImpact.currentGrossMarginPercent.toFixed(2)}%`],provenance:["CJ FX impact service"],freshness:"FRESH",reviewStatus:"NEW",recommendedValue:input.fxImpact.recommendedPrice,actionId:"REVIEW_PRICING"});
  const comparison=input.proposals.filter(item=>!["REJECTED","SUPERSEDED"].includes(item.status)).map(item=>({supplier:item.supplierId,status:item.status,supplierCostExVat:item.costSnapshot.landedCostExVat??item.costSnapshot.supplierCostExVat,currency:item.costSnapshot.currency??"ZAR",generatedAt:item.generatedAt,grossMarginPercent:item.grossMarginPercent,proposalId:item.id}));
  return {active,recommendations,comparison};
}
