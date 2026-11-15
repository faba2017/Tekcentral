import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { closePostgres, query } from "./persistence/postgres.js";
import { persistenceReadiness } from "./persistence/health.js";
import { parse as parseQuery } from "node:querystring";
import { URL } from "node:url";
import {
  addInternalNote,
  buildAdminActivity,
  createAdminShipment,
  createAdminRefund,
  createParcel,
  createSupplierAllocation,
  acknowledgePaidOrder,
  derivePaidOrderAlerts,
  deriveAttentionReasons,
  listAdminOrders,
  listAdminRefunds,
  listAdminReturns,
  releaseOperationalHold,
  setOperationalHold,
  updateAdminOrderStatus,
  updateAdminRefundStatus,
  updateAdminReturnStatus,
  updateShipment,
  updateSupplierAllocation,
} from "./adminOperations.js";
import { backendDeliveryMethods, calculateBackendTotals, getBackendProduct } from "./catalogue.js";
import { decideTekCentralReturn, getTekCentralReturnInventoryView, receiveTekCentralReturn, startTekCentralReturnInspection } from "./tekcentralReturnService.js";
import { availabilityPurchasable } from "./productAvailability.js";
import { cancelCartAction, cartOwner, confirmCartAction, createCartAction, getCart, mergeGuestCartIntoCustomer, newGuestCartToken, replaceCart, CartError } from "./cartService.js";
import { buildProductAvailabilityIndex } from "./productAvailabilityService.js";
import { createInitialCostBasis } from "./orderCostBasis.js";
import { toCustomerOrder } from "./customerOrderView.js";
import { confirmVerifiedPayfastPayment, getOrder, listOrders, saveProspectiveOrder, updateOrder, updatePaymentStatus } from "./orderRepository.js";
import { ensureOrderConfirmationDelivery, startCustomerDeliveryWorker } from "./customerDeliveryService.js";
import { startCommerceReconciliationWorker } from "./commerceReconciliationService.js";
import { ensureInvoiceForPaidOrderOperationally } from "./invoiceService.js";
import { getAdminCommercialDocuments, getAuthorizedInvoiceDownload, InvoiceAccessError, requestInvoiceResend, retryInvoiceDelivery } from "./invoiceAccessService.js";
import { recordPayfastItnEvent } from "./payfastItnLog.js";
import {
  getSupplierProductMappingById,
  listSupplierProductMappings,
  saveSupplierProductMapping,
  setSupplierProductMappingStatus,
} from "./supplierProductMappingRepository.js";
import { prepareSupplierPricing } from "./supplierPricing.js";
import { getAutomationSettingsView, getBusinessSettings, getEffectiveNotificationSettings, getPricingSettingsView, getSettingsDomain, getSettingsHistory, getShippingSettingsView, getSupplierPolicySettings, patchAutomationSettings, patchPricingSettings, patchSettingsDomain, patchShippingSettings, SettingsConflictError, updateNotificationSettings, type AutomationSettings, type NotificationSettings, type PricingSettings, type SettingsDomain, type ShippingSettings } from "./businessSettingsRepository.js";
import { getSystemHealth } from "./systemHealthService.js";
import { getAdminAiAccess, getAiAssistantSettingsView, updateAiAssistantSettings } from "./aiAccessControl.js";
import { acknowledgeAlert, bestEffortAlert, bestEffortResolve, getOperationalAlert, listOperationalAlerts, listOperationalEvents, operationalAlertSummary, resolveAlert } from "./operationalAlertService.js";
import { getAdminAuditRecord, listAdminAudit, recordAdminAuditBestEffort } from "./adminAuditService.js";
import { getStorefrontAnalytics, newAnalyticsSessionId, recordBrowserAnalytics, StorefrontAnalyticsError, type BrowserAnalyticsInput } from "./storefrontAnalytics.js";
import { AdminCustomerError, getAdminCustomer, listAdminCustomers, type CustomerFilter, type CustomerSort } from "./adminCustomerService.js";
import { getAdminMerchandising, resolveHomepage, saveHomepageSection, savePromotion, type HomepageSection, type Promotion } from "./merchandisingService.js";
import { getIntegrationHistory, getIntegrationsAdminView, testIntegration, type IntegrationId } from "./integrationAdminService.js";
import { createShippingOptionsResult, createShippingQuote, publicShippingQuote, requireShippingQuote, revalidateShippingQuote, ShippingQuoteError, testScoopZoneEstimate } from "./shippingService.js";
import { validateDeliveryAddress } from "./addressValidation.js";
import { calculateFreightReconciliation } from "./localShippingEstimator.js";
import { publicImageContentType, readPublicProductImage } from "./publicImageIngestion.js";
import { importPublicDocument, readPublicDocument, uploadPublicDocument } from "./publicDocumentStorage.js";
import { derivePricingPresentation, listPricingProposals, setPricingProposalStatus } from "./pricingProposalRepository.js";
import { createPricingOverride, generateCanonicalProductPricingProposal, generateCjCataloguePricingProposal, generateCjPricingProposal, generateScoopPricingProposal, generateSyntechPricingProposal, generateTekCentralManualPricingProposal, previewPricingOverride } from "./pricingService.js";
import { getFxRate, refreshFxRate, resolveFxEvidence } from "./fxRateService.js";
import { getFxImpactDashboard, reconcileForeignCurrencyPricingImpact } from "./fxImpactService.js";
import { getFxPricingAttention, runFxPricingReconciliation, startFxReconciliationScheduler } from "./fxReconciliationJob.js";
import { applyScoopPageLogistics, confirmScoopHardwareRevision, fetchScoopPageLogistics, ingestScoopPageLogisticsBatch, previewScoopPageLogistics } from "./suppliers/scoop/scoopPageLogistics.js";
import { applyScoopStaffUrl, applyScoopUrlImport, backfillScoopCanonicalUrls, fetchPublicScoopProductPage, getScoopUrlMetrics, previewScoopStaffUrl, previewScoopUrlImport } from "./suppliers/scoop/scoopUrlReconciliation.js";
import { getInternalProduct, listAdminProducts, setInternalProductLaunchSelection } from "./internalProductRepository.js";
import { canonicalTaxonomyPath, createCanonicalTaxonomyNode, getCanonicalTaxonomyTree, taxonomyImpact, updateCanonicalTaxonomyNode } from "./canonicalTaxonomyService.js";
import { listSupplierCategoryMappings, normalizeSupplierSourcePath } from "./supplierCategoryMappingRepository.js";
import { createPublicationDraftFromActiveVersion, getPublicationPreview, getPublicationReview, getPublicationSummary, getPublicProductBySlug, ingestAndAssociatePrivateMustekImage, ingestAndAssociatePublicationImage, ingestAndAssociateTvrWebsiteImage, listPublicProducts, publishSavedDraft, removePublicationMedia, rollbackProduct, savePublicationDraft, unpublishProduct, uploadAndAssociatePublicationImage } from "./productPublicationRepository.js";
import { getProductOnboardingReadiness } from "./productOnboardingService.js";
import {
  isDuplicatePayfastItn,
  readPayfastConfig,
  validatePayfastItn,
} from "./payfast.js";
import { createPayment, getPaymentSettings, getPayfastConfigForOrder, testPayfastConfiguration, updatePayfastSettings } from "./payments/paymentGateway.js";
import {
  applyMockSupplierOutcome,
  acknowledgeSupplierOrder,
  approveSupplierOrder,
  autoAllocatePaidOrder,
  createSupplierPayloadPreview,
  dispatchSupplierOrder,
  deriveSupplierOrderAttention,
  generateSupplierOrders,
  progressTekCentralFulfilment,
  fulfilTekCentralSupplierOrder,
  cancelTekCentralSupplierOrder,
  releaseTekCentralReservationsForCancelledOrder,
  getAdminSupplierOrder,
  listAdminSupplierOrders,
  mapSupplierOrderLineSku,
  markManualSupplierOrderOrdered,
  mockSubmitSupplierOrder,
  rejectSupplierOrder,
  SupplierWorkflowError,
} from "./supplierOrchestration.js";
import { CjApiError } from "./suppliers/cj/cjErrors.js";
import {
  autocompleteCjProducts,
  getCjConnectionStatus,
  checkCjMappingStalenessById,
  getCjCategories,
  getAllCjCategories,
  getCjProductDetail,
  getCjStockByVid,
  importCjProduct,
  refreshCjEvidenceCohort,
  refreshCjProduct,
  refreshCjVariantSourcePrice,
  refreshCjVariantAvailability,
  rejectSupplierMappingById,
  searchCjProducts,
  suggestCjMapping,
  testCjConnection,
  verifySupplierMappingById,
} from "./suppliers/cj/cjCatalogueAdapter.js";
import { confirmCjCatalogueCurrency, getCjCatalogueProduct, listCjCatalogueProducts } from "./suppliers/cj/cjCatalogueRepository.js";
import { confirmCjAccountCurrency, getCjEvidenceSettings } from "./suppliers/cj/cjEvidenceSettingsRepository.js";
import { auditCjEvidenceCohort, confirmCjProcurementCost, confirmCjVariantLogistics, createTekCentralProductFromCj, deriveCjPricingEvidence, getCjVariantLaunchReadiness, mapCjVariantToExistingProduct, previewCjProductMapping, setCjVariantLaunchState, verifyCjExistingMappingEvidence, verifyCjVariantEvidence, type CjLaunchState } from "./suppliers/cj/cjLaunchPipeline.js";
import { getSupplierRegistryEntry, supplierRegistry } from "./supplierRegistry.js";
import { productProcurementDecision, PROCUREMENT_UNAVAILABLE_MESSAGE } from "./supplierProcurement.js";
import { getSupplierHub, getSupplierOperations } from "./supplierHubService.js";
import { buildReport, getDashboard, reportCsv, reportDefinitions, reportFilename, reportXlsx, type PeriodId, type ReportId } from "./analyticsService.js";
import { getSettingsNotificationTestStatus, getSupplierOrderNotification, retryScoopActionRequiredNotification, sendSettingsNotificationTest } from "./internalNotificationService.js";
import {
  CjOrderError,
  checkCjVariantDeliveryToSouthAfrica,
  createRealCjOrder,
  prepareCjOrderPreflight,
  reconcileCjOrder,
  removeCjOperationalConsigneeId,
  refreshCjOrderStatus,
  saveCjOperationalConsigneeId,
  sanitizeCjOrderPreflightForAdmin,
  selectCjLogisticsOverride,
} from "./suppliers/cj/cjOrderAdapter.js";
import { syncScoopCatalogueFromFeed } from "./suppliers/scoop/scoopCatalogueAdapter.js";
import { listSyntechCatalogueProducts, getSyntechStatus } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { getSyntechSyncReadiness, runSyntechSync, startSyntechScheduler, syntechSyncErrorCode } from "./suppliers/syntech/syntechSyncService.js";
import { createTekCentralProductFromSyntech, getSyntechOnboardingPreview, getSyntechProductReadiness, mapSyntechProductToExisting, verifySyntechSourceCategory } from "./suppliers/syntech/syntechProductOnboarding.js";
import { createSyntechUatOrder, getSyntechApiProcurementControl, prepareSyntechOrderPreflight, SyntechOrderError, type SyntechShippingSelection } from "./suppliers/syntech/syntechOrderAdapter.js";
import { enrichScoopLogisticsBatch } from "./suppliers/scoop/scoopLogisticsEnrichment.js";
import { applyScoopLogisticsCsv, exportMissingScoopLogisticsCsv, previewScoopLogisticsCsv } from "./suppliers/scoop/scoopLogisticsCsv.js";
import { acquireScoopManufacturerLogistics } from "./suppliers/scoop/scoopManufacturerLogistics.js";
import { previewScoopProductContent, productPhysicalSpecifications } from "./suppliers/scoop/scoopProductContent.js";
import { applyScoopWebsiteImport, previewScoopWebsiteImport } from "./suppliers/scoop/scoopWebsiteImport.js";
import { createTekCentralProductFromScoop, getScoopProductCreationPreview, requireWeakMappingConfirmation, scoreSelectedScoopMapping } from "./suppliers/scoop/scoopProductCreation.js";
import {
  clearScoopAdminLogistics,
  getScoopCatalogueProduct,
  getScoopCatalogueSyncStatus,
  listScoopLogisticsAudit,
  listScoopCatalogueProducts,
  saveScoopAdminLogistics,
  setScoopLaunchAssortmentState,
} from "./suppliers/scoop/scoopCatalogueRepository.js";
import { deriveScoopLaunchReadiness, deriveScoopProductWorkflow, deriveScoopPublicationAction, isInScoopLaunchReadinessCohort, latestScoopProposal, scoopAssortmentState, suggestScoopLaunchCandidates } from "./suppliers/scoop/scoopLaunchReadiness.js";
import type { ScoopLaunchAssortmentState } from "./suppliers/scoop/scoopTypes.js";
import type {
  BackendOrder,
  BackendOrderItem,
  MockSupplierScenario,
  OperationalHoldReason,
  OrderStatus,
  Parcel,
  RefundStatus,
  ReturnStatus,
  ShipmentItem,
  ShipmentStatus,
  SupplierAllocationStatus,
  SupplierCode,
} from "./types.js";
import { clearCustomerSessionCookie, createCustomerAddress, customerFromSessionToken, customerSessionCookie, CustomerAuthError, CustomerAuthRateLimiter, deleteCustomerAddress, getZeusAccountDataConsent, listCustomerAddresses, loginCustomer, logoutCustomer, parseCustomerSessionCookie, registerCustomer, requestPasswordReset, resetCustomerPassword, setDefaultCustomerAddress, setZeusAccountDataConsent, updateCustomerAddress, updateCustomerProfile } from "./customerAuth.js";
import { createHash, randomUUID } from "node:crypto";
import { applySecurityHeaders, applySensitiveCachePolicy, applyTrustedCors, safeErrorEnvelope, validateCorsPreflight } from "./httpSecurity.js";
import { validateRuntimeSecurityConfig } from "./runtimeSecurityConfig.js";
import { proxyDiagnostic } from "./proxyDiagnostics.js";
import { seedMustekSources } from "./suppliers/mustek/mustekSourceService.js";
import { seedTvrSources } from "./suppliers/tvr/tvrSourceService.js";
import { normalizeCurrentTvrSourceVersion, summarizeTvrSemanticReport } from "./suppliers/tvr/tvrSemanticEvidenceService.js";
import { getTvrCatalogueStatus, listTvrCatalogueOffers, promoteCurrentTvrCatalogue } from "./suppliers/tvr/tvrCatalogueService.js";
import { createProductFromTvrOffer, getTvrOnboardingPreview, suggestTvrExistingProductMapping } from "./suppliers/tvr/tvrProductOnboarding.js";
import { getMustekCatalogueStatus, listMustekCatalogueOffers, normalizeCurrentMustekCatalogue } from "./suppliers/mustek/mustekCatalogueService.js";
import { createProductFromMustekOffer, getMustekOnboardingPreview, suggestMustekExistingProductMapping } from "./suppliers/mustek/mustekProductOnboarding.js";
import { getSupplierSource, saveSupplierSource, setSupplierSourceState } from "./supplierSourceRegistry.js";
import { getSupplierSourceView, runSupplierSourceOperation, supplierHasSourceWorkspace } from "./supplierSourcePlatform.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { consumeSharedRateLimit } from "./persistence/rateLimit.js";
import { getCustomerAccountOrder, listCustomerAccountOrders } from "./customerAccountOrders.js";
import { smtpMailTransport } from "./mailService.js";
import { CustomerOrderClaimError, requestGuestOrderClaim, verifyGuestOrderClaim } from "./customerOrderClaim.js";
import { sendCustomerPasswordResetEmail } from "./customerAccountMail.js";
import { isTrustedCustomerOrigin } from "./customerRequestSecurity.js";
import { acceptStaffInvitation, bootstrapInitialSuperAdminFromEnvironment, changeStaffPassword, clearStaffSessionCookie, createStaffPasswordReset, deferStaffTwoFactorReminder, disableStaffAccount, disableStaffTwoFactor, enableStaffAccount, getStaffAccount, getStaffInvitation, inviteStaff, listStaffAccounts, loginStaff, logoutStaff, parseStaffSessionCookie, regenerateStaffRecoveryCodes, requestStaffPasswordReset, resendStaffInvitation, resetStaffPassword, revokeAllStaffSessions, revokeStaffInvitation, staffAuthorizationContextForAutomation, staffFromSessionToken, staffSessionCookie, StaffAuthError, StaffAuthRateLimiter, startStaffTotpEnrollment, updateStaffAuthorizationProfile, verifyStaffTotpEnrollment, verifyStaffTwoFactorLogin } from "./staffAuth.js";
import { sendStaffInvitationEmail, sendStaffPasswordResetEmail } from "./staffAuthMail.js";
import { permissionForAdminRequest, permissionForReport } from "./adminAuthorizationPolicy.js";
import { isTrustedAdminOrigin } from "./adminRequestSecurity.js";
import { createStaffAuthorizationContext, requirePermission, staffAuditActor, StaffPermissionDeniedError } from "./staffAuthorization.js";
import { staffPermissionRegistry, staffRoleLabels, staffRolePermissions } from "./staffRbac.js";
import { redactAdminPayload } from "./adminResponseSecurity.js";
import { ContactSubmissionError, submitContactEnquiry } from "./contactService.js";
import { RecaptchaError, verifyRecaptcha } from "./recaptchaService.js";
import { buildRobots, buildSitemap } from "./seoService.js";
import { ContactMessagingError, createAdminContactMessage, getAdminContactConversation, listAdminContactConversations, replyToContactConversation, retryContactMessage, searchContactCustomers } from "./contactMessagingService.js";
import { issueGuestOrderAccess, verifyGuestOrderAccess } from "./guestOrderAccess.js";
import { ZeusRequestError, ZeusService, ZeusToolError, type ZeusRequestTelemetry } from "./zeus/service.js";
import { createZeusProvider } from "./zeus/providerFactory.js";
import { ZeusGuardError, zeusUsageGuard } from "./zeus/usageGuard.js";
import { adjustTekCentralManualStock, getTekCentralManualOffer, getTekCentralManualOfferHistory, getTekCentralManualOfferStatus, mapTekCentralManualOffer, saveTekCentralManualOffer, updateTekCentralInventorySettings, updateTekCentralManualCost } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { commitTekCentralInventoryCsv, createTekCentralReplenishment, exportTekCentralInventoryCsv, getTekCentralForecast, listTekCentralReplenishments, lookupTekCentralInventoryIdentifier, previewTekCentralInventoryCsv, receiveTekCentralReplenishment, updateTekCentralReplenishment } from "./tekcentralInventoryOperations.js";
import { createProductFromTekCentralManualOffer, getTekCentralManualProductReadiness } from "./suppliers/tekcentral/tekcentralManualProductOperations.js";
import { AdminAiError, adminAiSafeHttpError, createAdminAiService } from "./adminAi/index.js";
import { explainAdminAiTutorTopic, getAdminAiTutorContext, updateAdminAiTutorPreference, type AdminAiTutorAction } from "./adminAi/tutor.js";
import { buildAdminAiSafeContext, generateContextualAdminAi, parseAdminAiContextRequest } from "./adminAi/contextual.js";
import { createAdminAiChatConversation, retryAdminAiChat, sendAdminAiChat } from "./adminAi/chatService.js";
import { attachAdminAiContext, deleteAdminAiConversation, detachAdminAiContext, getAdminAiConversation, listAdminAiContextAttachments, listAdminAiConversations, listAdminAiMessagesNewestPage, renameAdminAiConversation, setAdminAiConversationStatus } from "./adminAi/conversationRepository.js";
import { adminAiToolRegistryDto, automationActionCard, cancelAdminAiAction, cancelAutomationAdminAiAction, confirmAdminAiAction, confirmAutomationAdminAiAction, listAdminAiActionCards } from "./adminAi/controlledActions.js";
import { evaluateAdminAiToolPolicy, getAdminAiPolicyBundle, savePlatformAdminAiPolicy, saveStaffAdminAiPolicy } from "./adminAi/policy.js";
import { ADMIN_AI_AUTOMATION_EVENT_CATALOGUE, createValidatedAdminAiAutomation, retireValidatedAdminAiAutomation, setValidatedAdminAiAutomationEnabled, startAdminAiAutomationWorker, updateValidatedAdminAiAutomation } from "./adminAi/automationService.js";
import { getAdminAiAutomation, listAdminAiAutomations, listAdminAiAutomationReviewRuns, listAdminAiAutomationRuns } from "./adminAi/automationRepository.js";
import { searchAdminAiAutomationProductTargets } from "./adminAi/automationProductTargets.js";
import { getAdminAiAction } from "./adminAi/actionRepository.js";
import { getAdminAiOperations } from "./adminAi/operationsService.js";

interface CreateOrderBody {
  customer: BackendOrder["customer"];
  deliveryAddress: BackendOrder["deliveryAddress"];
  deliveryMethodId: string;
  shippingQuoteId: string;
  items: { productId: string; quantity: number }[];
}

function normalizeAdminAiTutorError(error: unknown): never {
  if (error instanceof StaffAuthError) throw error;
  if (error instanceof AdminAiError) {
    const safe = adminAiSafeHttpError(error);
    throw new StaffAuthError(error.code, safe.message, safe.status);
  }
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; status?: unknown; message?: unknown };
    if (typeof value.code === "string" && typeof value.status === "number") throw new StaffAuthError(value.code, typeof value.message === "string" ? value.message : "The Admin Tour request could not be completed.", value.status);
  }
  throw error;
}

function loadEnvFile() {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) return;
    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile();

type CorsResponse = ServerResponse & { requestOrigin?: string; adminPath?: string; staffPermissions?: ReadonlySet<string>; requestId?: string };
function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  const secureResponse = response as CorsResponse;
  const safeBody = secureResponse.adminPath ? redactAdminPayload(body, { pathname: secureResponse.adminPath, permissions: secureResponse.staffPermissions ?? new Set<string>() }) : body;
  response.end(JSON.stringify(safeBody));
}

