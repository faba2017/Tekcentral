import type {
  AttentionReason,
  AdminActivityEntry,
  Order,
  OrderStatus,
  RefundStatus,
  ReturnStatus,
  SupplierAllocationStatus,
  SupplierCatalogueProduct,
  SupplierCode,
  SupplierProductMapping,
  SupplierOrder,
} from "@/types/order";

export interface AdminOrderResponse {
  order: Order;
  activity: AdminActivityEntry[];
  attentionReasons: AttentionReason[];
  commercialDocuments?: {
    invoice?: {
      invoiceNumber: string;
      status: string;
      issuedAt: string;
      total: number;
      currency: Order["currency"];
      documentStatus: "READY" | "MISSING" | "FAILED";
      documentFailureCode?: string;
      downloadAvailable: boolean;
      deliveries: {
        deliveryId: string;
        status: "PENDING" | "SENDING" | "SENT" | "FAILED";
        recipient: string;
        attempts: number;
        lastDeliveryAt?: string;
        safeFailureCode?: string;
        originType: "SYSTEM" | "STAFF_USER";
        actorLabel?: string;
        createdAt: string;
        history: {
          attemptNumber: number;
          outcome: "SENT" | "FAILED";
          completedAt: string;
          safeFailureCode?: string;
        }[];
      }[];
    };
  };
}

export interface AdminOrdersResponse {
  orders: Order[];
  attention: { orderNumber: string; reasons: AttentionReason[] }[];
  paidOrderAlerts?: {
    orderNumber: string;
    total: number;
    currency: Order["currency"];
    paidAt?: string;
  }[];
}

export interface AdminSupplierOrdersResponse {
  supplierOrders: SupplierOrder[];
  attention: { supplierOrderId: string; reasons: AttentionReason[] }[];
}

export interface AdminSupplierOrderResponse {
  supplierOrder: SupplierOrder;
  tekcentralStock?: { offerId: string; supplierSku: string; onHand: number; reserved: number; available: number; sourceCostExVat: number; stockObservedAt: string; costObservedAt: string; active: boolean }[];
  supplierConfiguration?: {
    manualProcurementUrl?: string;
    operationalChannel?: string;
    capabilities?: { realOrderSubmit?: boolean };
    apiProcurement?: { effectiveEnabled: boolean; operational: { enabled: boolean }; deployment: { enabled: boolean; environment: string } };
  };
  operationsNotification?: {
    notificationId: string;
    notificationType: "SCOOP_ACTION_REQUIRED";
    supplierOrderId: string;
    customerOrderId: string;
    recipient: string;
    status: "PENDING" | "SENDING" | "SENT" | "FAILED";
    createdAt: string;
    attemptedAt?: string;
    sentAt?: string;
    failedAt?: string;
    failureReason?: string;
    retryCount: number;
    idempotencyKey: string;
  };
  attentionReasons: AttentionReason[];
  customerOrder?: Order;
  payloadPreview?: unknown;
}

export interface CjOrderPreflight {
  supplierOrderId: string;
  status: "BLOCKED" | "READY";
  featureEnabled: boolean;
  checkedAt: string;
  customerShipping?: {
    customerName: string;
    phone: string;
    country: string;
    countryCode: string;
    province: string;
    city: string;
    address: string;
    address2?: string;
    postalCode: string;
  };
  lines: {
    orderItemId: string;
    tekcentralProduct: string;
    quantity: number;
    cjProductId: string;
    cjProductSku: string;
    cjVariantId: string;
    cjVariantSku: string;
    cjProductName?: string;
    unitPrice?: number;
    currency?: string;
  }[];
  logisticsOptions: {
    id?: string;
    logisticName: string;
    fromCountryCode: string;
    destCountryCode: string;
    shippingCost?: number;
    currency: string;
    estimatedDelivery?: string;
    fetchedAt: string;
  }[];
  selectedLogistics?: CjOrderPreflight["logisticsOptions"][number];
  selectionReason?: string;
  selectionMode?: "AUTO" | "STAFF";
  supplierProductAmount?: number;
  supplierShippingAmount?: number;
  supplierTotalAmount?: number;
  currency?: string;
  warnings: string[];
  blockers: string[];
  diagnostics?: {
    destinationCountryCode?: string;
    postalCodePresent?: boolean;
    itemCount?: number;
    variants?: { vid: string; quantity: number; weight?: number; productProp?: string }[];
    sourceCountries?: string[];
    requestBody?: unknown;
    responseCode?: number;
    responseMessage?: string;
    responseShape?: string;
    requestId?: string;
    unavailableReasons?: string[];
  };
  recipientRequirements?: {
    phone: "REQUIRED" | "OPTIONAL";
    consigneeId: "REQUIRED" | "OPTIONAL" | "UNKNOWN";
  };
  recipientValidation?: {
    phone: {
      status: "READY" | "NEEDS_CORRECTION";
      normalizedValue?: string;
      message?: string;
    };
    consigneeId: {
      status: "READY" | "NEEDS_CORRECTION" | "NOT_REQUIRED" | "UNKNOWN";
      normalizedValue?: string;
      maskedValue?: string;
      message?: string;
    };
  };
  payloadPreview?: unknown;
  requestFingerprint?: string;
}

