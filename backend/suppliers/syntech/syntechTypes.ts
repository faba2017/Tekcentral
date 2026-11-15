export type SyntechSyncType = "FULL" | "UPDATE" | "TEST";
export type SyntechSyncStatus = "SUCCESS" | "FAILED" | "INVALID" | "RATE_LIMITED" | "BLOCKED" | "SKIPPED";
export interface SyntechAttribute { key: string; value: string; }
export interface SyntechCatalogueProduct {
  supplierId: "SYNTECH"; supplierSku: string; name?: string;
  normalDealerCostExVat?: number; rrpInclVat?: number; recommendedMargin?: number;
  promoPriceExVat?: number; promoStarts?: string; promoEnds?: string;
  effectiveDealerCostExVat?: number; promotionActive: boolean; currency: string;
  branchStock: { CPT?: number; JHB?: number; DBN?: number }; totalStock?: number;
  nextShipmentEta?: string; productUrl?: string; description?: string; shortDescription?: string;
  weight?: number; dimensions?: { length?: number; width?: number; height?: number };
  featuredImage?: string; additionalImages: string[]; sourceCategories: string[]; sourceCategoryTrees: string[];
  attributes: SyntechAttribute[]; brand?: string; modelNumber?: string; manufacturerPartNumber?: string;
  lastModified?: string; observedAt: string; sourceFingerprint: string;
  observedFields?: string[];
  sourcePresence: "ACTIVE" | "SOURCE_MISSING"; sourceMissingAt?: string; taxonomyMappingStatus: "MAPPED" | "REVIEW_REQUIRED" | "UNMAPPED";
}
export interface SyntechFeedParseResult { type: SyntechSyncType; expectedCount: number; parsedCount: number; currency: string; products: SyntechCatalogueProduct[]; observedAt: string; }
export interface SyntechSyncRun { id: string; syncType: SyntechSyncType; startedAt: string; completedAt: string; status: SyntechSyncStatus; httpStatus?: number; expectedCount?: number; parsedCount?: number; failureStage?: string; failureRowIndex?: number; duplicateCount?: number; observedFields?: string[]; createdCount: number; updatedCount: number; missingCount: number; durationMs: number; warningCount: number; errorSummary?: string; rateLimitState?: string; }
export interface SyntechRequestBudget { hourKey: string; requests: number; rateLimitedUntil?: string; accountBlockedAt?: string; }
