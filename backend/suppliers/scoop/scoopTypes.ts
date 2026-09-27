export type ScoopStockAvailability = "AVAILABLE" | "OUT_OF_STOCK" | "UNKNOWN" | "STALE";
export type ScoopProductPageResolutionStatus = "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS" | "ERROR";
export type ScoopLogisticsStatus = "COMPLETE" | "WEIGHT_ONLY" | "DIMENSIONS_ONLY" | "MISSING" | "INVALID";
export type ScoopLogisticsSource = "SUPPLIER_FEED" | "SUPPLIER_PRODUCT_PAGE" | "MANUFACTURER" | "ADMIN_IMPORT" | "ADMIN" | "UNKNOWN";
export type ScoopLogisticsFailureReason = "IDENTITY_NOT_RESOLVED" | "LOW_IDENTITY_CONFIDENCE" | "MANUFACTURER_PROVIDER_NOT_AVAILABLE" | "AUTHORITATIVE_SOURCE_NOT_FOUND" | "SOURCE_BLOCKED" | "SOURCE_TEMPORARILY_UNAVAILABLE" | "RATE_LIMITED" | "WEIGHT_NOT_FOUND" | "DIMENSIONS_NOT_FOUND" | "PARTIAL_DATA" | "INVALID_SOURCE_DATA" | "NETWORK_ERROR" | "PARSER_ERROR" | "CACHE_ERROR";
export type ScoopLaunchAssortmentState = "NOT_SELECTED" | "CANDIDATE" | "SELECTED_FOR_LAUNCH";
export type ScoopCatalogueSourceType = "XML_FEED" | "WEBSITE" | "ADMIN_IMPORT";
export type ScoopReconciliationStatus = "XML_ONLY" | "WEBSITE_ONLY" | "BOTH" | "SOURCE_MISMATCH" | "STALE";

export interface ScoopSourceObservation {
  sourceType: ScoopCatalogueSourceType;
  sourceReference?: string;
  importBatchId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSuccessfulRefreshAt: string;
  active: boolean;
  staleAt?: string;
  fields: Record<string, string>;
}

export interface ScoopReconciliationEvent {
  id: string;
  type: "SOURCE_ADDED" | "SOURCE_REFRESHED" | "SOURCE_STALE" | "STATUS_CHANGED" | "CONFLICT_DETECTED";
  sourceType?: ScoopCatalogueSourceType;
  fromStatus?: ScoopReconciliationStatus;
  toStatus?: ScoopReconciliationStatus;
  timestamp: string;
  detail?: string;
}

export interface ScoopLaunchAssortment {
  state: ScoopLaunchAssortmentState;
  suggested: boolean;
  suggestionReasons: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface ScoopLogisticsMetadata {
  status: ScoopLogisticsStatus;
  source: ScoopLogisticsSource;
  sourceReference?: string;
  capturedAt: string;
  updatedAt: string;
  fetchedAt: string;
  productPageUrl?: string;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  packageWeightGrams?: number;
  packageLengthMm?: number;
  packageWidthMm?: number;
  packageHeightMm?: number;
  manufacturer?: string;
  model?: string;
  supplierSku?: string;
  identityConfidence?: "HIGH" | "MEDIUM" | "LOW";
  sourceConfidence?: "HIGH" | "MEDIUM" | "LOW";
  shippingBasis?: "PACKAGE" | "PRODUCT_DIMENSIONS_FALLBACK";
  notes?: string;
  actualWeightKg?: number;
  volumeM3?: number;
  rawWeight?: string;
  rawDimensions?: string;
}

export interface ScoopProductPageResolution {
  status: ScoopProductPageResolutionStatus;
  productPageUrl?: string;
  resolvedAt: string;
  error?: string;
}

export interface ScoopCatalogueProduct {
  supplierId: "SCOOP";
  supplierSku: string;
  description: string;
  manufacturer?: string;
  imageUrl?: string;
  branchStock: {
    CPT?: number;
    JHB?: number;
    DBN?: number;
  };
  totalStock?: number;
  availability: ScoopStockAvailability;
  dealerPriceExVat?: number;
  dealerVatAmount?: number;
  dealerPriceInclVat?: number;
  retailPriceInclVat?: number;
  currency: "ZAR";
  vatRate: number;
  priceSemantics: {
    dealerPrice: "EXCLUDING_VAT";
    retailPrice: "INCLUDING_VAT";
  };
  mappingStatus: "SUGGESTED" | "VERIFIED" | "REJECTED" | "STALE" | "UNMAPPED";
  sourceMetadata: {
    feedUrl: string;
    xmlRootTag?: string;
    xmlItemTag?: string;
    sourceFields: Record<string, string>;
  };
  sourceObservations: ScoopSourceObservation[];
  reconciliationStatus: ScoopReconciliationStatus;
  reconciliationConflict?: { detectedAt: string; reasons: string[] };
  reconciliationHistory?: ScoopReconciliationEvent[];
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
  sourceFeedTimestamp?: string;
  staleAt?: string;
  productPageResolution?: ScoopProductPageResolution;
  logisticsMetadata?: ScoopLogisticsMetadata;
  logisticsSources?: ScoopLogisticsMetadata[];
  logisticsLastAttemptAt?: string;
  logisticsLastError?: string;
  logisticsLastFailure?: ScoopLogisticsFailureReason;
  launchAssortment?: ScoopLaunchAssortment;
}

export interface ScoopLogisticsAuditEntry {
  id: string;
  supplierSku: string;
  changedFields: string[];
  previousValue?: ScoopLogisticsMetadata;
  newValue?: ScoopLogisticsMetadata;
  timestamp: string;
  actor: string;
}

export interface ScoopFeedParseResult {
  products: Omit<ScoopCatalogueProduct, "createdAt" | "updatedAt" | "mappingStatus">[];
  xmlRootTag?: string;
  xmlItemTag?: string;
  sourceFeedTimestamp?: string;
}

export interface ScoopCatalogueSyncSummary {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  failed: number;
  lastSyncedAt: string;
  xmlRootTag?: string;
  xmlItemTag?: string;
  error?: string;
  xmlObserved?: number;
  matchedWebsiteOnly?: number;
  newXmlOnly?: number;
  upgradedToBoth?: number;
  staleXmlObservations?: number;
}

export interface ScoopWebsiteImportRow {
  sku: string;
  title: string;
  manufacturer?: string;
  productUrl?: string;
  imageUrl?: string;
  category?: string;
  supplierCode?: string;
}

export interface ScoopWebsiteImportPreviewRow extends ScoopWebsiteImportRow {
  rowNumber: number;
  status: "VALID" | "REJECTED";
  errors: string[];
}

export interface ScoopWebsiteImportSummary {
  discovered: number;
  newWebsiteOnly: number;
  mergedWithXml: number;
  unchanged: number;
  conflicts: number;
  rejected: number;
  batchId: string;
  importedAt: string;
}

export interface ScoopLogisticsEnrichmentSummary {
  requested: number;
  processed: number;
  complete: number;
  partial: number;
  missing: number;
  failed: number;
  cached: number;
  lastEnrichmentAt: string;
  bySource?: Record<string, number>;
  failureReasons?: Record<string, number>;
  manufacturerCoverage?: Record<string, { total: number; complete: number }>;
}