export interface SyntechOrderPreflight {
  supplierOrderId: string;
  status: "BLOCKED" | "READY_FOR_CONTROLLED_UAT";
  checkedAt: string;
  environment: "UAT";
  featureEnabled: boolean;
  configurationReady: boolean;
  externalReference: string;
  shipping: { type: "DELIVERY" } | { type: "COLLECTION"; location: "cpt" | "jhb" };
  backorder: "no";
  lines: { productId: string; description: string; supplierSku: string; quantity: number; unitCostZar: number; branchStock: { CPT?: number; JHB?: number; DBN?: number }; totalStock?: number; promotionActive: boolean; promotionChanged: boolean; observedAt: string }[];
  estimatedProductCostZar: number;
  warnings: string[];
  blockers: string[];
  submissionBlockers: string[];
  maintenanceWindow: boolean;
}

export interface CjVariantDeliveryCheck {
  supplierVariantId: string;
  destinationCountryCode: "ZA";
  quantity: 1;
  status:
    | "AVAILABLE"
    | "NO_ROUTE"
    | "SOURCE_UNRESOLVED"
    | "STOCK_UNAVAILABLE"
    | "DATA_INCOMPLETE"
    | "VARIANT_INVALID"
    | "RATE_LIMITED"
    | "TEMPORARY_ERROR"
    | "API_REJECTED";
  checkedAt: string;
  cached?: boolean;
  retryAfterSeconds?: number;
  message: string;
  sourceCountries: string[];
  diagnosticReasons?: string[];
  logisticsOptions: {
    id?: string;
    logisticName: string;
    fromCountryCode: string;
    destCountryCode: string;
    shippingCost?: number;
    currency: string;
    estimatedDelivery?: string;
    fetchedAt: string;
  }[];
}

export interface CjConnectionStatus {
  supplier: "CJ";
  configured: boolean;
  authenticated: boolean;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  lastSuccessfulRequestAt?: string;
  lastError?: string | null;
  importedProductsCount: number;
  verifiedMappingsCount: number;
  suggestedMappingsCount: number;
  staleMappingsCount: number;
}

export interface CanonicalAvailabilitySummary {
  state: string;
  freshness: string;
  quantity?: number;
  reason?: string;
}

export interface CjLaunchReadinessRow {
  product: SupplierCatalogueProduct;
  variant: SupplierCatalogueProduct["variants"][number];
  mapping?: SupplierProductMapping;
  canonicalProduct?: { id: string; name: string; sku: string };
  onboarding?: import("@/lib/product-onboarding").ProductOnboardingReadiness;
  canonicalAvailability?: CanonicalAvailabilitySummary;
  readiness: { status: "NOT_READY" | "READY_FOR_PUBLISH_REVIEW"; blockers: string[]; nextAction: string };
  evidence: {
    status: "BLOCKED" | "READY_FOR_PRICING";
    identityStatus: "IDENTITY_VERIFIED" | "IDENTITY_REVIEW_REQUIRED";
    variantStatus: "VARIANT_VERIFIED" | "VARIANT_REVIEW_REQUIRED" | "VARIANT_AMBIGUOUS";
    currency: string | null;
    currencySource: "API_FIELD" | "CJ_API_CONTRACT" | "ACCOUNT_CONFIGURATION" | "CJ_DOCUMENTED_DEFAULT" | "ADMIN_CONFIRMED" | "UNKNOWN";
    costStatus: "AUTHORITATIVE" | "MISSING";
    authoritativeCost?: number;
    costSourceField?: string;
    normalizedCostZar?: number;
    fxStatus: "NOT_EVALUATED" | "NOT_REQUIRED" | "CONFIGURED" | "REQUIRED" | "STALE";
    logistics: { status: "COMPLETE" | "PARTIAL" | "MISSING"; weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number };
    blockers: string[];
    nextAction: string;
    demoProductWarning: boolean;
  };
  proposal?: PricingProposal;
  publication: { state: "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED"; versionCount: number; slug?: string };
}