function sendDownload(response: ServerResponse, contentType: string, filename: string, body: string | Buffer) {
  response.writeHead(200, { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store", "Access-Control-Expose-Headers": "Content-Disposition" });
  response.end(body);
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body too large.");
  }
}

function badRequest(message: string, code = "INVALID_REQUEST") {
  return Object.assign(new Error(message), { status: 400, code });
}

function readBody(request: IncomingMessage, maxBytes = 1_000_000) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    let rejected = false;
    request.on("data", (chunk) => {
      if (rejected) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        rejected = true;
        reject(new RequestBodyTooLargeError());
      }
    });
    request.on("end", () => { if (!rejected) resolve(body); });
    request.on("error", (error) => { if (!rejected) reject(error); });
  });
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeIp(ip?: string | null) {
  if (!ip) return undefined;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function getClientIp(request: IncomingMessage) {
  const remoteAddress = normalizeIp(request.socket.remoteAddress);
  const trustProxy = readPayfastConfig().trustProxy;
  const forwardedFor = request.headers["x-forwarded-for"];
  const cloudflareClientIp = request.headers["cf-connecting-ip"];
  if (
    trustProxy &&
    remoteAddress &&
    ["127.0.0.1", "::1"].includes(remoteAddress) &&
    typeof cloudflareClientIp === "string"
  ) {
    return normalizeIp(cloudflareClientIp.trim());
  }
  if (
    trustProxy &&
    remoteAddress &&
    ["127.0.0.1", "::1"].includes(remoteAddress) &&
    typeof forwardedFor === "string"
  ) {
    return normalizeIp(forwardedFor.split(",")[0]?.trim());
  }
  return remoteAddress;
}

function getForwardedClientIp(request: IncomingMessage) {
  const cloudflareClientIp = request.headers["cf-connecting-ip"];
  if (typeof cloudflareClientIp === "string") return normalizeIp(cloudflareClientIp.trim());
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") return normalizeIp(forwardedFor.split(",")[0]?.trim());
  return undefined;
}

function validateItnShape(data: Record<string, string>) {
  const requiredFields = [
    "merchant_id",
    "m_payment_id",
    "pf_payment_id",
    "payment_status",
    "amount_gross",
    "signature",
  ];
  return requiredFields.every((field) => typeof data[field] === "string" && data[field]);
}

async function readJsonBody<T>(request: IncomingMessage) {
  return JSON.parse(await readBody(request)) as T;
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `TC-${year}-`;
  if(loadPersistenceConfig().provider==="POSTGRES"){const allocated=(await query<{value:string}>("SELECT allocate_business_sequence('order',$1)::text AS value",[year])).rows[0].value;return`${prefix}${String(allocated).padStart(6,"0")}`;}
  const orders = await listOrders();
  const maxSequence = orders.reduce((max, order) => {
    if (!order.orderNumber.startsWith(prefix)) return max;
    const sequence = Number(order.orderNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(6, "0")}`;
}

async function createOrder(body: CreateOrderBody, customerAccountId?: string) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw badRequest("Order requires at least one item.");
  }
  const deliveryMethod = backendDeliveryMethods.find(
    (method) => method.id === body.deliveryMethodId && method.enabled,
  );
  if (!deliveryMethod) throw badRequest("Invalid delivery method.");

  const shippingQuote = await requireShippingQuote(body.shippingQuoteId, {
    items: body.items,
    destination: {
      country: body.deliveryAddress.country,
      province: body.deliveryAddress.province,
      city: body.deliveryAddress.city,
      suburb: body.deliveryAddress.suburb,
      postalCode: body.deliveryAddress.postalCode,
    },
    deliveryMethodId: body.deliveryMethodId,
  });

  const items: BackendOrderItem[] = await Promise.all(body.items.map(async (line) => {
    const cjMapping = (await listSupplierProductMappings()).find((mapping) => mapping.productId === line.productId && mapping.supplierCode === "CJ" && mapping.status === "VERIFIED" && mapping.supplierProductId && mapping.supplierVariantId);
    if (cjMapping?.supplierProductId && cjMapping.supplierVariantId) {
      await refreshCjVariantAvailability({ supplierProductId: cjMapping.supplierProductId, supplierVariantId: cjMapping.supplierVariantId, supplierVariantSku: cjMapping.supplierVariantSku });
    }
    const product = await getBackendProduct(line.productId);
    if (!product) throw badRequest(`Unknown product ${line.productId}.`, "UNKNOWN_PRODUCT");
    if (!(await productProcurementDecision(line.productId)).viable) {
      throw badRequest(PROCUREMENT_UNAVAILABLE_MESSAGE, "PRODUCT_PROCUREMENT_UNAVAILABLE");
    }
    if ("availabilityState" in product && !availabilityPurchasable(product.availabilityState)) {
      throw badRequest(`Product availability must be confirmed before checkout: ${product.name}.`, "PRODUCT_AVAILABILITY_UNCONFIRMED");
    }
    const quantity = Math.max(1, Math.min(99, Math.trunc(line.quantity)));
    return {
      productId: product.productId,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      stockStatus: product.stockStatus,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      productTypeId: product.productTypeId,
      taxonomyVersion: product.taxonomyVersion,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    };
  }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const totals = calculateBackendTotals(subtotal, shippingQuote.customerShippingCharge!);
  const now = new Date().toISOString();
  const orderNumber = await nextOrderNumber();
  const paymentSettings = await getPaymentSettings();
  const businessSettings = await getBusinessSettings();
  items.forEach((item) => { item.costBasis = createInitialCostBasis(item, businessSettings.pricing.vatRatePercent, now); });

  const order: BackendOrder = {
    id: createLocalId("order"),
    customerAccountId: customerAccountId ?? null,
    orderNumber,
    createdAt: now,
    updatedAt: now,
    customer: body.customer,
    deliveryAddress: body.deliveryAddress,
    deliveryMethod: { ...deliveryMethod, price: shippingQuote.customerShippingCharge! },
    paymentMethod: {
      id: "payfast",
      name: "PayFast",
      description:
        "You'll be redirected to PayFast to choose from the payment methods available for your order.",
      settlementNote: "Secure hosted payment with PayFast.",
      enabled: true,
    },
    payment: {
      provider: "payfast",
      gatewayProvider: "PAYFAST",
      gatewayInstanceId: `PAYFAST:${paymentSettings.gateways.find((gateway) => gateway.provider === "PAYFAST")?.mode ?? "SANDBOX"}`,
      gatewayReference: `${orderNumber}-PF`,
      paymentMethod: "HOSTED_CHECKOUT",
      amount: totals.total,
      currency: "ZAR",
      createdAt: now,
      status: "PENDING",
      paymentReference: `${orderNumber}-PF`,
      updatedAt: now,
      processedItnIds: [],
    },
    items,
    subtotal: totals.subtotal,
    deliveryAmount: totals.deliveryAmount,
    shippingQuoteSnapshot: {
      quoteId: shippingQuote.quoteId,
      amountCharged: shippingQuote.customerShippingCharge!,
      supplierShippingCost: shippingQuote.supplierShippingCost,
      estimatedInternalFreightCost: shippingQuote.estimatedInternalFreightCost,
      fulfilmentGroups: shippingQuote.fulfilmentGroups.map((group) => ({
        customerLabel: group.customerLabel,
        customerDescription: group.customerDescription,
        customerCharge: group.customerCharge!,
        supplierShippingCost: group.supplierShippingCost,
        estimatedInternalFreightCost: group.estimatedInternalFreightCost,
        actualSupplierFreightCost: group.actualSupplierFreightCost,
        bufferAmount: group.bufferAmount,
        policyType: group.policyType,
        zone: group.zone,
        actualWeightKg: group.actualWeightKg,
        volumetricWeightKg: group.volumetricWeightKg,
        billableWeightKg: group.billableWeightKg,
        rateCardVersion: group.rateCardVersion,
        calculationVersion: group.calculationVersion,
        provenance: group.provenance,
        estimate: group.estimate,
        internalSupplierCode: group.internalSupplierCode,
        internalMethod: group.internalMethod,
      })),
      acceptedAt: now,
      generatedAt: shippingQuote.generatedAt,
      expiresAt: shippingQuote.expiresAt,
      settingsSnapshot: shippingQuote.settingsSnapshot,
    },
    taxAmount: totals.taxAmount,
    total: totals.total,
    currency: "ZAR",
    status: "PENDING",
    statusHistory: [
      {
        status: "PENDING",
        label: "Order placed",
        createdAt: now,
        note: "Awaiting PayFast payment confirmation.",
      },
    ],
    returns: [],
    refunds: [],
  };
  const saved = await saveProspectiveOrder(order);
  if (loadPersistenceConfig().provider === "POSTGRES") {
    try {
      const queued = await ensureOrderConfirmationDelivery(saved);
      console.info("Order confirmation queued", { orderId: saved.id, orderNumber: saved.orderNumber, deliveryId: queued.delivery.id, created: queued.created });
    } catch {
      console.error("Order confirmation enqueue failed", { orderId: saved.id, orderNumber: saved.orderNumber, code: "ORDER_CONFIRMATION_ENQUEUE_FAILED" });
      await bestEffortAlert({ type: "ORDER_CONFIRMATION_ENQUEUE_FAILED", severity: "CRITICAL", subsystem: "EMAIL", title: "Order confirmation could not be queued", summary: "A persisted order does not yet have its durable customer confirmation delivery.", entityType: "ORDER", entityId: saved.id, targetRoute: `/admin/orders/${encodeURIComponent(saved.orderNumber)}`, recommendedAction: "Review the order and email service health", diagnosticCode: "ORDER_CONFIRMATION_ENQUEUE_FAILED", customerImpactCount: 1 });
    }
  }
  return saved;
}

const customerAuthRateLimiter = new CustomerAuthRateLimiter();
const staffAuthRateLimiter = new StaffAuthRateLimiter();
const zeusService = new ZeusService(createZeusProvider());
const rateLimitHash = (scope: string, key: string) => createHash("sha256").update(`${scope}:${key}`).digest("hex");
async function enforceCustomerAuthRateLimit(request: IncomingMessage, action: string, limit = 8, windowMs = 15 * 60 * 1_000) {
  const key = `${action}:${getClientIp(request) ?? "unknown"}`;
  if (loadPersistenceConfig().provider === "POSTGRES") {
    const result = await consumeSharedRateLimit({ keyHash: rateLimitHash("customer-auth", key), limit, windowSeconds: Math.ceil(windowMs / 1_000) });
    if (!result.allowed) throw new CustomerAuthError("RATE_LIMITED", "Too many attempts. Please try again later.", 429);
    return;
  }
  customerAuthRateLimiter.check(key, limit, windowMs);
}

async function currentCustomer(request: IncomingMessage) {
  return customerFromSessionToken(parseCustomerSessionCookie(request.headers.cookie));
}
async function currentStaff(request: IncomingMessage, touch = true) { return staffFromSessionToken(parseStaffSessionCookie(request.headers.cookie), new Date(), touch); }
async function enforceStaffAuthRateLimit(request: IncomingMessage, action: string, identity: string, limit = 8, windowMs = 15 * 60 * 1_000) { const source = getClientIp(request) ?? "unknown"; const keys = [{ key: `${action}:source:${source}`, limit: limit * 2 }, { key: `${action}:identity:${identity.trim().toLowerCase()}`, limit }]; if (loadPersistenceConfig().provider === "POSTGRES") { for (const item of keys) { const result = await consumeSharedRateLimit({ keyHash: rateLimitHash("staff-auth", item.key), limit: item.limit, windowSeconds: Math.ceil(windowMs / 1_000) }); if (!result.allowed) throw new StaffAuthError("RATE_LIMITED", "Too many attempts. Please try again later.", 429); } return; } for (const item of keys) staffAuthRateLimiter.check(item.key, item.limit, windowMs); }

const cartCookieName = "tc_cart_session";
function cartSession(request: IncomingMessage, response: ServerResponse) { const existing = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cartCookieName}=`))?.slice(cartCookieName.length + 1); if (existing) return decodeURIComponent(existing); const token = newGuestCartToken(); response.setHeader("Set-Cookie", `${cartCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); return token; }
async function currentCartOwner(request: IncomingMessage, response: ServerResponse) { const token = cartSession(request, response); const customer = await currentCustomer(request); const guestOwner = cartOwner(undefined, token); if (!customer) return guestOwner; const customerOwner = cartOwner(customer.id, token); await mergeGuestCartIntoCustomer(guestOwner, customerOwner); return customerOwner; }
const analyticsCookieName = "tc_analytics_session";
function analyticsSession(request: IncomingMessage, response: ServerResponse) { const existing = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${analyticsCookieName}=`))?.slice(analyticsCookieName.length + 1); if (existing && /^[a-zA-Z0-9_-]{8,100}$/.test(existing)) return existing; const id = newAnalyticsSessionId(); response.setHeader("Set-Cookie", `${analyticsCookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); return id; }

function enforceAccountMutationOrigin(request: IncomingMessage) {
  const adminRequest = request.url?.startsWith("/api/admin/");
  const trusted = adminRequest ? isTrustedAdminOrigin(request.headers.origin) : isTrustedCustomerOrigin(request.headers.origin);
  if (!trusted) throw new CustomerAuthError("UNTRUSTED_ORIGIN", "Request origin is not allowed.", 403);
}

function enforceAdminMutationOrigin(request: IncomingMessage) {
  if (!isTrustedAdminOrigin(request.headers.origin)) throw new StaffAuthError("UNTRUSTED_ORIGIN", "Request origin is not allowed.", 403);
}

const guestAccessToken = (request: IncomingMessage) => {
  const header = request.headers["x-guest-order-access"];
  return typeof header === "string" ? header : undefined;
};

async function hasCustomerOrderAccess(request: IncomingMessage, order: BackendOrder) {
  if (request.headers.origin && !isTrustedCustomerOrigin(request.headers.origin)) return false;
  const customer = await currentCustomer(request);
  if (customer && order.customerAccountId === customer.id) return true;
  if (order.customerAccountId) return false;
  return verifyGuestOrderAccess(order.orderNumber, guestAccessToken(request));
}

function denyCustomerOrderAccess(response: ServerResponse) {
  sendJson(response, 404, { error: "We couldn't access this order.", code: "ORDER_ACCESS_NOT_FOUND" });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const proxyMetadata = proxyDiagnostic(request);
  if (proxyMetadata) console.info(JSON.stringify(proxyMetadata));
  const secureResponse = response as CorsResponse;
  secureResponse.requestId = randomUUID();
  response.setHeader("X-Request-Id", secureResponse.requestId);
  applySecurityHeaders(response, url.pathname);
  applySensitiveCachePolicy(response, url.pathname);
  const requestOrigin = request.headers.origin;
  const trustedOrigin = Boolean(requestOrigin && (isTrustedCustomerOrigin(requestOrigin) || isTrustedAdminOrigin(requestOrigin)));
  if (requestOrigin && trustedOrigin) {
    secureResponse.requestOrigin = requestOrigin;
    applyTrustedCors(response, requestOrigin);
  }
  if (request.method === "OPTIONS") {
    const preflight = validateCorsPreflight(request, trustedOrigin);
    if (!preflight.ok) { sendJson(response, preflight.status, { error: "CORS preflight request is not allowed.", code: preflight.code, requestId: secureResponse.requestId }); return; }
    applyTrustedCors(response, requestOrigin!, preflight.method, preflight.headers);
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname.startsWith("/api/admin/")) (response as CorsResponse).adminPath = url.pathname;
  if (url.pathname.startsWith("/api/admin/auth")) response.setHeader("Cache-Control", "no-store");
  if (url.pathname.startsWith("/api/orders") || url.pathname.startsWith("/api/payments/")) {
    response.setHeader("Cache-Control", "no-store");
  }

  try {
    if (request.method === "GET" && url.pathname === "/live") { sendJson(response, 200, { status: "alive" }); return; }
    if (request.method === "GET" && url.pathname === "/ready") { const readiness = await persistenceReadiness(); sendJson(response, readiness.ready ? 200 : 503, readiness); return; }
    if (url.pathname.startsWith("/api/admin/auth/") && request.method !== "GET") enforceAdminMutationOrigin(request);
    if (request.method === "GET" && url.pathname === "/api/admin/auth/session") { const staff = await currentStaff(request); if (!staff) { sendJson(response, 200, { authenticated: false }); return; } sendJson(response, 200, { authenticated: true, staff: staff.staff, effectivePermissions: [...staff.context.permissions], mustChangePassword: staff.mustChangePassword }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/login") { const body = await readJsonBody<{ email?: string; password?: string }>(request); await enforceStaffAuthRateLimit(request, "login", body.email ?? "unknown", 6); const result = await loginStaff(body); if (result.requiresTwoFactor) { sendJson(response, 200, { staff: result.staff, requiresTwoFactor: true, challengeToken: result.challengeToken, expiresAt: result.expiresAt }); return; } response.setHeader("Set-Cookie", staffSessionCookie(result.sessionToken, process.env.NODE_ENV === "production")); sendJson(response, 200, { staff: result.staff, requiresTwoFactor: false }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/verify-login") { const body = await readJsonBody<{ challengeToken?: string; code?: string; method?: "TOTP_AUTHENTICATOR" | "RECOVERY_CODE" }>(request); await enforceStaffAuthRateLimit(request, "two-factor", body.challengeToken?.slice(0, 12) ?? "unknown", 6, 10 * 60 * 1_000); const result = await verifyStaffTwoFactorLogin({ challengeToken: body.challengeToken ?? "", code: body.code ?? "", method: body.method === "RECOVERY_CODE" ? "RECOVERY_CODE" : "TOTP_AUTHENTICATOR" }); response.setHeader("Set-Cookie", staffSessionCookie(result.sessionToken, process.env.NODE_ENV === "production")); sendJson(response, 200, { staff: result.staff }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/logout") { await logoutStaff(parseStaffSessionCookie(request.headers.cookie)); response.setHeader("Set-Cookie", clearStaffSessionCookie(process.env.NODE_ENV === "production")); sendJson(response, 200, { success: true }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/change-password") { const sessionToken = parseStaffSessionCookie(request.headers.cookie); if (!sessionToken) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const body = await readJsonBody<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>(request); const result = await changeStaffPassword({ sessionToken, currentPassword: body.currentPassword ?? "", newPassword: body.newPassword ?? "", confirmPassword: body.confirmPassword ?? "" }); response.setHeader("Set-Cookie", staffSessionCookie(result.sessionToken, process.env.NODE_ENV === "production")); sendJson(response, 200, { staff: result.staff }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/forgot-password") { const body = await readJsonBody<{ email?: string }>(request); await enforceStaffAuthRateLimit(request, "forgot", body.email ?? "unknown", 4, 30 * 60 * 1_000); const reset = await requestStaffPasswordReset(body.email ?? ""); if (reset) void sendStaffPasswordResetEmail(smtpMailTransport, { email: reset.staff.email, displayName: reset.staff.displayName, token: reset.token, expiresAt: reset.expiresAt }).catch(() => bestEffortAlert({ type: "STAFF_AUTH_EMAIL_DELIVERY_OUTAGE", severity: "CRITICAL", subsystem: "EMAIL", title: "Staff authentication email delivery failed", summary: "A staff password reset message could not be delivered.", targetRoute: "/admin/settings/health", recommendedAction: "Review email health", diagnosticCode: "STAFF_AUTH_RESET_SMTP_FAILED" })); sendJson(response, 200, { message: "If an eligible account exists, password reset instructions have been sent." }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/reset-password") { const body = await readJsonBody<{ token?: string; password?: string; confirmPassword?: string }>(request); await enforceStaffAuthRateLimit(request, "reset", "token", 8); await resetStaffPassword({ token: body.token ?? "", password: body.password ?? "", confirmPassword: body.confirmPassword ?? "" }); response.setHeader("Set-Cookie", clearStaffSessionCookie(process.env.NODE_ENV === "production")); sendJson(response, 200, { success: true }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/auth/invitation") { sendJson(response, 200, await getStaffInvitation(url.searchParams.get("token") ?? "")); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/accept-invitation") { const body = await readJsonBody<{ token?: string; password?: string; confirmPassword?: string }>(request); await enforceStaffAuthRateLimit(request, "invite", "token", 8); sendJson(response, 200, { staff: await acceptStaffInvitation({ token: body.token ?? "", password: body.password ?? "", confirmPassword: body.confirmPassword ?? "" }) }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/totp/start") { const token = parseStaffSessionCookie(request.headers.cookie); if (!token) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); sendJson(response, 200, await startStaffTotpEnrollment(token)); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/totp/verify") { const token = parseStaffSessionCookie(request.headers.cookie); if (!token) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const body = await readJsonBody<{ code?: string }>(request); await enforceStaffAuthRateLimit(request, "two-factor-enrollment", "session", 8); sendJson(response, 200, await verifyStaffTotpEnrollment(token, body.code ?? "")); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/disable") { const token = parseStaffSessionCookie(request.headers.cookie); if (!token) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const body = await readJsonBody<{ password?: string; code?: string }>(request); const staff = await disableStaffTwoFactor({ sessionToken: token, password: body.password ?? "", code: body.code ?? "" }); response.setHeader("Set-Cookie", clearStaffSessionCookie(process.env.NODE_ENV === "production")); sendJson(response, 200, { staff }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/recovery-codes/regenerate") { const token = parseStaffSessionCookie(request.headers.cookie); if (!token) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const body = await readJsonBody<{ password?: string; code?: string }>(request); sendJson(response, 200, await regenerateStaffRecoveryCodes({ sessionToken: token, password: body.password ?? "", code: body.code ?? "" })); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/auth/2fa/remind-later") { const token = parseStaffSessionCookie(request.headers.cookie); if (!token) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const body = await readJsonBody<{ days?: number }>(request); if (body.days !== 7 && body.days !== 14) throw new StaffAuthError("INVALID_REMINDER", "Choose a 7 or 14 day reminder."); sendJson(response, 200, { staff: await deferStaffTwoFactorReminder(token, body.days) }); return; }
    if (url.pathname.startsWith("/api/admin/") && !url.pathname.startsWith("/api/admin/auth/")) {
      const staff = await currentStaff(request);
      if (!staff) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
      if (staff.mustChangePassword) throw new StaffAuthError("PASSWORD_CHANGE_REQUIRED", "Change your temporary password before continuing.", 403);
      if (staff.staff.twoFactorRequired && !staff.staff.twoFactorEnabled) throw new StaffAuthError("TWO_FACTOR_REQUIRED", "Two-factor authentication is required for this account before continuing.", 403);
      if (request.method !== "GET" && request.method !== "HEAD") enforceAdminMutationOrigin(request);
      const permission = permissionForAdminRequest(request.method ?? "GET", url.pathname);
      if (!permission) throw new StaffAuthError("ADMIN_ROUTE_POLICY_MISSING", "This Admin action is not available.", 500);
      requirePermission(permission)(staff.context);
      if (["/api/admin/reports", "/api/admin/reports/export"].includes(url.pathname)) {
        const reportPermission = permissionForReport(url.searchParams.get("report"));
        if (reportPermission) requirePermission(reportPermission)(staff.context);
      }
      (response as CorsResponse).staffPermissions = staff.context.permissions;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/staff") { const staff = await currentStaff(request); sendJson(response, 200, { staff: await listStaffAccounts(staff!.context) }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/roles") { sendJson(response, 200, { roles: Object.entries(staffRoleLabels).map(([id, label]) => ({ id, label, permissions: staffRolePermissions[id as keyof typeof staffRolePermissions] })), permissions: staffPermissionRegistry }); return; }
    const staffDetailMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)$/); if (request.method === "GET" && staffDetailMatch) { const staff = await currentStaff(request); sendJson(response, 200, { staff: await getStaffAccount(decodeURIComponent(staffDetailMatch[1]), staff!.context) }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/staff/invitations") { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); if (!staff) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const result = await inviteStaff(await readJsonBody(request), staff.context); try { await sendStaffInvitationEmail(smtpMailTransport, { email: result.staff.email, displayName: result.staff.displayName, token: result.token, expiresAt: result.expiresAt }); } catch { await bestEffortAlert({ type: "STAFF_AUTH_EMAIL_DELIVERY_OUTAGE", severity: "CRITICAL", subsystem: "EMAIL", title: "Staff authentication email delivery failed", summary: "A staff invitation message could not be delivered.", targetRoute: "/admin/settings/health", recommendedAction: "Review email health", diagnosticCode: "STAFF_AUTH_INVITE_SMTP_FAILED" }); throw new StaffAuthError("INVITATION_EMAIL_FAILED", "Invitation was created but email delivery failed.", 502); } sendJson(response, 201, { staff: result.staff, expiresAt: result.expiresAt }); return; }
    const staffResendMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/resend-invitation$/); if (request.method === "POST" && staffResendMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); if (!staff) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); const result = await resendStaffInvitation(decodeURIComponent(staffResendMatch[1]), staff.context); await sendStaffInvitationEmail(smtpMailTransport, { email: result.staff.email, displayName: result.staff.displayName, token: result.token, expiresAt: result.expiresAt }); sendJson(response, 200, { staff: result.staff, expiresAt: result.expiresAt }); return; }
    const staffRevokeMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/revoke-invitation$/); if (request.method === "POST" && staffRevokeMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); if (!staff) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); sendJson(response, 200, { staff: await revokeStaffInvitation(decodeURIComponent(staffRevokeMatch[1]), staff.context) }); return; }
    const staffDisableMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/disable$/); if (request.method === "POST" && staffDisableMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); if (!staff) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authentication required.", 401); sendJson(response, 200, { staff: await disableStaffAccount(decodeURIComponent(staffDisableMatch[1]), staff.context) }); return; }
    const staffEnableMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/enable$/); if (request.method === "POST" && staffEnableMatch) { const staff = await currentStaff(request); sendJson(response, 200, { staff: await enableStaffAccount(decodeURIComponent(staffEnableMatch[1]), staff!.context) }); return; }
    const staffAuthorizationMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/authorization$/); if (request.method === "PATCH" && staffAuthorizationMatch) { const staff = await currentStaff(request); const body = await readJsonBody<{ baseRole: Parameters<typeof updateStaffAuthorizationProfile>[1]["baseRole"]; grantedPermissions: Parameters<typeof updateStaffAuthorizationProfile>[1]["grantedPermissions"]; revokedPermissions: Parameters<typeof updateStaffAuthorizationProfile>[1]["revokedPermissions"]; confirmHighRisk?: boolean }>(request); if (!body.confirmHighRisk && [...body.grantedPermissions, ...body.revokedPermissions].some((permission) => staffPermissionRegistry.find((item) => item.id === permission)?.risk === "HIGH_RISK")) throw new StaffAuthError("HIGH_RISK_CONFIRMATION_REQUIRED", "Confirm high-risk permission changes before saving.", 409); sendJson(response, 200, { staff: await updateStaffAuthorizationProfile(decodeURIComponent(staffAuthorizationMatch[1]), body, staff!.context) }); return; }
    const staffSessionsMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/revoke-sessions$/); if (request.method === "POST" && staffSessionsMatch) { const staff = await currentStaff(request); sendJson(response, 200, { staff: await revokeAllStaffSessions(decodeURIComponent(staffSessionsMatch[1]), staff!.context) }); return; }
    const staffResetMatch = url.pathname.match(/^\/api\/admin\/staff\/([^/]+)\/send-password-reset$/); if (request.method === "POST" && staffResetMatch) { const staff = await currentStaff(request); const reset = await createStaffPasswordReset(decodeURIComponent(staffResetMatch[1]), staff!.context); await sendStaffPasswordResetEmail(smtpMailTransport, { email: reset.staff.email, displayName: reset.staff.displayName, token: reset.token, expiresAt: reset.expiresAt }); sendJson(response, 200, { staff: reset.staff, sent: true }); return; }
    if (request.method === "POST" && url.pathname === "/api/analytics/events") { enforceAccountMutationOrigin(request); if (request.headers["x-tekcentral-analytics-test"] === "exclude" || /bot|crawler|spider|headless/i.test(request.headers["user-agent"] ?? "")) { sendJson(response, 202, { accepted: false, excluded: true }); return; } const body = JSON.parse(await readBody(request, 4_000)) as BrowserAnalyticsInput; sendJson(response, 202, await recordBrowserAnalytics(analyticsSession(request, response), Boolean(await currentCustomer(request)), body)); return; }
    if (url.pathname.startsWith("/api/cart") || url.pathname.startsWith("/api/zeus/cart")) response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET" && url.pathname === "/api/cart") { sendJson(response, 200, await getCart(await currentCartOwner(request, response))); return; }
    if (request.method === "PUT" && url.pathname === "/api/cart") { enforceAccountMutationOrigin(request); const body = JSON.parse(await readBody(request, 16_000)) as { lines?: { productId: string; quantity: number }[] }; if (!Array.isArray(body.lines)) throw new CartError("INVALID_CART", "Cart lines are invalid."); sendJson(response, 200, await replaceCart(await currentCartOwner(request, response), body.lines)); return; }
    if (request.method === "POST" && url.pathname === "/api/zeus/cart/actions") { enforceAccountMutationOrigin(request); const body = JSON.parse(await readBody(request, 8_000)) as { operation?: "ADD" | "UPDATE" | "REMOVE"; productId?: string; quantity?: number }; if (!body.operation || typeof body.productId !== "string" || typeof body.quantity !== "number") throw new CartError("INVALID_CART_ACTION", "Cart action is invalid."); sendJson(response, 201, await createCartAction(await currentCartOwner(request, response), body.operation, body.productId, body.quantity)); return; }
    const cartConfirmation = url.pathname.match(/^\/api\/zeus\/cart\/actions\/([^/]+)\/(confirm|cancel)$/);
    if (request.method === "POST" && cartConfirmation) { enforceAccountMutationOrigin(request); const owner = await currentCartOwner(request, response); sendJson(response, 200, cartConfirmation[2] === "confirm" ? await confirmCartAction(owner, decodeURIComponent(cartConfirmation[1])) : await cancelCartAction(owner, decodeURIComponent(cartConfirmation[1]))); return; }
    if (request.method === "POST" && url.pathname === "/api/zeus/chat") {
      if (!isTrustedCustomerOrigin(request.headers.origin)) throw new ZeusRequestError("UNTRUSTED_ORIGIN", "Request origin is not allowed.", 403);
      response.setHeader("Cache-Control", "no-store");
      const customer = await currentCustomer(request);
      const body = JSON.parse(await readBody(request, 16_000)) as { messages?: { role: string; content: string }[] };
      const messages = Array.isArray(body.messages) ? body.messages.filter((item) => item && typeof item.role === "string" && typeof item.content === "string") : [];
      const reservation = await zeusUsageGuard.reserve({ customerId: customer?.id, ip: getClientIp(request) ?? "unknown", messages });
      const duplicateKey = zeusUsageGuard.duplicateKey(reservation); const cached = zeusUsageGuard.recent(duplicateKey);
      if (cached) { await zeusUsageGuard.complete(reservation, "DUPLICATE_REUSED"); sendJson(response, 200, cached); return; }
      const running = zeusUsageGuard.running(duplicateKey);
      if (running) {
        try { const result = await running; sendJson(response, 200, result); }
        finally { await zeusUsageGuard.complete(reservation, "DUPLICATE_REUSED"); }
        return;
      }
      const consent = await getZeusAccountDataConsent(parseCustomerSessionCookie(request.headers.cookie));
      let telemetry: ZeusRequestTelemetry | undefined;
      const operation = zeusService.chat(body, customer, consent.granted, (value) => { telemetry = value; }, await currentCartOwner(request, response));
      try {
        const result = await zeusUsageGuard.track(duplicateKey, operation);
        await zeusUsageGuard.complete(reservation, result.consentRequired ? "CONSENT_REQUIRED" : "SUCCESS", telemetry);
        if (!result.consentRequired) zeusUsageGuard.cache(duplicateKey, result);
        sendJson(response, 200, result);
      } catch (error) {
        const code = error instanceof ZeusRequestError ? error.code : "UNKNOWN";
        await zeusUsageGuard.complete(reservation, code === "TOOL_LOOP_EXCEEDED" ? "TOOL_LOOP_FAILURE" : code.startsWith("INVALID_") ? "VALIDATION_REJECTED" : "PROVIDER_FAILURE", telemetry, code);
        throw error;
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/contact") {
      if (!isTrustedCustomerOrigin(request.headers.origin)) throw new ContactSubmissionError("UNTRUSTED_ORIGIN", "Request origin is not allowed.", 403);
      response.setHeader("Cache-Control", "no-store");
      const body = JSON.parse(await readBody(request, 32_000)) as Parameters<typeof submitContactEnquiry>[0] & { recaptchaToken?: string };
      await verifyRecaptcha({ token: body.recaptchaToken, action: "contact_submit", remoteIp: getClientIp(request) });
      const result = await submitContactEnquiry(body, {
        mail: smtpMailTransport,
        customer: await currentCustomer(request),
        clientKey: getClientIp(request) ?? "unknown",
        getOrder,
        getProduct: async (productId) => {
          const product = await getBackendProduct(productId);
          return product ? { id: product.productId, name: product.name, sku: product.sku, slug: product.slug } : undefined;
        },
      });
      sendJson(response, 202, result);
      return;
    }
    if (url.pathname.startsWith("/api/account/") && request.method !== "GET") enforceAccountMutationOrigin(request);
    if (request.method === "GET" && url.pathname === "/api/account/zeus-consent") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, await getZeusAccountDataConsent(parseCustomerSessionCookie(request.headers.cookie))); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/zeus-consent") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, await setZeusAccountDataConsent(parseCustomerSessionCookie(request.headers.cookie), true)); return;
    }
    if (request.method === "DELETE" && url.pathname === "/api/account/zeus-consent") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, await setZeusAccountDataConsent(parseCustomerSessionCookie(request.headers.cookie), false)); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/register") {
      await enforceCustomerAuthRateLimit(request, "register", 5);
      const body = await readJsonBody<{ firstName?: string; lastName?: string; email?: string; password?: string; phone?: string; recaptchaToken?: string }>(request);
      await verifyRecaptcha({ token: body.recaptchaToken, action: "account_register", remoteIp: getClientIp(request) });
      const result = await registerCustomer(body);
      response.setHeader("Set-Cookie", customerSessionCookie(result.sessionToken, process.env.NODE_ENV === "production"));
      sendJson(response, 201, { customer: result.customer }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/login") {
      await enforceCustomerAuthRateLimit(request, "login", 8);
      const result = await loginCustomer(await readJsonBody(request));
      response.setHeader("Set-Cookie", customerSessionCookie(result.sessionToken, process.env.NODE_ENV === "production"));
      sendJson(response, 200, { customer: result.customer }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/logout") {
      await logoutCustomer(parseCustomerSessionCookie(request.headers.cookie));
      response.setHeader("Set-Cookie", clearCustomerSessionCookie(process.env.NODE_ENV === "production"));
      sendJson(response, 200, { success: true }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/account/me") {
      const customer = await currentCustomer(request);
      if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, { customer }); return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/account/profile") {
      const customer = await currentCustomer(request);
      if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, { customer: await updateCustomerProfile(customer.id, await readJsonBody(request)) }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/account/addresses") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, { addresses: await listCustomerAddresses(customer.id) }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/addresses") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 201, { address: await createCustomerAddress(customer.id, await readJsonBody(request)) }); return;
    }
    const accountAddressMatch = url.pathname.match(/^\/api\/account\/addresses\/([^/]+)$/);
    const accountDefaultAddressMatch = url.pathname.match(/^\/api\/account\/addresses\/([^/]+)\/default$/);
    if (accountDefaultAddressMatch && request.method === "POST") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, { address: await setDefaultCustomerAddress(customer.id, decodeURIComponent(accountDefaultAddressMatch[1])) }); return;
    }
    if (accountAddressMatch && request.method === "PATCH") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, { address: await updateCustomerAddress(customer.id, decodeURIComponent(accountAddressMatch[1]), await readJsonBody(request)) }); return;
    }
    if (accountAddressMatch && request.method === "DELETE") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      await deleteCustomerAddress(customer.id, decodeURIComponent(accountAddressMatch[1])); sendJson(response, 200, { success: true }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/account/orders") {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      sendJson(response, 200, await listCustomerAccountOrders(customer.id, Number(url.searchParams.get("page") ?? 1), Number(url.searchParams.get("pageSize") ?? 10))); return;
    }
    const accountInvoiceDownloadMatch = url.pathname.match(/^\/api\/account\/orders\/([^/]+)\/invoice$/);
    if (request.method === "GET" && accountInvoiceDownloadMatch) {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      const order = await getOrder(decodeURIComponent(accountInvoiceDownloadMatch[1]));
      if (!order || order.customerAccountId !== customer.id) { sendJson(response, 404, { error: "Invoice not found.", code: "INVOICE_NOT_FOUND" }); return; }
      const download = await getAuthorizedInvoiceDownload(order.id);
      if (download.kind === "SIGNED_URL") { response.writeHead(302, { Location: download.url, "Cache-Control": "private, no-store" }); response.end(); return; }
      response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${download.filename}"`, "Content-Length": download.bytes.length, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }); response.end(download.bytes); return;
    }
    const accountOrderMatch = url.pathname.match(/^\/api\/account\/orders\/([^/]+)$/);
    if (request.method === "GET" && accountOrderMatch) {
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      const order = await getCustomerAccountOrder(customer.id, decodeURIComponent(accountOrderMatch[1])); if (!order) { sendJson(response, 404, { error: "Order not found." }); return; }
      sendJson(response, 200, { order }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/order-claims/request") {
      await enforceCustomerAuthRateLimit(request, "order-claim-request", 5, 15 * 60 * 1_000);
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      await requestGuestOrderClaim({ accountId: customer.id, orderNumber: body.orderNumber ?? "", mail: smtpMailTransport });
      sendJson(response, 200, { message: "If this guest order is eligible, a verification code has been sent to the email used for the order." }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/order-claims/verify") {
      await enforceCustomerAuthRateLimit(request, "order-claim-verify", 8, 15 * 60 * 1_000);
      const customer = await currentCustomer(request); if (!customer) { sendJson(response, 401, { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }); return; }
      const body = await readJsonBody<{ orderNumber?: string; token?: string }>(request);
      const order = await verifyGuestOrderClaim({ accountId: customer.id, orderNumber: body.orderNumber ?? "", token: body.token ?? "" });
      sendJson(response, 200, { orderNumber: order.orderNumber }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/forgot-password") {
      await enforceCustomerAuthRateLimit(request, "forgot-password", 5);
      const body = await readJsonBody<{ email?: string; recaptchaToken?: string }>(request);
      await verifyRecaptcha({ token: body.recaptchaToken, action: "password_reset_request", remoteIp: getClientIp(request) });
      const reset = await requestPasswordReset(body.email ?? "");
      if (reset) void sendCustomerPasswordResetEmail({ email: reset.customer.email, token: reset.token, mail: smtpMailTransport }).then(() => bestEffortResolve({ type: "PASSWORD_RESET_DELIVERY_OUTAGE", subsystem: "ACCOUNTS", diagnosticCode: "PASSWORD_RESET_SMTP_FAILED" })).catch(() => bestEffortAlert({ type: "PASSWORD_RESET_DELIVERY_OUTAGE", severity: "CRITICAL", subsystem: "ACCOUNTS", title: "Password reset email delivery failed", summary: "A customer password reset message could not be delivered through the configured email transport.", targetRoute: "/admin/settings/health", recommendedAction: "Review system health", diagnosticCode: "PASSWORD_RESET_SMTP_FAILED", customerImpactCount: 1 }));
      sendJson(response, 200, { message: "If an account exists for this email, we've sent password reset instructions." }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/account/reset-password") {
      await enforceCustomerAuthRateLimit(request, "reset-password", 8);
      await resetCustomerPassword(await readJsonBody(request));
      response.setHeader("Set-Cookie", clearCustomerSessionCookie(process.env.NODE_ENV === "production"));
      sendJson(response, 200, { success: true }); return;
    }
    const publicAssetMatch = url.pathname.match(/^\/api\/public\/assets\/products\/([^/]+)$/);
    if (request.method === "GET" && publicAssetMatch) {
      const filename = decodeURIComponent(publicAssetMatch[1]); const asset = await readPublicProductImage(filename); const contentType = publicImageContentType(filename);
      if (!asset || !contentType) { sendJson(response, 404, { error: "Image not found." }); return; }
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" }); response.end(asset); return;
    }
    const publicDocumentMatch = url.pathname.match(/^\/api\/public\/assets\/documents\/([^/]+)$/);
    if (request.method === "GET" && publicDocumentMatch) {
      const asset = await readPublicDocument(decodeURIComponent(publicDocumentMatch[1]));
      if (!asset) { sendJson(response, 404, { error: "Document not found." }); return; }
      response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${publicDocumentMatch[1].replace(/[^a-f0-9.-]/gi, "") || "product-document.pdf"}"`, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" }); response.end(asset); return;
    }
    if (request.method === "GET" && url.pathname === "/api/public/catalogue") {
      sendJson(response, 200, { products: await listPublicProducts() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }); response.end(await buildSitemap(await listPublicProducts())); return;
    }
    if (request.method === "GET" && url.pathname === "/robots.txt") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }); response.end(buildRobots()); return;
    }
    if (request.method === "GET" && url.pathname === "/api/public/merchandising/homepage") { sendJson(response, 200, await resolveHomepage(await listPublicProducts())); return; }
    const publicProductMatch = url.pathname.match(/^\/api\/public\/catalogue\/([^/]+)$/);
    if (request.method === "GET" && publicProductMatch) {
      const product = await getPublicProductBySlug(decodeURIComponent(publicProductMatch[1]));
      if (!product) { sendJson(response, 404, { error: "Product not found." }); return; }
      sendJson(response, 200, { product });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/orders") {
      const orders = await listAdminOrders();
      const supplierOrders = await listAdminSupplierOrders();
      sendJson(response, 200, {
        orders,
        paidOrderAlerts: derivePaidOrderAlerts(orders),
        attention: orders.map((order) => ({
          orderNumber: order.orderNumber,
          reasons: [
            ...deriveAttentionReasons(order),
            ...supplierOrders
              .filter((supplierOrder) => supplierOrder.customerOrderNumber === order.orderNumber)
              .flatMap((supplierOrder) => deriveSupplierOrderAttention(supplierOrder)),
          ],
        })),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/paid-acknowledgement$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname
          .replace("/api/admin/orders/", "")
          .replace("/paid-acknowledgement", ""),
      );
      const order = await acknowledgePaidOrder(orderNumber);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    const adminInvoiceDownloadMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/invoice$/);
    if (request.method === "GET" && adminInvoiceDownloadMatch) {
      const order = await getOrder(decodeURIComponent(adminInvoiceDownloadMatch[1]));
      if (!order) { sendJson(response, 404, { error: "Invoice not found." }); return; }
      const download = await getAuthorizedInvoiceDownload(order.id);
      if (download.kind === "SIGNED_URL") { response.writeHead(302, { Location: download.url, "Cache-Control": "private, no-store" }); response.end(); return; }
      response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${download.filename}"`, "Content-Length": download.bytes.length, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }); response.end(download.bytes); return;
    }
    const adminInvoiceResendMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/invoice\/resend$/);
    if (request.method === "POST" && adminInvoiceResendMatch) {
      const order = await getOrder(decodeURIComponent(adminInvoiceResendMatch[1])); if (!order) { sendJson(response, 404, { error: "Invoice not found." }); return; }
      const staff = await currentStaff(request); const body = await readJsonBody<{ requestId?: string; recipient?: string }>(request);
      if (body.recipient !== undefined) throw new InvoiceAccessError("RECIPIENT_INVALID", "Invoice recipient cannot be overridden.", 400);
      sendJson(response, 200, await requestInvoiceResend({ orderId: order.id, requestId: body.requestId ?? "", actor: staff!.context })); return;
    }
    const adminInvoiceRetryMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/invoice\/deliveries\/([^/]+)\/retry$/);
    if (request.method === "POST" && adminInvoiceRetryMatch) {
      const order = await getOrder(decodeURIComponent(adminInvoiceRetryMatch[1])); if (!order) { sendJson(response, 404, { error: "Invoice delivery not found." }); return; }
      const staff = await currentStaff(request);
      sendJson(response, 200, await retryInvoiceDelivery({ orderId: order.id, deliveryId: decodeURIComponent(adminInvoiceRetryMatch[2]), actor: staff!.context })); return;
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/freight-reconciliation$/)) {
      const orderNumber = decodeURIComponent(url.pathname.replace("/api/admin/orders/", "").replace("/freight-reconciliation", ""));
      const body = await readJsonBody<{ actualFreightCost: number; note?: string; toleranceRand?: number }>(request);
      if (!Number.isFinite(body.actualFreightCost) || body.actualFreightCost < 0) throw badRequest("Actual freight cost must be a valid non-negative amount.");
      const order = await updateOrder(orderNumber, (current) => {
        const snapshot = current.shippingQuoteSnapshot;
        if (!snapshot?.estimatedInternalFreightCost) throw badRequest("This order has no estimated internal freight cost to reconcile.");
        const result = calculateFreightReconciliation({ estimatedInternalFreightCost: snapshot.estimatedInternalFreightCost, actualFreightCost: body.actualFreightCost, customerShippingCharge: snapshot.amountCharged, toleranceRand: body.toleranceRand });
        return { ...current, updatedAt: new Date().toISOString(), shippingQuoteSnapshot: { ...snapshot, freightReconciliation: { ...result, reconciledAt: new Date().toISOString(), reconciledBy: "TekCentral Staff", note: body.note?.trim() || undefined } } };
      });
      if (!order) { sendJson(response, 404, { error: "Order not found." }); return; }
      sendJson(response, 200, { order, activity: buildAdminActivity(order), attentionReasons: deriveAttentionReasons(order) });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/admin/orders/")) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").split("/")[0],
      );
      const order = await getOrder(orderNumber);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        commercialDocuments: await getAdminCommercialDocuments(order.id),
        activity: buildAdminActivity(order),
        attentionReasons: [
          ...deriveAttentionReasons(order),
          ...(await listAdminSupplierOrders())
            .filter((supplierOrder) => supplierOrder.customerOrderNumber === order.orderNumber)
            .flatMap((supplierOrder) => deriveSupplierOrderAttention(supplierOrder)),
        ],
      });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/status$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/status", ""),
      );
      const body = await readJsonBody<{ status: OrderStatus; note?: string }>(request);
      const previousOrder = await getOrder(orderNumber);
      const order = await updateAdminOrderStatus(orderNumber, body.status, body.note);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      if (body.status === "CANCELLED") await releaseTekCentralReservationsForCancelledOrder(orderNumber);
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "ORDERS", actionType: "ORDER_STATUS_CHANGED", entityType: "ORDER", entityId: order.orderNumber, entityLabel: order.orderNumber, summary: "Staff changed a customer order status.", before: [{ label: "Order status", value: previousOrder?.status }], after: [{ label: "Order status", value: order.status }], targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}` });
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/notes$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/notes", ""),
      );
      const body = await readJsonBody<{ body: string; authorLabel?: string }>(request);
      const order = await addInternalNote(orderNumber, body.body, (await currentStaff(request))!.context.actorLabel);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/supplier-allocations$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname
          .replace("/api/admin/orders/", "")
          .replace("/supplier-allocations", ""),
      );
      const body = await readJsonBody<{
        orderItemIds: string[];
        supplierCode: SupplierCode;
        status?: SupplierAllocationStatus;
        supplierOrderReference?: string;
        notes?: string;
      }>(request);
      const order = await createSupplierAllocation({ ...body, orderNumber });
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(
        /^\/api\/admin\/orders\/[^/]+\/supplier-allocations\/[^/]+$/,
      )
    ) {
      const match = url.pathname.match(
        /^\/api\/admin\/orders\/([^/]+)\/supplier-allocations\/([^/]+)$/,
      );
      if (!match) {
        sendJson(response, 404, { error: "Endpoint not found." });
        return;
      }
      const body = await readJsonBody<{
        orderItemIds?: string[];
        supplierCode?: SupplierCode;
        status?: SupplierAllocationStatus;
        supplierOrderReference?: string;
        notes?: string;
      }>(request);
      const order = await updateSupplierAllocation({
        ...body,
        orderNumber: decodeURIComponent(match[1]),
        allocationId: decodeURIComponent(match[2]),
      });
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/shipment$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/shipment", ""),
      );
      const body = await readJsonBody<BackendOrder["shipment"]>(request);
      const order = await updateShipment(orderNumber, body ?? {});
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "SHIPPING", actionType: "ORDER_TRACKING_UPDATED", entityType: "ORDER", entityId: order.orderNumber, entityLabel: order.orderNumber, summary: "Staff updated order shipment or tracking information.", after: [{ label: "Tracking recorded", value: Boolean(order.shipment?.trackingNumber) }], targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}` });
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/hold$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/hold", ""),
      );
      const body = await readJsonBody<{ reason: OperationalHoldReason; notes?: string }>(
        request,
      );
      const order = await setOperationalHold({ orderNumber, ...body });
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "ORDERS", actionType: "ORDER_HOLD_APPLIED", entityType: "ORDER", entityId: order.orderNumber, entityLabel: order.orderNumber, summary: "Staff placed an operational hold on an order.", after: [{ label: "Hold active", value: true }, { label: "Reason", value: body.reason }], targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}` });
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/hold\/release$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/hold/release", ""),
      );
      const order = await releaseOperationalHold(orderNumber);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "ORDERS", actionType: "ORDER_HOLD_RELEASED", entityType: "ORDER", entityId: order.orderNumber, entityLabel: order.orderNumber, summary: "Staff released an operational order hold.", before: [{ label: "Hold active", value: true }], after: [{ label: "Hold active", value: false }], targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}` });
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/parcels$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/parcels", ""),
      );
      const body = await readJsonBody<Omit<Parcel, "id" | "orderId" | "createdAt" | "updatedAt">>(
        request,
      );
      const order = await createParcel({ orderNumber, ...body });
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/shipments$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/shipments", ""),
      );
      const body = await readJsonBody<{
        items: ShipmentItem[];
        courier?: string;
        trackingNumber?: string;
        trackingUrl?: string;
        dispatchedAt?: string;
        deliveredAt?: string;
        status?: ShipmentStatus;
      }>(request);
      const order = await createAdminShipment({ orderNumber, ...body });
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        order,
        activity: buildAdminActivity(order),
        attentionReasons: deriveAttentionReasons(order),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/returns") {
      const returns = await listAdminReturns(); sendJson(response, 200, { returns: await Promise.all(returns.map(async (entry) => ({ ...entry, inventory: await getTekCentralReturnInventoryView(entry.returnRequest.id) }))) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/settings/pricing") {
      sendJson(response, 200, await getPricingSettingsView());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/dashboard") { sendJson(response, 200, await getDashboard((url.searchParams.get("period") ?? "LAST_30_DAYS") as PeriodId)); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/analytics") { const requested = Number(url.searchParams.get("days") ?? 30); const days = requested === 1 || requested === 7 ? requested : 30; sendJson(response, 200, await getStorefrontAnalytics(days)); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/analytics/zeus") { const requested = Number(url.searchParams.get("days") ?? 30); const days = requested === 1 || requested === 7 ? requested : 30; sendJson(response, 200, await zeusUsageGuard.analytics(days)); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/access") { const staff = await currentStaff(request); sendJson(response, 200, await getAiAssistantSettingsView(staff!.context)); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/operations") { const staff=await currentStaff(request);response.setHeader("Cache-Control","no-store");sendJson(response,200,await getAdminAiOperations(staff!.context));return; }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/automations") {
      const staff = await currentStaff(request); const ownerOnly = staff!.context.role === "SUPER_ADMIN" ? undefined : staff!.context.actorId;
      const automations=await listAdminAiAutomations({ownerStaffId:ownerOnly});const runs=await listAdminAiAutomationRuns({limit:50});const reviewRuns=await listAdminAiAutomationReviewRuns(ownerOnly,50);
      const reviewQueue=(await Promise.all(reviewRuns.map(async run=>{const action=run.preparedActionId?await getAdminAiAction(run.preparedActionId):undefined;if(!action)return undefined;const automation=automations.find(item=>item.id===run.automationId)??await getAdminAiAutomation(run.automationId);return{run,action:automationActionCard(action),automationName:automation?.name??"Admin AI automation",requestedAutonomy:automation?.requestedAutonomy??"PREPARE"};}))).filter(Boolean);
      const tools=adminAiToolRegistryDto().filter(tool=>staff!.context.permissions.has(tool.requiredPermission));
      response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, { automations, runs, reviewQueue, tools, eventCatalogue:ADMIN_AI_AUTOMATION_EVENT_CATALOGUE }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/automations") {
      enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const actorId = staff!.context.actorId; if (!actorId) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401);
      const body = await readJsonBody<Record<string, unknown>>(request); const ownerStaffId = typeof body.ownerStaffId === "string" ? body.ownerStaffId : actorId;if(ownerStaffId!==actorId&&staff!.context.role!=="SUPER_ADMIN")throw new StaffPermissionDeniedError("admin_ai.manage_automations");
      const automation = await createValidatedAdminAiAutomation({ ownerStaffId, createdByStaffId: actorId, name: String(body.name ?? ""), triggerType: body.triggerType as "SCHEDULE" | "EVENT", triggerConfiguration: body.triggerConfiguration, toolId: String(body.toolId ?? ""), targetType: String(body.targetType ?? ""), targetId: String(body.targetId ?? ""), contextDefinition: body.contextDefinition, requestedAutonomy: body.requestedAutonomy as import("./adminAi/policy.js").AdminAiAutonomy, timezone: typeof body.timezone === "string" ? body.timezone : "Africa/Johannesburg" });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SETTINGS", actionType: "ADMIN_AI_AUTOMATION_CREATED", entityType: "ADMIN_AI_AUTOMATION", entityId: automation.id, entityLabel: automation.name, summary: "Staff created a disabled Admin AI automation definition.", metadata: [{ label: "Owner staff", value: ownerStaffId }, { label: "Tool", value: automation.toolId }], targetRoute: "/admin/settings/ai-assistant" });
      sendJson(response, 201, { automation }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/automations/product-targets") {
      const staff=await currentStaff(request);if(!staff!.context.permissions.has("products.edit"))throw new StaffPermissionDeniedError("products.edit");
      response.setHeader("Cache-Control","no-store");sendJson(response,200,await searchAdminAiAutomationProductTargets({query:url.searchParams.get("q")??"",selectedId:url.searchParams.get("selectedId")??undefined,limit:20}));return;
    }
    const adminAiAutomationMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/automations\/([^/]+)$/);
    if (request.method === "GET" && adminAiAutomationMatch) { const automation = await getAdminAiAutomation(decodeURIComponent(adminAiAutomationMatch[1])); if (!automation) throw Object.assign(new Error("Automation was not found."), { code: "ADMIN_AI_AUTOMATION_NOT_FOUND", status: 404 }); sendJson(response, 200, { automation, runs: await listAdminAiAutomationRuns({ automationId: automation.id, limit: 100 }) }); return; }
    if (request.method === "PATCH" && adminAiAutomationMatch) {
      enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const body = await readJsonBody<Record<string, unknown>>(request); const id = decodeURIComponent(adminAiAutomationMatch[1]);
      const current = await getAdminAiAutomation(id); if (!current) throw Object.assign(new Error("Automation was not found."), { code: "ADMIN_AI_AUTOMATION_NOT_FOUND", status: 404 });
      const automation = await updateValidatedAdminAiAutomation(id, Number(body.revision), { name: String(body.name ?? ""), enabled: current.enabled, triggerType: body.triggerType as "SCHEDULE" | "EVENT", triggerConfiguration: body.triggerConfiguration, toolId: String(body.toolId ?? ""), targetType: String(body.targetType ?? ""), targetId: String(body.targetId ?? ""), contextDefinition: body.contextDefinition, requestedAutonomy: body.requestedAutonomy as import("./adminAi/policy.js").AdminAiAutonomy, timezone: typeof body.timezone === "string" ? body.timezone : "Africa/Johannesburg" });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SETTINGS", actionType: "ADMIN_AI_AUTOMATION_UPDATED", entityType: "ADMIN_AI_AUTOMATION", entityId: automation.id, entityLabel: automation.name, summary: "Staff updated an Admin AI automation definition.", targetRoute: "/admin/settings/ai-assistant" }); sendJson(response, 200, { automation }); return;
    }
    const adminAiAutomationStateMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/automations\/([^/]+)\/(enable|disable)$/);
    if (request.method === "POST" && adminAiAutomationStateMatch) {
      enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const body = await readJsonBody<{ revision?: number }>(request); const enabled = adminAiAutomationStateMatch[2] === "enable"; const automation = await setValidatedAdminAiAutomationEnabled(decodeURIComponent(adminAiAutomationStateMatch[1]), Number(body.revision), enabled);
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SETTINGS", actionType: enabled ? "ADMIN_AI_AUTOMATION_ENABLED" : "ADMIN_AI_AUTOMATION_DISABLED", entityType: "ADMIN_AI_AUTOMATION", entityId: automation.id, entityLabel: automation.name, summary: `Staff ${enabled ? "enabled" : "disabled"} an Admin AI automation.`, targetRoute: "/admin/settings/ai-assistant" }); sendJson(response, 200, { automation }); return;
    }
    const adminAiAutomationRetireMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/automations\/([^/]+)\/retire$/);
    if (request.method === "POST" && adminAiAutomationRetireMatch) {
      enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const actorId=staff!.context.actorId;if(!actorId)throw new StaffAuthError("AUTHENTICATION_REQUIRED","Authenticated staff identity is required.",401);
      const id=decodeURIComponent(adminAiAutomationRetireMatch[1]);const body=await readJsonBody<{revision?:number}>(request);const current=await getAdminAiAutomation(id);if(!current)throw Object.assign(new Error("Automation was not found."),{code:"ADMIN_AI_AUTOMATION_NOT_FOUND",status:404});
      if(current.ownerStaffId!==actorId&&staff!.context.role!=="SUPER_ADMIN")throw new StaffPermissionDeniedError("admin_ai.manage_automations");
      const result=await retireValidatedAdminAiAutomation(id,Number(body.revision),actorId);
      if(result.changed)await recordAdminAuditBestEffort({category:"AUDIT",...staffAuditActor(staff!.context),subsystem:"SETTINGS",actionType:"ADMIN_AI_AUTOMATION_RETIRED",entityType:"ADMIN_AI_AUTOMATION",entityId:result.automation.id,entityLabel:result.automation.name,summary:"Staff deleted an Admin AI automation while retaining its history.",metadata:[{label:"Automation ID",value:result.automation.id},{label:"Tool",value:result.automation.toolId},{label:"Trigger",value:result.automation.triggerType},{label:"Previously enabled",value:current.enabled},{label:"Retired at",value:result.automation.retiredAt??""}],targetRoute:"/admin/settings/ai-assistant/automations"});
      sendJson(response,200,result);return;
    }
    const adminAiAutomationActionMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/automations\/actions\/([^/]+)\/(confirm|cancel)$/);
    if (request.method === "POST" && adminAiAutomationActionMatch) {
      enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const actionId = decodeURIComponent(adminAiAutomationActionMatch[1]); response.setHeader("Cache-Control", "no-store");
      if (adminAiAutomationActionMatch[2] === "cancel") { sendJson(response, 200, { action: await cancelAutomationAdminAiAction({ actionId, staff: staff!.context }) }); return; }
      const action = await getAdminAiAction(actionId); if (!action) throw Object.assign(new Error("Admin AI action is not available."), { code: "ADMIN_AI_ACTION_UNAVAILABLE", status: 404 }); const ownerStaff = await staffAuthorizationContextForAutomation(action.ownerStaffId); if (!ownerStaff) throw Object.assign(new Error("Automation owner is not available."), { code: "ADMIN_AI_AUTOMATION_OWNER_UNAVAILABLE", status: 409 }); sendJson(response, 200, await confirmAutomationAdminAiAction({ actionId, staff: staff!.context, ownerStaff })); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/conversations") {
      const staff = await currentStaff(request); const owner = staff!.context.actorId; if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401);
      const status = url.searchParams.get("status"); const page = Number(url.searchParams.get("page") ?? 1);
      response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, await listAdminAiConversations(owner, { status: status === "ARCHIVED" || status === "ALL" ? status : "ACTIVE", page, pageSize: 20 })); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/conversations") {
      try { const staff = await currentStaff(request); const owner = staff!.context.actorId; if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401); const body = await readJsonBody<{ titleSeed?: string }>(request);
        response.setHeader("Cache-Control", "no-store"); sendJson(response, 201, { conversation: await createAdminAiChatConversation({ ownerStaffId: owner, titleSeed: body.titleSeed ?? "", staff: staff!.context }) }); return;
      } catch (error) { normalizeAdminAiTutorError(error); }
    }
    const adminAiConversationMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/conversations\/([^/]+)$/);
    if (request.method === "GET" && adminAiConversationMatch) {
      const staff = await currentStaff(request); const owner = staff!.context.actorId; if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401); const conversationId = decodeURIComponent(adminAiConversationMatch[1]);
      const conversation = await getAdminAiConversation(owner, conversationId); if (!conversation) throw Object.assign(new Error("Admin AI conversation is not available."), { code: "ADMIN_AI_CONVERSATION_NOT_FOUND", status: 404 });
      response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, { conversation, messages: await listAdminAiMessagesNewestPage(owner, conversationId, { page: Number(url.searchParams.get("page") ?? 1), pageSize: 50 }), attachments: await listAdminAiContextAttachments(owner, conversationId), actions: await listAdminAiActionCards(owner, conversationId), access: await getAdminAiAccess(staff!.context) }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/chat/send") {
      try { const staff = await currentStaff(request); const owner = staff!.context.actorId; if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401); const body = await readJsonBody<{ conversationId?: string; content?: string; idempotencyKey?: string; attachments?: unknown }>(request);
        if (!body.idempotencyKey || body.idempotencyKey.length > 128) throw Object.assign(new Error("Idempotency key is invalid."), { code: "INVALID_ADMIN_AI_MESSAGE", status: 400 });
        response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, await sendAdminAiChat({ ownerStaffId: owner, conversationId: body.conversationId, content: body.content ?? "", idempotencyKey: body.idempotencyKey, attachments: body.attachments, staff: staff!.context, service: createAdminAiService() })); return;
      } catch (error) { normalizeAdminAiTutorError(error); }
    }
    const adminAiRetryMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/conversations\/([^/]+)\/turns\/([^/]+)\/retry$/);
    if (request.method === "POST" && adminAiRetryMatch) {
      try { const staff = await currentStaff(request); const owner = staff!.context.actorId; if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401); sendJson(response, 200, { assistantMessage: await retryAdminAiChat({ ownerStaffId: owner, conversationId: decodeURIComponent(adminAiRetryMatch[1]), turnId: decodeURIComponent(adminAiRetryMatch[2]), staff: staff!.context, service: createAdminAiService() }) }); return; }
      catch (error) { normalizeAdminAiTutorError(error); }
    }
    const adminAiActionMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/actions\/([^/]+)\/(confirm|cancel)$/);
    if (request.method === "POST" && adminAiActionMatch) {
      enforceAccountMutationOrigin(request);
      const staff = await currentStaff(request); const owner = staff!.context.actorId;
      if (!owner) throw new StaffAuthError("AUTHENTICATION_REQUIRED", "Authenticated staff identity is required.", 401);
      const actionId = decodeURIComponent(adminAiActionMatch[1]);
      response.setHeader("Cache-Control", "no-store");
      if (adminAiActionMatch[2] === "cancel") { sendJson(response, 200, { action: await cancelAdminAiAction(owner, actionId) }); return; }
      sendJson(response, 200, await confirmAdminAiAction({ ownerStaffId: owner, actionId, staff: staff!.context, service: createAdminAiService() })); return;
    }
    const adminAiTitleMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/conversations\/([^/]+)\/title$/);
    if (request.method === "PATCH" && adminAiTitleMatch) { const staff = await currentStaff(request); const body = await readJsonBody<{ title?: string }>(request); sendJson(response, 200, { conversation: await renameAdminAiConversation(staff!.context.actorId!, decodeURIComponent(adminAiTitleMatch[1]), body.title ?? "") }); return; }
    const adminAiStatusMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/conversations\/([^/]+)\/status$/);
    if (request.method === "PATCH" && adminAiStatusMatch) { const staff = await currentStaff(request); const body = await readJsonBody<{ status?: string }>(request); if (body.status !== "ACTIVE" && body.status !== "ARCHIVED") throw Object.assign(new Error("Conversation status is invalid."), { code: "INVALID_ADMIN_AI_CHAT_INPUT", status: 400 }); sendJson(response, 200, { conversation: await setAdminAiConversationStatus(staff!.context.actorId!, decodeURIComponent(adminAiStatusMatch[1]), body.status) }); return; }
    if (request.method === "DELETE" && adminAiConversationMatch) { const staff = await currentStaff(request); await deleteAdminAiConversation(staff!.context.actorId!, decodeURIComponent(adminAiConversationMatch[1])); sendJson(response, 200, { deleted: true }); return; }
    const adminAiContextMatch = url.pathname.match(/^\/api\/admin\/admin-ai\/conversations\/([^/]+)\/contexts$/);
    if (request.method === "POST" && adminAiContextMatch) { const staff = await currentStaff(request); const body = parseAdminAiContextRequest({ ...(await readJsonBody<Record<string, unknown>>(request)), intent: "EXPLAIN" }); await buildAdminAiSafeContext(body, staff!.context); sendJson(response, 200, { attachment: await attachAdminAiContext(staff!.context.actorId!, decodeURIComponent(adminAiContextMatch[1]), body.contextType, body.resourceId) }); return; }
    if (request.method === "DELETE" && adminAiContextMatch) { const staff = await currentStaff(request); const contextType = url.searchParams.get("contextType"); const resourceId = url.searchParams.get("resourceId"); const body = parseAdminAiContextRequest({ contextType, resourceId, intent: "EXPLAIN" }); sendJson(response, 200, { detached: await detachAdminAiContext(staff!.context.actorId!, decodeURIComponent(adminAiContextMatch[1]), body.contextType, body.resourceId) }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/admin-ai/tutor") { const staff = await currentStaff(request); response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, await getAdminAiTutorContext(staff!.context)); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/tutor/state") {
      try { const staff = await currentStaff(request); const body = await readJsonBody<{ action?: AdminAiTutorAction; topicId?: string }>(request);
        if (!body.action || !["START", "PROGRESS", "COMPLETE", "SKIP", "RESTART"].includes(body.action)) throw Object.assign(new Error("Tutor action is invalid."), { code: "INVALID_TUTOR_ACTION", status: 400 });
        response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, { preference: await updateAdminAiTutorPreference(staff!.context, { action: body.action, topicId: body.topicId }) }); return;
      } catch (error) { normalizeAdminAiTutorError(error); }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/tutor/explain") {
      try { const staff = await currentStaff(request); const body = await readJsonBody<{ topicId?: string }>(request);
        if (!body.topicId || body.topicId.length > 80) throw Object.assign(new Error("Tutor topic is invalid."), { code: "INVALID_TUTOR_TOPIC", status: 400 });
        const result = await explainAdminAiTutorTopic({ context: staff!.context, topicId: body.topicId, service: createAdminAiService() });
        response.setHeader("Cache-Control", "no-store"); sendJson(response, 200, { explanation: result.text, modelRole: result.requestedModelRole, fallbackUsed: result.fallbackUsed }); return;
      } catch (error) { normalizeAdminAiTutorError(error); }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/admin-ai/context") {
      try {
        const staff = await currentStaff(request);
        const body = parseAdminAiContextRequest(await readJsonBody<unknown>(request));
        const { context: safeContext, result } = await generateContextualAdminAi({ request: body, context: staff!.context, service: createAdminAiService() });
        response.setHeader("Cache-Control", "no-store");
        sendJson(response, 200, {
          response: result.text,
          context: { type: safeContext.contextType, resourceId: safeContext.resourceId, title: safeContext.title, provenance: safeContext.provenance },
          modelRole: result.requestedModelRole,
          fallbackUsed: result.fallbackUsed,
          usage: result.usage,
        });
        return;
      } catch (error) { normalizeAdminAiTutorError(error); }
    }
    if (request.method === "GET" && url.pathname === "/api/admin/merchandising") { sendJson(response, 200, await getAdminMerchandising(await listPublicProducts())); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/contact") { sendJson(response, 200, await listAdminContactConversations({ search: url.searchParams.get("search") ?? undefined, department: url.searchParams.get("department") ?? undefined, delivery: url.searchParams.get("delivery") ?? undefined, status: url.searchParams.get("status") ?? undefined, sort: url.searchParams.get("sort") ?? undefined, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20) })); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/contact/customers") { sendJson(response, 200, await searchContactCustomers(url.searchParams.get("search") ?? "")); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/contact/new") { enforceAccountMutationOrigin(request); const body = await readJsonBody<Parameters<typeof createAdminContactMessage>[0]>(request); const staff = await currentStaff(request); sendJson(response, 201, await createAdminContactMessage(body, { auditActor: staffAuditActor(staff!.context) })); return; }
    const contactConversationMatch = url.pathname.match(/^\/api\/admin\/contact\/([^/]+)$/);
    if (request.method === "GET" && contactConversationMatch) { sendJson(response, 200, await getAdminContactConversation(decodeURIComponent(contactConversationMatch[1]), url.searchParams.get("viewed") === "true")); return; }
    const contactReplyMatch = url.pathname.match(/^\/api\/admin\/contact\/([^/]+)\/reply$/);
    if (request.method === "POST" && contactReplyMatch) { enforceAccountMutationOrigin(request); const body = await readJsonBody<Parameters<typeof replyToContactConversation>[1]>(request); const staff = await currentStaff(request); sendJson(response, 200, await replyToContactConversation(decodeURIComponent(contactReplyMatch[1]), body, { auditActor: staffAuditActor(staff!.context) })); return; }
    const contactRetryMatch = url.pathname.match(/^\/api\/admin\/contact\/([^/]+)\/messages\/([^/]+)\/retry$/);
    if (request.method === "POST" && contactRetryMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); sendJson(response, 200, await retryContactMessage(decodeURIComponent(contactRetryMatch[1]), decodeURIComponent(contactRetryMatch[2]), { auditActor: staffAuditActor(staff!.context) })); return; }
    if (request.method === "PUT" && url.pathname === "/api/admin/merchandising/sections") { enforceAccountMutationOrigin(request); const body = JSON.parse(await readBody(request, 32_000)) as HomepageSection; const saved = await saveHomepageSection(body, await listPublicProducts()); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "MERCHANDISING", actionType: "HOMEPAGE_SECTION_UPDATED", entityType: "HOMEPAGE_SECTION", entityId: saved.id, entityLabel: saved.title, summary: "Staff updated a homepage merchandising section.", after: [{ label: "Enabled", value: saved.enabled }, { label: "Product count", value: saved.productIds.length }, { label: "Order", value: saved.order }], targetRoute: "/admin/merchandising" }); sendJson(response, 200, saved); return; }
    if (request.method === "PUT" && url.pathname === "/api/admin/merchandising/promotions") { enforceAccountMutationOrigin(request); const body = JSON.parse(await readBody(request, 32_000)) as Omit<Promotion,"createdAt"|"updatedAt">; const saved = await savePromotion(body, await listPublicProducts()); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "MERCHANDISING", actionType: "PROMOTION_UPDATED", entityType: "PROMOTION", entityId: saved.id, entityLabel: saved.name, summary: "Staff created or updated a storefront promotion.", after: [{ label: "Enabled", value: saved.enabled }, { label: "Product count", value: saved.products.length }], targetRoute: "/admin/merchandising" }); sendJson(response, 200, saved); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/merchandising/products") { const search=(url.searchParams.get("search")??"").trim().toLowerCase();const products=(await listPublicProducts()).filter((item)=>!search||`${item.name} ${item.sku??""} ${item.brand}`.toLowerCase().includes(search)).slice(0,25).map((item)=>({id:item.id,name:item.name,sku:item.sku,image:item.images[0],price:item.price,regularPrice:item.regularPrice,availability:item.availability,publicationState:"PUBLISHED"}));sendJson(response,200,{products});return; }
    if (request.method === "GET" && url.pathname === "/api/admin/customers") { sendJson(response, 200, await listAdminCustomers({ search: url.searchParams.get("search") ?? undefined, sort: (url.searchParams.get("sort") ?? "NEWEST") as CustomerSort, filter: (url.searchParams.get("filter") ?? "ALL") as CustomerFilter, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 15) })); return; }
    const adminCustomerMatch = url.pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
    if (request.method === "GET" && adminCustomerMatch) { sendJson(response, 200, await getAdminCustomer(decodeURIComponent(adminCustomerMatch[1]), { ordersPage: Number(url.searchParams.get("ordersPage") ?? 1), returnsPage: Number(url.searchParams.get("returnsPage") ?? 1), supportPage: Number(url.searchParams.get("supportPage") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 15) })); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/reports/definitions") { sendJson(response, 200, { reports: reportDefinitions }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/reports") {
      const report = (url.searchParams.get("report") ?? "sales") as ReportId;
      if (!reportDefinitions.some((item) => item.id === report)) { sendJson(response, 400, { error: "Unsupported report." }); return; }
      sendJson(response, 200, await buildReport({ report, period: (url.searchParams.get("period") ?? "LAST_30_DAYS") as PeriodId, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20), status: url.searchParams.get("status") ?? undefined, supplier: url.searchParams.get("supplier") ?? undefined, product: url.searchParams.get("product") ?? undefined, costBasisStatus: url.searchParams.get("costBasisStatus") ?? undefined, gateway: url.searchParams.get("gateway") ?? undefined, classification: url.searchParams.get("classification") ?? undefined })); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/reports/export") {
      const report = (url.searchParams.get("report") ?? "sales") as ReportId; const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
      if (!reportDefinitions.some((item) => item.id === report)) { sendJson(response, 400, { error: "Unsupported report." }); return; }
      const result = await buildReport({ report, period: (url.searchParams.get("period") ?? "LAST_30_DAYS") as PeriodId, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, status: url.searchParams.get("status") ?? undefined, supplier: url.searchParams.get("supplier") ?? undefined, product: url.searchParams.get("product") ?? undefined, costBasisStatus: url.searchParams.get("costBasisStatus") ?? undefined, gateway: url.searchParams.get("gateway") ?? undefined, classification: url.searchParams.get("classification") ?? undefined, all: true });
      sendDownload(response, format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8", reportFilename(report, result.range, format), format === "xlsx" ? reportXlsx(result) : reportCsv(result)); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/payments") { sendJson(response, 200, await getPaymentSettings()); return; }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/payments/payfast") { const body = await readJsonBody<Parameters<typeof updatePayfastSettings>[0]>(request); const settings = await updatePayfastSettings(body); const gateway = settings.gateways.find((item) => item.provider === "PAYFAST"); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "PAYMENTS", actionType: "PAYMENT_CONFIGURATION_UPDATED", entityType: "PAYMENT_GATEWAY", entityId: "PAYFAST", entityLabel: "PayFast", summary: "Staff updated the payment gateway configuration state.", before: [{ label: "Revision", value: body.revision }], after: [{ label: "Revision", value: settings.revision }, { label: "Mode", value: gateway?.mode }, { label: "Enabled", value: gateway?.enabled }], targetRoute: "/admin/settings/payments" }); sendJson(response, 200, settings); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/settings/payments/payfast/test") { sendJson(response, 200, await testPayfastConfiguration()); return; }
    if (request.method === "GET" && url.pathname === "/api/payments/gateways") { const settings = await getPaymentSettings(); sendJson(response, 200, { gateways: settings.gateways.filter((gateway) => gateway.enabled && gateway.implementation.includes("CHECKOUT_AVAILABLE")).map((gateway) => ({ provider: gateway.provider, displayName: gateway.displayName, mode: gateway.mode, capabilities: gateway.capabilities })) }); return; }
    const frameworkSettingsMatch = url.pathname.match(/^\/api\/admin\/settings\/(general|commerce|products|suppliers|integrations|users-security|system)(\/history)?$/);
    if (request.method === "GET" && url.pathname === "/api/admin/settings/ai-assistant") {
      const staff = await currentStaff(request);
      sendJson(response, 200, await getAiAssistantSettingsView(staff!.context));
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/ai-assistant") {
      const staff = await currentStaff(request);
      const body = await readJsonBody<{ revision: number; zeusEnabled: boolean; adminAiEnabled: boolean; confirmHighRisk?: boolean }>(request);
      const before = await getAiAssistantSettingsView(staff!.context);
      await updateAiAssistantSettings(body, staff!.context.actorLabel);
      const after = await getAiAssistantSettingsView(staff!.context);
      const changed = [{ key: "zeusEnabled", label: "Zeus", previous: before.zeus.globalEnabled, next: after.zeus.globalEnabled }, { key: "adminAiEnabled", label: "Admin AI", previous: before.adminAi.globalEnabled, next: after.adminAi.globalEnabled }].filter((item) => item.previous !== item.next);
      for (const item of changed) await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SETTINGS", actionType: "AI_MASTER_SWITCH_CHANGED", entityType: "SETTING", entityId: item.key, entityLabel: item.label, summary: `Staff ${item.next ? "enabled" : "disabled"} the ${item.label} global master switch.`, before: [{ label: "Enabled", value: item.previous }], after: [{ label: "Enabled", value: item.next }], targetRoute: "/admin/settings/ai-assistant", idempotencyKey: `ai-switch:${item.key}:${after.revision}` });
      sendJson(response, 200, after);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/ai-assistant/policy") {
      const actor = (await currentStaff(request))!.context; const targetId = url.searchParams.get("staffId") || actor.actorId!; const target = await getStaffAccount(targetId, actor); const targetContext = createStaffAuthorizationContext({ actorId: target.id, actorLabel: target.displayName, profile: { baseRole: target.baseRole as never, grantedPermissions: target.grantedPermissions as never, revokedPermissions: target.revokedPermissions as never } }); const tools = adminAiToolRegistryDto(); const bundle = await getAdminAiPolicyBundle(target.id, tools); const effective = await Promise.all(tools.map((tool) => evaluateAdminAiToolPolicy({ staff: targetContext, tool, requestedBehavior: "PREPARE", preparedActionsLastHour: 0, executionsLastHour: 0 }))); sendJson(response, 200, { ...bundle, effective, target: { id: target.id, displayName: target.displayName, email: target.email, role: target.baseRole }, staffOptions: (await listStaffAccounts(actor)).map((item) => ({ id: item.id, displayName: item.displayName, email: item.email, role: item.baseRole })) }); return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/ai-assistant/policy/platform") {
      const actor = (await currentStaff(request))!.context; const body = await readJsonBody<{ revision?: number; policy?: unknown; confirmHighRisk?: boolean }>(request); if (body.confirmHighRisk !== true) throw Object.assign(new Error("Explicit confirmation is required."), { code: "CONFIRMATION_REQUIRED", status: 400 }); const tools = adminAiToolRegistryDto(); const before = await getAdminAiPolicyBundle(actor.actorId!, tools); const saved = await savePlatformAdminAiPolicy(Number(body.revision), body.policy, actor.actorLabel, tools); if (saved.changed) await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(actor), subsystem: "SETTINGS", actionType: "ADMIN_AI_PLATFORM_POLICY_CHANGED", entityType: "SETTING", entityId: "admin-ai-platform-policy", entityLabel: "Admin AI platform policy", summary: "Staff updated the server-authoritative Admin AI platform policy.", before: [{ label: "Risk ceiling", value: before.platform.policy.maxRisk }, { label: "Tool policies", value: JSON.stringify(before.platform.policy.tools) }], after: [{ label: "Risk ceiling", value: saved.policy.maxRisk }, { label: "Tool policies", value: JSON.stringify(saved.policy.tools) }], targetRoute: "/admin/settings/ai-assistant", idempotencyKey: `admin-ai-platform-policy:${saved.revision}` }); sendJson(response, 200, saved); return;
    }
    const staffAiPolicyMatch = url.pathname.match(/^\/api\/admin\/settings\/ai-assistant\/policy\/staff\/([^/]+)$/);
    if (request.method === "PATCH" && staffAiPolicyMatch) {
      const actor = (await currentStaff(request))!.context; const target = await getStaffAccount(decodeURIComponent(staffAiPolicyMatch[1]), actor); const body = await readJsonBody<{ revision?: number; policy?: unknown; confirmHighRisk?: boolean; traceId?: string }>(request); const traceId = typeof body.traceId === "string" && /^[0-9a-f-]{36}$/i.test(body.traceId) ? body.traceId : undefined; const safePolicy = body.policy && typeof body.policy === "object" ? body.policy as { maxRisk?: unknown; tools?: Record<string,{enabled?:unknown;autonomy?:unknown}> } : undefined; if (process.env.NODE_ENV !== "production") console.info("Admin AI staff policy route entered", { traceId, actorId: actor.actorId, targetStaffId: target.id, permission: "settings.zeus", authorization: "ALLOWED", expectedRevision: body.revision, maxRisk: safePolicy?.maxRisk, tools: Object.fromEntries(Object.entries(safePolicy?.tools ?? {}).map(([id, item]) => [id, { enabled: item?.enabled, autonomy: item?.autonomy }])) }); if (body.confirmHighRisk !== true) throw Object.assign(new Error("Explicit confirmation is required."), { code: "CONFIRMATION_REQUIRED", status: 400 }); const tools = adminAiToolRegistryDto(); const before = await getAdminAiPolicyBundle(target.id, tools); const saved = await saveStaffAdminAiPolicy(target.id, Number(body.revision), body.policy, actor.actorLabel, tools); if (process.env.NODE_ENV !== "production") console.info("Admin AI staff policy repository completed", { traceId, targetStaffId: target.id, previousRevision: before.staff.revision, responseRevision: saved.revision, changed: saved.changed, normalizedMaxRisk: saved.policy.maxRisk, normalizedTools: saved.policy.tools }); const audit = saved.changed ? await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(actor), subsystem: "SETTINGS", actionType: "ADMIN_AI_STAFF_POLICY_CHANGED", entityType: "STAFF_ACCOUNT", entityId: target.id, entityLabel: target.displayName, summary: "Staff updated a staff member's Admin AI autonomy policy.", before: [{ label: "Risk ceiling", value: before.staff.policy.maxRisk }, { label: "Tool policies", value: JSON.stringify(before.staff.policy.tools) }], after: [{ label: "Risk ceiling", value: saved.policy.maxRisk }, { label: "Tool policies", value: JSON.stringify(saved.policy.tools) }], metadata: [{ label: "Target staff", value: target.id }], targetRoute: "/admin/settings/ai-assistant", idempotencyKey: `admin-ai-staff-policy:${target.id}:${saved.revision}` }) : undefined; if (process.env.NODE_ENV !== "production") { const persisted = await getAdminAiPolicyBundle(target.id, tools); console.info("Admin AI staff policy persistence verified", { traceId, targetStaffId: target.id, persistedRevision: persisted.staff.revision, persistedMaxRisk: persisted.staff.policy.maxRisk, persistedTools: persisted.staff.policy.tools, auditRecorded: saved.changed ? Boolean(audit) : false }); console.info("Admin AI staff policy response sent", { traceId, status: 200, revision: saved.revision, changed: saved.changed }); } sendJson(response, 200, saved); return;
    }
    if (frameworkSettingsMatch && request.method === "GET") {
      const domain = frameworkSettingsMatch[1] as SettingsDomain;
      if (frameworkSettingsMatch[2]) sendJson(response, 200, await getSettingsHistory(domain));
      else {
        const settings = await getSettingsDomain(domain);
        sendJson(response, 200, domain === "suppliers" ? { ...settings, suppliers: Object.values(supplierRegistry).map((supplier) => ({ code: supplier.id, displayName: supplier.displayName, enabled: supplier.enabled, supportedOrderModes: supplier.supportedOrderModes, capabilities: supplier.capabilities, configurationSource: supplier.configurationSource })) } : settings);
      }
      return;
    }
    if (frameworkSettingsMatch && request.method === "PATCH" && !frameworkSettingsMatch[2]) {
      const domain = frameworkSettingsMatch[1] as SettingsDomain;
      const body = await readJsonBody<{ revision: number; changes: Record<string, unknown>; confirmHighRisk?: boolean }>(request);
      const staff = await currentStaff(request);
      const syntechProcurementBefore = domain === "suppliers" && Object.hasOwn(body.changes, "syntechApiProcurementEnabled")
        ? await getSyntechApiProcurementControl()
        : undefined;
      const settings = await patchSettingsDomain(domain, body, staff!.context.actorLabel);
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SETTINGS", actionType: "SETTINGS_DOMAIN_UPDATED", entityType: "SETTINGS_DOMAIN", entityId: domain, entityLabel: `${domain} settings`, summary: "Staff updated an Admin settings domain.", before: [{ label: "Revision", value: body.revision }], after: [{ label: "Revision", value: settings.revision }], metadata: [{ label: "Changed fields", value: Object.keys(body.changes).length }], targetRoute: `/admin/settings/${domain}` });
      if (syntechProcurementBefore) {
        const after = await getSyntechApiProcurementControl();
        if (syntechProcurementBefore.operational.enabled !== after.operational.enabled) await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SUPPLIERS", actionType: "SYNTECH_API_PROCUREMENT_SWITCH_CHANGED", entityType: "SUPPLIER", entityId: "SYNTECH", entityLabel: "Syntech Distribution", summary: `Staff ${after.operational.enabled ? "enabled" : "disabled"} Syntech API procurement operations.`, before: [{ label: "Operationally enabled", value: syntechProcurementBefore.operational.enabled }], after: [{ label: "Operationally enabled", value: after.operational.enabled }, { label: "Effective", value: after.effectiveEnabled }], targetRoute: "/admin/suppliers/syntech/overview", idempotencyKey: `syntech-api-procurement:${after.operational.revision}` });
      }
      sendJson(response, 200, settings);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/system-health") {
      sendJson(response, 200, await getSystemHealth());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/alerts/summary") { sendJson(response, 200, await operationalAlertSummary()); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/audit") { sendJson(response, 200, await listAdminAudit({ search: url.searchParams.get("search") ?? undefined, period: url.searchParams.get("period") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, actorType: url.searchParams.get("actorType") ?? undefined, subsystem: url.searchParams.get("subsystem") ?? undefined, actionType: url.searchParams.get("actionType") ?? undefined, entityType: url.searchParams.get("entityType") ?? undefined, category: url.searchParams.get("category") ?? undefined, sort: url.searchParams.get("sort") ?? undefined, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20) })); return; }
    const auditDetailMatch = url.pathname.match(/^\/api\/admin\/audit\/([^/]+)$/);
    if (request.method === "GET" && auditDetailMatch) { const record = await getAdminAuditRecord(decodeURIComponent(auditDetailMatch[1])); if (!record) { sendJson(response, 404, { error: "Audit record not found." }); return; } sendJson(response, 200, { record }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/alerts") { sendJson(response, 200, { alerts: await listOperationalAlerts({ severity: url.searchParams.get("severity") ?? undefined, status: url.searchParams.get("status") ?? undefined, subsystem: url.searchParams.get("subsystem") ?? undefined }) }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/operational-events") { sendJson(response, 200, { events: await listOperationalEvents(Number(url.searchParams.get("limit") ?? 100)) }); return; }
    const alertDetailMatch = url.pathname.match(/^\/api\/admin\/alerts\/([^/]+)$/);
    if (request.method === "GET" && alertDetailMatch) { const result = await getOperationalAlert(decodeURIComponent(alertDetailMatch[1])); if (!result) { sendJson(response, 404, { error: "Operational alert not found." }); return; } sendJson(response, 200, result); return; }
    const alertAcknowledgeMatch = url.pathname.match(/^\/api\/admin\/alerts\/([^/]+)\/acknowledge$/);
    if (request.method === "POST" && alertAcknowledgeMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const alert = await acknowledgeAlert(decodeURIComponent(alertAcknowledgeMatch[1]), staffAuditActor(staff!.context)); if (!alert) { sendJson(response, 404, { error: "Operational alert not found." }); return; } sendJson(response, 200, { alert }); return; }
    const alertResolveMatch = url.pathname.match(/^\/api\/admin\/alerts\/([^/]+)\/resolve$/);
    if (request.method === "POST" && alertResolveMatch) { enforceAccountMutationOrigin(request); const staff = await currentStaff(request); const alert = await resolveAlert(decodeURIComponent(alertResolveMatch[1]), staffAuditActor(staff!.context)); if (!alert) { sendJson(response, 404, { error: "Operational alert not found." }); return; } sendJson(response, 200, { alert }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/integrations") { sendJson(response, 200, await getIntegrationsAdminView()); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/integrations/history") { sendJson(response, 200, { history: await getIntegrationHistory() }); return; }
    const integrationTestMatch = url.pathname.match(/^\/api\/admin\/integrations\/(CJ|SCOOP|SYNTECH|SMTP|FX)\/test$/);
    if (request.method === "POST" && integrationTestMatch) { sendJson(response, 200, { result: await testIntegration(integrationTestMatch[1] as IntegrationId) }); return; }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/pricing") {
      const body = await readJsonBody<{ pricing: PricingSettings; revision: number; confirmHighRisk: boolean }>(request);
      const settings = await patchPricingSettings(body.pricing, body); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "SETTINGS", actionType: "PRICING_SETTINGS_UPDATED", entityType: "SETTINGS_DOMAIN", entityId: "pricing", entityLabel: "Pricing settings", summary: "Staff updated pricing policy settings.", before: [{ label: "Revision", value: body.revision }], after: [{ label: "Revision", value: settings.revision }], targetRoute: "/admin/settings/pricing" }); sendJson(response, 200, settings);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/fx") {
      sendJson(response, 200, await getFxRate(url.searchParams.get("sourceCurrency") ?? "USD", url.searchParams.get("targetCurrency") ?? "ZAR"));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/settings/fx/refresh") {
      const body = await readJsonBody<{ sourceCurrency: string; targetCurrency: string }>(request);
      const quote = await refreshFxRate(body.sourceCurrency, body.targetCurrency);
      const reconciliation = body.targetCurrency.toUpperCase() === "ZAR" ? await reconcileForeignCurrencyPricingImpact(quote) : { evaluated: 0, generated: 0, blocked: 0, notifications: 0 };
      sendJson(response, 200, { quote, status: "FRESH", freshnessHours: (await getBusinessSettings()).pricing.fxStaleAfterHours, reconciliation });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/pricing/fx-impact") {
      sendJson(response, 200, await getFxImpactDashboard());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/pricing/fx-impact/generate") {
      const body = await readJsonBody<{ impactIds: string[]; sourceCurrency?: string; targetCurrency?: string }>(request);
      const current = await getFxRate(body.sourceCurrency ?? "USD", body.targetCurrency ?? "ZAR");
      if (current.status !== "FRESH" || !current.quote) throw badRequest("A fresh FX quote is required before generating proposals.");
      sendJson(response, 200, { reconciliation: await reconcileForeignCurrencyPricingImpact(current.quote, { forceProposalIds: body.impactIds }) });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/pricing/fx/reconciliation") {
      sendJson(response, 200, await getFxPricingAttention());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/pricing/fx/reconcile") {
      sendJson(response, 200, { run: await runFxPricingReconciliation({ trigger: "MANUAL" }), attention: await getFxPricingAttention() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/shipping") {
      sendJson(response, 200, await getShippingSettingsView());
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/shipping") {
      const body = await readJsonBody<{ shipping: ShippingSettings; revision: number; confirmHighRisk: boolean }>(request);
      const settings = await patchShippingSettings(body.shipping, body); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "SHIPPING", actionType: "SHIPPING_SETTINGS_UPDATED", entityType: "SETTINGS_DOMAIN", entityId: "shipping", entityLabel: "Shipping settings", summary: "Staff updated shipping policy or rate settings.", before: [{ label: "Revision", value: body.revision }], after: [{ label: "Revision", value: settings.revision }], targetRoute: "/admin/settings/shipping" }); sendJson(response, 200, settings);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/notifications") { sendJson(response, 200, { ...(await getEffectiveNotificationSettings()), lastTest: await getSettingsNotificationTestStatus() }); return; }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/notifications") { const body = await readJsonBody<{ notifications: NotificationSettings; revision: number; confirmHighRisk: boolean }>(request); sendJson(response, 200, await updateNotificationSettings(body.notifications, body)); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/settings/notifications/test") { sendJson(response, 200, { notification: await sendSettingsNotificationTest() }); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/automation") { sendJson(response, 200, { ...(await getAutomationSettingsView()), runtime: await getFxPricingAttention() }); return; }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/automation") { const body = await readJsonBody<{ automation: AutomationSettings; revision: number; confirmHighRisk: boolean }>(request); sendJson(response, 200, await patchAutomationSettings(body.automation, body)); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/settings/shipping/test-estimate") {
      const body = await readJsonBody<Parameters<typeof testScoopZoneEstimate>[0]>(request);
      sendJson(response, 200, await testScoopZoneEstimate(body));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/pricing/proposals") {
      const proposals = await listPricingProposals();
      const publicationByProductId = new Map<string, Awaited<ReturnType<typeof getPublicationSummary>>>();
      for (const productId of new Set(proposals.map((proposal) => proposal.productId))) publicationByProductId.set(productId, await getPublicationSummary(productId));
      sendJson(response, 200, { proposals, presentationByProposalId: Object.fromEntries(proposals.map((proposal) => [proposal.id, derivePricingPresentation({ proposal, publication: publicationByProductId.get(proposal.productId) })])) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/pricing/proposals/scoop") {
      const body = await readJsonBody<{ productId: string; supplierSku: string }>(request);
      sendJson(response, 200, { proposal: await generateScoopPricingProposal(body) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/pricing/proposals/cj") {
      const body = await readJsonBody<{ supplierOrderId: string; productId: string }>(request);
      sendJson(response, 200, { proposal: await generateCjPricingProposal(body) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/pricing/proposals/cj-catalogue") {
      const body = await readJsonBody<Parameters<typeof generateCjCataloguePricingProposal>[0]>(request);
      sendJson(response, 200, { proposal: await generateCjCataloguePricingProposal(body) });
      return;
    }
    const productPricingGenerateMatch = url.pathname.match(/^\/api\/admin\/pricing\/products\/([^/]+)\/proposal$/);
    if (request.method === "POST" && productPricingGenerateMatch) {
      const productId = decodeURIComponent(productPricingGenerateMatch[1]);
      sendJson(response, 201, { proposal: await generateCanonicalProductPricingProposal(productId) });
      return;
    }
    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/pricing\/proposals\/[^/]+\/override-preview$/)) {
      const id = decodeURIComponent(url.pathname.split("/")[5]);
      const body = await readJsonBody<{ overridePriceInclVat: number; overrideReason: string; reasonCategory?: import("./pricingProposalRepository.js").PricingOverrideReasonCategory }>(request);
      sendJson(response, 200, { preview: await previewPricingOverride({ proposalId: id, ...body }) });
      return;
    }
    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/pricing\/proposals\/[^/]+\/override$/)) {
      const id = decodeURIComponent(url.pathname.split("/")[5]);
      const body = await readJsonBody<{ overridePriceInclVat: number; overrideReason: string; reasonCategory?: import("./pricingProposalRepository.js").PricingOverrideReasonCategory }>(request);
      sendJson(response, 200, await createPricingOverride({ proposalId: id, ...body }));
      return;
    }
    if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/pricing\/proposals\/[^/]+\/(approve|reject)$/)) {
      const parts = url.pathname.split("/"); const id = decodeURIComponent(parts[5]); const action = parts[6];
      const staff = await currentStaff(request);
      await readJsonBody<Record<string, never>>(request);
      const proposal = await setPricingProposalStatus(id, action === "approve" ? "APPROVED" : "REJECTED", staff!.context.actorLabel);
      if (!proposal) { sendJson(response, 404, { error: "Pricing proposal not found." }); return; }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRICING", actionType: action === "approve" ? "PRICING_PROPOSAL_APPROVED" : "PRICING_PROPOSAL_REJECTED", entityType: "PRICING_PROPOSAL", entityId: proposal.id, entityLabel: proposal.productId, summary: `Staff ${action === "approve" ? "approved" : "rejected"} a pricing proposal.`, before: [{ label: "Status", value: "PENDING_APPROVAL" }], after: [{ label: "Status", value: proposal.status }, { label: "Selling price incl VAT", value: proposal.proposedSellingPriceInclVat }], metadata: [{ label: "Product ID", value: proposal.productId }], targetRoute: `/admin/pricing?proposal=${encodeURIComponent(proposal.id)}` });
      sendJson(response, 200, { proposal });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/returns\/[^/]+\/status$/)
    ) {
      const returnId = decodeURIComponent(
        url.pathname.replace("/api/admin/returns/", "").replace("/status", ""),
      );
      const body = await readJsonBody<{ status: ReturnStatus }>(request);
      const order = await updateAdminReturnStatus(returnId, body.status);
      if (!order) {
        sendJson(response, 404, { error: "Return not found." });
        return;
      }
      sendJson(response, 200, { order, activity: buildAdminActivity(order) });
      return;
    }

    const returnInventoryMatch = url.pathname.match(/^\/api\/admin\/returns\/([^/]+)\/inventory\/(receive|inspect|decide)$/);
    if (request.method === "POST" && returnInventoryMatch) {
      const returnId = decodeURIComponent(returnInventoryMatch[1]); const action = returnInventoryMatch[2];
      const body = await readJsonBody<{ productId: string; quantity?: number; reconciliationId?: string; decision?: import("./types.js").ReturnInventoryDecision; actor?: string; note?: string }>(request);
      const staff = await currentStaff(request); const actor = staff!.context.actorLabel;
      const order = action === "receive" ? await receiveTekCentralReturn({ returnId, productId: body.productId, quantity: Number(body.quantity), actor, note: body.note }) : action === "inspect" ? await startTekCentralReturnInspection({ returnId, productId: body.productId, reconciliationId: body.reconciliationId ?? "", actor }) : await decideTekCentralReturn({ returnId, productId: body.productId, reconciliationId: body.reconciliationId ?? "", decision: body.decision!, actor, note: body.note });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "INVENTORY", actionType: `RETURN_INVENTORY_${action.toUpperCase()}`, entityType: "RETURN", entityId: returnId, entityLabel: returnId, summary: `Staff recorded a return inventory ${action} action.`, after: [{ label: "Product ID", value: body.productId }, { label: "Quantity", value: body.quantity }, { label: "Decision", value: body.decision }], targetRoute: `/admin/returns/${encodeURIComponent(returnId)}` });
      sendJson(response, 200, { order, inventory: await getTekCentralReturnInventoryView(returnId) }); return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/refunds") {
      sendJson(response, 200, { refunds: await listAdminRefunds() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/status") {
      sendJson(response, 200, await getCjConnectionStatus());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/hub") { sendJson(response, 200, await getSupplierHub()); return; }
    const supplierSourcesMatch=url.pathname.match(/^\/api\/admin\/suppliers\/([^/]+)\/sources$/);
    if(request.method==="GET"&&supplierSourcesMatch){const staff=await currentStaff(request);requirePermission("suppliers.read")(staff?.context);const supplierCode=decodeURIComponent(supplierSourcesMatch[1]).toUpperCase() as SupplierCode;if(!supplierHasSourceWorkspace(supplierCode)){sendJson(response,404,{error:"Supplier source workspace not found."});return;}sendJson(response,200,await getSupplierSourceView(supplierCode));return;}
    const supplierSourceAction=url.pathname.match(/^\/api\/admin\/suppliers\/([^/]+)\/sources\/([^/]+)\/(check|sync)$/);
    if(request.method==="POST"&&supplierSourceAction){const staff=await currentStaff(request);requirePermission("suppliers.refresh")(staff?.context);const supplierCode=decodeURIComponent(supplierSourceAction[1]).toUpperCase() as SupplierCode;sendJson(response,200,await runSupplierSourceOperation(supplierCode,decodeURIComponent(supplierSourceAction[2]),supplierSourceAction[3] as "check"|"sync"));return;}
    const supplierSourceState=url.pathname.match(/^\/api\/admin\/suppliers\/([^/]+)\/sources\/([^/]+)\/state$/);
    if(request.method==="PATCH"&&supplierSourceState){const staff=await currentStaff(request);requirePermission("suppliers.manage_config")(staff?.context);const supplierCode=decodeURIComponent(supplierSourceState[1]).toUpperCase() as SupplierCode;const sourceId=decodeURIComponent(supplierSourceState[2]);const current=await getSupplierSource(sourceId);if(!current||current.supplierCode!==supplierCode){sendJson(response,404,{error:"Supplier source not found."});return;}const body=await readJsonBody<{state:"ACTIVE"|"DISABLED"|"ARCHIVED";isPrimary?:boolean;confirmed?:boolean}>(request);sendJson(response,200,{source:await setSupplierSourceState(sourceId,body.state,Boolean(body.isPrimary),staffAuditActor(staff!.context),Boolean(body.confirmed))});return;}
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tvr/products") {
      const [all, mappings, products] = await Promise.all([listTvrCatalogueOffers(), listSupplierProductMappings(), listAdminProducts()]);
      const mappingByOfferId = new Map(mappings.filter((mapping) => mapping.supplierCode === "TVR" && mapping.status !== "SUPERSEDED").map((mapping) => [mapping.supplierOfferId, mapping]));
      const productById = new Map(products.map((product) => [product.id, product]));
      const search = (url.searchParams.get("search") ?? "").trim().toLowerCase(); const classification = url.searchParams.get("classification") ?? ""; const condition = url.searchParams.get("condition") ?? "";
      const filtered = all.filter((offer) => offer.lifecycleStatus === "CURRENT" && (!search || `${offer.supplierSku} ${offer.normalizedSupplierSku} ${offer.description ?? ""}`.toLowerCase().includes(search)) && (!classification || offer.classification === classification) && (!condition || offer.condition === condition)).map((offer) => { const mapping = mappingByOfferId.get(offer.id); const product = mapping ? productById.get(mapping.productId) : undefined; return { ...offer, mapping, canonicalProduct: product ? { id: product.id, name: product.name, sku: product.sku } : undefined }; });
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20))); const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const page = Math.min(totalPages, Math.max(1, Number(url.searchParams.get("page") ?? 1))); const start = (page - 1) * pageSize;
      const paged = await Promise.all(filtered.slice(start, start + pageSize).map(async (offer) => ({ ...offer, onboarding: offer.mapping?.status === "VERIFIED" ? await getProductOnboardingReadiness(offer.mapping.productId).catch(() => undefined) : undefined })));
      sendJson(response, 200, { products: paged, pagination: { page, pageSize, totalItems: filtered.length, totalPages }, status: (await getTvrCatalogueStatus()).metrics }); return;
    }
    const tvrOnboardingMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tvr\/products\/([^/]+)\/onboarding$/);
    if (request.method === "GET" && tvrOnboardingMatch) { try { sendJson(response, 200, await getTvrOnboardingPreview(decodeURIComponent(tvrOnboardingMatch[1]))); } catch (error) { sendJson(response, 404, { error: error instanceof Error ? error.message : "TVR offer not found." }); } return; }
    const tvrMappingMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tvr\/products\/([^/]+)\/mapping$/);
    if (request.method === "POST" && tvrMappingMatch) { const staff = await currentStaff(request); const body = await readJsonBody<{ productId: string; confirmed: boolean }>(request); try { sendJson(response, 201, { mapping: await suggestTvrExistingProductMapping({ offerIdentity: decodeURIComponent(tvrMappingMatch[1]), ...body, actor: staff?.context.actorLabel }) }); } catch (error) { sendJson(response, 409, { error: error instanceof Error ? error.message : "Mapping could not be prepared." }); } return; }
    const tvrCreateMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tvr\/products\/([^/]+)\/create-product$/);
    if (request.method === "POST" && tvrCreateMatch) { const staff = await currentStaff(request); const auditActor = staffAuditActor(staff!.context); const offerIdentity = decodeURIComponent(tvrCreateMatch[1]); const body = await readJsonBody<Omit<Parameters<typeof createProductFromTvrOffer>[0], "offerIdentity" | "actor">>(request); try { const result = await createProductFromTvrOffer({ offerIdentity, ...body, actor: staff?.context.actorLabel }); if (!result.reused) { await recordAdminAuditBestEffort({ category: "AUDIT", ...auditActor, subsystem: "PRODUCTS", actionType: "PRODUCT_CREATED_FROM_SUPPLIER_OFFER", entityType: "PRODUCT", entityId: result.product.id, entityLabel: result.product.name, summary: "Staff created a canonical Product from reviewed TVR evidence.", after: [{ label: "Supplier", value: "TVR" }, { label: "Supplier offer", value: offerIdentity }], targetRoute: `/admin/products?productSetup=${encodeURIComponent(result.product.id)}` }); await recordAdminAuditBestEffort({ category: "AUDIT", ...auditActor, subsystem: "SUPPLIERS", actionType: "SUPPLIER_MAPPING_VERIFIED", entityType: "SUPPLIER_MAPPING", entityId: result.mapping.id ?? `${offerIdentity}:${result.product.id}`, entityLabel: `TVR ${offerIdentity}`, summary: "Staff verified the new Product against its reviewed TVR offer.", after: [{ label: "Status", value: result.mapping.status }, { label: "Product ID", value: result.product.id }], targetRoute: `/admin/suppliers/tvr/products?productSetup=${encodeURIComponent(result.product.id)}` }); } sendJson(response, result.reused ? 200 : 201, result); } catch (error) { sendJson(response, 409, { error: error instanceof Error ? error.message : "Product could not be created." }); } return; }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/mustek/products") {
      const [all, mappings, products] = await Promise.all([listMustekCatalogueOffers(), listSupplierProductMappings(), listAdminProducts()]); const search = (url.searchParams.get("search") ?? "").trim().toLowerCase(); const classification = url.searchParams.get("classification") ?? "";
      const mappingBySku = new Map(mappings.filter((mapping) => mapping.supplierCode === "MUSTEK" && mapping.status !== "SUPERSEDED").map((mapping) => [mapping.supplierSku, mapping]));
      const productById = new Map(products.map((product) => [product.id, product]));
      const filtered = all.filter((offer) => (!search || `${offer.supplierSku} ${offer.description ?? ""} ${offer.brand ?? ""}`.toLowerCase().includes(search)) && (!classification || offer.classification === classification)).map((offer) => { const mapping = mappingBySku.get(offer.supplierSku); const product = mapping ? productById.get(mapping.productId) : undefined; return { ...offer, mapping, canonicalProduct: product ? { id: product.id, name: product.name, sku: product.sku } : undefined }; });
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20))); const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const page = Math.min(totalPages, Math.max(1, Number(url.searchParams.get("page") ?? 1))); const start = (page - 1) * pageSize;
      const paged = await Promise.all(filtered.slice(start, start + pageSize).map(async (offer) => ({ ...offer, onboarding: offer.mapping?.status === "VERIFIED" ? await getProductOnboardingReadiness(offer.mapping.productId).catch(() => undefined) : undefined })));
      sendJson(response, 200, { products: paged, pagination: { page, pageSize, totalItems: filtered.length, totalPages }, status: (await getMustekCatalogueStatus()).metrics }); return;
    }
    const mustekOnboardingMatch = url.pathname.match(/^\/api\/admin\/suppliers\/mustek\/products\/([^/]+)\/onboarding$/);
    if (request.method === "GET" && mustekOnboardingMatch) { try { sendJson(response, 200, await getMustekOnboardingPreview(decodeURIComponent(mustekOnboardingMatch[1]))); } catch (error) { sendJson(response, 404, { error: error instanceof Error ? error.message : "Mustek offer not found." }); } return; }
    const mustekMappingMatch = url.pathname.match(/^\/api\/admin\/suppliers\/mustek\/products\/([^/]+)\/mapping$/);
    if (request.method === "POST" && mustekMappingMatch) { const staff = await currentStaff(request); const body = await readJsonBody<{ productId: string; confirmed: boolean }>(request); try { sendJson(response, 201, { mapping: await suggestMustekExistingProductMapping({ supplierSku: decodeURIComponent(mustekMappingMatch[1]), ...body, actor: staff?.context.actorLabel }) }); } catch (error) { sendJson(response, 409, { error: error instanceof Error ? error.message : "Mapping could not be prepared." }); } return; }
    const mustekCreateMatch = url.pathname.match(/^\/api\/admin\/suppliers\/mustek\/products\/([^/]+)\/create-product$/);
    if (request.method === "POST" && mustekCreateMatch) { const staff = await currentStaff(request); const auditActor = staffAuditActor(staff!.context); const supplierSku = decodeURIComponent(mustekCreateMatch[1]); const body = await readJsonBody<Omit<Parameters<typeof createProductFromMustekOffer>[0], "supplierSku" | "actor">>(request); try { const result = await createProductFromMustekOffer({ supplierSku, ...body, actor: staff?.context.actorLabel }); if (!result.reused) { await recordAdminAuditBestEffort({ category: "AUDIT", ...auditActor, subsystem: "PRODUCTS", actionType: "PRODUCT_CREATED_FROM_SUPPLIER_OFFER", entityType: "PRODUCT", entityId: result.product.id, entityLabel: result.product.name, summary: "Staff created a canonical Product from reviewed Mustek evidence.", after: [{ label: "Supplier", value: "MUSTEK" }, { label: "Supplier SKU", value: supplierSku }], targetRoute: `/admin/products?productSetup=${encodeURIComponent(result.product.id)}` }); await recordAdminAuditBestEffort({ category: "AUDIT", ...auditActor, subsystem: "SUPPLIERS", actionType: "SUPPLIER_MAPPING_VERIFIED", entityType: "SUPPLIER_MAPPING", entityId: result.mapping.id ?? `${supplierSku}:${result.product.id}`, entityLabel: `MUSTEK ${supplierSku}`, summary: "Staff verified the new Product against its reviewed Mustek offer.", after: [{ label: "Status", value: result.mapping.status }, { label: "Product ID", value: result.product.id }], targetRoute: `/admin/suppliers/mustek/products?productSetup=${encodeURIComponent(result.product.id)}` }); } sendJson(response, result.reused ? 200 : 201, result); } catch (error) { sendJson(response, 409, { error: error instanceof Error ? error.message : "Product could not be created." }); } return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/mustek/catalogue/refresh") { const result = await normalizeCurrentMustekCatalogue(); sendJson(response, 200, { summary: { total: result.offers.length, created: result.created, updated: result.updated, unchanged: result.unchanged, unresolvedEvidenceCount: result.unresolvedEvidenceCount } }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/mustek/sources/seed") { const staff=await currentStaff(request); requirePermission("suppliers.manage_config")(staff?.context); sendJson(response, 201, await seedMustekSources(staffAuditActor(staff!.context))); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/mustek/sources") { const staff=await currentStaff(request); requirePermission("suppliers.manage_config")(staff?.context); const body=await readJsonBody<{label:string;purpose:"PRICE_LIST"|"HTML_CATALOGUE"|"MARKETING_ASSET";format:"XLSX"|"HTML"|"IMAGE"|"PDF";sourceUrl:string;state?:"DISABLED"}>(request); const source=await saveSupplierSource({supplierCode:"MUSTEK",label:body.label,purpose:body.purpose,transport:"DOWNLOAD_URL",format:body.format,sourceUrl:body.sourceUrl,state:"DISABLED",priority:100,isPrimary:false,expectedMimeTypes:[],allowedHost:"shop.mustek.co.za",hints:{},syncEnabled:false,revisionMetadata:{}},staffAuditActor(staff!.context));sendJson(response,201,{source});return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tvr/sources/seed") { const staff=await currentStaff(request); requirePermission("suppliers.manage_config")(staff?.context); sendJson(response, 201, await seedTvrSources(staffAuditActor(staff!.context))); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tvr/evidence/normalize") { const staff=await currentStaff(request); requirePermission("suppliers.refresh")(staff?.context); const result=await normalizeCurrentTvrSourceVersion(); sendJson(response,200,{sourceVersionId:result.sourceVersionId,inserted:result.inserted,existing:result.existing,report:summarizeTvrSemanticReport(result.report)});return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tvr/catalogue/refresh") { const staff=await currentStaff(request); requirePermission("suppliers.refresh")(staff?.context); const result=await promoteCurrentTvrCatalogue(); sendJson(response,200,{summary:{total:result.metrics.total,created:result.created,updated:result.updated,unchanged:result.unchanged,noLongerObserved:result.noLongerObserved,metrics:result.metrics}});return; }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tekcentral/offers") {
      const [status, products, proposals, availabilityIndex] = await Promise.all([getTekCentralManualOfferStatus(), listAdminProducts(), listPricingProposals(), buildProductAvailabilityIndex()]);
      const productById = new Map(products.map((product) => [product.id, product]));
      const offers = await Promise.all(status.offers.map(async (offer) => { const product = offer.productId ? productById.get(offer.productId) : undefined; const readiness = await getTekCentralManualProductReadiness(offer.id); const onboarding = product ? await getProductOnboardingReadiness(product.id).catch(() => undefined) : undefined; const proposal = proposals.filter((item) => item.supplierId === "TEKCENTRAL" && item.supplierOfferId === offer.id).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]; return { ...offer, product: product ? { id: product.id, sku: product.sku, name: product.name, brand: product.brand, taxonomyStatus: product.taxonomyStatus } : undefined, readiness: { status: readiness.status, blockers: readiness.blockers, contentStatus: readiness.contentStatus }, onboarding, canonicalAvailability: product ? availabilityIndex.get(product.id) : undefined, pricing: proposal ? { id: proposal.id, status: proposal.status, proposedSellingPriceInclVat: proposal.proposedSellingPriceInclVat } : undefined }; }));
      sendJson(response, 200, { ...status, offers });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tekcentral/products") {
      const query = (url.searchParams.get("search") ?? "").trim().toLowerCase();
      const products = (await listAdminProducts()).filter((product) => !query || `${product.name} ${product.sku} ${product.brand}`.toLowerCase().includes(query)).slice(0, 100).map((product) => ({ id: product.id, sku: product.sku, name: product.name, brand: product.brand }));
      sendJson(response, 200, { products }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tekcentral/offers") {
      const body = await readJsonBody<Parameters<typeof saveTekCentralManualOffer>[0]>(request);
      sendJson(response, 201, { offer: await saveTekCentralManualOffer({ ...body, actor: (await currentStaff(request))!.context.actorLabel }) }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tekcentral/inventory/export") { sendDownload(response, "text/csv; charset=utf-8", "tekcentral-manual-inventory.csv", await exportTekCentralInventoryCsv()); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tekcentral/inventory/import/preview") { const body = await readJsonBody<{ csv: string }>(request); sendJson(response, 200, await previewTekCentralInventoryCsv(body.csv)); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tekcentral/inventory/import/commit") { const body = await readJsonBody<{ csv: string; confirmed: boolean; actor?: string }>(request); if (!body.confirmed) throw badRequest("Explicit import confirmation is required.", "CONFIRMATION_REQUIRED"); sendJson(response, 200, await commitTekCentralInventoryCsv(body.csv, (await currentStaff(request))!.context.actorLabel)); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tekcentral/inventory/lookup") { const match = await lookupTekCentralInventoryIdentifier(url.searchParams.get("identifier") ?? ""); if (!match) { sendJson(response, 404, { error: "No exact manual inventory match found." }); return; } sendJson(response, 200, match); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/tekcentral/replenishments") { sendJson(response, 200, { records: await listTekCentralReplenishments() }); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/tekcentral/replenishments") { const body = await readJsonBody<Parameters<typeof createTekCentralReplenishment>[0]>(request); sendJson(response, 201, { record: await createTekCentralReplenishment({ ...body, actor: (await currentStaff(request))!.context.actorLabel }) }); return; }
    const replenishmentMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tekcentral\/replenishments\/([^/]+)\/(status|receive)$/); if (request.method === "POST" && replenishmentMatch) { const body = await readJsonBody<{ status?: import("./tekcentralInventoryOperations.js").ReplenishmentStatus; reference?: string; quantity?: number; actor?: string }>(request); const actor = (await currentStaff(request))!.context.actorLabel; const record = replenishmentMatch[2] === "receive" ? await receiveTekCentralReplenishment(decodeURIComponent(replenishmentMatch[1]), Number(body.quantity), actor) : await updateTekCentralReplenishment(decodeURIComponent(replenishmentMatch[1]), { status: body.status!, reference: body.reference, actor }); sendJson(response, 200, { record }); return; }
    const tekcentralOfferMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tekcentral\/offers\/([^/]+)$/);
    if (request.method === "PATCH" && tekcentralOfferMatch) {
      const existing = await getTekCentralManualOffer(decodeURIComponent(tekcentralOfferMatch[1]));
      if (!existing) { sendJson(response, 404, { error: "Manual supplier offer not found." }); return; }
      const body = await readJsonBody<Partial<Parameters<typeof saveTekCentralManualOffer>[0]>>(request);
      sendJson(response, 200, { offer: await saveTekCentralManualOffer({ ...existing, ...body, id: existing.id, productId: existing.productId, stockQuantity: existing.onHand, sourceCostExVat: existing.sourceCostExVat, actor: (await currentStaff(request))!.context.actorLabel }) }); return;
    }
    const tekcentralOfferActionMatch = url.pathname.match(/^\/api\/admin\/suppliers\/tekcentral\/offers\/([^/]+)\/(map|create-product|stock-adjustments|cost|history|pricing-proposal|readiness|inventory-settings)$/);
    if (tekcentralOfferActionMatch) {
      const offerId = decodeURIComponent(tekcentralOfferActionMatch[1]); const action = tekcentralOfferActionMatch[2];
      if (request.method === "GET" && action === "history") { sendJson(response, 200, await getTekCentralManualOfferHistory(offerId)); return; }
      if (request.method === "GET" && action === "readiness") { sendJson(response, 200, { readiness: await getTekCentralManualProductReadiness(offerId), forecast: await getTekCentralForecast(offerId) }); return; }
      if (request.method === "PATCH" && action === "inventory-settings") { const body = await readJsonBody<Omit<Parameters<typeof updateTekCentralInventorySettings>[0], "offerId">>(request); sendJson(response, 200, { offer: await updateTekCentralInventorySettings({ offerId, ...body, actor: (await currentStaff(request))!.context.actorLabel }) }); return; }
      if (request.method === "POST" && action === "map") { const body = await readJsonBody<{ productId: string; actor?: string }>(request); sendJson(response, 200, { offer: await mapTekCentralManualOffer({ offerId, ...body, actor: (await currentStaff(request))!.context.actorLabel }) }); return; }
      if (request.method === "POST" && action === "create-product") { const body = await readJsonBody<Omit<Parameters<typeof createProductFromTekCentralManualOffer>[0], "offerId">>(request); sendJson(response, 201, await createProductFromTekCentralManualOffer({ offerId, ...body, actor: (await currentStaff(request))!.context.actorLabel })); return; }
      if (request.method === "POST" && action === "stock-adjustments") { const body = await readJsonBody<Omit<Parameters<typeof adjustTekCentralManualStock>[0], "offerId">>(request); sendJson(response, 201, await adjustTekCentralManualStock({ offerId, ...body, actor: (await currentStaff(request))!.context.actorLabel })); return; }
      if (request.method === "POST" && action === "cost") { const body = await readJsonBody<Omit<Parameters<typeof updateTekCentralManualCost>[0], "offerId">>(request); sendJson(response, 201, await updateTekCentralManualCost({ offerId, ...body, actor: (await currentStaff(request))!.context.actorLabel })); return; }
      if (request.method === "POST" && action === "pricing-proposal") { sendJson(response, 201, { proposal: await generateTekCentralManualPricingProposal({ offerId }) }); return; }
    }
    const supplierOperationsMatch = url.pathname.match(/^\/api\/admin\/suppliers\/([^/]+)\/operations$/i);
    if (request.method === "GET" && supplierOperationsMatch) { const result = await getSupplierOperations(supplierOperationsMatch[1].toUpperCase()); if (!result) { sendJson(response, 404, { error: "Supplier workspace not found." }); return; } sendJson(response, 200, result); return; }
    if (request.method === "PATCH" && url.pathname === "/api/admin/suppliers/syntech/settings/api-procurement") {
      const staff = (await currentStaff(request))!.context;
      const body = await readJsonBody<{ revision?: number; enabled?: boolean; confirmed?: boolean }>(request);
      if (body.confirmed !== true) throw Object.assign(new Error("Explicit confirmation is required to change Syntech API procurement."), { code: "CONFIRMATION_REQUIRED", status: 400 });
      const before = await getSyntechApiProcurementControl();
      await patchSettingsDomain("suppliers", { revision: Number(body.revision), changes: { syntechApiProcurementEnabled: String(Boolean(body.enabled)) }, confirmHighRisk: true }, staff.actorLabel);
      const after = await getSyntechApiProcurementControl();
      if (before.operational.enabled !== after.operational.enabled) await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff), subsystem: "SUPPLIERS", actionType: "SYNTECH_API_PROCUREMENT_SWITCH_CHANGED", entityType: "SUPPLIER", entityId: "SYNTECH", entityLabel: "Syntech Distribution", summary: `Staff ${after.operational.enabled ? "enabled" : "disabled"} Syntech API procurement operations.`, before: [{ label: "Operationally enabled", value: before.operational.enabled }], after: [{ label: "Operationally enabled", value: after.operational.enabled }, { label: "Effective", value: after.effectiveEnabled }], targetRoute: "/admin/suppliers/syntech/overview", idempotencyKey: `syntech-api-procurement:${after.operational.revision}` });
      sendJson(response, 200, { syntechProcurement: after }); return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/status") {
      sendJson(response, 200, await getScoopCatalogueSyncStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/syntech/status") { sendJson(response, 200, await getSyntechStatus()); return; }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/syntech/products") {
      const [all, mappings, categoryMappings, products, availabilityIndex] = await Promise.all([listSyntechCatalogueProducts(), listSupplierProductMappings(), listSupplierCategoryMappings("SYNTECH"), listAdminProducts(), buildProductAvailabilityIndex()]); const search = (url.searchParams.get("search") ?? "").trim().toLowerCase(); const brand = url.searchParams.get("brand") ?? ""; const category = url.searchParams.get("category") ?? ""; const stock = url.searchParams.get("stock") ?? ""; const promotion = url.searchParams.get("promotion") ?? ""; const taxonomyStatus = url.searchParams.get("taxonomyStatus") ?? ""; const mappingStatus = url.searchParams.get("mappingStatus") ?? "";
      const productById = new Map(products.map((product) => [product.id, product]));
      const mappingBySku = new Map(mappings.filter((candidate) => candidate.supplierCode === "SYNTECH" && candidate.status !== "SUPERSEDED" && candidate.status !== "REJECTED").map((candidate) => [candidate.supplierSku, candidate]));
      const verifiedSourcePaths = new Set(categoryMappings.filter((candidate) => candidate.status === "VERIFIED").map((candidate) => candidate.normalizedSourcePath));
      const rows = all.map((item) => { const mapping = mappingBySku.get(item.supplierSku); const canonicalProduct = mapping ? productById.get(mapping.productId) : undefined; const normalizedPath = normalizeSupplierSourcePath(item.sourceCategoryTrees.join("|")); return { ...item, taxonomyMappingStatus: verifiedSourcePaths.has(normalizedPath) ? "VERIFIED" as const : item.taxonomyMappingStatus, mapping, canonicalProduct: canonicalProduct ? { id: canonicalProduct.id, name: canonicalProduct.name, sku: canonicalProduct.sku } : undefined }; });
      const filtered = rows.filter((item) => (!search || item.supplierSku.toLowerCase().includes(search) || item.name?.toLowerCase().includes(search) || item.manufacturerPartNumber?.toLowerCase().includes(search)) && (!brand || item.brand === brand) && (!category || item.sourceCategories.includes(category)) && (!stock || stock === "IN_STOCK" && (item.totalStock ?? 0) > 0 || stock === "OUT_OF_STOCK" && item.totalStock === 0 || stock === "UNKNOWN" && item.totalStock === undefined) && (!promotion || (promotion === "ACTIVE") === item.promotionActive) && (!taxonomyStatus || item.taxonomyMappingStatus === taxonomyStatus) && (!mappingStatus || (item.mapping?.status ?? "UNMAPPED") === mappingStatus));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 15))); const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const page = Math.min(totalPages, Math.max(1, Number(url.searchParams.get("page") ?? 1))); const start = (page - 1) * pageSize;
      const paged = await Promise.all(filtered.slice(start, start + pageSize).map(async (item) => ({ ...item, onboarding: item.mapping?.status === "VERIFIED" ? await getProductOnboardingReadiness(item.mapping.productId).catch(() => undefined) : undefined, canonicalAvailability: item.mapping?.status === "VERIFIED" ? availabilityIndex.get(item.mapping.productId) : undefined })));
      sendJson(response, 200, { products: paged, pagination: { page, pageSize, totalItems: filtered.length, totalPages }, filters: { brands: [...new Set(all.map((item) => item.brand).filter((item): item is string => Boolean(item)))].sort(), categories: [...new Set(all.flatMap((item) => item.sourceCategories))].sort() } }); return;
    }
    const syntechOnboardingMatch = url.pathname.match(/^\/api\/admin\/suppliers\/syntech\/products\/([^/]+)\/onboarding$/);
    if (request.method === "GET" && syntechOnboardingMatch) { sendJson(response, 200, await getSyntechOnboardingPreview(decodeURIComponent(syntechOnboardingMatch[1]))); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/products/create") { const body = await readJsonBody<Parameters<typeof createTekCentralProductFromSyntech>[0]>(request); sendJson(response, 201, await createTekCentralProductFromSyntech({ ...body, actor: (await currentStaff(request))!.context.actorLabel })); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/mappings/map-existing") { const body = await readJsonBody<Parameters<typeof mapSyntechProductToExisting>[0]>(request); sendJson(response, 200, await mapSyntechProductToExisting({ ...body, actor: (await currentStaff(request))!.context.actorLabel })); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/taxonomy/verify-source-path") {
      const body = await readJsonBody<Parameters<typeof verifySyntechSourceCategory>[0]>(request); const staff = await currentStaff(request);
      const mapping = await verifySyntechSourceCategory({ ...body, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SUPPLIERS", actionType: mapping.revision > 1 ? "SUPPLIER_TAXONOMY_MAPPING_CHANGED" : "SUPPLIER_TAXONOMY_MAPPING_VERIFIED", entityType: "SUPPLIER_TAXONOMY_MAPPING", entityId: mapping.id, entityLabel: "Syntech source taxonomy", summary: mapping.revision > 1 ? "Staff changed a reusable supplier taxonomy mapping." : "Staff verified a reusable supplier taxonomy mapping.", after: [{ label: "Canonical category", value: mapping.categoryId }, { label: "Canonical subcategory", value: mapping.subcategoryId }, { label: "Revision", value: mapping.revision }], metadata: [{ label: "Affected exact source path", value: mapping.normalizedSourcePath }], targetRoute: "/admin/suppliers/syntech" });
      sendJson(response, 200, { mapping }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/pricing-proposals") { const body = await readJsonBody<{ productId: string; supplierSku: string }>(request); sendJson(response, 201, { proposal: await generateSyntechPricingProposal(body) }); return; }
    const syntechReadinessMatch = url.pathname.match(/^\/api\/admin\/suppliers\/syntech\/products\/([^/]+)\/readiness$/);
    if (request.method === "GET" && syntechReadinessMatch) { sendJson(response, 200, await getSyntechProductReadiness(decodeURIComponent(syntechReadinessMatch[1]))); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/sync") { const body = await readJsonBody<{ type: "FULL" | "UPDATE" }>(request); if (!body || !["FULL", "UPDATE"].includes(body.type)) { sendJson(response, 400, { error: "A FULL or UPDATE Syntech sync type is required." }); return; } const sync = await runSyntechSync(body.type); await bestEffortResolve({ type: "SUPPLIER_FEED_REFRESH_FAILED", subsystem: "SUPPLIERS", entityType: "SUPPLIER", entityId: "SYNTECH", diagnosticCode: "SYNTECH_SYNC_FAILED" }); await recordAdminAuditBestEffort({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "SUPPLIERS", actionType: "SUPPLIER_REFRESH_COMPLETED", entityType: "SUPPLIER", entityId: "SYNTECH", entityLabel: "Syntech", summary: `Syntech ${body.type.toLowerCase()} catalogue refresh completed.`, after: [{ label: "Parsed", value: sync.run.parsedCount }, { label: "Created", value: sync.run.createdCount }, { label: "Updated", value: sync.run.updatedCount }, { label: "Missing", value: sync.run.missingCount }], targetRoute: "/admin/suppliers/syntech/sync-history", idempotencyKey: `syntech-sync:${sync.run.id}` }); sendJson(response, 200, sync); return; }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/syntech/sync/full") {
      const readiness = await getSyntechSyncReadiness();
      if (!readiness.canRunFullSync) {
        const code = readiness.blockReason ?? "UNAVAILABLE";
        const message = code === "NOT_CONFIGURED" ? "Syntech is not configured." : code === "SYNC_IN_PROGRESS" ? "A Syntech sync is already in progress." : code === "ACCOUNT_BLOCKED" ? "The Syntech account is currently blocked." : "The Syntech request budget is temporarily unavailable.";
        sendJson(response, code === "RATE_LIMITED" ? 429 : code === "ACCOUNT_BLOCKED" ? 403 : 409, { error: message, code, readiness }); return;
      }
      try { const sync = await runSyntechSync("FULL"); await bestEffortResolve({ type: "SUPPLIER_FEED_REFRESH_FAILED", subsystem: "SUPPLIERS", entityType: "SUPPLIER", entityId: "SYNTECH", diagnosticCode: "SYNTECH_SYNC_FAILED" }); await recordAdminAuditBestEffort({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "SUPPLIERS", actionType: "SUPPLIER_REFRESH_COMPLETED", entityType: "SUPPLIER", entityId: "SYNTECH", entityLabel: "Syntech", summary: "Syntech full catalogue refresh completed.", after: [{ label: "Parsed", value: sync.run.parsedCount }, { label: "Created", value: sync.run.createdCount }, { label: "Updated", value: sync.run.updatedCount }, { label: "Missing", value: sync.run.missingCount }], targetRoute: "/admin/suppliers/syntech/sync-history", idempotencyKey: `syntech-sync:${sync.run.id}` }); sendJson(response, 200, sync); }
      catch (error) {
        const code = syntechSyncErrorCode(error);
        await bestEffortAlert({ type: "SUPPLIER_FEED_REFRESH_FAILED", severity: "WARNING", subsystem: "SUPPLIERS", title: "Syntech catalogue refresh failed", summary: "The Syntech supplier catalogue refresh did not complete successfully.", entityType: "SUPPLIER", entityId: "SYNTECH", targetRoute: "/admin/suppliers/syntech/overview", recommendedAction: "Open Syntech workspace", diagnosticCode: "SYNTECH_SYNC_FAILED" });
        const message = code === "RATE_LIMITED" ? "Syntech is temporarily rate limited." : code === "ACCOUNT_BLOCKED" ? "The Syntech account is currently blocked." : code === "INVALID_FEED" ? "Syntech returned an invalid feed." : code === "SYNC_IN_PROGRESS" ? "A Syntech sync is already in progress." : "Syntech is currently unavailable.";
        sendJson(response, code === "RATE_LIMITED" ? 429 : code === "ACCOUNT_BLOCKED" ? 403 : code === "SYNC_IN_PROGRESS" ? 409 : code === "INVALID_FEED" ? 422 : 503, { error: message, code });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/products") {
      const products = await listScoopCatalogueProducts();
      sendJson(response, 200, {
        products: products.map((product) => ({
          ...product,
          pricing: prepareSupplierPricing({
            currency: product.currency,
            vatRate: product.vatRate,
            supplierCostExVat: product.dealerPriceExVat,
            referenceRetailInclVat: product.retailPriceInclVat,
          }),
        })),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/launch-readiness") {
      const [products, mappings, proposals, availabilityIndex] = await Promise.all([
        listScoopCatalogueProducts(),
        listSupplierProductMappings(),
        listPricingProposals(),
        buildProductAvailabilityIndex(),
      ]);
      const allRows = await Promise.all(products.map(async (product) => {
        const supplierMappings = mappings.filter((mapping) => mapping.supplierCode === "SCOOP" && mapping.supplierSku === product.supplierSku);
        const mapping = supplierMappings.find((item) => item.status === "VERIFIED") ?? supplierMappings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        const proposal = latestScoopProposal(proposals, product.supplierSku, mapping?.productId);
        const publication = mapping ? await getPublicationSummary(mapping.productId) : { state: "NOT_PUBLISHED" as const, versionCount: 0 };
        let hasUnpublishedChanges = false;
        let publicationEligibility: { canPublish: boolean; blockers: string[]; warnings: string[] } | undefined;
        let onboarding: Awaited<ReturnType<typeof getProductOnboardingReadiness>> | undefined;
        if (mapping?.status === "VERIFIED") {
          try {
            const [review, productOnboarding] = await Promise.all([
              getPublicationReview(mapping.productId),
              getProductOnboardingReadiness(mapping.productId),
            ]);
            hasUnpublishedChanges = publication.versionCount > 0 ? review.hasUnpublishedChanges : false;
            publicationEligibility = review.eligibility;
            onboarding = productOnboarding;
          } catch { publicationEligibility = undefined; }
        }
        const publicationWithChanges = { ...publication, hasUnpublishedChanges };
        const readiness = deriveScoopLaunchReadiness({ product, mapping, proposal });
        const workflow = deriveScoopProductWorkflow({ product, mapping, proposal, publication: publicationWithChanges, publicationEligibility });
        return {
          product: { ...product, pricing: prepareSupplierPricing({ currency: product.currency, vatRate: product.vatRate, supplierCostExVat: product.dealerPriceExVat, referenceRetailInclVat: product.retailPriceInclVat }) },
          mapping,
          proposal,
          readiness,
          publication: publicationWithChanges,
          publicationEligibility,
          onboarding,
          canonicalAvailability: mapping?.status === "VERIFIED" ? availabilityIndex.get(mapping.productId) : undefined,
          publicationAction: deriveScoopPublicationAction({ readiness, publication: publicationWithChanges }),
          workflow: onboarding ? { ...workflow, primaryAction: onboarding.nextAction.label } : workflow,
        };
      }));
      const rows = allRows.filter((row) => isInScoopLaunchReadinessCohort(row));
      const selectedRows = rows.filter(({ product }) => scoopAssortmentState(product) === "SELECTED_FOR_LAUNCH");
      sendJson(response, 200, {
        rows,
        workflowRows: allRows,
        guidanceRows: allRows.filter((row) => !isInScoopLaunchReadinessCohort(row) && row.workflow.primaryAction === "Select for launch"),
        metrics: {
          totalOffers: rows.length,
          launchCandidates: products.filter((product) => scoopAssortmentState(product) === "CANDIDATE").length,
          selectedForLaunch: selectedRows.length,
          verifiedMappings: rows.filter(({ mapping }) => mapping?.status === "VERIFIED").length,
          logisticsComplete: rows.filter(({ product }) => product.logisticsMetadata?.status === "COMPLETE").length,
          approvedPricing: rows.filter(({ proposal }) => proposal?.status === "APPROVED").length,
          readyForPublishReview: selectedRows.filter(({ workflow }) => workflow.completionState === "READY_FOR_PUBLISH_REVIEW").length,
          published: selectedRows.filter(({ workflow }) => workflow.completionState === "PUBLISHED").length,
          blockedLogistics: selectedRows.filter(({ workflow }) => workflow.completionState === "BLOCKED_LOGISTICS").length,
          blockedPricing: selectedRows.filter(({ workflow }) => workflow.completionState === "BLOCKED_PRICING").length,
          blockedMapping: selectedRows.filter(({ workflow }) => workflow.completionState === "BLOCKED_MAPPING").length,
          needsStaffReview: selectedRows.filter(({ workflow }) => workflow.completionState === "NEEDS_STAFF_REVIEW" || workflow.completionState === "BLOCKED_URL_IDENTITY").length,
        },
      });
      return;
    }

    const publicationReviewMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication$/);
    const onboardingReadinessMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/onboarding-readiness$/);
    if (request.method === "GET" && onboardingReadinessMatch) {
      sendJson(response, 200, await getProductOnboardingReadiness(decodeURIComponent(onboardingReadinessMatch[1])));
      return;
    }
    if (request.method === "GET" && publicationReviewMatch) {
      sendJson(response, 200, await getPublicationReview(decodeURIComponent(publicationReviewMatch[1])));
      return;
    }
    if (request.method === "PUT" && publicationReviewMatch) {
      const staff = await currentStaff(request);
      if (process.env.NODE_ENV !== "production") console.info("Publication request received", { operation: "save-draft", productId: decodeURIComponent(publicationReviewMatch[1]) });
      const body = await readJsonBody<Parameters<typeof savePublicationDraft>[0]>(request);
      const internalProductId = decodeURIComponent(publicationReviewMatch[1]); const previous = await getPublicationReview(internalProductId); const draft = await savePublicationDraft({ ...body, internalProductId, actor: staff!.context.actorLabel }); const previousSnapshot = previous.draft; const primaryChanged = previousSnapshot.images?.[0] !== draft.snapshot.images?.[0]; const categoryChanged = previousSnapshot.category !== draft.snapshot.category; const documentsChanged = JSON.stringify(previousSnapshot.documents ?? []) !== JSON.stringify(draft.snapshot.documents ?? []);
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: primaryChanged ? "PRODUCT_PRIMARY_IMAGE_CHANGED" : categoryChanged ? "PRODUCT_CATEGORY_CHANGED" : documentsChanged ? "PRODUCT_DOCUMENTS_UPDATED" : "PRODUCT_CONTENT_UPDATED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: draft.snapshot.name, summary: documentsChanged ? "Staff updated controlled Product documents." : "Staff updated canonical Product content.", before: [{ label: "Category", value: previousSnapshot?.category }, { label: "Image count", value: previousSnapshot?.images?.length ?? 0 }, { label: "Document count", value: previousSnapshot?.documents?.length ?? 0 }], after: [{ label: "Category", value: draft.snapshot.category }, { label: "Image count", value: draft.snapshot.images.length }, { label: "Document count", value: draft.snapshot.documents?.length ?? 0 }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-draft:${internalProductId}:${draft.savedAt}` });
      sendJson(response, 200, { draft });
      return;
    }
    const productLaunchSelectionMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/launch-selection$/);
    if (request.method === "PATCH" && productLaunchSelectionMatch) {
      const body = await readJsonBody<{ state: "NOT_SELECTED" | "SELECTED_FOR_LAUNCH"; actor?: string }>(request);
      if (!["NOT_SELECTED", "SELECTED_FOR_LAUNCH"].includes(body.state)) { sendJson(response, 400, { error: "Invalid Product launch selection state." }); return; }
      const product = await setInternalProductLaunchSelection({ productId: decodeURIComponent(productLaunchSelectionMatch[1]), state: body.state, actor: (await currentStaff(request))!.context.actorLabel });
      if (!product) { sendJson(response, 404, { error: "Internal product not found." }); return; }
      sendJson(response, 200, { product });
      return;
    }
    const publicationPreviewMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-preview$/);
    if (request.method === "GET" && publicationPreviewMatch) {
      const preview = await getPublicationPreview(decodeURIComponent(publicationPreviewMatch[1]));
      if (!preview) { sendJson(response, 404, { error: "No published version is available to preview." }); return; }
      sendJson(response, 200, preview);
      return;
    }
    const publicationImageMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-image$/);
    if (request.method === "POST" && publicationImageMatch) {
      const staff = await currentStaff(request);
      const body = await readJsonBody<{ sourceUrl: string; sourceType?: string; actor?: string }>(request);
      const internalProductId = decodeURIComponent(publicationImageMatch[1]);
      const result = await ingestAndAssociatePublicationImage({ internalProductId, sourceUrl: body.sourceUrl, sourceType: body.sourceType ?? "SUPPLIER_SOURCE", actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_MEDIA_INGESTED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: result.review.draft.name, summary: "Staff ingested controlled Product media.", after: [{ label: "Public media", value: result.image.publicUrl }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-media:${internalProductId}:${result.image.contentHash}` });
      sendJson(response, 201, result);
      return;
    }
    const publicationPrivateImageMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-image\/private$/);
    if (request.method === "POST" && publicationPrivateImageMatch) {
      const staff = await currentStaff(request);
      requirePermission("suppliers.read")(staff?.context);
      const body = await readJsonBody<{ candidateId: string }>(request);
      const internalProductId = decodeURIComponent(publicationPrivateImageMatch[1]);
      const result = await ingestAndAssociatePrivateMustekImage({ internalProductId, candidateId: body.candidateId, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_SUPPLIER_MEDIA_INGESTED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: result.review.draft.name, summary: "Staff approved and ingested private supplier media into controlled Product storage.", after: [{ label: "Public media", value: result.image.publicUrl }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-private-media:${internalProductId}:${result.image.contentHash}` });
      sendJson(response, 201, result);
      return;
    }
    const publicationTvrImageMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-image\/tvr$/);
    if (request.method === "POST" && publicationTvrImageMatch) {
      const staff = await currentStaff(request);
      requirePermission("suppliers.read")(staff?.context);
      const body = await readJsonBody<{ candidateId: string }>(request);
      const internalProductId = decodeURIComponent(publicationTvrImageMatch[1]);
      const result = await ingestAndAssociateTvrWebsiteImage({ internalProductId, candidateId: body.candidateId, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_SUPPLIER_MEDIA_INGESTED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: result.review.draft.name, summary: "Staff approved and ingested TVR website media into controlled Product storage.", after: [{ label: "Public media", value: result.image.publicUrl }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-tvr-media:${internalProductId}:${result.image.contentHash}` });
      sendJson(response, 201, result);
      return;
    }
    const publicationMediaRemovalMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-media\/([^/]+)$/);
    if (request.method === "DELETE" && publicationMediaRemovalMatch) {
      const staff = await currentStaff(request);
      const internalProductId = decodeURIComponent(publicationMediaRemovalMatch[1]);
      const mediaId = decodeURIComponent(publicationMediaRemovalMatch[2]);
      const result = await removePublicationMedia({ internalProductId, mediaId, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_MEDIA_REMOVED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: result.review.draft.name, summary: "Staff removed controlled Product media association.", before: [{ label: "Media ID", value: mediaId }, { label: "Public media", value: result.removed.publicUrl }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-media-removal:${internalProductId}:${mediaId}` });
      sendJson(response, 200, result);
      return;
    }
    const publicationImageUploadMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-image\/upload$/);
    if (request.method === "POST" && publicationImageUploadMatch) {
      const staff = await currentStaff(request);
      const body = JSON.parse(await readBody(request, 7_500_000)) as { filename: string; mimeType: string; base64: string; actor?: string };
      const internalProductId = decodeURIComponent(publicationImageUploadMatch[1]);
      const result = await uploadAndAssociatePublicationImage({ ...body, internalProductId, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_MEDIA_UPLOADED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: result.review.draft.name, summary: "Staff uploaded controlled Product media.", after: [{ label: "Public media", value: result.image.publicUrl }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-media-upload:${internalProductId}:${result.image.contentHash}` });
      sendJson(response, 201, result);
      return;
    }
    const publicationContentPreviewMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-content-preview$/);
    if (request.method === "POST" && publicationContentPreviewMatch) {
      const internalProductId = decodeURIComponent(publicationContentPreviewMatch[1]);
      const body = await readJsonBody<{ sourceUrl: string; content: string }>(request);
      const review = await getPublicationReview(internalProductId);
      if (review.internalSource.supplierCode === "CJ") {
        sendJson(response, 200, { preview: { identityConfidence: "LOW", blocker: "CJ_SOURCE_REVIEW_REQUIRED", overview: undefined, specifications: [], physicalSpecifications: [], documents: [], sourceUrl: body.sourceUrl } });
        return;
      }
      const preview = await previewScoopProductContent({ supplierSku: review.internalSource.supplierSku, sourceUrl: body.sourceUrl, content: body.content });
      const offer = await getScoopCatalogueProduct(review.internalSource.supplierSku);
      sendJson(response, 200, { preview: { ...preview, physicalSpecifications: productPhysicalSpecifications(offer) } });
      return;
    }
    const publicationDocumentMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-documents\/(upload|import)$/);
    if (request.method === "POST" && publicationDocumentMatch) {
      const internalProductId = decodeURIComponent(publicationDocumentMatch[1]); const action = publicationDocumentMatch[2];
      if (process.env.NODE_ENV !== "production") console.info("Publication request received", { operation: `document-${action}`, productId: internalProductId });
      await getPublicationReview(internalProductId);
      let stored;
      if (action === "upload") { const body = JSON.parse(await readBody(request, 14_500_000)) as { filename: string; mimeType: string; base64: string }; stored = await uploadPublicDocument(body); }
      else { const body = await readJsonBody<{ sourceUrl: string }>(request); stored = await importPublicDocument({ sourceUrl: body.sourceUrl, trustedHosts: ["scoop.co.za", "ui.com", "ubiquiti.com", "cudy.com", "reyee.com", "ruijienetworks.com", "linkbasic.com", "fanvil.com", "mikrotik.com"] }); }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor((await currentStaff(request))!.context), subsystem: "PRODUCTS", actionType: action === "upload" ? "PRODUCT_DOCUMENT_UPLOADED" : "PRODUCT_DOCUMENT_IMPORTED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: internalProductId, summary: `Staff ${action === "upload" ? "uploaded" : "imported"} a controlled Product PDF.`, after: [{ label: "MIME type", value: stored.mimeType }, { label: "Size", value: stored.bytes }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing` });
      sendJson(response, 201, stored);
      return;
    }
    const publicationNewDraftMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-draft\/new$/);
    if (request.method === "POST" && publicationNewDraftMatch) {
      const internalProductId = decodeURIComponent(publicationNewDraftMatch[1]); await readJsonBody<{ actor?: string }>(request); const staff = await currentStaff(request); const draft = await createPublicationDraftFromActiveVersion(internalProductId, staff!.context.actorLabel);
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_VERSION_DRAFT_CREATED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: draft.snapshot.name, summary: "Staff created an editable draft from the current immutable Product version.", before: [{ label: "Draft active", value: false }], after: [{ label: "Draft active", value: true }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-version-draft:${internalProductId}:${draft.savedAt}` });
      sendJson(response, 201, { draft }); return;
    }
    const publicationPublishMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publish$/);
    if (request.method === "POST" && publicationPublishMatch) {
      const body = await readJsonBody<{ pricingProposalId: string; idempotencyKey: string; actor?: string }>(request);
      const internalProductId = decodeURIComponent(publicationPublishMatch[1]);
      const staff = await currentStaff(request); const version = await publishSavedDraft({ ...body, internalProductId, actor: staff!.context.actorLabel });
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_PUBLISHED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: version.snapshot.name, summary: "Staff published a new immutable Product version.", before: [{ label: "Publication", value: "READY_FOR_PUBLISH_REVIEW" }], after: [{ label: "Publication", value: "PUBLISHED" }, { label: "Version", value: version.version }, { label: "Price", value: version.snapshot.price }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing`, idempotencyKey: `product-published:${version.id}` });
      const [publication, readiness, review] = await Promise.all([
        getPublicationSummary(internalProductId),
        getProductOnboardingReadiness(internalProductId),
        getPublicationReview(internalProductId),
      ]);
      sendJson(response, 200, { version, publication, readiness, review });
      return;
    }
    const publicationUnpublishMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/unpublish$/);
    if (request.method === "POST" && publicationUnpublishMatch) {
      await readJsonBody<{ actor?: string }>(request);
      const staff = await currentStaff(request); const internalProductId = decodeURIComponent(publicationUnpublishMatch[1]); const publication = await unpublishProduct(internalProductId, staff!.context.actorLabel); await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "PRODUCTS", actionType: "PRODUCT_UNPUBLISHED", entityType: "PRODUCT", entityId: internalProductId, entityLabel: internalProductId, summary: "Staff removed a Product from the public storefront.", before: [{ label: "Publication", value: "PUBLISHED" }], after: [{ label: "Publication", value: "UNPUBLISHED" }], targetRoute: `/admin/products/${encodeURIComponent(internalProductId)}/publishing` }); sendJson(response, 200, { publication });
      return;
    }
    const publicationRollbackMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-versions\/([^/]+)\/rollback$/);
    if (request.method === "POST" && publicationRollbackMatch) {
      const body = await readJsonBody<{ pricingProposalId: string; idempotencyKey: string; actor?: string }>(request);
      sendJson(response, 200, { version: await rollbackProduct({ ...body, actor: (await currentStaff(request))!.context.actorLabel, internalProductId: decodeURIComponent(publicationRollbackMatch[1]), sourceVersionId: decodeURIComponent(publicationRollbackMatch[2]) }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/launch-candidates/suggest") {
      const body = await readJsonBody<{ limit?: number }>(request);
      const suggestions = suggestScoopLaunchCandidates(await listScoopCatalogueProducts(), body.limit ?? 50);
      for (const suggestion of suggestions) {
        await setScoopLaunchAssortmentState({ supplierSku: suggestion.product.supplierSku, state: "CANDIDATE", suggested: true, suggestionReasons: suggestion.reasons, actor: "TekCentral advisory criteria" });
      }
      sendJson(response, 200, { suggested: suggestions.length, supplierSkus: suggestions.map(({ product }) => product.supplierSku) });
      return;
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/[^/]+\/launch-state$/)) {
      const supplierSku = decodeURIComponent(url.pathname.replace("/api/admin/suppliers/scoop/products/", "").replace("/launch-state", ""));
      const body = await readJsonBody<{ state: ScoopLaunchAssortmentState }>(request);
      if (!["NOT_SELECTED", "CANDIDATE", "SELECTED_FOR_LAUNCH"].includes(body.state)) {
        sendJson(response, 400, { error: "Invalid Scoop launch assortment state." }); return;
      }
      const product = await setScoopLaunchAssortmentState({ supplierSku, state: body.state });
      if (!product) { sendJson(response, 404, { error: "Scoop product not found." }); return; }
      sendJson(response, 200, { product });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/[^/]+$/)
    ) {
      const supplierSku = decodeURIComponent(
        url.pathname.replace("/api/admin/suppliers/scoop/products/", ""),
      );
      const product = await getScoopCatalogueProduct(supplierSku);
      sendJson(response, 200, {
        product: product
          ? {
              ...product,
              pricing: prepareSupplierPricing({
                currency: product.currency,
                vatRate: product.vatRate,
                supplierCostExVat: product.dealerPriceExVat,
                referenceRetailInclVat: product.retailPriceInclVat,
              }),
            }
          : undefined,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/sync") {
      const sync = await syncScoopCatalogueFromFeed(); await bestEffortResolve({ type: "SUPPLIER_FEED_REFRESH_FAILED", subsystem: "SUPPLIERS", entityType: "SUPPLIER", entityId: "SCOOP", diagnosticCode: "SCOOP_SYNC_FAILED" }); sendJson(response, 200, { sync });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/website-import/preview") {
      const body = await readJsonBody<{ content: string }>(request);
      sendJson(response, 200, previewScoopWebsiteImport(body.content)); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/website-import/apply") {
      const body = await readJsonBody<{ content: string; importFingerprint: string }>(request);
      sendJson(response, 200, await applyScoopWebsiteImport(body.content, body.importFingerprint)); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/url-reconciliation/status") {
      sendJson(response, 200, { metrics: await getScoopUrlMetrics() }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/url-reconciliation/backfill") {
      sendJson(response, 200, { result: await backfillScoopCanonicalUrls(), metrics: await getScoopUrlMetrics() }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/url-reconciliation/preview") {
      const body = await readJsonBody<{ content: string }>(request); sendJson(response, 200, await previewScoopUrlImport(body.content)); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/url-reconciliation/apply") {
      const body = await readJsonBody<{ content: string; fingerprint: string }>(request); sendJson(response, 200, await applyScoopUrlImport(body.content, body.fingerprint)); return;
    }
    const scoopStaffUrlMatch = url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/([^/]+)\/canonical-url$/);
    if (request.method === "POST" && scoopStaffUrlMatch) {
      const supplierSku = decodeURIComponent(scoopStaffUrlMatch[1]); const body = await readJsonBody<{ action: "PREVIEW" | "APPLY"; url: string; pageContent?: string; fingerprint?: string }>(request);
      if (body.action === "APPLY") { sendJson(response, 200, await applyScoopStaffUrl({ supplierSku, url: body.url, pageContent: body.pageContent ?? "", fingerprint: body.fingerprint ?? "" })); return; }
      const fetched = body.pageContent?.trim() ? undefined : await fetchPublicScoopProductPage({ url: body.url });
      if (fetched && (!("content" in fetched) || typeof fetched.content !== "string")) { sendJson(response, 200, { diagnostic: fetched, preview: await previewScoopStaffUrl({ supplierSku, url: body.url }) }); return; }
      const pageContent = body.pageContent?.trim() || (fetched && "content" in fetched && typeof fetched.content === "string" ? fetched.content : "");
      const preview = await previewScoopStaffUrl({ supplierSku, url: fetched?.canonicalUrl ?? body.url, pageContent });
      const extraction = preview.confidence === "HIGH" && preview.proposedUrl ? await previewScoopProductContent({ supplierSku, sourceUrl: preview.proposedUrl, content: pageContent }) : undefined;
      sendJson(response, 200, { preview, diagnostic: { diagnostic: extraction ? (extraction.specifications.length || extraction.documents.length ? "EXTRACTION_SUCCESS" : "MORE_INFORMATION_NOT_FOUND") : preview.errors.some((item) => /SKU/i.test(item)) ? "PRODUCT_IDENTITY_MISMATCH" : fetched?.diagnostic ?? preview.diagnostic, message: extraction ? `${extraction.specifications.length} specifications and ${extraction.documents.length} documents extracted.` : fetched?.message ?? preview.errors[0] ?? "Product identity could not be verified." }, extraction, pageContent }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/logistics/enrich") {
      const body = await readJsonBody<{ skus?: string[]; limit?: number; force?: boolean; missingOnly?: boolean; selectedForLaunchOnly?: boolean; verifiedMappingsOnly?: boolean; manufacturer?: string }>(request);
      sendJson(response, 200, await enrichScoopLogisticsBatch(body));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/logistics/import/preview") {
      const body = await readJsonBody<{ csv: string }>(request); sendJson(response, 200, await previewScoopLogisticsCsv(body.csv)); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/logistics/import/apply") {
      const body = await readJsonBody<{ csv: string; importFingerprint: string }>(request); sendJson(response, 200, await applyScoopLogisticsCsv(body.csv, body.importFingerprint)); return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/logistics/missing-template") {
      sendJson(response, 200, { filename: "scoop-logistics-missing.csv", csv: await exportMissingScoopLogisticsCsv() }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/logistics/manufacturer") {
      const body = await readJsonBody<{ skus: string[] }>(request); const skus = [...new Set(body.skus ?? [])].slice(0, 25); const results = [];
      for (const supplierSku of skus) results.push({ supplierSku, ...(await acquireScoopManufacturerLogistics(supplierSku)) });
      sendJson(response, 200, { results }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/scoop/logistics/scoop-page-batch") {
      const body = await readJsonBody<{ skus?: string[] }>(request);
      sendJson(response, 200, await ingestScoopPageLogisticsBatch({ skus: body.skus ?? [] })); return;
    }
    const scoopPageLogisticsMatch = url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/([^/]+)\/logistics\/scoop-page$/);
    if (request.method === "POST" && scoopPageLogisticsMatch) {
      const supplierSku = decodeURIComponent(scoopPageLogisticsMatch[1]); const body = await readJsonBody<{ action?: "FETCH" | "PREVIEW" | "APPLY" | "CONFIRM_REVISION"; sourceUrl?: string; sourceType?: "SCOOP_PRODUCT_PAGE" | "MANUFACTURER_PRODUCT_PAGE" | "MANUFACTURER_DATASHEET" | "APPROVED_SOURCE_CAPTURE"; content?: string; contentFingerprint?: string; confirmConflict?: boolean }>(request);
      if (body.action === "PREVIEW") { sendJson(response, 200, { preview: await previewScoopPageLogistics({ supplierSku, sourceUrl: body.sourceUrl, sourceType: body.sourceType, content: body.content ?? "" }) }); return; }
      if (body.action === "CONFIRM_REVISION") { sendJson(response, 200, await confirmScoopHardwareRevision({ supplierSku, sourceUrl: body.sourceUrl, sourceType: body.sourceType, content: body.content ?? "", contentFingerprint: body.contentFingerprint ?? "" })); return; }
      if (body.action === "APPLY") {
        const result = await applyScoopPageLogistics({ supplierSku, sourceUrl: body.sourceUrl, sourceType: body.sourceType, content: body.content ?? "", contentFingerprint: body.contentFingerprint ?? "", confirmConflict: body.confirmConflict });
        const product = await getScoopCatalogueProduct(supplierSku); let proposal;
        if (product?.logisticsMetadata?.status === "COMPLETE") {
          const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "SCOOP" && item.supplierSku === supplierSku && item.status === "VERIFIED");
          if (mapping?.productId) proposal = await generateScoopPricingProposal({ productId: mapping.productId, supplierSku });
        }
        sendJson(response, 200, { ...result, product, proposal }); return;
      }
      sendJson(response, 200, await fetchScoopPageLogistics({ supplierSku })); return;
    }
    const scoopAdminLogisticsMatch = url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/([^/]+)\/logistics\/admin$/);
    if (request.method === "PATCH" && scoopAdminLogisticsMatch) {
      const supplierSku = decodeURIComponent(scoopAdminLogisticsMatch[1]);
      const body = await readJsonBody<{ weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number; clear?: boolean }>(request);
      const result = body.clear ? await clearScoopAdminLogistics(supplierSku) : await saveScoopAdminLogistics({ supplierSku, weightGrams: body.weightGrams, lengthMm: body.lengthMm, widthMm: body.widthMm, heightMm: body.heightMm });
      if (!result) { sendJson(response, 404, { error: "Scoop product not found." }); return; }
      sendJson(response, 200, result); return;
    }
    const scoopLogisticsAuditMatch = url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/([^/]+)\/logistics\/audit$/);
    if (request.method === "GET" && scoopLogisticsAuditMatch) {
      sendJson(response, 200, { audit: await listScoopLogisticsAudit(decodeURIComponent(scoopLogisticsAuditMatch[1])) }); return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/test") {
      sendJson(response, 200, await testCjConnection());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/search") {
      sendJson(
        response,
        200,
        await searchCjProducts({
          keyword: url.searchParams.get("keyword") ?? "",
          categoryId: url.searchParams.get("categoryId") ?? undefined,
          scope: url.searchParams.get("scope") === "all" ? "all" : "technology",
          page: Number(url.searchParams.get("page") ?? 1),
          size: Number(url.searchParams.get("size") ?? 20),
        }),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/autocomplete") {
      sendJson(
        response,
        200,
        await autocompleteCjProducts({
          keyword: url.searchParams.get("keyword") ?? "",
          categoryId: url.searchParams.get("categoryId") ?? undefined,
          scope: url.searchParams.get("scope") === "all" ? "all" : "technology",
          page: 1,
          size: Number(url.searchParams.get("size") ?? 8),
        }),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/categories") {
      sendJson(
        response,
        200,
        url.searchParams.get("scope") === "all"
          ? await getAllCjCategories()
          : await getCjCategories(),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/detail") {
      sendJson(
        response,
        200,
        await getCjProductDetail({
          pid: url.searchParams.get("pid") ?? undefined,
          productSku: url.searchParams.get("productSku") ?? undefined,
          variantSku: url.searchParams.get("variantSku") ?? undefined,
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.match(/^\/api\/admin\/suppliers\/cj\/stock\/[^/]+$/)
    ) {
      const vid = decodeURIComponent(url.pathname.replace("/api/admin/suppliers/cj/stock/", ""));
      sendJson(response, 200, await getCjStockByVid(vid));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/delivery-check") {
      const body = await readJsonBody<{ supplierProductId?: string; supplierVariantId?: string }>(request);
      sendJson(response, 200, {
        deliveryCheck: await checkCjVariantDeliveryToSouthAfrica({
          supplierProductId: body.supplierProductId ?? "",
          supplierVariantId: body.supplierVariantId ?? "",
        }),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/products") {
      sendJson(response, 200, { products: await listCjCatalogueProducts() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/launch-readiness") {
      const [products, mappings, settings, supplierPolicy, cjEvidenceSettings, adminProducts, availabilityIndex] = await Promise.all([listCjCatalogueProducts(), listSupplierProductMappings(), getBusinessSettings(), getSupplierPolicySettings(), getCjEvidenceSettings(), listAdminProducts(), buildProductAvailabilityIndex()]);
      const productById = new Map(adminProducts.map((product) => [product.id, product]));
      const rows = [];
      for (const product of products) {
        for (const variant of product.variants) {
          const variantMappings = mappings.filter((mapping) => mapping.supplierCode === "CJ" && mapping.supplierProductId === product.supplierProductId && mapping.supplierVariantId === variant.supplierVariantId);
          const mapping = variantMappings.find((item) => item.status === "VERIFIED") ?? variantMappings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          const fx = await resolveFxEvidence(variant.costEvidence?.currency ?? cjEvidenceSettings.accountCurrency?.currency ?? "USD");
          const evidence = deriveCjPricingEvidence({ product, variant, mapping, supplierCurrencyEvidence: cjEvidenceSettings.accountCurrency, fxRate: fx.rate, fxRateUpdatedAt: fx.capturedAt, fxStaleAfterHours: settings.pricing.fxStaleAfterHours, sourcePriceFreshnessHours: supplierPolicy.sourcePriceFreshnessHours });
          if (mapping?.status === "VERIFIED" && evidence.status === "READY_FOR_PRICING" && evidence.currency && variant.costEvidence) {
            await generateCjCataloguePricingProposal({ productId: mapping.productId, supplierProductId: product.supplierProductId, supplierVariantId: variant.supplierVariantId, shippingCost: 0, currency: evidence.currency, quotedAt: variant.costEvidence.capturedAt });
          }
          const readiness = await getCjVariantLaunchReadiness(product, variant, mapping);
          const publication = mapping ? await getPublicationSummary(mapping.productId) : { state: "NOT_PUBLISHED" as const, versionCount: 0 };
          const canonicalProduct = mapping ? productById.get(mapping.productId) : undefined;
          rows.push({ product, variant, mapping, canonicalProduct: canonicalProduct ? { id: canonicalProduct.id, name: canonicalProduct.name, sku: canonicalProduct.sku } : undefined, onboarding: mapping?.status === "VERIFIED" ? await getProductOnboardingReadiness(mapping.productId).catch(() => undefined) : undefined, canonicalAvailability: mapping?.status === "VERIFIED" ? availabilityIndex.get(mapping.productId) : undefined, readiness: { status: readiness.status, blockers: readiness.blockers, nextAction: evidence.nextAction }, evidence, proposal: readiness.proposal, publication });
        }
      }
      const cohort = rows.filter((row) => row.variant.launch?.state !== undefined || row.mapping);
      sendJson(response, 200, {
        rows: cohort,
        metrics: {
          importedProducts: products.length,
          importedOffers: rows.length,
          candidates: rows.filter((row) => row.variant.launch?.state === "CANDIDATE").length,
          selected: rows.filter((row) => row.variant.launch?.state === "SELECTED_FOR_LAUNCH").length,
          verified: cohort.filter((row) => row.mapping?.status === "VERIFIED").length,
          logisticsComplete: cohort.filter((row) => row.variant.launch?.logistics.status === "COMPLETE").length,
          pricingPending: cohort.filter((row) => row.proposal?.status === "PENDING_APPROVAL").length,
          pricingApproved: cohort.filter((row) => row.proposal?.status === "APPROVED").length,
          readyForPublishReview: cohort.filter((row) => row.readiness.status === "READY_FOR_PUBLISH_REVIEW").length,
          published: cohort.filter((row) => row.publication.state === "PUBLISHED").length,
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/evidence-audit") {
      sendJson(response, 200, await auditCjEvidenceCohort());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/evidence-refresh") {
      sendJson(response, 200, await refreshCjEvidenceCohort());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/mappings/verify-evidence") {
      const body = await readJsonBody<{ mappingId?: string; evidenceNote?: string; sourceReference?: string }>(request);
      sendJson(response, 200, { mapping: await verifyCjExistingMappingEvidence({ mappingId: body.mappingId ?? "", evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "" }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/mappings/map-existing") {
      const body = await readJsonBody<{ supplierProductId?: string; supplierVariantId?: string; productId?: string; previousMappingId?: string; evidenceNote?: string; sourceReference?: string; confirmDemoProduct?: boolean }>(request);
      sendJson(response, 200, await mapCjVariantToExistingProduct({ supplierProductId: body.supplierProductId ?? "", supplierVariantId: body.supplierVariantId ?? "", productId: body.productId ?? "", previousMappingId: body.previousMappingId, evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "", confirmDemoProduct: body.confirmDemoProduct }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/evidence-settings") {
      sendJson(response, 200, await getCjEvidenceSettings());
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/admin/suppliers/cj/evidence-settings/currency") {
      const body = await readJsonBody<{ currency?: string; evidenceType?: string; evidenceNote?: string; sourceReference?: string }>(request);
      sendJson(response, 200, await confirmCjAccountCurrency({ currency: body.currency ?? "", evidenceType: body.evidenceType ?? "", evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "" }));
      return;
    }

    const cjCurrencyMatch = url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/([^/]+)\/currency$/);
    if (request.method === "PATCH" && cjCurrencyMatch) {
      const body = await readJsonBody<{ currency?: string; evidenceNote?: string; sourceReference?: string }>(request);
      const product = await confirmCjCatalogueCurrency({ supplierProductId: decodeURIComponent(cjCurrencyMatch[1]), currency: body.currency ?? "", evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "" });
      if (!product) { sendJson(response, 404, { error: "CJ product not found." }); return; }
      sendJson(response, 200, { product });
      return;
    }

    const cjEvidenceVariantMatch = url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/([^/]+)\/variants\/([^/]+)\/(verify|cost|logistics)$/);
    if (request.method === "PATCH" && cjEvidenceVariantMatch) {
      const supplierProductId = decodeURIComponent(cjEvidenceVariantMatch[1]);
      const supplierVariantId = decodeURIComponent(cjEvidenceVariantMatch[2]);
      const action = cjEvidenceVariantMatch[3];
      if (action === "verify") {
        const body = await readJsonBody<{ evidenceNote?: string }>(request);
        sendJson(response, 200, { product: await verifyCjVariantEvidence({ supplierProductId, supplierVariantId, evidenceNote: body.evidenceNote ?? "" }) });
      } else if (action === "cost") {
        const body = await readJsonBody<{ amount?: number; currency?: string; evidenceType?: string; evidenceNote?: string; sourceReference?: string }>(request);
        sendJson(response, 200, { product: await confirmCjProcurementCost({ supplierProductId, supplierVariantId, amount: Number(body.amount), currency: body.currency ?? "", evidenceType: body.evidenceType, evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "" }) });
      } else {
        const body = await readJsonBody<{ weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number; classification?: "PRODUCT" | "PACKAGE" | "SHIPPING"; evidenceNote?: string; sourceReference?: string }>(request);
        if (!body.classification || !["PRODUCT", "PACKAGE", "SHIPPING"].includes(body.classification)) { sendJson(response, 400, { error: "Logistics classification is required." }); return; }
        sendJson(response, 200, { product: await confirmCjVariantLogistics({ supplierProductId, supplierVariantId, weightGrams: Number(body.weightGrams), lengthMm: Number(body.lengthMm), widthMm: Number(body.widthMm), heightMm: Number(body.heightMm), classification: body.classification, evidenceNote: body.evidenceNote ?? "", sourceReference: body.sourceReference ?? "" }) });
      }
      return;
    }

    const cjSourcePriceRefreshMatch = url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/([^/]+)\/variants\/([^/]+)\/refresh-source-price$/);
    if (request.method === "POST" && cjSourcePriceRefreshMatch) {
      const supplierProductId = decodeURIComponent(cjSourcePriceRefreshMatch[1]);
      const supplierVariantId = decodeURIComponent(cjSourcePriceRefreshMatch[2]);
      const body = await readJsonBody<{ supplierVariantSku?: string }>(request);
      const refreshed = await refreshCjVariantSourcePrice({ supplierProductId, supplierVariantId, supplierVariantSku: body.supplierVariantSku });
      const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "CJ" && item.supplierProductId === supplierProductId && item.supplierVariantId === supplierVariantId && item.status === "VERIFIED");
      let proposal;
      if (mapping && refreshed.variant.costEvidence?.currency) {
        const [settings, supplierPolicy, cjEvidenceSettings, fx] = await Promise.all([getBusinessSettings(), getSupplierPolicySettings(), getCjEvidenceSettings(), resolveFxEvidence(refreshed.variant.costEvidence.currency)]);
        const evidence = deriveCjPricingEvidence({ product: refreshed.product, variant: refreshed.variant, mapping, supplierCurrencyEvidence: cjEvidenceSettings.accountCurrency, fxRate: fx.rate, fxRateUpdatedAt: fx.capturedAt, fxStaleAfterHours: settings.pricing.fxStaleAfterHours, sourcePriceFreshnessHours: supplierPolicy.sourcePriceFreshnessHours });
        if (evidence.status === "READY_FOR_PRICING" && evidence.currency) proposal = await generateCjCataloguePricingProposal({ productId: mapping.productId, supplierProductId, supplierVariantId, shippingCost: 0, currency: evidence.currency, quotedAt: refreshed.variant.costEvidence.capturedAt });
      }
      sendJson(response, 200, { refresh: { previousCostEvidence: refreshed.previousCostEvidence, costEvidence: refreshed.variant.costEvidence, requestId: refreshed.requestId }, proposal });
      return;
    }

    const cjAvailabilityRefreshMatch = url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/([^/]+)\/variants\/([^/]+)\/refresh-availability$/);
    if (request.method === "POST" && cjAvailabilityRefreshMatch) {
      const supplierProductId = decodeURIComponent(cjAvailabilityRefreshMatch[1]);
      const supplierVariantId = decodeURIComponent(cjAvailabilityRefreshMatch[2]);
      const body = await readJsonBody<{ supplierVariantSku?: string }>(request);
      const refreshed = await refreshCjVariantAvailability({ supplierProductId, supplierVariantId, supplierVariantSku: body.supplierVariantSku });
      sendJson(response, 200, { product: refreshed.product, variant: refreshed.variant, requestId: refreshed.requestId });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/mapping-preview") {
      const body = await readJsonBody<{ supplierProductId: string; supplierVariantId: string }>(request);
      sendJson(response, 200, await previewCjProductMapping(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/products/create") {
      const body = await readJsonBody<Parameters<typeof createTekCentralProductFromCj>[0]>(request);
      sendJson(response, 201, await createTekCentralProductFromCj({ ...body, actor: (await currentStaff(request))!.context.actorLabel }));
      return;
    }

    const cjLaunchStateMatch = url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/([^/]+)\/variants\/([^/]+)\/launch-state$/);
    if (request.method === "PATCH" && cjLaunchStateMatch) {
      const body = await readJsonBody<{ state: CjLaunchState }>(request);
      if (!["NOT_SELECTED", "CANDIDATE", "SELECTED_FOR_LAUNCH"].includes(body.state)) { sendJson(response, 400, { error: "Invalid CJ launch assortment state." }); return; }
      const product = await setCjVariantLaunchState({ supplierProductId: decodeURIComponent(cjLaunchStateMatch[1]), supplierVariantId: decodeURIComponent(cjLaunchStateMatch[2]), state: body.state });
      sendJson(response, 200, { product });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/[^/]+$/)
    ) {
      const supplierProductId = decodeURIComponent(
        url.pathname.replace("/api/admin/suppliers/cj/products/", ""),
      );
      sendJson(response, 200, { product: await getCjCatalogueProduct(supplierProductId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/suppliers/cj/products/import") {
      const body = await readJsonBody<{ pid?: string; productSku?: string; variantSku?: string }>(
        request,
      );
      sendJson(response, 200, { product: await importCjProduct(body) });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/suppliers\/cj\/products\/[^/]+\/refresh$/)
    ) {
      const supplierProductId = decodeURIComponent(
        url.pathname
          .replace("/api/admin/suppliers/cj/products/", "")
          .replace("/refresh", ""),
      );
      sendJson(response, 200, { product: await refreshCjProduct(supplierProductId) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/supplier-mappings") {
      const supplier = url.searchParams.get("supplier");
      const mappings = await listSupplierProductMappings();
      sendJson(response, 200, {
        mappings: supplier
          ? mappings.filter((mapping) => mapping.supplierCode === supplier)
          : mappings,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/products") {
      const [products, mappings, proposals, availabilityIndex] = await Promise.all([listAdminProducts(), listSupplierProductMappings(), listPricingProposals(), buildProductAvailabilityIndex()]);
      sendJson(response, 200, { products: await Promise.all(products.map(async (product) => {
        const internalProduct = await getInternalProduct(product.id);
        const productMappings = mappings.filter((mapping) => mapping.productId === product.id && mapping.status !== "REJECTED" && mapping.status !== "SUPERSEDED");
        const publication = await getPublicationSummary(product.id);
        const approved = proposals.filter((proposal) => proposal.productId === product.id && proposal.status === "APPROVED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
        const controlledImages = publication.activeImage ? [publication.activeImage] : product.images?.filter((item) => item.startsWith("/api/public/assets/products/")) ?? [];
        const taxonomy = { categoryId: product.categoryId ?? "", subcategoryId: product.subcategoryId, productTypeId: product.productTypeId, taxonomyVersion: 1 as const, taxonomyStatus: product.taxonomyStatus ?? "UNMAPPED" as const }; const path = await canonicalTaxonomyPath(taxonomy);
        const attention = [...(!approved ? ["PRICING_NOT_APPROVED"] : []), ...(!controlledImages.length ? ["IMAGE_MISSING"] : []), ...(productMappings.some((mapping) => mapping.status !== "VERIFIED") ? ["MAPPING_REVIEW_REQUIRED"] : []), ...(taxonomy.taxonomyStatus === "REVIEW_REQUIRED" ? ["TAXONOMY_REVIEW_REQUIRED"] : []), ...(taxonomy.taxonomyStatus === "UNMAPPED" ? ["TAXONOMY_UNMAPPED"] : []), ...(publication.state === "READY_FOR_PUBLISH_REVIEW" ? ["PUBLICATION_REVIEW"] : [])];
        const availability = availabilityIndex.get(product.id);
        return { ...product, ...taxonomy, taxonomyLabels: { category: path.category?.label, subcategory: path.subcategory?.label, productType: path.productType?.label }, images: controlledImages, canonicalInternalProductId: internalProduct?.id, publicationActionAvailable: Boolean(internalProduct), recordQuality: internalProduct ? "CANONICAL" : "LEGACY_ORPHAN", publicationState: publication.state, launchReadiness: "launchSelection" in product ? product.launchSelection?.state ?? "NOT_SELECTED" : publication.state === "PUBLISHED" ? "PUBLISHED" : "NOT_SELECTED", approvedPrice: approved?.proposedSellingPriceInclVat ?? publication.activePrice, availabilityState: availability.state, availabilityReason: availability.reason, availabilityFreshness: availability.freshness, supplierCount: new Set(productMappings.map((mapping) => mapping.supplierCode)).size, suppliers: [...new Set(productMappings.map((mapping) => mapping.supplierCode))], lastUpdatedAt: "updatedAt" in product ? product.updatedAt : undefined, attention: internalProduct ? attention : [...attention, "RECORD_NEEDS_REPAIR"] };
      })) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/product-taxonomy") {
      sendJson(response, 200, { version: 1, categories: await getCanonicalTaxonomyTree() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/taxonomy") {
      const categories=await getCanonicalTaxonomyTree({includeInactive:true}); sendJson(response,200,{version:1,categories}); return;
    }
    const taxonomyImpactMatch=url.pathname.match(/^\/api\/admin\/taxonomy\/([^/]+)\/impact$/);
    if(request.method==="GET"&&taxonomyImpactMatch){sendJson(response,200,{impact:await taxonomyImpact(decodeURIComponent(taxonomyImpactMatch[1]))});return;}
    if(request.method==="POST"&&url.pathname==="/api/admin/taxonomy/nodes"){
      const staff=await currentStaff(request);const body=await readJsonBody<Omit<Parameters<typeof createCanonicalTaxonomyNode>[0],"actor">>(request);const node=await createCanonicalTaxonomyNode({...body,actor:staff!.context.actorLabel});await recordAdminAuditBestEffort({category:"AUDIT",...staffAuditActor(staff!.context),subsystem:"PRODUCTS",actionType:"TAXONOMY_CREATED",entityType:"TAXONOMY_NODE",entityId:node.id,entityLabel:node.name,summary:"Staff created a canonical taxonomy node.",after:[{label:"Level",value:node.level},{label:"Parent",value:node.parentId},{label:"Slug",value:node.slug},{label:"Storefront visible",value:node.storefrontVisible}],targetRoute:"/admin/taxonomy"});sendJson(response,201,{node,categories:await getCanonicalTaxonomyTree({includeInactive:true})});return;
    }
    const taxonomyNodeMatch=url.pathname.match(/^\/api\/admin\/taxonomy\/([^/]+)$/);
    if(request.method==="PATCH"&&taxonomyNodeMatch){const staff=await currentStaff(request);const id=decodeURIComponent(taxonomyNodeMatch[1]);const body=await readJsonBody<Omit<Parameters<typeof updateCanonicalTaxonomyNode>[0],"id"|"actor">>(request);const result=await updateCanonicalTaxonomyNode({...body,id,actor:staff!.context.actorLabel});const actionType=body.status&&body.status!=="ACTIVE"?`TAXONOMY_${body.status}`:body.parentId!==undefined?"TAXONOMY_MOVED":body.storefrontVisible!==undefined?"TAXONOMY_VISIBILITY_CHANGED":body.slug!==undefined?"TAXONOMY_SLUG_CHANGED":"TAXONOMY_RENAMED";await recordAdminAuditBestEffort({category:"AUDIT",...staffAuditActor(staff!.context),subsystem:"PRODUCTS",actionType,entityType:"TAXONOMY_NODE",entityId:result.node.id,entityLabel:result.node.name,summary:"Staff updated canonical taxonomy.",after:[{label:"Status",value:result.node.status},{label:"Parent",value:result.node.parentId},{label:"Slug",value:result.node.slug},{label:"Revision",value:result.node.revision}],metadata:[{label:"Affected Products",value:result.impact.productCount},{label:"Supplier mappings",value:result.impact.supplierMappingCount}],targetRoute:"/admin/taxonomy"});sendJson(response,200,{...result,categories:await getCanonicalTaxonomyTree({includeInactive:true})});return;
    }
    if (request.method === "GET" && url.pathname === "/api/public/taxonomy") {
      sendJson(response, 200, { version: 1, categories: await getCanonicalTaxonomyTree({ storefrontOnly: true }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/supplier-mappings/cj/suggest") {
      const body = await readJsonBody<{
        tekcentralProductId: string;
        supplierProductId: string;
        supplierVariantId?: string;
      }>(request);
      sendJson(response, 200, await suggestCjMapping(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/supplier-mappings/scoop/suggest") {
      const body = await readJsonBody<{
        tekcentralProductId: string;
        supplierSku: string;
      }>(request);
      const scoopProduct = await getScoopCatalogueProduct(body.supplierSku);
      if (!scoopProduct) {
        sendJson(response, 404, { error: "Scoop product not found." });
        return;
      }
      const scoopMappings = (await listSupplierProductMappings()).filter(
        (mapping) => mapping.supplierCode === "SCOOP" && mapping.supplierSku === scoopProduct.supplierSku,
      );
      const existing = scoopMappings.find((mapping) => mapping.status === "VERIFIED") ?? scoopMappings[0];
      if (existing?.status === "VERIFIED" && existing.productId !== body.tekcentralProductId) {
        sendJson(response, 409, {
          error: "This Scoop offer is already verified against another TekCentral product. Reject it before suggesting a replacement.",
        });
        return;
      }
      const match = await scoreSelectedScoopMapping(scoopProduct.supplierSku, body.tekcentralProductId);
      if (!match) { sendJson(response, 404, { error: "TekCentral product not found." }); return; }
      sendJson(response, 200, {
        mapping: await saveSupplierProductMapping({
          id: existing?.id,
          productId: body.tekcentralProductId,
          supplierCode: "SCOOP",
          supplierSku: scoopProduct.supplierSku,
          supplierOfferId: `SCOOP:${scoopProduct.supplierSku}`,
          supplierProductId: scoopProduct.supplierSku,
          supplierProductSku: scoopProduct.supplierSku,
          status: "SUGGESTED",
          confidence: match.confidence,
          confidenceLevel: match.confidenceLevel,
          matchMethod: "STAFF_SELECTED_SCOOP_SKU",
          evidence: match.evidence,
          source: "SCOOP_FEED",
        }),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/[^/]+\/product-creation-preview$/)) {
      const supplierSku = decodeURIComponent(url.pathname.replace("/api/admin/suppliers/scoop/products/", "").replace("/product-creation-preview", ""));
      const preview = await getScoopProductCreationPreview(supplierSku);
      if (!preview) { sendJson(response, 404, { error: "Scoop product not found." }); return; }
      sendJson(response, 200, preview); return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/suppliers\/scoop\/products\/[^/]+\/create-tekcentral-product$/)) {
      const supplierSku = decodeURIComponent(url.pathname.replace("/api/admin/suppliers/scoop/products/", "").replace("/create-tekcentral-product", ""));
      const body = await readJsonBody<{ name: string; categorySlug: string; subcategory?: string; confirmed: boolean }>(request);
      try {
        const result = await createTekCentralProductFromScoop({ supplierSku, ...body });
        let proposal;
        let pricingBlocker;
        try { proposal = await generateScoopPricingProposal({ productId: result.product.id, supplierSku }); }
        catch (error) { pricingBlocker = error instanceof Error ? error.message : "Pricing proposal could not be generated."; }
        sendJson(response, result.reused ? 200 : 201, { ...result, proposal, pricingBlocker });
      }
      catch (error) { sendJson(response, error instanceof Error && error.message === "PRODUCT_ALREADY_CREATED_FROM_OFFER" ? 409 : 400, { error: error instanceof Error ? error.message : "TekCentral product could not be created." }); }
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-mappings\/[^/]+\/verify$/)
    ) {
      const staff = await currentStaff(request);
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-mappings/", "").replace("/verify", ""),
      );
      const current = await getSupplierProductMappingById(id);
      if (current?.supplierCode === "SCOOP" && current.confidenceLevel === "LOW") {
        const body = await readJsonBody<{ confirmWeakMatch?: boolean }>(request);
        try { requireWeakMappingConfirmation(current.confidenceLevel, Boolean(body.confirmWeakMatch)); }
        catch { sendJson(response, 409, { error: "Weak product match confirmation is required." }); return; }
      }
      const mapping = current?.supplierCode === "CJ"
        ? await verifySupplierMappingById(id)
        : await setSupplierProductMappingStatus(id, "VERIFIED", { actor: staff?.context.actorLabel, evidence: "Explicit staff verification" });
      if (!mapping) {
        sendJson(response, 404, { error: "Supplier mapping not found." });
        return;
      }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SUPPLIERS", actionType: "SUPPLIER_MAPPING_VERIFIED", entityType: "SUPPLIER_MAPPING", entityId: mapping.id ?? id, entityLabel: `${mapping.supplierCode} ${mapping.supplierSku}`, summary: "Staff verified a supplier offer mapping to a canonical Product.", before: [{ label: "Status", value: current?.status }], after: [{ label: "Status", value: mapping.status }, { label: "Product ID", value: mapping.productId }], targetRoute: "/admin/suppliers" });
      sendJson(response, 200, { mapping });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-mappings\/[^/]+\/reject$/)
    ) {
      const staff = await currentStaff(request);
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-mappings/", "").replace("/reject", ""),
      );
      const current = await getSupplierProductMappingById(id);
      const mapping = current?.supplierCode === "CJ"
        ? await rejectSupplierMappingById(id)
        : await setSupplierProductMappingStatus(id, "REJECTED", { actor: staff?.context.actorLabel, evidence: "Explicit staff rejection" });
      if (!mapping) {
        sendJson(response, 404, { error: "Supplier mapping not found." });
        return;
      }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff!.context), subsystem: "SUPPLIERS", actionType: "SUPPLIER_MAPPING_REJECTED", entityType: "SUPPLIER_MAPPING", entityId: mapping.id ?? id, entityLabel: `${mapping.supplierCode} ${mapping.supplierSku}`, summary: "Staff rejected a supplier mapping.", before: [{ label: "Status", value: current?.status }], after: [{ label: "Status", value: mapping.status }], targetRoute: "/admin/suppliers" });
      sendJson(response, 200, { mapping });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-mappings\/[^/]+\/check-stale$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-mappings/", "").replace("/check-stale", ""),
      );
      sendJson(response, 200, { mapping: await checkCjMappingStalenessById(id) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/supplier-orders") {
      const supplierOrders = await listAdminSupplierOrders();
      const orders = await listAdminOrders();
      sendJson(response, 200, {
        supplierOrders,
        attention: supplierOrders.map((supplierOrder) => ({
          supplierOrderId: supplierOrder.id,
          reasons: [
            ...deriveSupplierOrderAttention(supplierOrder),
            ...(orders.find((order) => order.orderNumber === supplierOrder.customerOrderNumber)
              ?.operationalHold?.active
              ? [
                  {
                    code: "ORDER_ON_HOLD",
                    label: "On hold",
                    detail: "Customer order is on hold",
                    createdAt: orders.find(
                      (order) => order.orderNumber === supplierOrder.customerOrderNumber,
                    )?.operationalHold?.createdAt,
                  },
                ]
              : []),
          ],
        })),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+$/)
    ) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", ""));
      const supplierOrder = await getAdminSupplierOrder(id);
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      const order = await getOrder(supplierOrder.customerOrderNumber);
      const tekcentralStock = supplierOrder.supplierCode === "TEKCENTRAL" ? await Promise.all((supplierOrder.tekcentralOperations?.reservations ?? []).map(async (item) => { const offer = await getTekCentralManualOffer(item.manualOfferId); return offer ? { offerId: offer.id, supplierSku: offer.supplierSku, onHand: offer.onHand, reserved: offer.reserved, available: offer.available, sourceCostExVat: offer.sourceCostExVat, stockObservedAt: offer.stockObservedAt, costObservedAt: offer.costObservedAt, active: offer.active } : undefined; })) : undefined;
      const supplierConfiguration = getSupplierRegistryEntry(supplierOrder.supplierCode);
      sendJson(response, 200, {
        supplierOrder,
        tekcentralStock: tekcentralStock?.filter(Boolean),
        supplierConfiguration: supplierOrder.supplierCode === "SYNTECH" ? { ...supplierConfiguration, apiProcurement: await getSyntechApiProcurementControl() } : supplierConfiguration,
        operationsNotification: supplierOrder.supplierCode === "SCOOP" ? await getSupplierOrderNotification(supplierOrder.id, "SCOOP_ACTION_REQUIRED") : undefined,
        attentionReasons: [
          ...deriveSupplierOrderAttention(supplierOrder),
          ...(order?.operationalHold?.active
            ? [
                {
                  code: "ORDER_ON_HOLD",
                  label: "On hold",
                  detail: "Customer order is on hold",
                  createdAt: order.operationalHold.createdAt,
                },
              ]
            : []),
        ],
        customerOrder: order,
        payloadPreview: order
          ? createSupplierPayloadPreview(order, supplierOrder)
          : undefined,
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/supplier-orders$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/supplier-orders", ""),
      );
      const supplierOrders = await generateSupplierOrders(orderNumber);
      if (!supplierOrders) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrders });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/notifications\/scoop-action-required\/retry$/)
    ) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/notifications/scoop-action-required/retry", ""));
      const notification = await retryScoopActionRequiredNotification(id);
      if (!notification) { sendJson(response, 404, { error: "Notification not found." }); return; }
      sendJson(response, 200, { notification });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/acknowledge$/)
    ) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/acknowledge", ""));
      const supplierOrder = await acknowledgeSupplierOrder(id);
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/approve$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/approve", ""),
      );
      const supplierOrder = await approveSupplierOrder(id);
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/tekcentral\/progress$/)) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/tekcentral/progress", ""));
      const body = await readJsonBody<{ action: "START_PICKING" | "MARK_PACKED" | "MARK_READY"; actor?: string }>(request);
      const supplierOrder = await progressTekCentralFulfilment({ id, action: body.action, actor: (await currentStaff(request))!.context.actorLabel });
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
      sendJson(response, 200, { supplierOrder }); return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/tekcentral\/fulfil$/)) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/tekcentral/fulfil", ""));
      await readJsonBody<{ actor?: string }>(request);
      const supplierOrder = await fulfilTekCentralSupplierOrder({ id, actor: (await currentStaff(request))!.context.actorLabel });
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
      sendJson(response, 200, { supplierOrder }); return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/tekcentral\/cancel$/)) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/tekcentral/cancel", ""));
      const body = await readJsonBody<{ actor?: string; reason?: string }>(request);
      const supplierOrder = await cancelTekCentralSupplierOrder({ id, actor: (await currentStaff(request))!.context.actorLabel, reason: body.reason });
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
      sendJson(response, 200, { supplierOrder }); return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/manual-order$/)
    ) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/manual-order", ""));
      const body = await readJsonBody<{ supplierReference?: string; note?: string }>(request);
      const staff = (await currentStaff(request))!.context;
      const supplierOrder = await markManualSupplierOrderOrdered({ id, supplierReference: body.supplierReference ?? "", note: body.note, actor: staff.actorLabel });
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
      await recordAdminAuditBestEffort({ category: "AUDIT", ...staffAuditActor(staff), subsystem: "SUPPLIER_ORDERS", actionType: "MANUAL_SUPPLIER_REFERENCE_ENTERED", entityType: "SUPPLIER_ORDER", entityId: supplierOrder.id, entityLabel: supplierOrder.id, summary: "Staff recorded a manual supplier procurement reference.", after: [{ label: "Customer order", value: supplierOrder.customerOrderNumber }, { label: "Supplier", value: supplierOrder.supplierCode }, { label: "External reference", value: supplierOrder.supplierOrderReference ?? "Recorded" }, { label: "Transition", value: "APPROVED → ORDERED" }], targetRoute: `/admin/supplier-orders/${encodeURIComponent(supplierOrder.id)}` });
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/preflight$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/preflight", ""),
      );
      const body = await readJsonBody<{
        selectedLogistics?: { logisticName?: string; fromCountryCode?: string };
      }>(request);
      const preflight = await prepareCjOrderPreflight({
        supplierOrderId: id,
        selectedLogistics: body.selectedLogistics,
      });
      sendJson(response, 200, { preflight: sanitizeCjOrderPreflightForAdmin(preflight) });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/syntech\/preflight$/)) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/syntech/preflight", ""));
      const body = await readJsonBody<{ shipping?: SyntechShippingSelection }>(request);
      const shipping = body.shipping ?? { type: "DELIVERY" };
      sendJson(response, 200, { preflight: await prepareSyntechOrderPreflight({ supplierOrderId: id, shipping }) });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/syntech\/create$/)) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/syntech/create", ""));
      const body = await readJsonBody<{ shipping?: SyntechShippingSelection; confirmed?: boolean }>(request);
      const staff = await currentStaff(request);
      const result = await createSyntechUatOrder({ supplierOrderId: id, shipping: body.shipping ?? { type: "DELIVERY" }, confirmed: body.confirmed === true, actor: staff!.context.actorLabel, auditActor: staffAuditActor(staff!.context) });
      sendJson(response, 200, result);
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/create$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/create", ""),
      );
      const body = await readJsonBody<{
        selectedLogistics?: { logisticName?: string; fromCountryCode?: string };
      }>(request);
      const result = await createRealCjOrder({
        supplierOrderId: id,
        selectedLogistics: body.selectedLogistics ?? {},
      });
      sendJson(response, 200, {
        ...result,
        preflight: result.preflight ? sanitizeCjOrderPreflightForAdmin(result.preflight) : undefined,
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/reconcile$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/reconcile", ""),
      );
      sendJson(response, 200, await reconcileCjOrder({ supplierOrderId: id }));
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/refresh-status$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/refresh-status", ""),
      );
      sendJson(response, 200, await refreshCjOrderStatus({ supplierOrderId: id }));
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/consignee-id$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/consignee-id", ""),
      );
      const body = await readJsonBody<{ consigneeId?: string }>(request);
      const result = await saveCjOperationalConsigneeId({ supplierOrderId: id, consigneeId: body.consigneeId });
      sendJson(response, 200, {
        ...result,
        preflight: result.preflight ? sanitizeCjOrderPreflightForAdmin(result.preflight) : undefined,
      });
      return;
    }

    if (
      request.method === "DELETE" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/consignee-id$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/consignee-id", ""),
      );
      const result = await removeCjOperationalConsigneeId({ supplierOrderId: id });
      sendJson(response, 200, {
        ...result,
        preflight: result.preflight ? sanitizeCjOrderPreflightForAdmin(result.preflight) : undefined,
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/cj\/select-logistics$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/cj/select-logistics", ""),
      );
      const body = await readJsonBody<{ selectedLogistics?: { logisticName?: string; fromCountryCode?: string } }>(request);
      const result = await selectCjLogisticsOverride({
        supplierOrderId: id,
        selectedLogistics: body.selectedLogistics ?? {},
      });
      sendJson(response, 200, {
        ...result,
        preflight: result.preflight ? sanitizeCjOrderPreflightForAdmin(result.preflight) : undefined,
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/mock-submit$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/mock-submit", ""),
      );
      if (process.env.NODE_ENV === "production") { sendJson(response, 403, { error: "Mock supplier tools are disabled in production." }); return; }
      const body = await readJsonBody<{ scenario?: MockSupplierScenario }>(request);
      const supplierOrder = await mockSubmitSupplierOrder(id, body.scenario ?? "SUCCESS");
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/mock-confirm$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/mock-confirm", ""),
      );
      if (process.env.NODE_ENV === "production") { sendJson(response, 403, { error: "Mock supplier tools are disabled in production." }); return; }
      const body = request.headers["content-length"]
        ? await readJsonBody<{
            confirmations?: {
              orderItemId: string;
              confirmedQuantity: number;
              backorderedQuantity?: number;
            }[];
          }>(request)
        : undefined;
      const supplierOrder = await applyMockSupplierOutcome(id, body?.confirmations);
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/mock-reject$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/mock-reject", ""),
      );
      if (process.env.NODE_ENV === "production") { sendJson(response, 403, { error: "Mock supplier tools are disabled in production." }); return; }
      const body = await readJsonBody<{ reason?: string }>(request);
      const supplierOrder = await rejectSupplierOrder(id, body.reason ?? "Mock supplier rejection.");
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/dispatch$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-orders/", "").replace("/dispatch", ""),
      );
      if (process.env.NODE_ENV === "production") { sendJson(response, 403, { error: "Mock supplier tools are disabled in production." }); return; }
      const body = await readJsonBody<{
        courier?: string;
        trackingNumber?: string;
        trackingUrl?: string;
        dispatchedAt?: string;
      }>(request);
      const supplierOrder = await dispatchSupplierOrder({ id, ...body });
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/lines\/[^/]+\/supplier-sku$/)
    ) {
      const match = url.pathname.match(
        /^\/api\/admin\/supplier-orders\/([^/]+)\/lines\/([^/]+)\/supplier-sku$/,
      );
      if (!match) {
        sendJson(response, 404, { error: "Endpoint not found." });
        return;
      }
      const body = await readJsonBody<{ supplierSku?: string }>(request);
      const supplierOrder = await mapSupplierOrderLineSku({
        supplierOrderId: decodeURIComponent(match[1]),
        productId: decodeURIComponent(match[2]),
        supplierSku: body.supplierSku ?? "",
      });
      if (!supplierOrder) {
        sendJson(response, 404, { error: "Supplier order not found." });
        return;
      }
      sendJson(response, 200, { supplierOrder });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/refunds$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/refunds", ""),
      );
      const body = await readJsonBody<{ returnRequestId?: string }>(request);
      const order = await createAdminRefund(orderNumber, body.returnRequestId);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, { order, activity: buildAdminActivity(order) });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/refunds\/[^/]+\/status$/)
    ) {
      const refundId = decodeURIComponent(
        url.pathname.replace("/api/admin/refunds/", "").replace("/status", ""),
      );
      const body = await readJsonBody<{ status: RefundStatus }>(request);
      const order = await updateAdminRefundStatus(refundId, body.status);
      if (!order) {
        sendJson(response, 404, { error: "Refund not found." });
        return;
      }
      sendJson(response, 200, { order, activity: buildAdminActivity(order) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      enforceAccountMutationOrigin(request);
      const body = await readJsonBody<CreateOrderBody>(request);
      const customer = await customerFromSessionToken(parseCustomerSessionCookie(request.headers.cookie));
      const order = await createOrder(body, customer?.id);
      const guestAccessToken = customer ? undefined : await issueGuestOrderAccess(order.orderNumber);
      sendJson(response, 201, { order: toCustomerOrder(order), guestAccessToken });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/shipping/quotes") {
      const body = await readJsonBody<Parameters<typeof createShippingQuote>[0]>(request);
      sendJson(response, 201, { quote: publicShippingQuote(await createShippingQuote(body)) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/shipping/options") {
      const body = await readJsonBody<Parameters<typeof createShippingOptionsResult>[0]>(request);
      const result = await createShippingOptionsResult(body);
      sendJson(response, 200, { ...result, options: result.options.map(publicShippingQuote) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/addresses/validate") {
      const body = await readJsonBody<Parameters<typeof validateDeliveryAddress>[0]>(request);
      sendJson(response, 200, await validateDeliveryAddress(body));
      return;
    }
    const shippingRevalidateMatch = url.pathname.match(/^\/api\/shipping\/quotes\/([^/]+)\/revalidate$/);
    if (request.method === "POST" && shippingRevalidateMatch) {
      const result = await revalidateShippingQuote(decodeURIComponent(shippingRevalidateMatch[1]));
      sendJson(response, 200, { quote: publicShippingQuote(result.quote), changed: result.changed });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/orders") {
      sendJson(response, 404, { error: "Endpoint not found." });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/orders/")) {
      await enforceCustomerAuthRateLimit(request, "guest-order-access", 60, 15 * 60 * 1_000);
      const orderNumber = decodeURIComponent(url.pathname.replace("/api/orders/", ""));
      const order = await getOrder(orderNumber);
      if (!order || !(await hasCustomerOrderAccess(request, order))) { denyCustomerOrderAccess(response); return; }
      sendJson(response, 200, { order: toCustomerOrder(order) });
      return;
    }

    const customerCancellationMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/cancellation$/);
    if (request.method === "POST" && customerCancellationMatch) {
      enforceAccountMutationOrigin(request);
      const orderNumber = decodeURIComponent(customerCancellationMatch[1]);
      const existing = await getOrder(orderNumber);
      if (!existing || !(await hasCustomerOrderAccess(request, existing))) { denyCustomerOrderAccess(response); return; }
      if (!(["PENDING", "CONFIRMED", "PROCESSING"] as OrderStatus[]).includes(existing.status)) {
        sendJson(response, 409, { error: "This order cannot currently be cancelled.", code: "CANCELLATION_NOT_AVAILABLE" });
        return;
      }
      const body = await readJsonBody<{ reason?: string }>(request);
      const reason = body.reason?.trim().slice(0, 500);
      const now = new Date().toISOString();
      await releaseTekCentralReservationsForCancelledOrder(orderNumber, "Customer cancellation");
      const order = await updateOrder(orderNumber, (current) => ({
        ...current,
        status: "CANCELLED",
        cancellationReason: reason,
        updatedAt: now,
        statusHistory: [...current.statusHistory, { status: "CANCELLED", label: "Cancelled", createdAt: now, note: reason || "Cancellation requested." }],
      }));
      sendJson(response, 200, { order: toCustomerOrder(order!) });
      return;
    }

    const customerReturnMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/returns$/);
    if (request.method === "POST" && customerReturnMatch) {
      enforceAccountMutationOrigin(request);
      const orderNumber = decodeURIComponent(customerReturnMatch[1]);
      const existing = await getOrder(orderNumber);
      if (!existing || !(await hasCustomerOrderAccess(request, existing))) { denyCustomerOrderAccess(response); return; }
      if (existing.status !== "DELIVERED" && existing.status !== "RETURN_REQUESTED") {
        sendJson(response, 409, { error: "This order is not currently eligible for a return request.", code: "RETURN_NOT_AVAILABLE" });
        return;
      }
      const body = await readJsonBody<{ items?: { productId: string; quantity: number }[]; reason?: string; notes?: string }>(request);
      const requestedItems = body.items ?? [];
      const items = requestedItems.map((requested) => {
        const purchased = existing.items.find((item) => item.productId === requested.productId);
        const alreadyReturned = existing.returns.flatMap((entry) => entry.items).filter((item) => item.productId === requested.productId).reduce((sum, item) => sum + item.quantity, 0);
        const available = purchased ? purchased.quantity - alreadyReturned : 0;
        const quantity = Math.trunc(requested.quantity);
        if (!purchased || quantity < 1 || quantity > available) throw new CustomerAuthError("RETURN_ITEMS_INVALID", "Select valid items and quantities for this order.", 400);
        return { productId: purchased.productId, name: purchased.name, quantity, unitPrice: purchased.unitPrice, lineTotal: purchased.unitPrice * quantity };
      });
      if (items.length === 0 || !body.reason?.trim()) throw new CustomerAuthError("RETURN_ITEMS_INVALID", "Select valid items and a return reason.", 400);
      const now = new Date().toISOString();
      const order = await updateOrder(orderNumber, (current) => ({
        ...current,
        status: "RETURN_REQUESTED",
        updatedAt: now,
        statusHistory: [...current.statusHistory, { status: "RETURN_REQUESTED", label: "Return requested", createdAt: now, note: "Return request received." }],
        returns: [...current.returns, { id: createLocalId("return"), orderId: current.id, items, reason: body.reason!.trim().slice(0, 200), notes: body.notes?.trim().slice(0, 2_000) || undefined, createdAt: now, status: "REQUESTED" }],
      }));
      sendJson(response, 201, { order: toCustomerOrder(order!) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/payfast/create") {
      enforceAccountMutationOrigin(request);
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      if (!body.orderNumber) throw badRequest("Order number is required.");
      const order = await getOrder(body.orderNumber);
      if (!order || !(await hasCustomerOrderAccess(request, order))) { denyCustomerOrderAccess(response); return; }
      const settings = await getBusinessSettings();
      if (settings.shipping.requireFreshQuoteBeforePayment && order.shippingQuoteSnapshot) {
        const result = await revalidateShippingQuote(order.shippingQuoteSnapshot.quoteId);
        if (result.changed) {
          sendJson(response, 409, { error: "Delivery cost changed. Review the updated delivery quote before payment.", code: "SHIPPING_QUOTE_CHANGED", quote: publicShippingQuote(result.quote) });
          return;
        }
      }
      const paymentRequest = await createPayment(order);
      sendJson(response, 200, paymentRequest);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/create") {
      enforceAccountMutationOrigin(request);
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      if (!body.orderNumber) throw badRequest("Order number is required.");
      const order = await getOrder(body.orderNumber);
      if (!order || !(await hasCustomerOrderAccess(request, order))) { denyCustomerOrderAccess(response); return; }
      const settings = await getBusinessSettings();
      if (settings.shipping.requireFreshQuoteBeforePayment && order.shippingQuoteSnapshot) { const result = await revalidateShippingQuote(order.shippingQuoteSnapshot.quoteId); if (result.changed) { sendJson(response, 409, { error: "Delivery cost changed. Review the updated delivery quote before payment.", code: "SHIPPING_QUOTE_CHANGED", quote: publicShippingQuote(result.quote) }); return; } }
      sendJson(response, 200, await createPayment(order));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/payments/")) {
      await enforceCustomerAuthRateLimit(request, "guest-payment-status", 60, 15 * 60 * 1_000);
      const match = url.pathname.match(/^\/api\/payments\/([^/]+)\/status$/);
      if (!match) {
        sendJson(response, 404, { error: "Endpoint not found." });
        return;
      }
      const order = await getOrder(decodeURIComponent(match[1]));
      if (!order || !(await hasCustomerOrderAccess(request, order))) { denyCustomerOrderAccess(response); return; }
      sendJson(response, 200, {
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment.status,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/payfast/itn") {
      const rawBody = await readBody(request);
      const data = parseQuery(rawBody) as Record<string, string>;
      const remoteAddress = normalizeIp(request.socket.remoteAddress);
      const forwardedClientIp = getForwardedClientIp(request);
      const trustedClientIp = getClientIp(request);
      if (!validateItnShape(data)) {
        await recordPayfastItnEvent({
          orderNumber: data.m_payment_id?.replace(/-PF$/, ""),
          paymentReference: data.m_payment_id,
          pfPaymentId: data.pf_payment_id,
          remoteAddress,
          forwardedClientIp,
          trustedClientIp,
          accepted: false,
          reason: "Malformed PayFast ITN.",
        });
        sendJson(response, 400, { error: "Malformed PayFast ITN." });
        return;
      }
      const order = data.m_payment_id
        ? await getOrder(data.m_payment_id.replace(/-PF$/, ""))
        : undefined;
      if (!order) {
        await recordPayfastItnEvent({
          orderNumber: data.m_payment_id.replace(/-PF$/, ""),
          paymentReference: data.m_payment_id,
          pfPaymentId: data.pf_payment_id,
          remoteAddress,
          forwardedClientIp,
          trustedClientIp,
          accepted: false,
          reason: "Order not found.",
        });
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      const duplicateKey = data.pf_payment_id || data.signature;
      if (isDuplicatePayfastItn(order, duplicateKey)) {
        if (loadPersistenceConfig().provider === "POSTGRES" && order.payment.status === "PAID") await ensureInvoiceForPaidOrderOperationally(order.id, order.orderNumber);
        try {
          await autoAllocatePaidOrder(order.orderNumber);
        } catch (error) {
          console.error("Duplicate-ITN supplier allocation reconciliation failed", {
            orderNumber: order.orderNumber,
            error: error instanceof Error ? error.message : "Unknown allocation error",
          });
        }
        await recordPayfastItnEvent({
          orderNumber: order.orderNumber,
          paymentReference: data.m_payment_id,
          pfPaymentId: data.pf_payment_id,
          remoteAddress,
          forwardedClientIp,
          trustedClientIp,
          accepted: true,
          reason: "Duplicate ITN.",
        });
        sendJson(response, 200, { ok: true, duplicate: true });
        return;
      }
      const validation = await validatePayfastItn(
        data,
        order,
        await getPayfastConfigForOrder(order),
        getClientIp(request),
      );
      if (!validation.ok) {
        await recordPayfastItnEvent({
          orderNumber: order.orderNumber,
          paymentReference: data.m_payment_id,
          pfPaymentId: data.pf_payment_id,
          remoteAddress,
          forwardedClientIp,
          trustedClientIp,
          accepted: false,
          reason: validation.reason,
          signatureDiagnostic:
            process.env.PAYFAST_DEBUG_SIGNATURE === "true"
              ? validation.signatureDiagnostic
              : undefined,
        });
        await bestEffortAlert({ type: "PAYMENT_CALLBACK_VERIFICATION_FAILED", severity: "CRITICAL", subsystem: "PAYMENTS", title: "PayFast callback verification failed", summary: "A payment callback could not be verified against the canonical order and gateway rules.", entityType: "ORDER", entityId: order.orderNumber, targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}`, recommendedAction: "Open affected order", diagnosticCode: "PAYFAST_ITN_VERIFICATION_FAILED", customerImpactCount: 1 });
        sendJson(response, 400, { error: validation.reason });
        return;
      }
      const paidOrder = await confirmVerifiedPayfastPayment(order.orderNumber, {
        payfastPaymentId: data.pf_payment_id,
        gatewayTransactionId: data.pf_payment_id,
        grossAmount: Number(data.amount_gross),
        confirmedAt: new Date().toISOString(),
        processedItnIds: duplicateKey
          ? [...order.payment.processedItnIds, duplicateKey]
          : order.payment.processedItnIds,
      });
      if (paidOrder && loadPersistenceConfig().provider === "POSTGRES") await ensureInvoiceForPaidOrderOperationally(paidOrder.id, paidOrder.orderNumber);
      try {
        await autoAllocatePaidOrder(order.orderNumber);
      } catch (error) {
        console.error("Paid-order supplier allocation failed", {
          orderNumber: order.orderNumber,
          error: error instanceof Error ? error.message : "Unknown allocation error",
        });
        await bestEffortAlert({ type: "SUPPLIER_ORDER_CREATION_FAILED", severity: "CRITICAL", subsystem: "SUPPLIERS", title: "Paid order requires procurement intervention", summary: "Supplier allocation failed after payment confirmation. The customer order remains the financial source of truth.", entityType: "ORDER", entityId: order.orderNumber, targetRoute: `/admin/orders/${encodeURIComponent(order.orderNumber)}`, recommendedAction: "Open affected order", diagnosticCode: "PAID_ORDER_ALLOCATION_FAILED", customerImpactCount: 1 });
      }
      await recordPayfastItnEvent({
        orderNumber: order.orderNumber,
        paymentReference: data.m_payment_id,
        pfPaymentId: data.pf_payment_id,
        remoteAddress,
        forwardedClientIp,
        trustedClientIp,
        accepted: true,
        reason: "Payment confirmed.",
      });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/payfast/cancel") {
      enforceAccountMutationOrigin(request);
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      if (!body.orderNumber) throw badRequest("Order number is required.");
      const existing = await getOrder(body.orderNumber);
      if (!existing || !(await hasCustomerOrderAccess(request, existing))) { denyCustomerOrderAccess(response); return; }
      const order = await updatePaymentStatus(body.orderNumber, "CANCELLED");
      if (!order) { denyCustomerOrderAccess(response); return; }
      sendJson(response, 200, {
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment.status,
      });
      return;
    }

    sendJson(response, 404, { error: "Endpoint not found." });
  } catch (error) {
    const explicitStatus = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : undefined;
    const knownError = error instanceof RequestBodyTooLargeError || error instanceof InvoiceAccessError || error instanceof RecaptchaError || error instanceof ContactMessagingError || error instanceof AdminCustomerError || error instanceof StorefrontAnalyticsError || error instanceof CartError || error instanceof ZeusGuardError || error instanceof ZeusRequestError || error instanceof ZeusToolError || error instanceof ContactSubmissionError || error instanceof CustomerAuthError || error instanceof CustomerOrderClaimError || error instanceof StaffAuthError || error instanceof StaffPermissionDeniedError || error instanceof SettingsConflictError || error instanceof SupplierWorkflowError || error instanceof CjApiError || error instanceof ShippingQuoteError || error instanceof SyntechOrderError || error instanceof CjOrderError || explicitStatus !== undefined;
    const status = error instanceof RequestBodyTooLargeError ? 413 : error instanceof InvoiceAccessError ? error.status : error instanceof RecaptchaError ? error.status : error instanceof ContactMessagingError ? error.status : error instanceof AdminCustomerError ? error.status : error instanceof StorefrontAnalyticsError ? error.status : error instanceof CartError ? error.status : error instanceof ZeusGuardError ? error.status : error instanceof ZeusRequestError ? error.status : error instanceof ContactSubmissionError || error instanceof CustomerAuthError || error instanceof CustomerOrderClaimError || error instanceof StaffAuthError || error instanceof StaffPermissionDeniedError ? error.status : error instanceof SettingsConflictError ? 409 : explicitStatus ?? (knownError ? 400 : 500);
    const diagnosticCode = "code" in Object(error) && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : error instanceof Error ? error.name : "UNKNOWN_ERROR";
    if (request.method === "POST" && url.pathname === "/api/orders") await bestEffortAlert({ type: "CHECKOUT_ORDER_CREATION_FAILED", severity: "CRITICAL", subsystem: "CHECKOUT", title: "Checkout could not create an order", summary: "A customer checkout attempt failed before the order could be safely created.", targetRoute: "/admin/orders", recommendedAction: "Review Orders", diagnosticCode, customerImpactCount: 1 });
    if (request.method === "POST" && ["/api/payments/payfast/create", "/api/payments/create"].includes(url.pathname)) await bestEffortAlert({ type: "PAYMENT_INITIALIZATION_FAILED", severity: "CRITICAL", subsystem: "PAYMENTS", title: "Payment initialization failed", summary: "A customer payment attempt could not be initialized safely.", targetRoute: "/admin/settings/payments", recommendedAction: "Review payment settings", diagnosticCode, customerImpactCount: 1 });
    if (error instanceof ShippingQuoteError && ["SHIPPING_DISABLED", "QUOTE_UNAVAILABLE", "UNKNOWN_PRODUCT"].includes(error.code)) await bestEffortAlert({ type: "SHIPPING_RATE_CALCULATION_FAILED", severity: "CRITICAL", subsystem: "SHIPPING", title: "Shipping calculation blocked checkout", summary: "A delivery quote could not be produced for a customer checkout attempt.", targetRoute: "/admin/settings/shipping", recommendedAction: "Check shipping configuration", diagnosticCode: error.code, customerImpactCount: 1 });
    if (error instanceof ZeusRequestError && error.status >= 500) await bestEffortAlert({ type: error.code === "CIRCUIT_BREAKER_OPEN" ? "ZEUS_CIRCUIT_BREAKER_ACTIVE" : "ZEUS_PROVIDER_FAILURE_SPIKE", severity: "WARNING", subsystem: "ZEUS", title: "Zeus provider is temporarily unavailable", summary: "Zeus recorded a provider-side failure. Customer commerce data and supplier details remain protected.", targetRoute: "/admin/reports/zeus", recommendedAction: "Review Zeus health", diagnosticCode: error.code });
    if (request.method === "POST" && /\/api\/admin\/suppliers\/(scoop|syntech)\/.*sync/i.test(url.pathname)) { const supplier = url.pathname.toLowerCase().includes("syntech") ? "SYNTECH" : "SCOOP"; await bestEffortAlert({ type: "SUPPLIER_FEED_REFRESH_FAILED", severity: "WARNING", subsystem: "SUPPLIERS", title: "Supplier catalogue refresh failed", summary: "A supplier catalogue refresh did not complete successfully.", entityType: "SUPPLIER", entityId: supplier, targetRoute: "/admin/suppliers", recommendedAction: "Open Supplier Hub", diagnosticCode: `${supplier}_SYNC_FAILED` }); }
    if (error instanceof RecaptchaError && error.reason === "VERIFICATION_UNAVAILABLE") await bestEffortAlert({ type: "RECAPTCHA_VERIFICATION_PROVIDER_FAILURE", severity: "WARNING", subsystem: "SYSTEM", title: "reCAPTCHA verification provider unavailable", summary: "An abuse-protected public action could not be verified because the external verification service was unavailable.", targetRoute: "/admin/settings/health", recommendedAction: "Review system health", diagnosticCode: "RECAPTCHA_PROVIDER_UNAVAILABLE", customerImpactCount: 1 });
    if (error instanceof StorefrontAnalyticsError && error.status >= 500) await bestEffortAlert({ type: "ANALYTICS_PIPELINE_FAILED", severity: "WARNING", subsystem: "SYSTEM", title: "Storefront analytics persistence failed", summary: "A first-party analytics event could not be stored. Core commerce remains authoritative.", targetRoute: "/admin/reports/analytics", recommendedAction: "Review analytics", diagnosticCode: error.code });
    if (request.method === "GET" && url.pathname === "/sitemap.xml") await bestEffortAlert({ type: "SITEMAP_GENERATION_FAILED", severity: "WARNING", subsystem: "SYSTEM", title: "Sitemap generation failed", summary: "The public sitemap could not be generated from the canonical published catalogue.", targetRoute: "/admin/settings/health", recommendedAction: "Review system health", diagnosticCode });
    if (!knownError) console.error("Unhandled request error", { requestId: secureResponse.requestId, method: request.method, pathname: url.pathname, errorName: error instanceof Error ? error.name : "UNKNOWN_ERROR", ...(process.env.NODE_ENV !== "production" && error instanceof Error ? { stack: error.stack } : {}) });
    const responseCode =
        error instanceof InvoiceAccessError
          ? error.code
          : error instanceof RecaptchaError
          ? `RECAPTCHA_${error.reason}`
          : error instanceof ContactMessagingError
          ? error.code
          : error instanceof AdminCustomerError
          ? error.code
          : error instanceof StorefrontAnalyticsError
          ? error.code
          : error instanceof CartError
          ? error.code
          : error instanceof ZeusGuardError
          ? error.code
          : error instanceof ZeusRequestError || error instanceof ZeusToolError
          ? error.code
          : error instanceof ContactSubmissionError
          ? error.code
          : error instanceof CustomerAuthError
          ? error.code
          : error instanceof StaffAuthError
          ? error.code
          : error instanceof CustomerOrderClaimError
          ? error.code
          : error instanceof SupplierWorkflowError || error instanceof CjApiError || error instanceof ShippingQuoteError || error instanceof SyntechOrderError
          ? error.code
          : error instanceof CjOrderError
          ? error.code
          : error instanceof SettingsConflictError
          ? error.code
          : knownError && error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : knownError
          ? undefined
          : "INTERNAL_SERVER_ERROR";
    sendJson(response, status, {
      ...safeErrorEnvelope(error, knownError, secureResponse.requestId, responseCode),
      actions: error instanceof ZeusGuardError ? error.actions : undefined,
      quota: error instanceof ZeusGuardError ? error.quota : undefined,
    });
  }
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
validateRuntimeSecurityConfig();
await bootstrapInitialSuperAdminFromEnvironment();
const server = createServer(handleRequest);
let adminAiAutomationWorker: ReturnType<typeof startAdminAiAutomationWorker> | undefined;
let customerDeliveryWorker: ReturnType<typeof startCustomerDeliveryWorker> | undefined;
let commerceReconciliationWorker: ReturnType<typeof startCommerceReconciliationWorker> | undefined;
let fxScheduler: ReturnType<typeof startFxReconciliationScheduler> | undefined;
let syntechScheduler: ReturnType<typeof startSyntechScheduler> | undefined;
server.listen(port, host, () => {
  console.log(`TekCentral payment backend listening on http://${host}:${port}`);
  const mayRunScheduledJobs = process.env.APP_ROLE === "worker";
  fxScheduler = mayRunScheduledJobs ? startFxReconciliationScheduler() : { enabled: false, stop: () => undefined };
  console.log(`FX reconciliation scheduler ${fxScheduler.enabled ? "enabled" : "disabled"}.`);
  syntechScheduler = mayRunScheduledJobs ? startSyntechScheduler() : { enabled: false, stop: () => undefined };
  console.log(`Syntech feed scheduler ${syntechScheduler.enabled ? "enabled" : "disabled"}.`);
  adminAiAutomationWorker = mayRunScheduledJobs ? startAdminAiAutomationWorker(createAdminAiService()) : { enabled: false, stop: () => undefined };
  console.log(`Admin AI automation worker ${adminAiAutomationWorker.enabled ? "enabled" : "disabled"}.`);
  customerDeliveryWorker = mayRunScheduledJobs && loadPersistenceConfig().provider === "POSTGRES" ? startCustomerDeliveryWorker() : { enabled: false, stop: () => undefined };
  console.log(`Customer delivery worker ${customerDeliveryWorker.enabled ? "enabled" : "disabled"}.`);
  commerceReconciliationWorker = mayRunScheduledJobs && loadPersistenceConfig().provider === "POSTGRES" ? startCommerceReconciliationWorker() : { enabled: false, stop: () => undefined };
  console.log(`Commerce reconciliation worker ${commerceReconciliationWorker.enabled ? "enabled" : "disabled"}.`);
});
let shuttingDown = false;
const shutdown = (signal: string) => { if (shuttingDown) return; shuttingDown = true; console.log(`Received ${signal}; stopping new requests.`); fxScheduler?.stop(); syntechScheduler?.stop(); adminAiAutomationWorker?.stop(); customerDeliveryWorker?.stop(); commerceReconciliationWorker?.stop(); server.close(() => void closePostgres().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10_000).unref(); };
process.once("SIGTERM", () => shutdown("SIGTERM")); process.once("SIGINT", () => shutdown("SIGINT"));