export interface CjLaunchReadinessResponse {
  rows: CjLaunchReadinessRow[];
  metrics: { importedProducts: number; importedOffers: number; candidates: number; selected: number; verified: number; logisticsComplete: number; pricingPending: number; pricingApproved: number; readyForPublishReview: number; published: number };
}

export interface CjProductSearchResponse {
  requestId?: string;
  products: SupplierCatalogueProduct[];
  suggestions?: SupplierCatalogueProduct[];
  rawResultsCount?: number;
  categoryResolvedCount?: number;
  technologyAllowedCount?: number;
  invalidResultsCount?: number;
  exactLookup?: {
    used: boolean;
    identifier: string;
    identifierType?: "PRODUCT_ID" | "PRODUCT_SKU" | "VID" | "VARIANT_SKU";
    status: "MATCH" | "NOT_FOUND" | "OUTSIDE_SCOPE";
    message: string;
    selectedVariantId?: string;
  };
}

export interface CjCategoryNode {
  categoryId?: string;
  name: string;
  level: 1 | 2 | 3;
  children: CjCategoryNode[];
}

export interface CjCategoriesResponse {
  requestId?: string;
  categories: CjCategoryNode[];
  mode?: "technology" | "all";
  groups?: {
    name: string;
    tekcentralCategory: string;
    categories: {
      group: string;
      tekcentralCategory: string;
      categoryId: string;
      categoryName: string;
      categoryPath: string;
      enabled: boolean;
    }[];
  }[];
}

export interface SupplierMappingsResponse {
  mappings: SupplierProductMapping[];
}

export type ScoopStockAvailability = "AVAILABLE" | "OUT_OF_STOCK" | "UNKNOWN" | "STALE";

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
  mappingStatus: "SUGGESTED" | "VERIFIED" | "REJECTED" | "STALE" | "UNMAPPED";
  sourceObservations: { sourceType: "XML_FEED" | "WEBSITE" | "ADMIN_IMPORT"; sourceReference?: string; importBatchId?: string; firstSeenAt: string; lastSeenAt: string; lastSuccessfulRefreshAt: string; active: boolean; staleAt?: string; fields: Record<string, string> }[];
  reconciliationStatus: "XML_ONLY" | "WEBSITE_ONLY" | "BOTH" | "SOURCE_MISMATCH" | "STALE";
  reconciliationConflict?: { detectedAt: string; reasons: string[] };
  lastSyncedAt: string;
  staleAt?: string;
  pricing: SupplierPricingPreparation;
  productPageResolution?: { status: "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS" | "ERROR"; productPageUrl?: string; resolvedAt: string; error?: string; urlStatus?: "VERIFIED" | "REVIEW_REQUIRED" | "UNKNOWN" | "CONFLICT"; urlSource?: "PREVIOUSLY_VERIFIED" | "WEBSITE_OBSERVATION" | "TRUSTED_IMPORT" | "STAFF_PROVIDED" | "SAFE_DISCOVERY"; urlIdentityConfidence?: "HIGH" | "MEDIUM" | "LOW"; verifiedAt?: string; lastCheckedAt?: string; history?: { url: string; source: string; status: string; observedAt: string }[] };
  logisticsMetadata?: {
    status: "COMPLETE" | "WEIGHT_ONLY" | "DIMENSIONS_ONLY" | "MISSING" | "INVALID";
    source: "SUPPLIER_FEED" | "SUPPLIER_PRODUCT_PAGE" | "MANUFACTURER" | "ADMIN_IMPORT" | "ADMIN" | "UNKNOWN"; sourceReference?: string; capturedAt: string; updatedAt: string; fetchedAt: string; productPageUrl?: string;
    weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number;
    packageWeightGrams?: number; packageLengthMm?: number; packageWidthMm?: number; packageHeightMm?: number;
    manufacturer?: string; model?: string; supplierSku?: string;
    identityConfidence?: "HIGH" | "MEDIUM" | "LOW"; sourceConfidence?: "HIGH" | "MEDIUM" | "LOW";
    shippingBasis?: "PACKAGE" | "PRODUCT_DIMENSIONS_FALLBACK"; measurementScope?: "PRODUCT" | "PACKAGE" | "PRODUCT_AND_PACKAGE"; productSource?: "SUPPLIER_FEED" | "SUPPLIER_PRODUCT_PAGE" | "MANUFACTURER" | "ADMIN_IMPORT" | "ADMIN" | "UNKNOWN"; packageSource?: "SUPPLIER_FEED" | "SUPPLIER_PRODUCT_PAGE" | "MANUFACTURER" | "ADMIN_IMPORT" | "ADMIN" | "UNKNOWN"; extractionConfidence?: "HIGH" | "MEDIUM" | "LOW"; components?: { label: string; weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number; rawWeight?: string; rawDimensions?: string }[]; notes?: string;
    actualWeightKg?: number; volumeM3?: number; rawWeight?: string; rawDimensions?: string;
  };
  logisticsSources?: ScoopCatalogueProduct["logisticsMetadata"][];
  logisticsLastAttemptAt?: string;
  logisticsLastError?: string;
  logisticsLastFailure?: string;
  confirmedHardwareRevision?: { revision: string; sourceReference: string; contentFingerprint: string; confirmedAt: string; confirmedBy: string };
  capturedContentSuggestions?: { contentFingerprint: string; sourceUrl: string; capturedAt: string; specifications: unknown[]; documents: unknown[] };
  launchAssortment?: {
    state: "NOT_SELECTED" | "CANDIDATE" | "SELECTED_FOR_LAUNCH";
    suggested: boolean;
    suggestionReasons: string[];
    updatedAt: string;
    updatedBy: string;
  };
}

export interface ScoopLaunchReadinessRow {
  product: ScoopCatalogueProduct;
  mapping?: SupplierProductMapping;
  proposal?: PricingProposal;
  readiness: {
    status: "NOT_READY" | "READY_FOR_PUBLISH_REVIEW";
    blockers: ("NOT_SELECTED" | "OFFER_UNAVAILABLE" | "AUTHORITATIVE_COMMERCIAL_DATA_MISSING" | "MAPPING_NOT_VERIFIED" | "LOGISTICS_INCOMPLETE" | "PRICING_MISSING" | "PRICING_NOT_APPROVED" | "PRICING_STALE" | "PRICING_BLOCKING_WARNING")[];
    nextAction: string;
  };
  publication: { state: "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED"; activeVersionId?: string; versionCount: number; slug?: string; activePrice?: number; hasUnpublishedChanges?: boolean };
  publicationAction: { primary: string; secondary?: string };
  publicationEligibility?: { canPublish: boolean; blockers: string[]; warnings: string[] };
  onboarding?: import("@/lib/product-onboarding").ProductOnboardingReadiness;
  canonicalAvailability?: CanonicalAvailabilitySummary;
  workflow: { stage: "UNMAPPED" | "MAPPING_REVIEW" | "LOGISTICS_REQUIRED" | "PRICING_REQUIRED" | "READY_FOR_LAUNCH_SELECTION" | "SELECTED_NOT_READY" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED_CLEAN" | "PUBLISHED_CHANGES_PENDING" | "UNPUBLISHED_WITH_HISTORY"; primaryAction: string; completionState: "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "BLOCKED_LOGISTICS" | "BLOCKED_URL_IDENTITY" | "BLOCKED_PRICING" | "BLOCKED_MAPPING" | "DELIBERATELY_EXCLUDED" | "NEEDS_STAFF_REVIEW"; exactBlockers: string[]; completedLaunchChecks: number; totalLaunchChecks: 5; steps: { id: "MAPPING" | "LOGISTICS" | "PRICING" | "LAUNCH_SELECTION" | "PUBLICATION"; label: string; status: string; complete: boolean }[] };
}

export interface ScoopLaunchReadinessResponse {
  rows: ScoopLaunchReadinessRow[];
  workflowRows: ScoopLaunchReadinessRow[];
  guidanceRows: ScoopLaunchReadinessRow[];
  metrics: { totalOffers: number; launchCandidates: number; selectedForLaunch: number; verifiedMappings: number; logisticsComplete: number; approvedPricing: number; readyForPublishReview: number; published: number; blockedLogistics: number; blockedPricing: number; blockedMapping: number; needsStaffReview: number };
}

export type PricingPresentation = { state: "NEEDS_APPROVAL" | "APPROVED_NOT_PUBLISHED" | "LIVE" | "LIVE_PRICE_CHANGE_PENDING" | "HISTORY"; livePrice?: number; approvedNextPrice?: number; slug?: string };

export interface SupplierPricingPreparation {
  currency: string;
  vatRate: number;
  supplierCostExVat?: number;
  supplierVatAmount?: number;
  supplierCostInclVat?: number;
  referenceRetailInclVat?: number;
  retailGrossSpreadVsCostExVat?: number;
  retailGrossSpreadVsCostInclVat?: number;
  proposedSellingPriceInclVat?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  markupPercent?: number;
}

export type PricingRoundingMode = "NONE" | "NEAREST_1" | "NEAREST_5" | "NEAREST_10" | "END_99";
export type ReferencePriceBehavior = "IGNORE" | "WARNING_ONLY" | "SOFT_CEILING";
export interface PricingBand { id: string; minimumCost: number; maximumCost?: number; targetGrossMarginPercent: number; minimumGrossProfit?: number; }
export interface PricingSettings { vatRatePercent: number; pricingBands: PricingBand[]; roundingMode: PricingRoundingMode; referencePriceBehavior: ReferencePriceBehavior; proposedPricesRequireApproval: boolean; autoPublishPrices: boolean; cjManualFxRate?: number; cjFxRateUpdatedAt?: string; cjFxSourceCurrency?: string; cjFxSourceReference?: string; cjFxManualReason?: string; cjFxManualActor?: string; cjFxBufferPercent: number; fxStaleAfterHours: number; fxImpactMonitoringEnabled: boolean; fxImpactMonitoringMode: "MANUAL" | "ASSISTED" | "AUTO_WITH_GUARDRAILS"; fxImpactThresholds: { ignorePercent: number; monitorPercent: number; reviewPercent: number; criticalPercent: number }; fxScheduledReconciliationEnabled: boolean; fxScheduledReconciliationHours: number; }
export interface FxQuote { sourceCurrency: string; targetCurrency: string; rate: number; provider: string; effectiveAt: string; fetchedAt: string; sourceReference: string; }
export interface FxRateResponse { quote?: FxQuote; status: "FRESH" | "STALE" | "MISSING"; freshnessHours: number; reconciliation?: { evaluated: number; generated: number; blocked: number; notifications?: number }; }
export interface FxPricingImpact { id: string; productId: string; productName: string; category?: string; supplierId: string; supplierOfferId: string; sourceCurrency: string; targetCurrency: "ZAR"; sourceCostAmount: number; previousFxRate: number; currentFxRate: number; previousNormalizedCost: number; currentNormalizedCost: number; costDelta: number; costDeltaPercent: number; direction: "INCREASE" | "DECREASE" | "UNCHANGED"; commercialBaseline: "LIVE" | "APPROVED" | "PENDING" | "NONE"; currentRetailPrice?: number; previousGrossMarginPercent?: number; currentGrossMarginPercent?: number; marginPointChange?: number; currentGrossProfit?: number; recommendedPrice?: number; classification: "IGNORE" | "MONITOR" | "REVIEW" | "CRITICAL"; reasons: string[]; evaluatedAt: string; resultingAction: string; proposalId?: string; notificationRequired: boolean; }
export interface FxImpactDashboard { impacts: FxPricingImpact[]; metrics: { healthy: number; monitor: number; review: number; critical: number; pendingProposals: number; notifications: number }; }
export interface FxReconciliationRun { id: string; trigger: "SCHEDULED" | "MANUAL"; startedAt: string; completedAt: string; status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED"; pairsEvaluated: number; ratesRefreshed: number; ratesReused: number; offersEvaluated: number; ignore: number; monitor: number; review: number; critical: number; proposalsGenerated: number; attentionCreated: number; errors: { pair?: string; message: string }[]; }
export interface FxPricingAttention { count: number; productIds: string[]; lastRun?: FxReconciliationRun; running: boolean; }
export interface SettingsAuditEntry { id: string; setting: string; previousValue: unknown; newValue: unknown; timestamp: string; actor: string; }
export interface ShippingSettings {
  shippingEnabled: boolean; quoteValidityMinutes: number; shippingPriceBufferPercent: number;
  minimumShippingCharge: number; maximumShippingCharge?: number;
  allowMixedSupplierCheckout: boolean; requireFreshQuoteBeforePayment: boolean;
  scoopMode: "MANUAL_QUOTE" | "FLAT_RATE" | "ZONE_ESTIMATE" | "CARRIER_QUOTE" | "SUPPLIER_QUOTE" | "CONFIGURED_FLAT" | "CONFIGURED_ZONE";
  scoopFlatCharge?: number;
  scoopZones: { id: string; provinces: string[]; charge: number; estimate?: string }[];
  localRateCard: {
    enabled: boolean; version: number; environment: "PRODUCTION" | "TEST_NOT_PRODUCTION";
    origin: { city: string; province: string; postalCode?: string };
    volumetricDivisorCm3PerKg: number; percentageBuffer: number; fixedBufferRand: number;
    roundingMode: "NONE" | "NEAREST_1" | "NEAREST_5";
    zones: { id: string; label: string; enabled: boolean; postalCodeRanges: { from: number; to: number }[]; provinces: string[]; cities: string[]; baseCharge: number; includedWeightKg: number; additionalRatePerKg: number; minimumCharge: number; maximumCharge?: number; estimatedTransitDaysMin: number; estimatedTransitDaysMax: number }[];
  };
}
export const emptyLocalRateCard: ShippingSettings["localRateCard"] = {
  enabled: false, version: 0, environment: "PRODUCTION", origin: { city: "", province: "" },
  volumetricDivisorCm3PerKg: 5000, percentageBuffer: 0, fixedBufferRand: 0,
  roundingMode: "NEAREST_1", zones: [],
};
export function normalizeAdminShippingSettings(input: Partial<ShippingSettings>): ShippingSettings {
  const card = input.localRateCard;
  return {
    shippingEnabled: input.shippingEnabled ?? true,
    quoteValidityMinutes: input.quoteValidityMinutes ?? 30,
    shippingPriceBufferPercent: input.shippingPriceBufferPercent ?? 0,
    minimumShippingCharge: input.minimumShippingCharge ?? 0,
    maximumShippingCharge: input.maximumShippingCharge,
    allowMixedSupplierCheckout: input.allowMixedSupplierCheckout ?? true,
    requireFreshQuoteBeforePayment: input.requireFreshQuoteBeforePayment ?? true,
    scoopMode: input.scoopMode ?? "MANUAL_QUOTE",
    scoopFlatCharge: input.scoopFlatCharge,
    scoopZones: Array.isArray(input.scoopZones) ? input.scoopZones : [],
    localRateCard: {
      ...emptyLocalRateCard,
      ...card,
      version: Number.isInteger(card?.version) && (card?.version ?? -1) >= 0 ? card!.version : 0,
      origin: { ...emptyLocalRateCard.origin, ...card?.origin },
      zones: Array.isArray(card?.zones) ? card.zones : [],
    },
  };
}
export interface PricingScenario { suggestedPriceInclVat: number; suggestedPriceExVat: number; grossProfitExVat: number; grossMarginPercent: number; markupPercent: number; minimumProfitPasses: boolean; targetMarginPasses: boolean; referenceRetailDelta: number; }
export interface ManualPricingPreview { proposedSellingPriceInclVat: number; proposedSellingPriceExVat: number; vatAmount: number; supplierCostExVat: number; grossProfit: number; grossMarginPercent: number; markupPercent: number; targetMarginPercent: number; minimumGrossProfit: number; minimumProfitPasses: boolean; targetMarginPasses: boolean; referenceRetailInclVat?: number; referenceRetailDelta?: number; automatedTargetDelta: number; warnings: string[]; warningDetails: { code: string; severity: "INFO" | "WARNING" | "BLOCKING"; message: string }[]; }
export interface PricingProposal { id: string; productId: string; supplierId: string; supplierOfferId: string; proposalKind?: "AUTOMATED" | "MANUAL_OVERRIDE"; status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPERSEDED"; costSnapshot: { currency: string; supplierCostExVat?: number; landedCostExVat?: number; sourceCostAmount?: number; sourceCurrency?: string; fxRateUsed?: number; fxProvider?: string }; proposedSellingPriceExVat?: number; vatAmount?: number; proposedSellingPriceInclVat?: number; grossProfit?: number; grossMarginPercent?: number; markupPercent?: number; referenceRetailInclVat?: number; appliedPricingBand?: PricingBand; vatRatePercent: number; warnings: string[]; warningDetails?: { code: string; severity: "INFO" | "WARNING" | "BLOCKING"; message: string }[]; targetMarginProposal?: PricingScenario; competitiveSuggestion?: PricingScenario & { viability: "VIABLE_BELOW_TARGET_MARGIN" | "NOT_COMMERCIALLY_VIABLE" }; manualOverride?: { override: true; priceInclVat: number; reason: string; reasonCategory?: string; actor: string; timestamp: string; originalProposalId: string; grossProfitExVat: number; grossMarginPercent: number; markupPercent: number }; approvedAt?: string; approvedBy?: string; rejectedAt?: string; rejectedBy?: string; supersededByProposalId?: string; supersededAt?: string; generatedAt: string; }

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
  xmlObserved?: number; matchedWebsiteOnly?: number; newXmlOnly?: number; upgradedToBoth?: number; staleXmlObservations?: number;
}

export interface ScoopCatalogueStatus {
  supplier: "SCOOP";
  productCount: number;
  availableCount: number;
  staleCount: number;
  reconciliation: { xmlBacked: number; websiteBacked: number; both: number; websiteOnly: number; xmlOnly: number; conflicts: number; stale: number };
  lastSync?: ScoopCatalogueSyncSummary;
  lastEnrichment?: ScoopLogisticsEnrichmentSummary;
  canonicalUrls: { verified: number; reviewRequired: number; unknown: number; conflict: number; selectedVerified: number; selectedMissing: number };
  logistics: { complete: number; partial: number; missing: number; adminOverrides: number; adminImports: number; supplierPage: number; scoopPageObservations: number; completeFromScoopPackage: number; completeFromScoopProductFallback: number; blocked: number; noMeasurements: number; selectedForLaunchComplete: number; supplierFeed: number; manufacturer: number; unknown: number };
}
export interface ScoopLogisticsEnrichmentSummary { requested: number; processed: number; complete: number; partial: number; missing: number; failed: number; cached: number; lastEnrichmentAt: string; bySource?: Record<string, number>; failureReasons?: Record<string, number>; manufacturerCoverage?: Record<string, { total: number; complete: number }>; }
export interface ScoopProductCreationPreview {
  offer: ScoopCatalogueProduct;
  titleSuggestions: string[];
  categorySuggestion: { slug: string; name: string; subcategories: string[]; suggestedSubcategory?: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE"; evidence: string[]; source: string };
  categories: { slug: string; name: string; subcategories: string[] }[];
  matches: { product: { id: string; name: string; sku?: string; brand: string; model?: string; category: string }; confidence: number; confidenceLevel: "HIGH" | "MEDIUM" | "LOW"; evidence: string[] }[];
}
export interface AdminInternalProduct { id: string; slug: string; sku: string; name: string; brand: string; model?: string; category: string; categorySlug: string; subcategory?: string; categoryId?: string; subcategoryId?: string; productTypeId?: string; taxonomyVersion?: 1; taxonomyStatus?: "VERIFIED" | "REVIEW_REQUIRED" | "UNMAPPED"; taxonomyLabels?: { category?: string; subcategory?: string; productType?: string }; shortDescription: string; images: string[]; publicationStatus: "INTERNAL_DRAFT"; provenance: { createdFromSupplierOffer: true; sourceSupplier: "SCOOP" | "CJ" | "SYNTECH" | "TEKCENTRAL"; sourceSupplierOfferId: string; sourceSupplierSku: string; sourceDescription: string; sourceCategory?: { supplierId: string; sourceCategoryId?: string; sourceCategoryPath?: string; sourceCategoryLabel?: string }; manufacturer?: string; sourceImage?: { source: "SCOOP" | "CJ" | "SYNTECH" | "TEKCENTRAL"; originalUrl: string; capturedAt: string } } }

export interface AdminReturnRow {
  order: Order;
  returnRequest: Order["returns"][number];
  inventory?: { returnId: string; items: { productId: string; eligible: boolean; supplierOrderId?: string; manualOfferId?: string; supplierSku?: string; fulfilledQuantity?: number; requestedQuantity: number; reconciliations: NonNullable<Order["returns"][number]["items"][number]["inventoryReconciliations"]>; offer?: { onHand: number; reserved: number; available: number } }[] };
}

export interface AdminRefundRow {
  order: Order;
  refund: Order["refunds"][number];
}

export const adminOrderActions: { status: OrderStatus; label: string }[] = [
  { status: "CONFIRMED", label: "Confirm" },
  { status: "PROCESSING", label: "Move to Processing" },
  { status: "SHIPPED", label: "Mark Shipped" },
  { status: "DELIVERED", label: "Mark Delivered" },
];

export function attentionForOrder(
  attention: AdminOrdersResponse["attention"],
  orderNumber: string,
) {
  return attention.find((entry) => entry.orderNumber === orderNumber)?.reasons ?? [];
}

export const adminReturnActions: { status: ReturnStatus; label: string }[] = [
  { status: "UNDER_REVIEW", label: "Under Review" },
  { status: "APPROVED", label: "Approve" },
  { status: "REJECTED", label: "Reject" },
  { status: "AWAITING_RETURN", label: "Awaiting Return" },
  { status: "RECEIVED", label: "Received" },
  { status: "COMPLETED", label: "Complete" },
];

export const adminRefundActions: { status: RefundStatus; label: string }[] = [
  { status: "APPROVED", label: "Approve" },
  { status: "REJECTED", label: "Reject" },
  { status: "PROCESSING", label: "Mark Ready for PayFast Refund" },
  { status: "REFUNDED", label: "Mark Refunded" },
];

export const supplierCodes: { code: SupplierCode; label: string }[] = [
  { code: "MANUAL", label: "Manual sourcing" },
  { code: "SCOOP", label: "Scoop Distribution" },
  { code: "PINNACLE", label: "Pinnacle ICT" },
  { code: "MIRO", label: "MiRO Distribution" },
  { code: "RECTRON", label: "Rectron" },
  { code: "MUSTEK", label: "Mustek" },
  { code: "AXIZ", label: "Axiz" },
  { code: "CJ", label: "CJdropshipping" },
];

export const supplierStatuses: SupplierAllocationStatus[] = [
  "ASSIGNED",
  "READY_TO_ORDER",
  "ORDER_PENDING_APPROVAL",
  "APPROVED_FOR_ORDER",
  "ORDER_SUBMITTED",
  "SUPPLIER_CONFIRMED",
  "BACKORDERED",
  "DISPATCHED",
  "COMPLETED",
  "CANCELLED",
];

export const mockSupplierScenarios = [
  "SUCCESS",
  "BACKORDER",
  "PARTIAL_CONFIRMATION",
  "REJECTED",
  "DELAYED_CONFIRMATION",
] as const;

export function itemCount(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function latestReturnStatus(order: Order) {
  return order.returns[0]?.status ?? "Not started";
}

export function latestRefundStatus(order: Order) {
  return order.refunds[0]?.status ?? "Not started";
}

export function productContext(order: Order) {
  const visible = order.items.slice(0, 2).map((item) => `${item.sku ?? item.productId} x${item.quantity}`);
  const remaining = order.items.length - visible.length;
  return remaining > 0 ? `${visible.join(" · ")} · +${remaining} more` : visible.join(" · ");
}
