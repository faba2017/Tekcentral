import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import {
  buildPayfastPaymentRequest,
  createPayfastItnSignature,
  createPayfastItnSignatureDiagnostic,
  isDuplicatePayfastItn,
  validatePayfastItn,
} from "../payfast.js";
import { getOrder, listOrders, saveOrder, updatePaymentStatus } from "../orderRepository.js";
import { saveSupplierOrder } from "../supplierOrderRepository.js";
import { backendProducts, calculateBackendTotals } from "../catalogue.js";
import { toCustomerOrder } from "../customerOrderView.js";
import {
  listSupplierProductMappings,
  saveSupplierProductMapping,
  setSupplierProductMappingStatus,
} from "../supplierProductMappingRepository.js";
import { applyPricingRounding, calculateManualPriceOverride, calculateProposedPrice, cjLandedCostPricingInput, classifyPricingWarning, prepareSupplierPricing, scoopPricingInput, TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS } from "../supplierPricing.js";
import { defaultPricingSettings, defaultShippingSettings, getBusinessSettings, normalizeShippingSettings, updatePricingSettings, updateShippingSettings } from "../businessSettingsRepository.js";
import { applyShippingPolicy, createShippingOptions, createShippingOptionsResult, publicShippingQuote, requireShippingQuote, selectCustomerSafeCjRoute, testScoopZoneEstimate } from "../shippingService.js";
import { saveShippingQuote } from "../shippingQuoteRepository.js";
import { classifyGoogleAddressValidationFailure, normalizeGoogleValidatedAddress, validateDeliveryAddress } from "../addressValidation.js";
import { calculateFreightReconciliation, calculateVolumetricWeightKg, estimateLocalShipping, LocalShippingEstimateError, resolveLocalShippingZone, resolveLocalShippingZoneMatch, roundShippingCharge, type LocalShippingRateCard } from "../localShippingEstimator.js";
import { findIngestedPublicImage, ingestPublicProductImage, publicImageContentType, readPublicProductImage } from "../publicImageIngestion.js";
import { defaultSeoTitle, preparePublicationContentDefaults } from "../publicationContentDefaults.js";
import { hasMaterialPublicChanges } from "../publicationSnapshot.js";
import { isCompleteSouthAfricanAddress, parseGoogleAddressComponents } from "../../src/lib/google-address.js";
import { listPricingProposals, savePricingProposal, setPricingProposalStatus } from "../pricingProposalRepository.js";
import { createPricingOverride, generateScoopPricingProposal, previewPricingOverride } from "../pricingService.js";
import { CjAuthService } from "../suppliers/cj/cjAuthService.js";
import { CjApiError } from "../suppliers/cj/cjErrors.js";
import {
  extractProductList,
  normalizeCjCategories,
  normalizeCjProduct,
  normalizeCjStock,
  normalizeCjVariant,
} from "../suppliers/cj/cjProductMapper.js";
import { saveCjCatalogueProduct, getCjCatalogueProduct, listCjCatalogueProducts } from "../suppliers/cj/cjCatalogueRepository.js";
import {
  checkCjMappingStalenessById,
  searchCjProducts,
  suggestCjMapping,
  verifySupplierMappingById,
} from "../suppliers/cj/cjCatalogueAdapter.js";
import {
  applyCjCatalogueScope,
  annotateTechnologyProduct,
  assertCjTechnologyPolicyAvailable,
  filterCategoryTree,
  technologyMatches,
  technologyPolicyResponse,
} from "../suppliers/cj/cjCataloguePolicy.js";
import { products } from "../../src/data/catalogue.js";
import {
  addInternalNote,
  createAdminShipment,
  createAdminRefund,
  createParcel,
  createSupplierAllocation,
  acknowledgePaidOrder,
  baselinePaidOrderAlerts,
  deriveAttentionReasons,
  derivePaidOrderAlerts,
  listAdminOrders,
  releaseOperationalHold,
  setOperationalHold,
  updateAdminOrderStatus,
  updateAdminRefundStatus,
  updateAdminReturnStatus,
} from "../adminOperations.js";
import {
  acknowledgeSupplierOrder,
  applyMockSupplierOutcome,
  approveSupplierOrder,
  autoAllocatePaidOrder,
  deriveSupplierOrderAttention,
  dispatchSupplierOrder,
  generateSupplierOrders,
  getAdminSupplierOrder,
  listAdminSupplierOrders,
  mapSupplierOrderLineSku,
  markManualSupplierOrderOrdered,
  mockSubmitSupplierOrder,
} from "../supplierOrchestration.js";
import { supplierAdapters } from "../mockSupplierAdapters.js";
import { getSupplierProductMappingById } from "../supplierProductMappingRepository.js";
import { getSupplierRegistryEntry } from "../supplierRegistry.js";
import { hasCapability, requireCapability, supplierOfferFromMapping } from "../supplierDomain.js";
import { getSupplierOrderNotification, notifyNewScoopActionRequired, retryScoopActionRequiredNotification } from "../internalNotificationService.js";
import type { MailMessage } from "../mailService.js";
import {
  buildCjFreightRequest,
  buildCjFreightTipRequest,
  checkCjVariantDeliveryToSouthAfrica,
  createRealCjOrder,
  normalizeSouthAfricanConsigneeIdForCj,
  normalizeSouthAfricanPhoneForCj,
  prepareCjOrderPreflight,
  reconcileCjOrder,
  removeCjOperationalConsigneeId,
  refreshCjOrderStatus,
  saveCjOperationalConsigneeId,
  sanitizeCjOrderPreflightForAdmin,
  selectCjLogisticsOverride,
} from "../suppliers/cj/cjOrderAdapter.js";
import { parseScoopPricelistXml, scoopProductToSupplierOffer } from "../suppliers/scoop/scoopCatalogueAdapter.js";
import { enrichScoopProductLogistics, extractScoopLogisticsMetadata, parseScoopDimensions, parseScoopWeight, resolveScoopProductPageFromSearch, selectScoopLogisticsBatchCandidates, stockedScoopBranches } from "../suppliers/scoop/scoopLogisticsEnrichment.js";
import {
  clearScoopAdminLogistics,
  getScoopCatalogueProduct,
  listScoopLogisticsAudit,
  listScoopCatalogueProducts,
  saveScoopAdminLogistics,
  setScoopLaunchAssortmentState,
  syncScoopCatalogueProducts,
  scoopIdentityConflict,
} from "../suppliers/scoop/scoopCatalogueRepository.js";
import { deriveScoopLogisticsStatus, effectiveScoopLogisticsMetadata, validateScoopLogisticsValues } from "../suppliers/scoop/scoopLogisticsMetadata.js";
import { deriveScoopLaunchReadiness, latestScoopProposal, scoopCandidateReasons, suggestScoopLaunchCandidates } from "../suppliers/scoop/scoopLaunchReadiness.js";
import { applyScoopLogisticsCsv, exportMissingScoopLogisticsCsv, previewScoopLogisticsCsv } from "../suppliers/scoop/scoopLogisticsCsv.js";
import { acquireScoopManufacturerLogistics, normalizeDimension, normalizeWeight, type ScoopManufacturerMetadataProvider } from "../suppliers/scoop/scoopManufacturerLogistics.js";
import { createTekCentralProductFromScoop, requireWeakMappingConfirmation, scoreScoopProductMatch, suggestScoopCategory, suggestScoopProductTitles } from "../suppliers/scoop/scoopProductCreation.js";
import { applyScoopWebsiteImport, discoverScoopWebsiteProducts, previewScoopWebsiteImport } from "../suppliers/scoop/scoopWebsiteImport.js";
import { getInternalProduct } from "../internalProductRepository.js";
import { derivePublicationEligibility, getPublicationPreview, getPublicationReview, getPublicationSummary, getPublicProductBySlug, listPublicProducts, publishProduct, rollbackProduct, unpublishProduct } from "../productPublicationRepository.js";
import type { BackendOrder, SupplierOrder, SupplierProductMapping } from "../types.js";
import type { PricingProposal } from "../pricingProposalRepository.js";
import type { ScoopCatalogueProduct } from "../suppliers/scoop/scoopTypes.js";

const order: BackendOrder = {
  id: "order-test",
  orderNumber: "TC-2026-000001",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  customer: {
    firstName: "Test",
    lastName: "Customer",
    email: "test@example.com",
    mobile: "0821234567",
    consigneeId: "8001015009087",
  },
  deliveryAddress: {
    streetAddress: "1 Test Street",
    suburb: "Rosebank",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2196",
    country: "South Africa",
  },
  deliveryMethod: {
    id: "standard",
    name: "Standard Delivery",
    description: "Delivery to your South African address.",
    estimatedRange: "2-5 business days",
    price: 149,
    enabled: true,
  },
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
    status: "PENDING",
    paymentReference: "TC-2026-000001-PF",
    updatedAt: "2026-09-05T00:00:00.000Z",
    processedItnIds: [],
  },
  items: [
    {
      productId: "demo-laptop-pro-14",
      slug: "tekpro-14-business-laptop",
      sku: "TC-LTP-14",
      name: "14-inch Business Laptop",
      brand: "TekPro",
      quantity: 1,
      unitPrice: 18999,
      lineTotal: 18999,
    },
  ],
  subtotal: 18999,
  deliveryAmount: 149,
  taxAmount: 2498,
  total: 19148,
  currency: "ZAR",
  status: "PENDING",
  statusHistory: [],
  returns: [],
  refunds: [],
};

const config = {
  merchantId: "sandbox-merchant-id",
  merchantKey: "sandbox-merchant-key",
  passphrase: "sandbox-passphrase",
  mode: "sandbox" as const,
  publicAppUrl: "https://tekcentral.test",
  publicApiUrl: "https://api.tekcentral.test",
  trustProxy: false,
};

assert.equal(normalizeSouthAfricanPhoneForCj("0821234567"), "27821234567");
assert.equal(normalizeSouthAfricanPhoneForCj("+27 82 123 4567"), "27821234567");
assert.equal(normalizeSouthAfricanPhoneForCj("27821234567"), "27821234567");
assert.equal(normalizeSouthAfricanPhoneForCj("not-a-phone"), undefined);
assert.equal(normalizeSouthAfricanConsigneeIdForCj("800101-5009-087"), "8001015009087");
assert.equal(normalizeSouthAfricanConsigneeIdForCj("12345"), undefined);
assert.equal(normalizeSouthAfricanConsigneeIdForCj(undefined), undefined);

class MockCjOrderClient {
  calls: { path: string; body?: unknown }[] = [];
  failCreate: "none" | "network" | "supplier" = "none";
  logisticsMode: "available" | "empty" = "available";
  unavailableMode: "known" | "unknown" = "known";
  stockMode: "available" | "source-unresolved" = "available";
  productDataMode: "complete" | "missing-weight" | "missing-product-prop" = "complete";
  listMode: "available" | "empty" | "unavailable" = "available";
  logisticsName = "CJPacket Sensitive";
  logisticsOptions?: { name: string; cost: string; estimate?: string }[];

  async request<T>(path: string, options: { query?: Record<string, string | number | undefined>; body?: unknown } = {}) {
    this.calls.push({ path, body: options.body });
    if (path === "/product/variant/queryByVid") {
      return {
        data: {
          vid: "VID-UNVERIFIED",
          pid: "PID-UNVERIFIED",
          productSku: "CJ-SPU-UNVERIFIED",
          variantSku: "CJ-VAR-UNVERIFIED",
          variantNameEn: "Dock variant",
          variantWeight: this.productDataMode === "missing-weight" ? undefined : 250,
          sellPrice: "12.50",
          currency: "USD",
        },
        requestId: "variant-request",
      } as T;
    }
    if (path === "/product/query") {
      return {
        data: {
          pid: "PID-UNVERIFIED",
          productSku: "CJ-SPU-UNVERIFIED",
          productNameEn: "USB-C Business Dock Candidate",
          productWeight: this.productDataMode === "missing-weight" ? undefined : 250,
          productProEnSet: this.productDataMode === "missing-product-prop" ? [] : ["ELECTRONIC"],
          sellPrice: "20.00",
          currency: "USD",
        },
        requestId: "product-query-request",
      } as T;
    }
    if (path === "/product/stock/queryByVid") {
      if (this.stockMode === "source-unresolved") {
        return {
          data: [{ areaEn: "Unknown Warehouse", totalInventoryNum: 4 }],
          requestId: "stock-unresolved-request",
        } as T;
      }
      return {
        data: [{ areaEn: "China Warehouse", countryCode: "CN", totalInventoryNum: 4 }],
        requestId: "stock-request",
      } as T;
    }
    if (path === "/logistic/freightCalculate") {
      if (this.logisticsMode === "empty") {
        return {
          data: [],
          requestId: "freight-empty-request",
        } as T;
      }
      return {
        data: [
          {
            logisticsInfoList: [
              {
                id: "LOG-1",
                logisticsName: "CJPacket",
                postage: "5.50",
                startCountryCode: "CN",
                destCountryCode: "ZA",
              },
            ],
          },
        ],
        requestId: "freight-request",
      } as T;
    }
    if (path === "/logistic/freightCalculateTip") {
      if (this.logisticsMode === "empty") {
        return {
          data: [],
          requestId: "freight-tip-empty-request",
        } as T;
      }
      return {
        data: (this.logisticsOptions ?? [{ name: this.logisticsName, cost: "7.25", estimate: "10-18 days" }]).map((option, index) => ({
          optionId: `TIP-LOG-${index + 1}`,
          option: { enName: option.name, arrivalTime: option.estimate },
          srcArea: { shortCode: "CN" },
          destArea: { shortCode: "ZA" },
          totalPostageFee: option.cost,
        })),
        requestId: "freight-tip-request",
      } as T;
    }
    if (path === "/logistic/unavailableShippingMethods") {
      return {
        data: {
          unavailableList: [
            {
              optionName: "CJPacket Sensitive",
              errorCode: this.unavailableMode === "unknown" ? 2999 : 2007,
              errorEn: this.unavailableMode === "unknown" ? "Supplier trial rejected this parcel" : "Weight is not supported",
            },
          ],
        },
        requestId: "unavailable-request",
      } as T;
    }
    if (path === "/shopping/order/createOrderV2") {
      if (this.failCreate === "network") throw new CjApiError("CJ_API_UNAVAILABLE", "CJ API unavailable.");
      if (this.failCreate === "supplier") throw new Error("CJ supplier rejected the create request.");
      return {
        data: {
          orderId: "CJ-ID-1",
          orderNumber: "CJ-ORDER-1",
          orderStatus: "Awaiting Payment",
          payStatus: "Unpaid",
        },
        requestId: "create-request",
      } as T;
    }
    if (path === "/shopping/order/getOrderDetail") {
      return {
        data: {
          orderId: "CJ-ID-1",
          orderNumber: "CJ-ORDER-1",
          orderStatus: "Awaiting Payment",
          payStatus: "Unpaid",
        },
        requestId: "detail-request",
      } as T;
    }
    if (path === "/shopping/order/list") {
      if (this.listMode === "unavailable") throw new CjApiError("CJ_API_UNAVAILABLE", "CJ API unavailable.");
      if (this.listMode === "empty") {
        return {
          data: { list: [] },
          requestId: "list-empty-request",
        } as T;
      }
      const reference = String(
        options.query?.orderContent ??
          (options.body as { orderContent?: string } | undefined)?.orderContent ??
          "",
      );
      return {
        data: {
          list: [
            {
              orderId: "CJ-ID-FOUND",
              orderNumber: "CJ-ORDER-FOUND",
              orderStatus: "Awaiting Payment",
              payStatus: "Unpaid",
              tekcentralReference: reference,
            },
          ],
        },
        requestId: "list-request",
      } as T;
    }
    throw new Error(`Unexpected CJ mock path ${path}`);
  }
}

class MockCjCatalogueClient {
  calls: { path: string; query?: Record<string, string | number | undefined> }[] = [];

  async request<T>(path: string, options: { query?: Record<string, string | number | undefined> } = {}) {
    this.calls.push({ path, query: options.query });
    if (path === "/product/getCategory") {
      return {
        data: [
          {
            categoryFirstName: "Computer & Office",
            categoryFirstList: [
              {
                categorySecondName: "Storage Devices",
                categorySecondList: [
                  { categoryId: "4D3B9582-E92E-46BF-B00E-715E70FB4742", categoryName: "SSD" },
                ],
              },
            ],
          },
          {
            categoryFirstName: "Women's Clothing",
            categoryFirstList: [
              {
                categorySecondName: "Dresses",
                categorySecondList: [{ categoryId: "CLOTHING", categoryName: "Dresses" }],
              },
            ],
          },
        ],
        requestId: "category-request",
      } as T;
    }
    if (path === "/product/query") {
      const query = options.query ?? {};
      if (query.pid === "461C62AD-6DD4-4BB6-A0B4-51EE138480B5" || query.productSku === "CJSJYDFL00003") {
        return {
          data: {
            pid: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
            productSku: "CJSJYDFL00003",
            productNameEn: "Exact USB-C SSD Enclosure",
            categoryId: "4D3B9582-E92E-46BF-B00E-715E70FB4742",
            categoryNameEn: "SSD",
            sellPrice: "9.99",
            currency: "USD",
          },
          requestId: "product-query-request",
        } as T;
      }
      if (query.variantSku === "CJ-VAR-EXACT") {
        return {
          data: {
            pid: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
            productSku: "CJSJYDFL00003",
            productNameEn: "Exact USB-C SSD Enclosure",
            categoryId: "4D3B9582-E92E-46BF-B00E-715E70FB4742",
            categoryNameEn: "SSD",
            sellPrice: "9.99",
            currency: "USD",
          },
          requestId: "variant-sku-query-request",
        } as T;
      }
      if (query.productSku === "CJ-DRESS-001") {
        return {
          data: {
            pid: "DRESS-PID-1",
            productSku: "CJ-DRESS-001",
            productNameEn: "Summer Dress",
            categoryId: "CLOTHING",
            categoryNameEn: "Dresses",
            sellPrice: "12.00",
            currency: "USD",
          },
          requestId: "outside-scope-query-request",
        } as T;
      }
      throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "CJ product not found.");
    }
    if (path === "/product/variant/queryByVid") {
      if (options.query?.vid !== "1414473755404668928") {
        throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "CJ variant not found.");
      }
      return {
        data: {
          vid: "1414473755404668928",
          pid: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
          productSku: "CJSJYDFL00003",
          variantSku: "CJ-VAR-EXACT",
          variantNameEn: "1TB Black",
          sellPrice: "11.25",
          currency: "USD",
        },
        requestId: "vid-request",
      } as T;
    }
    if (path === "/product/variant/query") {
      return {
        data: [
          {
            vid: "1414473755404668928",
            pid: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
            productSku: "CJSJYDFL00003",
            variantSku: "CJ-VAR-EXACT",
            variantNameEn: "1TB Black",
            sellPrice: "11.25",
            currency: "USD",
          },
          {
            vid: "1414473755404668929",
            pid: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
            productSku: "CJSJYDFL00003",
            variantSku: "CJ-VAR-OTHER",
            variantNameEn: "2TB Silver",
            sellPrice: "18.50",
            currency: "USD",
          },
        ],
        requestId: "variant-query-request",
      } as T;
    }
    if (path === "/product/listV2") {
      return {
        data: {
          content: [
            {
              productList: [
                {
                  id: "LIST-PID-1",
                  sku: "LIST-SKU-1",
                  nameEn: "Wireless Mouse",
                  categoryId: "4D3B9582-E92E-46BF-B00E-715E70FB4742",
                  categoryNameEn: "Computer Accessories",
                  sellPrice: "4.50",
                  currency: "USD",
                },
              ],
            },
          ],
        },
        requestId: "list-request",
      } as T;
    }
    throw new CjApiError("CJ_PRODUCT_NOT_FOUND", `Unhandled mock CJ path ${path}.`);
  }
}

async function mapSupplierOrderSkus(supplierOrder: SupplierOrder) {
  if (supplierOrder.supplierCode === "MANUAL") return supplierOrder;
  let mapped = supplierOrder;
  for (const line of supplierOrder.itemLines) {
    mapped =
      (await mapSupplierOrderLineSku({
        supplierOrderId: supplierOrder.id,
        productId: line.productId,
        supplierSku: `${supplierOrder.supplierCode}-${line.customerSku ?? line.productId}`,
      })) ?? mapped;
  }
  return mapped;
}

const request = buildPayfastPaymentRequest(order, config);
assert.equal(request.actionUrl, "https://sandbox.payfast.co.za/eng/process");
assert.equal(request.fields.m_payment_id, "TC-2026-000001-PF");
assert.equal(request.fields.amount, "19148.00");
assert.equal(
  request.fields.notify_url,
  "https://api.tekcentral.test/api/payments/payfast/itn",
);
assert.ok(request.fields.signature);

const md5 = (value: string) => createHash("md5").update(value).digest("hex");
const itnSerializationFixture = {
  m_payment_id: order.payment.paymentReference,
  pf_payment_id: "pf-test-serialization",
  payment_status: "COMPLETE",
  item_name: "TekCentral order TC-2026-000001",
  item_description: "1TB Portable SSD & 14-inch Business Laptop",
  amount_gross: "19148.00",
  amount_fee: "",
  amount_net: "19148.00",
  custom_str1: "https://tekcentral.test/payment return?order=TC-2026-000001",
  custom_str2: "office & home ~ special",
  merchant_id: config.merchantId,
  signature: "ignored-received-signature",
};
const itnExpectedParameterString =
  "m_payment_id=TC-2026-000001-PF" +
  "&pf_payment_id=pf-test-serialization" +
  "&payment_status=COMPLETE" +
  "&item_name=TekCentral+order+TC-2026-000001" +
  "&item_description=1TB+Portable+SSD+%26+14-inch+Business+Laptop" +
  "&amount_gross=19148.00" +
  "&amount_fee=" +
  "&amount_net=19148.00" +
  "&custom_str1=https%3A%2F%2Ftekcentral.test%2Fpayment+return%3Forder%3DTC-2026-000001" +
  "&custom_str2=office+%26+home+%7E+special" +
  "&merchant_id=sandbox-merchant-id" +
  "&passphrase=sandbox-passphrase";
assert.equal(
  createPayfastItnSignature(itnSerializationFixture, config.passphrase),
  md5(itnExpectedParameterString),
);
assert.equal(
  createPayfastItnSignature(
    { ...itnSerializationFixture, signature: "another-received-signature" },
    config.passphrase,
  ),
  createPayfastItnSignature(itnSerializationFixture, config.passphrase),
);
assert.equal(
  createPayfastItnSignatureDiagnostic(
    {
      ...itnSerializationFixture,
      merchant_key: "sensitive-merchant-key",
    },
    config.passphrase,
  ).serializedParameterString,
  `${itnExpectedParameterString.replace(
    "&passphrase=sandbox-passphrase",
    "&merchant_key=[redacted]&passphrase=[redacted]",
  )}`,
);

const validItn = {
  merchant_id: config.merchantId,
  m_payment_id: order.payment.paymentReference,
  pf_payment_id: "pf-test-1",
  payment_status: "COMPLETE",
  amount_gross: "19148.00",
};
const signedValidItn = {
  ...validItn,
  signature: createPayfastItnSignature(validItn, config.passphrase),
};
assert.equal(
  (await validatePayfastItn(
    signedValidItn,
    order,
    config,
    "196.0.0.1",
    async () => true,
  )).ok,
  true,
);

const invalidSignature = { ...signedValidItn, amount_gross: "19149.00" };
assert.equal(
  (await validatePayfastItn(
    invalidSignature,
    order,
    config,
    "196.0.0.1",
    async () => true,
  )).ok,
  false,
);

const amountMismatch = {
  ...validItn,
  amount_gross: "1.00",
  signature: createPayfastItnSignature(
    { ...validItn, amount_gross: "1.00" },
    config.passphrase,
  ),
};
const amountResult = await validatePayfastItn(
  amountMismatch,
  order,
  config,
  "196.0.0.1",
  async () => true,
);
assert.equal(amountResult.ok, false);
assert.equal(amountResult.reason, "Amount mismatch");

const sourceResult = await validatePayfastItn(
  signedValidItn,
  order,
  config,
  "127.0.0.1",
  async () => false,
);
assert.equal(sourceResult.ok, false);
assert.equal(sourceResult.reason, "Invalid PayFast source IP");

assert.equal(isDuplicatePayfastItn(order, "pf-test-1"), false);
assert.equal(
  isDuplicatePayfastItn(
    {
      ...order,
      payment: {
        ...order.payment,
        processedItnIds: ["pf-test-1"],
      },
    },
    "pf-test-1",
  ),
  true,
);

const originalCwd = cwd();
const adminCjPageSource = readFileSync(
  join(originalCwd, "src/pages/admin/AdminCjSupplierPage.tsx"),
  "utf8",
);
const cjWorkflowSource = readFileSync(
  join(originalCwd, "src/lib/cj-workflow.ts"),
  "utf8",
);
const adminCjImportedPageSource = readFileSync(
  join(originalCwd, "src/pages/admin/AdminCjImportedProductsPage.tsx"),
  "utf8",
);
const adminOrderDetailSource = readFileSync(
  join(originalCwd, "src/pages/admin/AdminOrderDetailPage.tsx"),
  "utf8",
);
const supplierOrderDetailSource = readFileSync(
  join(originalCwd, "src/pages/admin/AdminSupplierOrderDetailPage.tsx"),
  "utf8",
);
const cartStateSource = readFileSync(join(originalCwd, "src/state/cart.tsx"), "utf8");
const cartToastSource = readFileSync(join(originalCwd, "src/components/commerce/CartToast.tsx"), "utf8");
const appShellSource = readFileSync(join(originalCwd, "src/components/layout/AppShell.tsx"), "utf8");
const appSource = readFileSync(join(originalCwd, "src/App.tsx"), "utf8");
assert.equal(adminCjPageSource.includes('const [query, setQuery] = useState("");'), true);
assert.equal(adminCjPageSource.includes('placeholder="Search technology products..."'), true);
assert.equal(adminCjPageSource.includes('apiRequest<CjProductSearchResponse>('), true);
assert.equal(adminCjPageSource.includes("scope=${catalogueScope}"), true);
assert.equal(adminCjPageSource.includes("Filter available variants"), true);
assert.equal(adminCjPageSource.includes("Search variants"), false);
assert.equal(adminCjPageSource.includes("No selectable CJ variants were returned for this product."), true);
assert.equal(adminCjPageSource.includes("xl:sticky xl:top-28"), false);
assert.equal(adminCjPageSource.includes("View imported products"), true);
assert.equal(adminCjPageSource.includes("<h2 className=\"text-lg font-black\">Imported products</h2>"), false);
assert.equal(adminCjPageSource.includes("Create CJ Order"), false);
assert.equal(adminCjPageSource.includes("Submit CJ Order"), false);
assert.equal(adminCjPageSource.includes("Check delivery to South Africa"), true);
assert.equal(adminCjPageSource.includes("Checking delivery to South Africa..."), true);
assert.equal(adminCjPageSource.includes("Not currently deliverable to South Africa via CJ."), true);
assert.equal(adminCjPageSource.includes("setDeliveryCheck(undefined);"), true);
assert.equal(cjWorkflowSource.includes('return `${scope}:${categoryId ?? "all"}:${query.trim().toLowerCase()}`;'), true);
assert.equal(cjWorkflowSource.includes("export const cjVariantFilterThreshold = 7;"), true);
assert.equal(cjWorkflowSource.includes("variants.length >= cjVariantFilterThreshold"), true);
assert.equal(cjWorkflowSource.includes("filterImportedCjProducts"), true);
assert.equal(adminCjImportedPageSource.includes("Imported CJ products"), true);
assert.equal(adminCjImportedPageSource.includes("cjImportedPageSize"), true);
assert.equal(adminCjImportedPageSource.includes("Product name, CJ SKU or product ID"), true);
assert.equal(adminCjImportedPageSource.includes("Mapping"), true);
assert.equal(adminCjImportedPageSource.includes("Supplier status"), true);
assert.equal(adminCjImportedPageSource.includes("Review Mapping"), true);
assert.equal(adminCjImportedPageSource.includes("Create CJ Order"), false);
assert.equal(appSource.includes('path="/admin/suppliers/cj/imported"'), true);
assert.equal(adminOrderDetailSource.includes("Unsaved allocation changes"), true);
assert.equal(adminOrderDetailSource.includes("Save the supplier allocation first."), true);
assert.equal(adminOrderDetailSource.includes("Generating..."), true);
assert.equal(adminOrderDetailSource.includes("Open {supplierOrder.id}"), true);
assert.equal(adminOrderDetailSource.includes("function deriveOrderWorkflow"), true);
assert.equal(adminOrderDetailSource.includes("Resolve CJ logistics availability"), true);
assert.equal(supplierOrderDetailSource.includes("CJ API"), true);
assert.equal(supplierOrderDetailSource.includes("CJ fulfilment pending logistics selection"), true);
assert.equal(supplierOrderDetailSource.includes("Direct to customer"), true);
assert.equal(supplierOrderDetailSource.includes("Mock controls are secondary for CJ API supplier orders"), true);
assert.equal(supplierOrderDetailSource.includes("CJ logistics check"), true);
assert.equal(supplierOrderDetailSource.includes("Open Scoop reseller portal"), true);
assert.equal(supplierOrderDetailSource.includes('supplierOrder.status === "APPROVED"'), true);
assert.equal(supplierOrderDetailSource.includes("Place the order in Scoop, then return here and record the supplier reference."), true);
assert.equal(supplierOrderDetailSource.includes("import.meta.env.DEV"), true);
assert.equal(cartStateSource.includes("recentAddsRef"), true);
assert.equal(cartToastSource.includes("role=\"status\""), true);
assert.equal(cartToastSource.includes("added to cart."), true);
assert.equal(cartToastSource.includes("View cart"), true);
assert.equal(appShellSource.includes("<CartToast />"), true);
assert.deepEqual(
  buildCjFreightRequest({
    sourceCountryCode: "CN",
    destinationCountryCode: "ZA",
    products: [{ vid: "VID-1", quantity: 2 }],
  }),
  {
    startCountryCode: "CN",
    endCountryCode: "ZA",
    products: [{ vid: "VID-1", quantity: 2 }],
  },
);
assert.deepEqual(
  buildCjFreightTipRequest({
    sourceCountryCode: "CN",
    destinationCountryCode: "ZA",
    weight: 250,
    productProp: ["ELECTRONIC"],
    sku: "CJ-VAR-1",
    vid: "VID-1",
    quantity: 1,
    productCode: "CJ-SPU-1",
    totalGoodsAmount: 12.5,
  }),
  {
    reqDTOS: [
      {
        srcAreaCode: "CN",
        destAreaCode: "ZA",
        weight: 250,
        productProp: ["ELECTRONIC"],
        skuList: ["CJ-VAR-1"],
        freightTrialSkuList: [
          {
            skuQuantity: 1,
            sku: "CJ-VAR-1",
            vid: "VID-1",
            skuWeight: 250,
            productPropList: ["ELECTRONIC"],
            productCode: "CJ-SPU-1",
          },
        ],
        totalGoodsAmount: 12.5,
      },
    ],
  },
);
const variantDeliveryClient = new MockCjOrderClient();
const variantDeliveryCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: variantDeliveryClient,
});
assert.equal(variantDeliveryCheck.status, "AVAILABLE");
assert.equal(variantDeliveryCheck.message, "Delivery to South Africa available ✓");
assert.deepEqual(variantDeliveryCheck.sourceCountries, ["CN"]);
assert.equal(variantDeliveryCheck.logisticsOptions[0]?.logisticName, "CJPacket Sensitive");
assert.equal(variantDeliveryCheck.logisticsOptions[0]?.shippingCost, 7.25);
const variantTipCall = variantDeliveryClient.calls.find((call) => call.path === "/logistic/freightCalculateTip");
assert.deepEqual(variantTipCall?.body, {
  reqDTOS: [
    {
      srcAreaCode: "CN",
      destAreaCode: "ZA",
      weight: 250,
      productProp: ["ELECTRONIC"],
      skuList: ["CJ-VAR-UNVERIFIED"],
      freightTrialSkuList: [
        {
          skuQuantity: 1,
          sku: "CJ-VAR-UNVERIFIED",
          vid: "VID-UNVERIFIED",
          skuWeight: 250,
          productPropList: ["ELECTRONIC"],
          productCode: "CJ-SPU-UNVERIFIED",
        },
      ],
      totalGoodsAmount: 20,
    },
  ],
});
assert.equal(
  variantDeliveryClient.calls.some((call) => call.path === "/shopping/order/createOrderV2"),
  false,
);
const noRouteDeliveryClient = new MockCjOrderClient();
noRouteDeliveryClient.logisticsMode = "empty";
const noRouteDeliveryCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: noRouteDeliveryClient,
});
assert.equal(noRouteDeliveryCheck.status, "NO_ROUTE");
assert.equal(noRouteDeliveryCheck.message, "No CJ shipping method is currently available to South Africa for this variant.");
assert.equal(noRouteDeliveryCheck.diagnostics?.destinationCountryCode, "ZA");
assert.equal(noRouteDeliveryCheck.diagnostics?.itemCount, 1);
assert.equal(noRouteDeliveryCheck.diagnosticReasons?.[0]?.includes("Weight unsupported"), true);
assert.equal(noRouteDeliveryClient.calls.some((call) => call.path === "/logistic/unavailableShippingMethods"), true);
const unknownDiagnosticClient = new MockCjOrderClient();
unknownDiagnosticClient.logisticsMode = "empty";
unknownDiagnosticClient.unavailableMode = "unknown";
const unknownDiagnosticCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: unknownDiagnosticClient,
});
assert.equal(unknownDiagnosticCheck.status, "NO_ROUTE");
assert.equal(unknownDiagnosticCheck.diagnosticReasons?.[0]?.includes("CJ 2999"), true);
const missingWeightClient = new MockCjOrderClient();
missingWeightClient.productDataMode = "missing-weight";
const missingWeightCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: missingWeightClient,
});
assert.equal(missingWeightCheck.status, "DATA_INCOMPLETE");
assert.equal(missingWeightCheck.diagnosticReasons?.[0]?.includes("weight"), true);
assert.equal(missingWeightClient.calls.some((call) => call.path === "/logistic/freightCalculateTip"), false);
const missingProductPropClient = new MockCjOrderClient();
missingProductPropClient.productDataMode = "missing-product-prop";
const missingProductPropCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: missingProductPropClient,
});
assert.equal(missingProductPropCheck.status, "DATA_INCOMPLETE");
assert.equal(missingProductPropCheck.diagnosticReasons?.[0]?.includes("productProp"), true);
const sourceUnresolvedClient = new MockCjOrderClient();
sourceUnresolvedClient.stockMode = "source-unresolved";
const sourceUnresolvedCheck = await checkCjVariantDeliveryToSouthAfrica({
  supplierVariantId: "VID-UNVERIFIED",
  client: sourceUnresolvedClient,
});
assert.equal(sourceUnresolvedCheck.status, "SOURCE_UNRESOLVED");
assert.equal(sourceUnresolvedCheck.message, "CJ source warehouse or country could not be resolved for this variant.");
assert.equal(
  sourceUnresolvedClient.calls.some((call) => call.path === "/logistic/freightCalculateTip"),
  false,
);
const exactProductIdClient = new MockCjCatalogueClient();
const exactProductIdResult = await searchCjProducts(
  { keyword: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5", scope: "technology", page: 1, size: 20 },
  exactProductIdClient,
);
assert.equal(exactProductIdResult.exactLookup?.status, "MATCH");
assert.equal(exactProductIdResult.exactLookup?.identifierType, "PRODUCT_ID");
assert.equal(exactProductIdResult.products[0]?.supplierProductId, "461C62AD-6DD4-4BB6-A0B4-51EE138480B5");
assert.equal(exactProductIdClient.calls.some((call) => call.path === "/product/listV2"), false);

const exactProductSkuClient = new MockCjCatalogueClient();
const exactProductSkuResult = await searchCjProducts(
  { keyword: "CJSJYDFL00003", scope: "technology", page: 1, size: 20 },
  exactProductSkuClient,
);
assert.equal(exactProductSkuResult.exactLookup?.status, "MATCH");
assert.equal(exactProductSkuResult.exactLookup?.identifierType, "PRODUCT_SKU");
assert.equal(exactProductSkuResult.products[0]?.supplierSku, "CJSJYDFL00003");

const exactVidClient = new MockCjCatalogueClient();
const exactVidResult = await searchCjProducts(
  { keyword: "1414473755404668928", scope: "technology", page: 1, size: 20 },
  exactVidClient,
);
assert.equal(exactVidResult.exactLookup?.status, "MATCH");
assert.equal(exactVidResult.exactLookup?.identifierType, "VID");
assert.equal(exactVidResult.exactLookup?.selectedVariantId, "1414473755404668928");
assert.equal(exactVidResult.products[0]?.variants.some((variant) => variant.supplierVariantId === "1414473755404668928"), true);

const exactVariantSkuClient = new MockCjCatalogueClient();
const exactVariantSkuResult = await searchCjProducts(
  { keyword: "CJ-VAR-EXACT", scope: "technology", page: 1, size: 20 },
  exactVariantSkuClient,
);
assert.equal(exactVariantSkuResult.exactLookup?.status, "MATCH");
assert.equal(exactVariantSkuResult.exactLookup?.identifierType, "VARIANT_SKU");
assert.equal(exactVariantSkuResult.exactLookup?.selectedVariantId, "1414473755404668928");

const unknownIdentifierClient = new MockCjCatalogueClient();
const unknownIdentifierResult = await searchCjProducts(
  { keyword: "CJ-UNKNOWN-9999", scope: "technology", page: 1, size: 20 },
  unknownIdentifierClient,
);
assert.equal(unknownIdentifierResult.exactLookup?.status, "NOT_FOUND");
assert.equal(unknownIdentifierResult.exactLookup?.message, "No CJ product or variant found for this identifier.");
assert.equal(unknownIdentifierResult.products.length, 0);
assert.equal(unknownIdentifierClient.calls.some((call) => call.path === "/product/listV2"), false);

const outsideScopeClient = new MockCjCatalogueClient();
const outsideScopeResult = await searchCjProducts(
  { keyword: "CJ-DRESS-001", scope: "technology", page: 1, size: 20 },
  outsideScopeClient,
);
assert.equal(outsideScopeResult.exactLookup?.status, "OUTSIDE_SCOPE");
assert.equal(outsideScopeResult.products.length, 0);
assert.equal(outsideScopeResult.exactLookup?.message.includes("Switch to All CJ catalogue"), true);
const outsideScopeAllResult = await searchCjProducts(
  { keyword: "CJ-DRESS-001", scope: "all", page: 1, size: 20 },
  new MockCjCatalogueClient(),
);
assert.equal(outsideScopeAllResult.exactLookup?.status, "MATCH");
assert.equal(outsideScopeAllResult.products[0]?.supplierSku, "CJ-DRESS-001");

const normalSearchClient = new MockCjCatalogueClient();
const normalSearchResult = await searchCjProducts(
  { keyword: "wireless mouse", scope: "technology", page: 1, size: 20 },
  normalSearchClient,
);
assert.equal(normalSearchResult.exactLookup, undefined);
assert.equal(normalSearchResult.products[0]?.supplierProductName, "Wireless Mouse");
assert.equal(normalSearchClient.calls.some((call) => call.path === "/product/listV2"), true);
const tempDir = await mkdtemp(join(tmpdir(), "tekcentral-payfast-test-"));
const originalCjApiKey = process.env.CJ_API_KEY;
const originalCjRealOrderFlag = process.env.CJ_REAL_ORDER_CREATION_ENABLED;
try {
  chdir(tempDir);
  delete process.env.CJ_API_KEY;
  await assert.rejects(new CjAuthService().getAccessToken(), /CJ API key is not configured/);
  process.env.CJ_API_KEY = "test-cj-api-key";
  let authCalls = 0;
  const authService = new CjAuthService((async () => {
    authCalls += 1;
    return new Response(
      JSON.stringify({
        code: 200,
        result: true,
        message: "Success",
        data: {
          accessToken: "test-access-token",
          accessTokenExpiryDate: "2099-01-01T00:00:00+00:00",
          refreshToken: "test-refresh-token",
          refreshTokenExpiryDate: "2099-06-01T00:00:00+00:00",
        },
        requestId: "cj-auth-request",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch);
  assert.equal(await authService.getAccessToken(), "test-access-token");
  assert.equal(await authService.getAccessToken(), "test-access-token");
  assert.equal(authCalls, 1);

  const actualShapeListV2Fixture = {
    pageSize: "20",
    pageNumber: "1",
    totalRecords: "1",
    totalPages: "1",
    content: [
      {
        productList: [
          {
            id: "461C62AD-6DD4-4BB6-A0B4-51EE138480B5",
            nameEn: "Magnetic Cable LED Magnet Charger Cable USB Cable & USB Type-C USB C",
            sku: "CJSJYDFL00003",
            bigImage: "https://example.test/cj-product.jpg",
            sellPrice: "1.19 -- 4.63",
            nowPrice: "0.99-2.40",
            categoryId: "5FE5E389-0B85-4592-A08D-B4AD79B164D4",
            oneCategoryName: "Electronics",
            twoCategoryName: "Mobile Phone Accessories",
            threeCategoryName: "Charging Cables",
            productWeight: "120",
            warehouseInventoryNum: 413313,
          },
        ],
        relatedCategoryList: [],
        keyWord: "USB-C charger",
      },
    ],
  };
  const actualShapeProducts = extractProductList(actualShapeListV2Fixture);
  assert.equal(actualShapeProducts.length, 1);
  const actualShapeProduct = normalizeCjProduct(actualShapeProducts[0]);
  assert.equal(actualShapeProduct.supplierProductId, "461C62AD-6DD4-4BB6-A0B4-51EE138480B5");
  assert.equal(actualShapeProduct.supplierProductName, "Magnetic Cable LED Magnet Charger Cable USB Cable & USB Type-C USB C");
  assert.equal(actualShapeProduct.supplierSku, "CJSJYDFL00003");
  assert.equal(actualShapeProduct.imageUrl, "https://example.test/cj-product.jpg");
  assert.equal(actualShapeProduct.categoryName, "Electronics > Mobile Phone Accessories > Charging Cables");
  const annotatedUsbProduct = annotateTechnologyProduct(actualShapeProduct, "usb");
  assert.equal(annotatedUsbProduct.tekcentralCategoryGroup, "Cables & Connectivity");
  assert.equal(technologyMatches(annotatedUsbProduct, "usb"), true);
  assert.doesNotThrow(() => assertCjTechnologyPolicyAvailable());
  const clothingProduct = {
    ...actualShapeProduct,
    supplierProductId: "CLOTHING-1",
    supplierProductName: "Woman summer dress",
    categoryId: "CLOTHING",
    categoryName: "Women's Clothing > Dresses",
  };
  const categoryUnavailableProduct = {
    ...actualShapeProduct,
    supplierProductId: "UNKNOWN-CATEGORY",
    supplierProductName: "USB mystery item",
    categoryId: undefined,
    categoryName: undefined,
  };
  const technologyScoped = applyCjCatalogueScope(
    [actualShapeProduct, clothingProduct, categoryUnavailableProduct],
    "technology",
    "woman",
  );
  assert.equal(technologyScoped.products.some((product) => product.supplierProductId === "CLOTHING-1"), false);
  assert.equal(technologyScoped.products.some((product) => product.supplierProductId === "UNKNOWN-CATEGORY"), false);
  const allScoped = applyCjCatalogueScope(
    [actualShapeProduct, clothingProduct, categoryUnavailableProduct],
    "all",
    "woman",
  );
  assert.equal(allScoped.products.some((product) => product.supplierProductId === "CLOTHING-1"), true);
  assert.equal(allScoped.products.some((product) => product.supplierProductId === "UNKNOWN-CATEGORY"), true);
  assert.equal(applyCjCatalogueScope([actualShapeProduct], "technology", "usb").products.length, 1);
  assert.equal(
    technologyMatches(
      {
        ...actualShapeProduct,
        supplierProductName: "Summer swimming ring",
        categoryId: "IRRELEVANT-CATEGORY",
        categoryName: "Sports & Outdoors > Swimming",
      },
      "ups",
    ),
    false,
  );
  assert.equal(
    applyCjCatalogueScope(
      [
        {
          ...actualShapeProduct,
          supplierProductId: "SWIM-UPS",
          supplierProductName: "UPS swimming ring",
          categoryId: "IRRELEVANT-CATEGORY",
          categoryName: "Sports & Outdoors > Swimming",
        },
      ],
      "technology",
      "ups",
    ).products.length,
    0,
  );
  assert.equal(
    technologyMatches(
      {
        ...actualShapeProduct,
        supplierProductName: "UPS backup battery charger",
        categoryId: "6DB79FAF-593D-4F52-B6FF-AB1D14331862",
        categoryName: "Consumer Electronics > Accessories & Parts > Charger",
      },
      "ups",
    ),
    true,
  );
  const normalizedCategories = normalizeCjCategories([
    {
      categoryFirstName: "Phones & Accessories",
      categoryFirstList: [
        {
          categorySecondName: "Mobile Phone Accessories",
          categorySecondList: [
            {
              categoryId: "CAT-CABLES",
              categoryName: "Cables",
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(normalizedCategories[0]?.name, "Phones & Accessories");
  assert.equal(normalizedCategories[0]?.children[0]?.name, "Mobile Phone Accessories");
  assert.equal(normalizedCategories[0]?.children[0]?.children[0]?.categoryId, "CAT-CABLES");
  const policyCategories = normalizeCjCategories([
    {
      categoryFirstName: "Computer & Office",
      categoryFirstList: [
        {
          categorySecondName: "Storage Devices",
          categorySecondList: [
            { categoryId: "4D3B9582-E92E-46BF-B00E-715E70FB4742", categoryName: "SSD" },
            { categoryId: "NON-TECH", categoryName: "Decor" },
          ],
        },
      ],
    },
    {
      categoryFirstName: "Women's Clothing",
      categoryFirstList: [
        {
          categorySecondName: "Dresses",
          categorySecondList: [{ categoryId: "CLOTHING", categoryName: "Dresses" }],
        },
      ],
    },
  ]);
  const technologyPolicy = technologyPolicyResponse(policyCategories);
  assert.equal(technologyPolicy.mode, "technology");
  assert.equal(technologyPolicy.groups.some((group) => group.name === "Storage"), true);
  assert.equal(filterCategoryTree(policyCategories, new Set(["4D3B9582-E92E-46BF-B00E-715E70FB4742"]))[0]?.children[0]?.children[0]?.name, "SSD");
  assert.equal(JSON.stringify(technologyPolicy.categories).includes("Dresses"), false);
  assert.throws(
    () => normalizeCjProduct({ nameEn: "Malformed CJ row", sku: "NO-PID" }),
    /CJ product response is missing product identity/,
  );

  const cjVariant = normalizeCjVariant({
    vid: "VID-1",
    pid: "PID-1",
    productSku: "CJ-SPU-1",
    variantSku: "CJ-VAR-1",
    variantNameEn: "Black EU",
    sellPrice: "12.50",
    currency: "USD",
  });
  assert.equal(cjVariant.supplierVariantId, "VID-1");
  assert.equal(cjVariant.supplierVariantSku, "CJ-VAR-1");
  assert.equal(cjVariant.price, 12.5);
  const cjVariantTwo = normalizeCjVariant({
    vid: "VID-2",
    pid: "PID-1",
    productSku: "CJ-SPU-1",
    variantSku: "CJ-VAR-2",
    variantNameEn: "White EU",
    sellPrice: "13.50",
    currency: "USD",
  });
  const cjProduct = normalizeCjProduct(
    {
      pid: "PID-1",
      productSku: "CJ-SPU-1",
      productNameEn: "65W USB C Charger",
      categoryId: "CAT-1",
      categoryNameEn: "Electronics",
      sellPrice: "10.00-15.00",
      currency: "USD",
    },
    [cjVariant, cjVariantTwo],
  );
  assert.equal(cjProduct.supplierCode, "CJ");
  assert.equal(cjProduct.supplierProductId, "PID-1");
  assert.equal(cjProduct.supplierSku, "CJ-SPU-1");
  assert.equal(cjProduct.variants[0]?.supplierVariantId, "VID-1");
  assert.equal(cjProduct.variants[0]?.supplierVariantSku, "CJ-VAR-1");
  const stock = normalizeCjStock([
    { areaId: "1", areaEn: "China Warehouse", countryCode: "CN", totalInventoryNum: 5 },
    { areaId: "2", areaEn: "US Warehouse", countryCode: "US", storageNum: 3 },
  ]);
  assert.equal(stock.stockTotal, 8);
  await saveCjCatalogueProduct(cjProduct);
  assert.equal((await getCjCatalogueProduct("PID-1"))?.supplierSku, "CJ-SPU-1");
  await saveCjCatalogueProduct({ ...cjProduct, supplierProductName: "65W USB C Charger Refreshed" });
  const savedCjProducts = await listCjCatalogueProducts();
  assert.equal(savedCjProducts.filter((product) => product.supplierProductId === "PID-1").length, 1);
  assert.equal((await getCjCatalogueProduct("PID-1"))?.supplierProductName, "65W USB C Charger Refreshed");
  await assert.rejects(
    suggestCjMapping({
      tekcentralProductId: "demo-laptop-pro-14",
      supplierProductId: "PID-1",
    }),
    /Select a CJ variant before creating the mapping/,
  );
  const suggestedCjMapping = await suggestCjMapping({
    tekcentralProductId: "demo-laptop-pro-14",
    supplierProductId: "PID-1",
    supplierVariantId: "VID-1",
  });
  assert.equal(suggestedCjMapping.mapping.status, "SUGGESTED");
  assert.equal(suggestedCjMapping.mapping.supplierSku, "CJ-VAR-1");
  assert.equal(suggestedCjMapping.mapping.supplierProductId, "PID-1");
  assert.equal(suggestedCjMapping.mapping.supplierProductSku, "CJ-SPU-1");
  assert.equal(suggestedCjMapping.mapping.supplierVariantId, "VID-1");
  assert.equal(suggestedCjMapping.mapping.supplierVariantSku, "CJ-VAR-1");
  assert.equal(
    (await listSupplierProductMappings()).filter((mapping) => mapping.status === "SUGGESTED").length,
    1,
  );
  const verifiedCjMapping = await verifySupplierMappingById(
    suggestedCjMapping.mapping.id ?? "",
  );
  assert.equal(verifiedCjMapping.status, "VERIFIED");
  assert.equal(
    (await listSupplierProductMappings()).filter((mapping) => mapping.status === "SUGGESTED").length,
    0,
  );
  assert.equal(
    (await listSupplierProductMappings()).filter((mapping) => mapping.status === "VERIFIED").length,
    1,
  );
  const staleCandidate = await saveSupplierProductMapping({
    productId: "demo-ssd-1tb",
    supplierCode: "CJ",
    supplierSku: "CJ-MISSING-VAR",
    supplierProductId: "PID-MISSING",
    supplierVariantId: "VID-MISSING",
    supplierVariantSku: "CJ-MISSING-VAR",
    status: "VERIFIED",
    source: "CJ API",
  });
  assert.equal((await checkCjMappingStalenessById(staleCandidate.id ?? ""))?.status, "STALE");

  const unverifiedCjProduct = normalizeCjProduct(
    {
      pid: "PID-UNVERIFIED",
      productSku: "CJ-SPU-UNVERIFIED",
      productNameEn: "USB-C Business Dock Candidate",
      categoryNameEn: "Electronics",
      sellPrice: "20.00",
      currency: "USD",
    },
    [
      normalizeCjVariant({
        vid: "VID-UNVERIFIED",
        pid: "PID-UNVERIFIED",
        productSku: "CJ-SPU-UNVERIFIED",
        variantSku: "CJ-VAR-UNVERIFIED",
        variantNameEn: "Dock variant",
      }),
    ],
  );
  await saveCjCatalogueProduct(unverifiedCjProduct);
  const unverifiedMapping = await suggestCjMapping({
    tekcentralProductId: "demo-usbc-dock",
    supplierProductId: "PID-UNVERIFIED",
    supplierVariantId: "VID-UNVERIFIED",
  });
  assert.equal(unverifiedMapping.mapping.status, "SUGGESTED");

  await saveOrder({
    ...order,
    id: "cj-supplier-resolution",
    orderNumber: "TC-2026-000009",
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000009-PF",
    },
    status: "CONFIRMED",
    items: [
      {
        productId: "demo-usbc-dock",
        slug: "dockworks-usb-c-business-dock",
        sku: "TC-DOCK-USBC",
        name: "USB-C Business Dock",
        brand: "DockWorks",
        quantity: 1,
        unitPrice: 3299,
        lineTotal: 3299,
      },
    ],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000009",
    supplierCode: "CJ",
    orderItemIds: ["demo-usbc-dock"],
  });
  const unverifiedCjSupplierOrders = await generateSupplierOrders("TC-2026-000009");
  assert.equal(unverifiedCjSupplierOrders?.[0]?.itemLines[0]?.supplierSku, undefined);
  await assert.rejects(
    approveSupplierOrder(unverifiedCjSupplierOrders![0].id),
    /Verified CJ mapping is required/,
  );
  await verifySupplierMappingById(unverifiedMapping.mapping.id ?? "");
  const approvedCjSupplierOrder = await approveSupplierOrder(unverifiedCjSupplierOrders![0].id);
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierProductId, "PID-UNVERIFIED");
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierProductSku, "CJ-SPU-UNVERIFIED");
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierVariantId, "VID-UNVERIFIED");
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierVariantSku, "CJ-VAR-UNVERIFIED");
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierSku, "CJ-VAR-UNVERIFIED");
  assert.equal(approvedCjSupplierOrder?.itemLines[0]?.supplierOfferId, "CJ:demo-usbc-dock:VID-UNVERIFIED");
  const cjCapabilities = supplierAdapters.CJ.getCapabilities();
  assert.equal(cjCapabilities.catalogue, "SUPPORTED");
  assert.equal(cjCapabilities.orderCreate, "SUPPORTED");
  assert.equal(cjCapabilities.supplierPayment, "UNSUPPORTED");
  assert.equal(supplierAdapters.CJ.supportedOrderModes.includes("API"), true);
  assert.equal(getSupplierRegistryEntry("CJ").defaultOrderMode, "API");
  assert.equal(getSupplierRegistryEntry("SCOOP").capabilities.orderCreate, "UNSUPPORTED");
  assert.equal(getSupplierRegistryEntry("SCOOP").supportedOrderModes.includes("EMAIL"), true);
  assert.equal(hasCapability(cjCapabilities, "logisticsQuote"), true);
  assert.throws(
    () => requireCapability(getSupplierRegistryEntry("MANUAL").capabilities, "supplierPayment"),
    /supplierPayment is not supported/,
  );
  const verifiedMapping = await getSupplierProductMappingById(unverifiedMapping.mapping.id ?? "");
  assert.equal(verifiedMapping?.status, "VERIFIED");
  const cjOffer = supplierOfferFromMapping(verifiedMapping!, approvedCjSupplierOrder?.itemLines[0]);
  assert.equal(cjOffer.supplierId, "CJ");
  assert.equal(cjOffer.supplierVariantId, "VID-UNVERIFIED");
  assert.equal(cjOffer.mappingStatus, "VERIFIED");

  const liveShapeScoopFixture = `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <sku><![CDATA[ACB-ISP]]></sku>
    <description><![CDATA[Ubiquiti UISP airCube ISP WiFi Access Point ]]></description>
    <cpt><![CDATA[72]]></cpt>
    <jhb><![CDATA[115]]></jhb>
    <dbn><![CDATA[65]]></dbn>
    <total_stock><![CDATA[252]]></total_stock>
    <dealer_price><![CDATA[475]]></dealer_price>
    <retail_price><![CDATA[650]]></retail_price>
    <manufacturer><![CDATA[Ubiquiti]]></manufacturer>
    <image_url><![CDATA[https://scoop.co.za/download/marketing/images/ACB-ISP.jpg]]></image_url>
  </product>
</products>`;
  const parsedLiveShapeScoop = parseScoopPricelistXml(liveShapeScoopFixture);
  assert.equal(parsedLiveShapeScoop.xmlRootTag, "products");
  assert.equal(parsedLiveShapeScoop.xmlItemTag, "product");
  assert.equal(parsedLiveShapeScoop.products[0]?.supplierSku, "ACB-ISP");
  assert.equal(parsedLiveShapeScoop.products[0]?.totalStock, 252);
  assert.equal(parsedLiveShapeScoop.products[0]?.dealerPriceExVat, 475);

  const launchProduct = {
    ...parsedLiveShapeScoop.products[0],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(), mappingStatus: "UNMAPPED",
    launchAssortment: { state: "SELECTED_FOR_LAUNCH", suggested: false, suggestionReasons: [], updatedAt: new Date().toISOString(), updatedBy: "test" },
    logisticsMetadata: { status: "COMPLETE", source: "MANUFACTURER", capturedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), weightGrams: 280, lengthMm: 88, widthMm: 90, heightMm: 89 },
  } as ScoopCatalogueProduct;
  const launchMapping = { status: "VERIFIED", productId: "demo-router-gigabit" } as SupplierProductMapping;
  const approvedProposal = { status: "APPROVED", warnings: [], supplierId: "SCOOP", supplierOfferId: "SCOOP:ACB-ISP" } as unknown as PricingProposal;
  assert.equal(scoopCandidateReasons({ ...launchProduct, launchAssortment: undefined }).length > 0, true);
  assert.equal(suggestScoopLaunchCandidates([{ ...launchProduct, launchAssortment: undefined }], 50).length, 1);
  assert.deepEqual(deriveScoopLaunchReadiness({ product: { ...launchProduct, launchAssortment: undefined }, mapping: launchMapping, proposal: approvedProposal }).blockers, ["NOT_SELECTED"]);
  assert.deepEqual(deriveScoopLaunchReadiness({ product: launchProduct, proposal: approvedProposal }).blockers, ["MAPPING_NOT_VERIFIED"]);
  assert.deepEqual(deriveScoopLaunchReadiness({ product: { ...launchProduct, logisticsMetadata: undefined }, mapping: launchMapping, proposal: approvedProposal }).blockers, ["LOGISTICS_INCOMPLETE"]);
  assert.deepEqual(deriveScoopLaunchReadiness({ product: launchProduct, mapping: launchMapping }).blockers, ["PRICING_MISSING"]);
  assert.equal(deriveScoopLaunchReadiness({ product: launchProduct, mapping: launchMapping, proposal: { ...approvedProposal, status: "PENDING_APPROVAL" } }).blockers.includes("PRICING_NOT_APPROVED"), true);
  assert.equal(deriveScoopLaunchReadiness({ product: { ...launchProduct, availability: "OUT_OF_STOCK" }, mapping: launchMapping, proposal: approvedProposal }).blockers.includes("OFFER_UNAVAILABLE"), true);
  assert.equal(deriveScoopLaunchReadiness({ product: launchProduct, mapping: launchMapping, proposal: approvedProposal }).status, "READY_FOR_PUBLISH_REVIEW");
  assert.equal(deriveScoopLaunchReadiness({ product: launchProduct, mapping: launchMapping, proposal: { ...approvedProposal, warnings: ["BELOW_TARGET_MARGIN"], warningDetails: [{ code: "BELOW_TARGET_MARGIN", severity: "WARNING", message: "Expected gross margin is below the configured target." }] } }).status, "READY_FOR_PUBLISH_REVIEW");
  assert.equal(deriveScoopLaunchReadiness({ product: launchProduct, mapping: launchMapping, proposal: { ...approvedProposal, warnings: ["BELOW_MINIMUM_PROFIT"], warningDetails: [{ code: "BELOW_MINIMUM_PROFIT", severity: "BLOCKING", message: "Gross profit is below the configured minimum." }] } }).status, "NOT_READY");

  const scoopXmlFixture = `<?xml version="1.0" encoding="UTF-8"?>
<ScoopPriceList>
  <Product>
    <SKU>FLY-2G</SKU>
    <Description>Linkbasic 2 Meter UTP Cat5e Flylead Green</Description>
    <CPT>444</CPT>
    <JHB>244</JHB>
    <DBN>14</DBN>
    <Total_Stock>702</Total_Stock>
    <Dealer_Price>R 25</Dealer_Price>
    <Retail_Price>R 36</Retail_Price>
    <Manufacturer>LinkBasic</Manufacturer>
    <Image_URL>https://scoop.co.za/download/marketing/images/FLY-2G.jpg</Image_URL>
  </Product>
  <Product>
    <SKU>ZERO-STOCK</SKU>
    <Description>Zero stock test item</Description>
    <CPT>0</CPT>
    <JHB>0</JHB>
    <DBN>0</DBN>
    <Total_Stock>0</Total_Stock>
    <Dealer_Price>R 10.50</Dealer_Price>
    <Retail_Price>R 15.00</Retail_Price>
    <Manufacturer>Test Maker</Manufacturer>
    <Image_URL>https://scoop.co.za/zero.jpg</Image_URL>
  </Product>
  <Product>
    <SKU>UNKNOWN-STOCK</SKU>
    <Description>Unknown stock test item</Description>
    <CPT></CPT>
    <JHB></JHB>
    <DBN></DBN>
    <Total_Stock></Total_Stock>
    <Dealer_Price></Dealer_Price>
    <Retail_Price>R 20</Retail_Price>
    <Manufacturer>Test Maker</Manufacturer>
    <Image_URL>https://scoop.co.za/unknown.jpg</Image_URL>
  </Product>
</ScoopPriceList>`;
  const parsedScoop = parseScoopPricelistXml(scoopXmlFixture);
  assert.equal(parsedScoop.xmlRootTag, "ScoopPriceList");
  assert.equal(parsedScoop.xmlItemTag, "Product");
  assert.equal(parsedScoop.products.length, 3);
  const flylead = parsedScoop.products.find((product) => product.supplierSku === "FLY-2G");
  assert.equal(flylead?.description, "Linkbasic 2 Meter UTP Cat5e Flylead Green");
  assert.equal(flylead?.dealerPriceExVat, 25);
  assert.equal(flylead?.dealerVatAmount, 3.75);
  assert.equal(flylead?.dealerPriceInclVat, 28.75);
  assert.equal(flylead?.retailPriceInclVat, 36);
  assert.equal(flylead?.branchStock.CPT, 444);
  assert.equal(flylead?.branchStock.JHB, 244);
  assert.equal(flylead?.branchStock.DBN, 14);
  assert.equal(flylead?.totalStock, 702);
  assert.equal(flylead?.availability, "AVAILABLE");
  assert.equal(parsedScoop.products.find((product) => product.supplierSku === "ZERO-STOCK")?.availability, "OUT_OF_STOCK");
  assert.equal(parsedScoop.products.find((product) => product.supplierSku === "UNKNOWN-STOCK")?.availability, "UNKNOWN");
  const firstScoopSync = await syncScoopCatalogueProducts(parsedScoop);
  assert.equal(firstScoopSync.fetched, 3);
  assert.equal(firstScoopSync.created, 3);
  assert.equal(firstScoopSync.updated, 0);
  await setScoopLaunchAssortmentState({ supplierSku: "FLY-2G", state: "CANDIDATE", suggested: true, suggestionReasons: ["In stock"] });
  const duplicateScoopSync = await syncScoopCatalogueProducts(parsedScoop);
  assert.equal(duplicateScoopSync.created, 0);
  assert.equal(duplicateScoopSync.unchanged, 3);
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.launchAssortment?.state, "CANDIDATE");
  assert.equal(parseScoopWeight("215g"), 215);
  assert.equal(parseScoopWeight("2.74 kg"), 2740);
  assert.equal(parseScoopWeight("unknown"), undefined);
  assert.deepEqual(parseScoopDimensions("87.80 x 89.50 x 89.25mm"), { lengthMm: 87.8, widthMm: 89.5, heightMm: 89.25 });
  assert.deepEqual(parseScoopDimensions("12 x 8.5 x 2.8 cm"), { lengthMm: 120, widthMm: 85, heightMm: 28 });
  assert.equal(parseScoopDimensions("119 x broken x 28mm"), undefined);
  const scoopPageUrl = "https://scoop.co.za/linkbasic-flylead-fly-2g.html";
  const searchFixture = `<ol><li class="item product product-item"><a href="${scoopPageUrl}">Linkbasic flylead</a><span>SKU: FLY-2G</span></li></ol>`;
  assert.equal(resolveScoopProductPageFromSearch(searchFixture, "FLY-2G").productPageUrl, scoopPageUrl);
  assert.equal(resolveScoopProductPageFromSearch(searchFixture, "OTHER").status, "NOT_FOUND");
  const productPageFixture = `<html><body><h1>Linkbasic flylead</h1><table><tr><th>SKU</th><td>FLY-2G</td></tr></table><div>Specifications Dimensions: 20 x 10 x 5cm Weight: 0.25kg</div></body></html>`;
  const extractedLogistics = extractScoopLogisticsMetadata(productPageFixture, scoopPageUrl);
  assert.equal(extractedLogistics.status, "COMPLETE");
  assert.equal(extractedLogistics.weightGrams, 250);
  assert.equal(extractedLogistics.lengthMm, 200);
  assert.equal(extractedLogistics.volumeM3, 0.001);
  let logisticsFetchCalls = 0;
  const logisticsFetch: typeof fetch = async (input) => {
    logisticsFetchCalls += 1;
    const url = String(input);
    return new Response(url.includes("catalogsearch") ? searchFixture : productPageFixture, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const enrichedScoop = await enrichScoopProductLogistics("FLY-2G", { fetchImpl: logisticsFetch });
  assert.equal(enrichedScoop.product.logisticsMetadata?.status, "COMPLETE");
  assert.equal(enrichedScoop.product.logisticsMetadata?.source, "SUPPLIER_PRODUCT_PAGE");
  assert.equal(logisticsFetchCalls, 2);
  await enrichScoopProductLogistics("FLY-2G", { fetchImpl: logisticsFetch });
  assert.equal(logisticsFetchCalls, 2);
  const failingFetch: typeof fetch = async () => new Response("Unavailable", { status: 503 });
  await enrichScoopProductLogistics("FLY-2G", { fetchImpl: failingFetch, force: true });
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.logisticsMetadata?.weightGrams, 250);
  const adminOverride = await saveScoopAdminLogistics({ supplierSku: "FLY-2G", weightGrams: 300, actor: "Test Staff" });
  assert.equal(adminOverride?.product.logisticsMetadata?.source, "ADMIN");
  assert.equal(adminOverride?.product.logisticsMetadata?.status, "WEIGHT_ONLY");
  assert.equal(deriveScoopLogisticsStatus({ lengthMm: 10, widthMm: 20, heightMm: 30 }), "DIMENSIONS_ONLY");
  assert.throws(() => validateScoopLogisticsValues({ weightGrams: -1 }), /positive/);
  assert.throws(() => validateScoopLogisticsValues({ lengthMm: 10 }), /length, width and height/);
  assert.throws(() => validateScoopLogisticsValues({ weightGrams: 1_000_001 }), /1,000 kg/);
  await enrichScoopProductLogistics("FLY-2G", { fetchImpl: failingFetch, force: true });
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.logisticsMetadata?.source, "ADMIN");
  assert.equal((await listScoopLogisticsAudit("FLY-2G"))[0]?.actor, "Test Staff");
  await syncScoopCatalogueProducts(parsedScoop);
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.logisticsMetadata?.source, "ADMIN");
  const clearedOverride = await clearScoopAdminLogistics("FLY-2G", "Test Staff");
  assert.equal(clearedOverride?.product.logisticsMetadata?.source, "SUPPLIER_PRODUCT_PAGE");
  assert.equal(clearedOverride?.product.logisticsMetadata?.weightGrams, 250);
  const validCsv = "sku,weight_grams,length_mm,width_mm,height_mm\nZERO-STOCK,500,,,,\nUNKNOWN-STOCK,,100,200,300";
  const csvPreview = await previewScoopLogisticsCsv(validCsv);
  assert.equal(csvPreview.summary.rowsRead, 2);
  assert.equal(csvPreview.summary.matched, 2);
  assert.equal(csvPreview.summary.partial, 2);
  assert.equal(csvPreview.summary.rejected, 0);
  const firstCsvImport = await applyScoopLogisticsCsv(validCsv, csvPreview.importFingerprint, "CSV Test");
  assert.equal(firstCsvImport.updated, 2);
  const repeatedCsvImport = await applyScoopLogisticsCsv(validCsv, csvPreview.importFingerprint, "CSV Test");
  assert.equal(repeatedCsvImport.updated, 0);
  assert.equal(repeatedCsvImport.unchanged, 2);
  assert.equal((await previewScoopLogisticsCsv("sku,weight_grams,length_mm,width_mm,height_mm\nMISSING,10,,,,")).summary.unknownSkus, 1);
  assert.equal((await previewScoopLogisticsCsv("sku,weight_grams,length_mm,width_mm,height_mm\nFLY-2G,10,,,,\nFLY-2G,20,,,,")).summary.rejected, 2);
  assert.equal((await previewScoopLogisticsCsv("sku,weight_grams,length_mm,width_mm,height_mm\nFLY-2G,,10,,20")).summary.rejected, 1);
  await saveScoopAdminLogistics({ supplierSku: "FLY-2G", weightGrams: 333 });
  const flyImportCsv = "sku,weight_grams,length_mm,width_mm,height_mm\nFLY-2G,444,10,20,30";
  const flyImportPreview = await previewScoopLogisticsCsv(flyImportCsv);
  await applyScoopLogisticsCsv(flyImportCsv, flyImportPreview.importFingerprint);
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.logisticsMetadata?.weightGrams, 333);
  assert.match(await exportMissingScoopLogisticsCsv(), /^sku,description,manufacturer,weight_grams,length_mm,width_mm,height_mm/m);
  assert.equal(normalizeWeight(2.26, "kg"), 2260);
  assert.equal(normalizeWeight(1, "lb"), 453.592);
  assert.equal(normalizeDimension(12, "cm"), 120);
  assert.equal(normalizeDimension(1, "in"), 25.4);
  assert.throws(() => normalizeWeight(0, "g"), /INVALID_SOURCE_DATA/);
  assert.throws(() => normalizeDimension(-1, "mm"), /INVALID_SOURCE_DATA/);
  const mismatchProvider: ScoopManufacturerMetadataProvider = { id: "MISMATCH", supportsManufacturer: () => true, resolveIdentity: async () => ({ identity: { manufacturer: "Wrong", scoopSku: "OTHER", manufacturerModel: "OTHER", aliases: ["OTHER"], canonicalUrl: "https://manufacturer.example/other", identityConfidence: "LOW" }, product: { weightGrams: 100 } }), fetchLogistics: async (result) => result, verifyIdentity: () => "LOW", normalizeLogistics: () => ({ source: "MANUFACTURER", weightGrams: 100 }) };
  assert.equal((await acquireScoopManufacturerLogistics("ZERO-STOCK", [mismatchProvider])).reason, "IDENTITY_NOT_RESOLVED");
  const exactProvider: ScoopManufacturerMetadataProvider = { id: "EXACT", supportsManufacturer: () => true, resolveIdentity: async (product) => ({ identity: { manufacturer: product.manufacturer!, scoopSku: product.supplierSku, manufacturerModel: product.supplierSku, aliases: [product.supplierSku], canonicalUrl: `https://manufacturer.example/${product.supplierSku}`, identityConfidence: "HIGH" }, product: { weightGrams: 550, lengthMm: 10, widthMm: 20, heightMm: 30 } }), fetchLogistics: async (result) => result, verifyIdentity: () => "HIGH", normalizeLogistics: (result) => ({ source: "MANUFACTURER", sourceReference: result.identity.canonicalUrl, manufacturer: result.identity.manufacturer, model: result.identity.manufacturerModel, supplierSku: result.identity.scoopSku, identityConfidence: "HIGH", sourceConfidence: "HIGH", shippingBasis: "PRODUCT_DIMENSIONS_FALLBACK", weightGrams: result.product?.weightGrams, lengthMm: result.product?.lengthMm, widthMm: result.product?.widthMm, heightMm: result.product?.heightMm }) };
  assert.equal((await acquireScoopManufacturerLogistics("FLY-2G", [exactProvider])).outcome, "UPDATED");
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.logisticsMetadata?.source, "ADMIN");
  const timestamp = new Date().toISOString();
  assert.equal(effectiveScoopLogisticsMetadata([
    { ...extractedLogistics, source: "MANUFACTURER", capturedAt: timestamp, updatedAt: timestamp },
    { ...extractedLogistics, source: "SUPPLIER_FEED", capturedAt: timestamp, updatedAt: timestamp },
  ])?.source, "SUPPLIER_FEED");
  assert.deepEqual(stockedScoopBranches((await getScoopCatalogueProduct("FLY-2G"))!), ["CPT", "JHB", "DBN"]);
  const reducedScoopSync = await syncScoopCatalogueProducts({
    ...parsedScoop,
    products: parsedScoop.products.slice(0, 2),
  });
  assert.equal(reducedScoopSync.stale, 1);
  assert.equal((await getScoopCatalogueProduct("UNKNOWN-STOCK"))?.availability, "STALE");
  assert.equal((await listScoopCatalogueProducts()).length, 3);
  const scoopOffer = scoopProductToSupplierOffer((await getScoopCatalogueProduct("FLY-2G"))!);
  assert.equal(scoopOffer.id, "SCOOP:FLY-2G");
  assert.equal(scoopOffer.supplierId, "SCOOP");
  assert.equal(scoopOffer.supplierSku, "FLY-2G");
  assert.equal(scoopOffer.cost, 25);
  assert.equal(scoopOffer.currency, "ZAR");
  const scoopPricing = prepareSupplierPricing({
    currency: "ZAR",
    vatRate: 0.15,
    supplierCostExVat: flylead?.dealerPriceExVat,
    referenceRetailInclVat: flylead?.retailPriceInclVat,
  });
  assert.equal(scoopPricing.supplierCostExVat, 25);
  assert.equal(scoopPricing.supplierVatAmount, 3.75);
  assert.equal(scoopPricing.supplierCostInclVat, 28.75);
  assert.equal(scoopPricing.referenceRetailInclVat, 36);
  assert.equal(scoopPricing.retailGrossSpreadVsCostExVat, 11);
  assert.equal(scoopPricing.retailGrossSpreadVsCostInclVat, 7.25);
  assert.equal(scoopPricing.proposedSellingPriceInclVat, undefined);
  const futurePricing = prepareSupplierPricing({
    currency: "ZAR",
    vatRate: 0.15,
    supplierCostExVat: 100,
    referenceRetailInclVat: 160,
    proposedSellingPriceInclVat: 150,
  });
  assert.equal(futurePricing.grossProfit, 35);
  assert.equal(futurePricing.grossMarginPercent, 23.33);
  assert.equal(futurePricing.markupPercent, 30.43);
  const engineSettings = structuredClone(defaultPricingSettings);
  assert.deepEqual(
    engineSettings.pricingBands.map((band) => [band.id, band.targetGrossMarginPercent, band.minimumGrossProfit]),
    [["LOW", 35, 50], ["STANDARD", 28, 125], ["HIGH", 20, 300], ["PREMIUM", 15, 750]],
  );
  assert.equal(engineSettings.vatRatePercent, 15);
  assert.equal(engineSettings.referencePriceBehavior, "WARNING_ONLY");
  assert.equal(engineSettings.proposedPricesRequireApproval, true);
  assert.equal(engineSettings.autoPublishPrices, false);
  assert.equal(engineSettings.cjFxBufferPercent, 0);
  engineSettings.roundingMode = "NONE";
  const scoopEngineInput = scoopPricingInput({ supplierOfferId: "SCOOP:FLY-2G", dealerPriceExVat: 100, referenceRetailInclVat: 200, pricingTimestamp: new Date().toISOString() });
  const scoopEngineResult = calculateProposedPrice(scoopEngineInput, engineSettings);
  const scoopWithCustomerShipping = calculateProposedPrice({ ...scoopEngineInput, shippingCost: 149 }, engineSettings);
  assert.equal(scoopWithCustomerShipping.proposedSellingPriceInclVat, scoopEngineResult.proposedSellingPriceInclVat);
  assert.equal(scoopEngineResult.appliedPricingBand?.id, "LOW");
  assert.equal(scoopEngineResult.proposedSellingPriceExVat, 153.84);
  assert.equal(scoopEngineResult.grossMarginPercent, 35);
  assert.equal(scoopEngineResult.markupPercent, 53.84);
  const minimumProfitResult = calculateProposedPrice({ ...scoopEngineInput, supplierCostExVat: 490 }, engineSettings);
  assert.ok((minimumProfitResult.grossProfit ?? 0) >= 150);
  assert.equal(applyPricingRounding(123.4, "NEAREST_1"), 123);
  assert.equal(applyPricingRounding(123.4, "NEAREST_5"), 125);
  assert.equal(applyPricingRounding(123.4, "NEAREST_10"), 120);
  assert.equal(applyPricingRounding(123.4, "END_99"), 123.99);
  const cjInput = cjLandedCostPricingInput({ supplierOfferId: "CJ:VID", currency: "USD", productCost: 5.83, shippingCost: 16.43, fxRate: 18, fxBufferPercent: 3, pricingTimestamp: new Date().toISOString() });
  assert.equal(cjInput.landedCostExVat, 412.7);
  assert.equal(cjInput.fxRateUsed, 18);
  const missingFxInput = cjLandedCostPricingInput({ supplierOfferId: "CJ:VID", currency: "USD", productCost: 5.83, shippingCost: 16.43, fxBufferPercent: 0, pricingTimestamp: new Date().toISOString() });
  assert.ok(calculateProposedPrice(missingFxInput, engineSettings).warnings.includes("MISSING_FX_RATE"));
  const staleFxInput = { ...cjInput, pricingTimestamp: new Date(Date.now() - 48 * 3_600_000).toISOString() };
  assert.ok(calculateProposedPrice(staleFxInput, engineSettings).warnings.includes("STALE_FX_RATE"));
  const referenceWarning = calculateProposedPrice({ ...scoopEngineInput, referenceRetailInclVat: 120 }, engineSettings);
  assert.ok(referenceWarning.warnings.includes("ABOVE_REFERENCE_RETAIL"));
  assert.equal(referenceWarning.warningDetails?.find((warning) => warning.code === "ABOVE_REFERENCE_RETAIL")?.severity, "WARNING");
  assert.equal(TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS, 0.1);
  const acbPricing = calculateProposedPrice(scoopPricingInput({ supplierOfferId: "SCOOP:ACB-ISP", dealerPriceExVat: 475, referenceRetailInclVat: 650, pricingTimestamp: new Date().toISOString() }), { ...engineSettings, roundingMode: "NEAREST_1" });
  assert.equal(acbPricing.proposedSellingPriceInclVat, 840);
  assert.equal(acbPricing.grossMarginPercent, 34.97);
  assert.equal(acbPricing.warnings.includes("BELOW_TARGET_MARGIN"), false);
  assert.equal(acbPricing.competitiveSuggestion?.suggestedPriceInclVat, 650);
  assert.equal(acbPricing.competitiveSuggestion?.suggestedPriceExVat, 565.22);
  assert.equal(acbPricing.competitiveSuggestion?.grossProfitExVat, 90.22);
  assert.equal(acbPricing.competitiveSuggestion?.grossMarginPercent, 15.96);
  assert.equal(acbPricing.competitiveSuggestion?.minimumProfitPasses, true);
  assert.equal(acbPricing.competitiveSuggestion?.targetMarginPasses, false);
  assert.equal(acbPricing.competitiveSuggestion?.viability, "VIABLE_BELOW_TARGET_MARGIN");
  const ignoredReference = calculateProposedPrice({ ...scoopEngineInput, referenceRetailInclVat: 120 }, { ...engineSettings, referencePriceBehavior: "IGNORE" });
  assert.equal(ignoredReference.warnings.includes("ABOVE_REFERENCE_RETAIL"), false);
  const unviableReference = calculateProposedPrice({ ...scoopEngineInput, referenceRetailInclVat: 80 }, engineSettings);
  assert.equal(unviableReference.competitiveSuggestion?.viability, "NOT_COMMERCIALLY_VIABLE");
  assert.equal(unviableReference.competitiveSuggestion?.minimumProfitPasses, false);
  const materialMarginMiss = calculateProposedPrice({ ...scoopEngineInput, referenceRetailInclVat: 120 }, { ...engineSettings, referencePriceBehavior: "SOFT_CEILING" });
  assert.equal(materialMarginMiss.warnings.includes("BELOW_TARGET_MARGIN"), true);
  assert.equal(classifyPricingWarning("BELOW_MINIMUM_PROFIT", { referencePriceBehavior: "WARNING_ONLY" }).severity, "BLOCKING");
  assert.equal(classifyPricingWarning("BELOW_TARGET_MARGIN", { referencePriceBehavior: "WARNING_ONLY" }).severity, "WARNING");
  const initialSettingsStore = await getBusinessSettings();
  const changedSettings = { ...initialSettingsStore.pricing, vatRatePercent: 16 };
  const updatedSettingsStore = await updatePricingSettings(changedSettings, "Test Staff");
  assert.equal(updatedSettingsStore.pricing.vatRatePercent, 16);
  assert.equal(updatedSettingsStore.audit[0]?.setting, "pricing.vatRatePercent");
  assert.equal((await getBusinessSettings()).pricing.vatRatePercent, 16);
  const proposal = await savePricingProposal({ ...scoopEngineResult, productId: "demo-router-gigabit", supplierId: "SCOOP", supplierOfferId: "SCOOP:FLY-2G", costSnapshot: scoopEngineInput, status: "PENDING_APPROVAL" });
  assert.equal((await setPricingProposalStatus(proposal.id, "APPROVED"))?.status, "APPROVED");
  const rejectedProposal = await savePricingProposal({ ...scoopEngineResult, productId: "demo-router-gigabit", supplierId: "SCOOP", supplierOfferId: "SCOOP:FLY-2G", costSnapshot: scoopEngineInput, status: "PENDING_APPROVAL" });
  assert.equal((await setPricingProposalStatus(rejectedProposal.id, "REJECTED"))?.status, "REJECTED");
  const overrideSource = await savePricingProposal({ ...acbPricing, productId: "override-test-product", supplierId: "SCOOP", supplierOfferId: "SCOOP:ACB-ISP", costSnapshot: scoopPricingInput({ supplierOfferId: "SCOOP:ACB-ISP", dealerPriceExVat: 475, referenceRetailInclVat: 650, pricingTimestamp: new Date().toISOString() }), settingsSnapshot: engineSettings, status: "APPROVED" });
  const countBeforePreview = (await listPricingProposals()).length;
  const overridePreview = await previewPricingOverride({ proposalId: overrideSource.id, overridePriceInclVat: 699, overrideReason: "Align with current market pricing.", reasonCategory: "MARKET_PRICE" });
  assert.equal(overridePreview.proposedSellingPriceInclVat, 699);
  assert.equal(overridePreview.supplierCostExVat, 475);
  assert.equal(overridePreview.minimumProfitPasses, true);
  assert.equal(overridePreview.warnings.includes("BELOW_TARGET_MARGIN"), true);
  const belowMinimumPreview = calculateManualPriceOverride(overrideSource.costSnapshot, engineSettings, 600, 840);
  assert.equal(belowMinimumPreview.grossProfit! > 0, true);
  assert.equal(belowMinimumPreview.minimumProfitPasses, false);
  assert.equal(belowMinimumPreview.warningDetails?.find((warning) => warning.code === "BELOW_MINIMUM_PROFIT")?.severity, "BLOCKING");
  assert.equal((await listPricingProposals()).length, countBeforePreview);
  await assert.rejects(previewPricingOverride({ proposalId: overrideSource.id, overridePriceInclVat: 0, overrideReason: "Invalid." }), /positive finite/);
  await assert.rejects(previewPricingOverride({ proposalId: overrideSource.id, overridePriceInclVat: 699, overrideReason: "   " }), /reason is required/);
  const lossPreview = calculateManualPriceOverride(overrideSource.costSnapshot, engineSettings, 400, 840);
  assert.equal(lossPreview.warnings.includes("SELLING_BELOW_COST"), true);
  assert.equal(lossPreview.warningDetails?.find((warning) => warning.code === "SELLING_BELOW_COST")?.severity, "BLOCKING");
  const overrideResult = await createPricingOverride({ proposalId: overrideSource.id, overridePriceInclVat: 699, overrideReason: "Align with current market pricing.", reasonCategory: "MARKET_PRICE" });
  assert.equal(overrideResult.proposal.status, "PENDING_APPROVAL");
  assert.equal(overrideResult.proposal.manualOverride?.originalProposalId, overrideSource.id);
  assert.equal(overrideResult.superseded.status, "SUPERSEDED");
  assert.equal(overrideResult.superseded.supersededByProposalId, overrideResult.proposal.id);
  assert.equal((await setPricingProposalStatus(overrideResult.proposal.id, "REJECTED"))?.status, "REJECTED");
  assert.equal((await listPricingProposals()).find((item) => item.id === overrideSource.id)?.status, "SUPERSEDED");
  assert.equal(latestScoopProposal(await listPricingProposals(), "ACB-ISP", "override-test-product")?.id, overrideResult.proposal.id);
  assert.equal(latestScoopProposal(await listPricingProposals(), "ACB-ISP", "override-test-product")?.status, "REJECTED");
  const approvalSource = await savePricingProposal({ ...acbPricing, productId: "override-approval-product", supplierId: "SCOOP", supplierOfferId: "SCOOP:ACB-ISP-APPROVAL", costSnapshot: scoopPricingInput({ supplierOfferId: "SCOOP:ACB-ISP-APPROVAL", dealerPriceExVat: 475, referenceRetailInclVat: 650, pricingTimestamp: new Date().toISOString() }), settingsSnapshot: engineSettings, status: "APPROVED" });
  const approvalOverride = await createPricingOverride({ proposalId: approvalSource.id, overridePriceInclVat: 699, overrideReason: "Approved market alignment test.", reasonCategory: "COMPETITIVE_ALIGNMENT" });
  assert.equal((await setPricingProposalStatus(approvalOverride.proposal.id, "APPROVED"))?.status, "APPROVED");
  const publicPriceBeforePricingPreparation = products.find((product) => product.id === "demo-router-gigabit")?.price;
  prepareSupplierPricing({
    currency: "ZAR",
    vatRate: 0.15,
    supplierCostExVat: 100,
    referenceRetailInclVat: 150,
  });
  assert.equal(products.find((product) => product.id === "demo-router-gigabit")?.price, publicPriceBeforePricingPreparation);

  const acbOffer = { ...parsedLiveShapeScoop.products[0], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(), mappingStatus: "UNMAPPED" } as ScoopCatalogueProduct;
  const highMatch = scoreScoopProductMatch(acbOffer, { sku: "ACB-ISP", name: "airCube ISP Wi-Fi Access Point", brand: "Ubiquiti", model: "airCube ISP", category: "Networking" });
  const mediumMatch = scoreScoopProductMatch(acbOffer, { name: "Ubiquiti Wireless Access Point", brand: "Ubiquiti", category: "Networking" });
  const lowGenericMatch = scoreScoopProductMatch(acbOffer, { name: "Wireless Network Switch", brand: "Generic", category: "Networking" });
  assert.equal(highMatch.confidenceLevel, "HIGH");
  assert.equal(mediumMatch.confidenceLevel, "MEDIUM");
  assert.equal(lowGenericMatch.confidenceLevel, "LOW");
  assert.ok(highMatch.confidence > lowGenericMatch.confidence);
  assert.throws(() => requireWeakMappingConfirmation("LOW", false), /WEAK_MAPPING_CONFIRMATION_REQUIRED/);
  assert.doesNotThrow(() => requireWeakMappingConfirmation("LOW", true));
  const titleSuggestions = suggestScoopProductTitles(acbOffer);
  assert.ok(titleSuggestions.includes("Ubiquiti UISP airCube ISP Wi-Fi Access Point"));
  assert.equal(titleSuggestions.some((title) => /TekCentral/i.test(title)), false);
  assert.equal(suggestScoopCategory(acbOffer).slug, "networking");
  await syncScoopCatalogueProducts({ ...parsedScoop, products: [...parsedScoop.products, ...parsedLiveShapeScoop.products] });
  await assert.rejects(() => createTekCentralProductFromScoop({ supplierSku: "ACB-ISP", name: titleSuggestions[0], categorySlug: "", confirmed: true }), /CATEGORY_CONFIRMATION_REQUIRED/);
  const createdFromScoop = await createTekCentralProductFromScoop({ supplierSku: "ACB-ISP", name: titleSuggestions[0], categorySlug: "networking", subcategory: "Wi-Fi", confirmed: true });
  assert.equal(createdFromScoop.product.publicationStatus, "INTERNAL_DRAFT");
  assert.equal(createdFromScoop.product.images[0], acbOffer.imageUrl);
  assert.equal(createdFromScoop.product.provenance.sourceImage?.source, "SCOOP");
  assert.equal(createdFromScoop.product.provenance.sourceSupplierOfferId, "SCOOP:ACB-ISP");
  assert.equal(createdFromScoop.mapping.status, "VERIFIED");
  assert.equal(createdFromScoop.mapping.supplierSku, "ACB-ISP");
  assert.equal(createdFromScoop.mapping.productId, createdFromScoop.product.id);
  const automaticScoopOrder: BackendOrder = {
    ...order,
    id: "automatic-scoop-order",
    orderNumber: "TC-2026-000019-AUTO",
    status: "CONFIRMED",
    payment: { ...order.payment, status: "PAID", paymentReference: "TC-2026-000019-AUTO-PF" },
    items: [{ productId: createdFromScoop.product.id, slug: createdFromScoop.product.slug, sku: createdFromScoop.product.sku, name: createdFromScoop.product.name, brand: createdFromScoop.product.brand, quantity: 1, unitPrice: 840, lineTotal: 840 }],
    subtotal: 840,
    deliveryAmount: 93,
    total: 933,
  };
  await saveOrder(automaticScoopOrder);
  const automaticResult = await autoAllocatePaidOrder(automaticScoopOrder.orderNumber);
  assert.equal(automaticResult.allocationsCreated, 1);
  assert.equal(automaticResult.supplierOrders.length, 1);
  const automaticSupplierOrder = automaticResult.supplierOrders[0];
  assert.equal(automaticSupplierOrder.supplierCode, "SCOOP");
  assert.equal(automaticSupplierOrder.status, "ACTION_REQUIRED");
  assert.equal(automaticSupplierOrder.submissionMode, "MANUAL");
  assert.equal(automaticSupplierOrder.itemLines[0]?.supplierSku, "ACB-ISP");
  assert.equal(automaticSupplierOrder.itemLines[0]?.unitCost, 475);
  assert.equal(automaticSupplierOrder.itemLines[0]?.expectedMerchandiseCost, 475);
  assert.equal(automaticSupplierOrder.itemLines[0]?.costExcludesVat, true);
  assert.equal(automaticSupplierOrder.itemLines[0]?.costSourceOfferId, "SCOOP:ACB-ISP");
  assert.equal((await autoAllocatePaidOrder(automaticScoopOrder.orderNumber)).supplierOrders.length, 0);
  assert.equal((await listAdminSupplierOrders()).filter((item) => item.customerOrderNumber === automaticScoopOrder.orderNumber).length, 1);
  const previousOperationsEmail = process.env.OPERATIONS_NOTIFICATION_EMAIL;
  const previousAppBaseUrl = process.env.APP_PUBLIC_BASE_URL;
  process.env.OPERATIONS_NOTIFICATION_EMAIL = "ops@example.test";
  process.env.APP_PUBLIC_BASE_URL = "https://tekcentral.example";
  const notificationSupplierOrder = { ...automaticSupplierOrder, id: "SO-SCOOP-NOTIFICATION-TEST", events: [...automaticSupplierOrder.events] };
  await saveSupplierOrder(notificationSupplierOrder);
  let emailSendCount = 0;
  let sentMessage: MailMessage | undefined;
  const mockMailTransport = { send: async (message: MailMessage) => { emailSendCount += 1; sentMessage = message; } };
  const sentNotification = await notifyNewScoopActionRequired(automaticScoopOrder, notificationSupplierOrder, mockMailTransport);
  assert.equal(sentNotification?.status, "SENT");
  assert.equal(sentNotification?.recipient, "ops@example.test");
  assert.equal(emailSendCount, 1);
  assert.equal((await notifyNewScoopActionRequired(automaticScoopOrder, notificationSupplierOrder, mockMailTransport))?.status, "SENT");
  assert.equal(emailSendCount, 1);
  assert.equal(sentMessage?.subject, `Action required: Paid TekCentral order ${automaticScoopOrder.orderNumber}`);
  assert.equal(sentMessage?.text.includes(automaticScoopOrder.orderNumber), true);
  assert.equal(sentMessage?.text.includes(notificationSupplierOrder.id), true);
  assert.equal(sentMessage?.text.includes(`https://tekcentral.example/admin/supplier-orders/${notificationSupplierOrder.id}`), true);
  assert.equal(sentMessage?.text.includes("475"), false);
  assert.equal(sentMessage?.text.includes(automaticScoopOrder.customer.email), false);
  assert.equal(sentMessage?.text.includes(automaticScoopOrder.customer.mobile), false);
  assert.equal(sentMessage?.text.includes(automaticScoopOrder.deliveryAddress.streetAddress), false);
  const cjNotificationCandidate = { ...notificationSupplierOrder, id: "SO-CJ-NOTIFICATION-TEST", supplierCode: "CJ" as const };
  assert.equal(await notifyNewScoopActionRequired(automaticScoopOrder, cjNotificationCandidate, mockMailTransport), undefined);
  const failedSupplierOrder = { ...notificationSupplierOrder, id: "SO-SCOOP-NOTIFICATION-FAIL", events: [...automaticSupplierOrder.events] };
  await saveSupplierOrder(failedSupplierOrder);
  const failedNotification = await notifyNewScoopActionRequired(automaticScoopOrder, failedSupplierOrder, { send: async () => { throw new Error("provider offline"); } });
  assert.equal(failedNotification?.status, "FAILED");
  assert.equal(failedNotification?.failureReason, "DELIVERY_FAILED");
  assert.equal((await getAdminSupplierOrder(failedSupplierOrder.id))?.status, "ACTION_REQUIRED");
  const retriedNotification = await retryScoopActionRequiredNotification(failedSupplierOrder.id, mockMailTransport);
  assert.equal(retriedNotification?.status, "SENT");
  assert.equal(retriedNotification?.retryCount, 1);
  const sendsAfterRetry = emailSendCount;
  assert.equal((await retryScoopActionRequiredNotification(failedSupplierOrder.id, mockMailTransport))?.status, "SENT");
  assert.equal(emailSendCount, sendsAfterRetry);
  delete process.env.OPERATIONS_NOTIFICATION_EMAIL;
  const missingConfigSupplierOrder = { ...notificationSupplierOrder, id: "SO-SCOOP-NOTIFICATION-NOCONFIG", events: [...automaticSupplierOrder.events] };
  await saveSupplierOrder(missingConfigSupplierOrder);
  assert.equal((await notifyNewScoopActionRequired(automaticScoopOrder, missingConfigSupplierOrder, mockMailTransport))?.failureReason, "CONFIGURATION_MISSING");
  const historicalSupplierOrder = { ...notificationSupplierOrder, id: "SO-SCOOP-HISTORICAL", events: [...automaticSupplierOrder.events] };
  await saveSupplierOrder(historicalSupplierOrder);
  assert.equal(await getSupplierOrderNotification(historicalSupplierOrder.id, "SCOOP_ACTION_REQUIRED"), undefined);
  if (previousOperationsEmail === undefined) delete process.env.OPERATIONS_NOTIFICATION_EMAIL; else process.env.OPERATIONS_NOTIFICATION_EMAIL = previousOperationsEmail;
  if (previousAppBaseUrl === undefined) delete process.env.APP_PUBLIC_BASE_URL; else process.env.APP_PUBLIC_BASE_URL = previousAppBaseUrl;
  assert.equal((await acknowledgeSupplierOrder(automaticSupplierOrder.id))?.status, "ACKNOWLEDGED");
  assert.equal((await approveSupplierOrder(automaticSupplierOrder.id))?.status, "APPROVED");
  await assert.rejects(() => markManualSupplierOrderOrdered({ id: automaticSupplierOrder.id, supplierReference: "" }), /reference is required/);
  const orderedScoop = await markManualSupplierOrderOrdered({ id: automaticSupplierOrder.id, supplierReference: "SCOOP-REAL-TEST", note: "Controlled test reference." });
  assert.equal(orderedScoop?.status, "ORDERED");
  assert.equal(orderedScoop?.supplierOrderReference, "SCOOP-REAL-TEST");
  await syncScoopCatalogueProducts({ ...parsedLiveShapeScoop, products: parsedLiveShapeScoop.products.map((product) => ({ ...product, dealerPriceExVat: 500 })) });
  assert.equal((await getAdminSupplierOrder(automaticSupplierOrder.id))?.itemLines[0]?.unitCost, 475);
  await syncScoopCatalogueProducts(parsedLiveShapeScoop);
  assert.equal((await getOrder(automaticScoopOrder.orderNumber))?.payment.status, "PAID");
  assert.equal((await getOrder(automaticScoopOrder.orderNumber))?.total, 933);
  assert.equal((await getOrder(automaticScoopOrder.orderNumber))?.deliveryAmount, 93);

  const unmappedOrder = { ...automaticScoopOrder, id: "automatic-unmapped-order", orderNumber: "TC-2026-000019-UNMAPPED", items: [{ ...automaticScoopOrder.items[0], productId: "unmapped-product" }] };
  await saveOrder(unmappedOrder);
  assert.equal((await autoAllocatePaidOrder(unmappedOrder.orderNumber)).allocationsCreated, 0);
  await saveSupplierProductMapping({ productId: "ambiguous-product", supplierCode: "SCOOP", supplierSku: "ACB-ISP", supplierOfferId: "SCOOP:ACB-ISP:A", status: "VERIFIED" });
  await saveSupplierProductMapping({ productId: "ambiguous-product", supplierCode: "SCOOP", supplierSku: "ACB-ISP", supplierOfferId: "SCOOP:ACB-ISP:B", status: "VERIFIED" });
  const ambiguousOrder = { ...automaticScoopOrder, id: "automatic-ambiguous-order", orderNumber: "TC-2026-000019-AMBIGUOUS", items: [{ ...automaticScoopOrder.items[0], productId: "ambiguous-product" }] };
  await saveOrder(ambiguousOrder);
  assert.equal((await autoAllocatePaidOrder(ambiguousOrder.orderNumber)).allocationsCreated, 0);
  assert.equal((await getInternalProduct(createdFromScoop.product.id))?.publicationStatus, "INTERNAL_DRAFT");
  assert.equal(products.some((product) => product.id === createdFromScoop.product.id), false);
  assert.equal((await getPublicationSummary(createdFromScoop.product.id)).state, "NOT_PUBLISHED");
  assert.equal(await getPublicationPreview(createdFromScoop.product.id), undefined);
  await setScoopLaunchAssortmentState({ supplierSku: "ACB-ISP", state: "SELECTED_FOR_LAUNCH" });
  await saveScoopAdminLogistics({ supplierSku: "ACB-ISP", weightGrams: 280, lengthMm: 88, widthMm: 90, heightMm: 89 });
  const publicationPricing = await generateScoopPricingProposal({ productId: createdFromScoop.product.id, supplierSku: "ACB-ISP" });
  const approvedPublicationPricing = await setPricingProposalStatus(publicationPricing.id, "APPROVED");
  assert.equal((await getPublicationSummary(createdFromScoop.product.id)).state, "READY_FOR_PUBLISH_REVIEW");
  const sourceImageUrl = createdFromScoop.product.provenance.sourceImage!.originalUrl;
  let publicationImageFetches = 0;
  const publicationImageFetcher = (async () => { publicationImageFetches += 1; return new Response(new Uint8Array([255, 216, 255, 217]), { status: 200, headers: { "Content-Type": "image/jpeg" } }); }) as typeof fetch;
  const storedPublicationImage = await ingestPublicProductImage({ internalProductId: createdFromScoop.product.id, sourceUrl: sourceImageUrl, sourceType: "SCOOP" }, publicationImageFetcher);
  const repeatedPublicationImage = await ingestPublicProductImage({ internalProductId: createdFromScoop.product.id, sourceUrl: sourceImageUrl, sourceType: "SCOOP" }, publicationImageFetcher);
  assert.equal(repeatedPublicationImage.publicUrl, storedPublicationImage.publicUrl);
  assert.equal(publicationImageFetches, 1);
  assert.equal((await findIngestedPublicImage({ internalProductId: createdFromScoop.product.id }))?.contentHash, storedPublicationImage.contentHash);
  const review = await getPublicationReview(createdFromScoop.product.id);
  assert.equal(review.currentApprovedProposal?.id, approvedPublicationPricing?.id);
  assert.equal(review.image.sourceImageUrl, sourceImageUrl);
  assert.equal(review.image.publicImageUrl, storedPublicationImage.publicUrl);
  assert.equal(review.draft.images[0], storedPublicationImage.publicUrl);
  assert.equal(review.eligibility.canPublish, true);
  assert.ok(Array.isArray(review.eligibility.blockers));
  assert.ok(Array.isArray(review.eligibility.warnings));
  assert.equal(review.draft.seoTitle, `${review.draft.name} | TekCentral`);
  assert.ok(review.draft.seoDescription?.includes(review.draft.name));
  assert.equal(review.draft.deliveryDisplay, "Delivery calculated at checkout based on your delivery address.");
  assert.equal(review.draft.specifications.length, 0);
  assert.ok(review.draft.description?.includes("is part of TekCentral's Networking range"));
  const longSeoTitle = defaultSeoTitle("A very long verified public product title that is deliberately longer than a normal search result title");
  assert.ok(longSeoTitle.length <= 60);
  const staffContent = preparePublicationContentDefaults({ product: createdFromScoop.product, draft: { ...review.draft, seoTitle: "Staff SEO title", description: "Staff description" }, origins: { seoTitle: "STAFF_EDITED", description: "STAFF_EDITED" } });
  assert.equal(staffContent.draft.seoTitle, "Staff SEO title");
  assert.equal(staffContent.draft.description, "Staff description");
  const advisoryOnlyEligibility = derivePublicationEligibility({ draft: { ...review.draft, shortDescription: "", specifications: [], seoTitle: "", seoDescription: "", deliveryDisplay: "" }, readinessStatus: "READY_FOR_PUBLISH_REVIEW", readinessBlockers: [], hasApprovedPrice: true, publicImageUrl: storedPublicationImage.publicUrl });
  assert.deepEqual(advisoryOnlyEligibility.blockers, []);
  const missingImageEligibility = derivePublicationEligibility({ draft: review.draft, readinessStatus: "READY_FOR_PUBLISH_REVIEW", readinessBlockers: [], hasApprovedPrice: true });
  assert.deepEqual(missingImageEligibility.blockers, ["TekCentral-controlled primary image is missing."]);
  const publicationDraft = review.draft;
  const firstVersion = await publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: publicationPricing.id, idempotencyKey: "publish-acb-v1", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Ubiquiti airCube ISP Access Point" } });
  const duplicateVersion = await publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: publicationPricing.id, idempotencyKey: "publish-acb-v1", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Changed title must not overwrite" } });
  assert.equal(duplicateVersion.id, firstVersion.id);
  assert.equal((await getPublicProductBySlug(review.draft.slug))?.name, "Ubiquiti airCube ISP Access Point");
  assert.equal("supplierSku" in (await getPublicProductBySlug(review.draft.slug))!, false);
  const secondVersion = await publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: publicationPricing.id, idempotencyKey: "publish-acb-v2", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Ubiquiti airCube ISP Wi-Fi Access Point" } });
  assert.notEqual(secondVersion.id, firstVersion.id);
  assert.equal(firstVersion.snapshot.name, "Ubiquiti airCube ISP Access Point");
  await assert.rejects(() => publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: publicationPricing.id, idempotencyKey: "publish-acb-identical", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Ubiquiti airCube ISP Wi-Fi Access Point" } }), /No public changes to publish/);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, description: ` ${secondVersion.snapshot.description ?? ""} ` }), false);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, name: `${secondVersion.snapshot.name} updated` }), true);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, description: "Changed public description" }), true);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, seoTitle: "Changed SEO title" }), true);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, images: ["/api/public/assets/products/changed.jpg"] }), true);
  assert.equal(hasMaterialPublicChanges(secondVersion.snapshot, { ...secondVersion.snapshot, price: secondVersion.snapshot.price + 1 }), true);
  assert.equal(hasMaterialPublicChanges({ ...secondVersion.snapshot, specifications: [{ name: "B", value: "2" }, { name: "A", value: "1" }] }, { ...secondVersion.snapshot, specifications: [{ name: "A", value: "1" }, { name: "B", value: "2" }] }), false);
  const rollbackVersion = await rollbackProduct({ internalProductId: createdFromScoop.product.id, sourceVersionId: firstVersion.id, pricingProposalId: publicationPricing.id, idempotencyKey: "rollback-acb-v1", actor: "Test Staff" });
  assert.equal(rollbackVersion.snapshot.name, firstVersion.snapshot.name);
  assert.equal(rollbackVersion.rollbackSourceVersionId, firstVersion.id);
  await unpublishProduct(createdFromScoop.product.id, "Test Staff");
  assert.equal((await listPublicProducts()).some((item) => item.id === createdFromScoop.product.id), false);
  assert.equal((await getPublicationSummary(createdFromScoop.product.id)).state, "UNPUBLISHED");
  const unpublishedReview = await getPublicationReview(createdFromScoop.product.id);
  assert.equal(unpublishedReview.state, "UNPUBLISHED");
  assert.equal(unpublishedReview.eligibility.canPublish, true);
  assert.equal(unpublishedReview.versions.length, 3);
  const unpublishedPreview = await getPublicationPreview(createdFromScoop.product.id);
  assert.equal(unpublishedPreview?.publicationState, "UNPUBLISHED");
  assert.equal(unpublishedPreview?.product.name, rollbackVersion.snapshot.name);
  assert.equal(unpublishedPreview?.product.images[0], storedPublicationImage.publicUrl);
  assert.equal("supplierCode" in unpublishedPreview!.product, false);
  assert.equal("supplierSku" in unpublishedPreview!.product, false);
  const republished = await publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: publicationPricing.id, idempotencyKey: "republish-acb", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Ubiquiti airCube ISP Access Point" } });
  assert.ok(republished.version > rollbackVersion.version);
  assert.equal((await getPublicationReview(createdFromScoop.product.id)).versions.length, 4);
  assert.equal(firstVersion.snapshot.name, "Ubiquiti airCube ISP Access Point");
  assert.equal((await listPublicProducts()).some((item) => item.id === createdFromScoop.product.id), true);
  const updatedPrice = await createPricingOverride({ proposalId: publicationPricing.id, overridePriceInclVat: 799, overrideReason: "Publication version price regression test.", reasonCategory: "MARKET_PRICE" });
  await setPricingProposalStatus(updatedPrice.proposal.id, "APPROVED");
  assert.equal((await getPublicProductBySlug(review.draft.slug))?.price, firstVersion.snapshot.price);
  const priceVersion = await publishProduct({ internalProductId: createdFromScoop.product.id, pricingProposalId: updatedPrice.proposal.id, idempotencyKey: "publish-acb-price-v2", actor: "Test Staff", snapshot: { ...publicationDraft, name: "Ubiquiti airCube ISP Access Point" } });
  assert.equal(priceVersion.snapshot.price, 799);
  await assert.rejects(() => rollbackProduct({ internalProductId: createdFromScoop.product.id, sourceVersionId: firstVersion.id, pricingProposalId: updatedPrice.proposal.id, idempotencyKey: "blocked-price-rollback" }), /current approved price does not match/);
  const parsedAddress = parseGoogleAddressComponents([
    { longText: "23", types: ["street_number"] }, { longText: "Anderson Street", types: ["route"] },
    { longText: "Goodwood", types: ["sublocality_level_1"] }, { longText: "Cape Town", types: ["locality"] },
    { longText: "Western Cape", types: ["administrative_area_level_1"] }, { longText: "7460", types: ["postal_code"] }, { longText: "South Africa", types: ["country"] },
  ]);
  assert.deepEqual(parsedAddress, { streetAddress: "23 Anderson Street", suburb: "Goodwood", city: "Cape Town", province: "Western Cape", postalCode: "7460", country: "South Africa" });
  assert.equal(isCompleteSouthAfricanAddress(parsedAddress), true);
  assert.equal(parseGoogleAddressComponents([{ longText: "Cape Town", types: ["locality"] }]).suburb, "");
  const validGoogleResponse = { responseId: "validation-safe", result: { verdict: { addressComplete: true }, address: { postalAddress: { regionCode: "ZA", addressLines: ["23 Anderson Street"], locality: "Cape Town", administrativeArea: "Western Cape", postalCode: "7460" }, addressComponents: [{ componentType: "sublocality_level_1", componentName: { text: "Goodwood" }, confirmationLevel: "CONFIRMED" }] }, geocode: { placeId: "place-safe", location: { latitude: -33.9, longitude: 18.5 } } } };
  assert.equal(normalizeGoogleValidatedAddress(validGoogleResponse, parsedAddress).status, "VALIDATED");
  assert.equal(normalizeGoogleValidatedAddress({ result: { verdict: { addressComplete: false } } }, parsedAddress).status, "INVALID");
  const previousAddressValidationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  delete process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  assert.deepEqual((await validateDeliveryAddress(parsedAddress)).unresolvedConcerns, ["ADDRESS_VALIDATION_KEY_MISSING"]);
  process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY = "test-address-key";
  const validated = await validateDeliveryAddress(parsedAddress, (async () => new Response(JSON.stringify(validGoogleResponse), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch);
  assert.equal(validated.status, "VALIDATED");
  const unavailable = await validateDeliveryAddress(parsedAddress, (async () => { throw new Error("offline"); }) as typeof fetch);
  assert.equal(unavailable.status, "VALIDATION_UNAVAILABLE");
  const unsupportedRegion = await validateDeliveryAddress(parsedAddress, (async () => new Response(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Unsupported region code: \"ZA\"." } }), { status: 400, headers: { "Content-Type": "application/json" } })) as typeof fetch);
  assert.deepEqual(unsupportedRegion.unresolvedConcerns, ["ADDRESS_VALIDATION_REGION_UNSUPPORTED"]);
  const requestDenied = await validateDeliveryAddress(parsedAddress, (async () => new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Request denied." } }), { status: 403, headers: { "Content-Type": "application/json" } })) as typeof fetch);
  assert.deepEqual(requestDenied.unresolvedConcerns, ["ADDRESS_VALIDATION_REQUEST_DENIED"]);
  assert.equal((await validateDeliveryAddress({ ...parsedAddress, postalCode: "invalid" })).status, "INVALID");
  assert.equal(classifyGoogleAddressValidationFailure(403, { error: { status: "PERMISSION_DENIED" } }), "ADDRESS_VALIDATION_REQUEST_DENIED");
  assert.equal(classifyGoogleAddressValidationFailure(429, { error: { status: "RESOURCE_EXHAUSTED" } }), "ADDRESS_VALIDATION_QUOTA");
  if (previousAddressValidationKey === undefined) delete process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  else process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY = previousAddressValidationKey;
  let genericImageFetches = 0;
  const genericImageFetcher = (async () => { genericImageFetches += 1; return new Response(new Uint8Array([255, 216, 255, 218]), { status: 200, headers: { "Content-Type": "image/jpeg" } }); }) as typeof fetch;
  const ingested = await ingestPublicProductImage({ internalProductId: "product-image-test", sourceUrl: "https://images.example.test/product.jpg", sourceType: "TEST" }, genericImageFetcher);
  assert.ok(ingested.publicUrl.startsWith("/api/public/assets/products/"));
  assert.equal(ingested.provenance.originalUrl, "https://images.example.test/product.jpg");
  assert.equal((await ingestPublicProductImage({ internalProductId: "product-image-test", sourceUrl: "https://images.example.test/product.jpg", sourceType: "TEST" }, genericImageFetcher)).publicUrl, ingested.publicUrl);
  assert.equal(genericImageFetches, 1);
  const storedFilename = ingested.publicUrl.split("/").at(-1)!;
  assert.ok((await readPublicProductImage(storedFilename))?.length);
  assert.equal(publicImageContentType(storedFilename), "image/jpeg");
  assert.equal(await readPublicProductImage("../business-settings.json"), undefined);
  assert.equal(await readPublicProductImage("missing.jpg"), undefined);
  const changedSource = await ingestPublicProductImage({ internalProductId: "product-image-test", sourceUrl: "https://images.example.test/product-updated.jpg", sourceType: "TEST" }, (async () => new Response(new Uint8Array([255, 216, 255, 219]), { status: 200, headers: { "Content-Type": "image/jpeg" } })) as typeof fetch);
  assert.equal((await findIngestedPublicImage({ internalProductId: "product-image-test" }))?.sourceImageUrl, "https://images.example.test/product-updated.jpg");
  assert.notEqual(changedSource.publicUrl, ingested.publicUrl);
  await assert.rejects(() => ingestPublicProductImage({ sourceUrl: "https://images.example.test/page", sourceType: "TEST" }, (async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } })) as typeof fetch), /IMAGE_CONTENT_TYPE_UNSUPPORTED/);
  const shippingSettings = (await getBusinessSettings()).shipping;
  await updateShippingSettings({ ...shippingSettings, scoopMode: "MANUAL_QUOTE" });
  const unavailablePolicy = await createShippingOptionsResult({ items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Western Cape", postalCode: "7460" } });
  assert.equal(unavailablePolicy.outcome, "QUOTE_UNAVAILABLE_POLICY");
  assert.equal(unavailablePolicy.reason, "NO_AUTOMATED_RATE_POLICY");
  assert.deepEqual(unavailablePolicy.options, []);
  const manualDiagnostic = await testScoopZoneEstimate({ supplierSku: "ACB-ISP", quantity: 1, destination: { province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(manualDiagnostic.success, false);
  assert.equal(manualDiagnostic.blocker, "POLICY_NOT_ZONE_ESTIMATE");
  await updateShippingSettings({ ...shippingSettings, scoopMode: "CONFIGURED_FLAT", scoopFlatCharge: 149 });
  const readyOptions = await createShippingOptionsResult({ items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Western Cape", postalCode: "7460" } });
  assert.equal(readyOptions.outcome, "QUOTE_READY");
  const acbOptions = await createShippingOptions({ items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Western Cape", postalCode: "7460" } });
  assert.equal(acbOptions.length, 1);
  assert.equal(acbOptions[0]?.deliveryMethodId, "standard");
  assert.equal(acbOptions[0]?.customerShippingCharge, 149);
  const testRateCard: LocalShippingRateCard = {
    enabled: true, version: 0, environment: "TEST_NOT_PRODUCTION", origin: { city: "Cape Town", province: "Western Cape", postalCode: "8001" },
    volumetricDivisorCm3PerKg: 5_000, percentageBuffer: 10, fixedBufferRand: 5, roundingMode: "NEAREST_1",
    zones: [{ id: "LOCAL_METRO", label: "Cape Town metro", enabled: true, postalCodeRanges: [{ from: 7400, to: 7999 }], provinces: [], cities: ["Cape Town"], baseCharge: 80, includedWeightKg: 1, additionalRatePerKg: 12, minimumCharge: 80, maximumCharge: 250, estimatedTransitDaysMin: 2, estimatedTransitDaysMax: 5 }],
  };
  const zoneSettings = await updateShippingSettings({ ...shippingSettings, scoopMode: "ZONE_ESTIMATE", localRateCard: testRateCard });
  assert.equal(zoneSettings.shipping.localRateCard.version, 1);
  const acbEstimated = await createShippingOptionsResult({ items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(acbEstimated.outcome, "QUOTE_READY");
  assert.equal(acbEstimated.options[0]?.fulfilmentGroups[0]?.policyType, "ZONE_ESTIMATE");
  assert.equal(acbEstimated.options[0]?.fulfilmentGroups[0]?.rateCardVersion, 1);
  assert.ok((acbEstimated.options[0]?.customerShippingCharge ?? 0) > 0);
  const acbQuantityTwo = await createShippingOptionsResult({ items: [{ productId: createdFromScoop.product.id, quantity: 2 }], destination: { country: "South Africa", province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(acbQuantityTwo.outcome, "QUOTE_READY");
  assert.equal(acbQuantityTwo.options[0]?.fulfilmentGroups[0]?.actualWeightKg, 0.56);
  const unmatchedDestination = await createShippingOptionsResult({ items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Limpopo", city: "Polokwane", postalCode: "0700" } });
  assert.equal(unmatchedDestination.outcome, "QUOTE_NO_MATCHING_ZONE");
  const rateCardVersionBeforeTest = (await getBusinessSettings()).shipping.localRateCard.version;
  const acbDiagnostic = await testScoopZoneEstimate({ supplierSku: "ACB-ISP", quantity: 1, destination: { province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(acbDiagnostic.success, true);
  assert.equal(acbDiagnostic.zoneId, "LOCAL_METRO");
  assert.equal(acbDiagnostic.matchedBy, "POSTAL_CODE");
  assert.ok((acbDiagnostic.customerCharge ?? 0) > 0);
  assert.equal(acbDiagnostic.transitDaysMin, 2);
  assert.equal(acbDiagnostic.transitDaysMax, 5);
  assert.equal(acbDiagnostic.rateCardVersion, 1);
  assert.equal((await getBusinessSettings()).shipping.localRateCard.version, rateCardVersionBeforeTest);
  const unknownSkuDiagnostic = await testScoopZoneEstimate({ supplierSku: "NOT-A-REAL-SKU", quantity: 1, destination: { province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(unknownSkuDiagnostic.success, false);
  assert.equal(unknownSkuDiagnostic.blocker, "SKU_NOT_FOUND");
  const unmatchedDiagnostic = await testScoopZoneEstimate({ supplierSku: "ACB-ISP", quantity: 1, destination: { province: "Limpopo", city: "Polokwane", postalCode: "0700" } });
  assert.equal(unmatchedDiagnostic.success, false);
  assert.equal(unmatchedDiagnostic.blocker, "NO_MATCHING_ZONE");
  const invalidDestinationDiagnostic = await testScoopZoneEstimate({ supplierSku: "ACB-ISP", quantity: 1, destination: { province: "Western Cape", city: "Cape Town", postalCode: "invalid" } });
  assert.equal(invalidDestinationDiagnostic.success, false);
  assert.equal(invalidDestinationDiagnostic.blocker, "INVALID_DESTINATION");
  const acbQuote = acbEstimated.options[0]!;
  const acbQuoteInput = { items: [{ productId: createdFromScoop.product.id, quantity: 1 }], destination: { country: "South Africa", province: "Western Cape", city: "Cape Town", postalCode: "7460" }, deliveryMethodId: "standard" };
  assert.equal((await requireShippingQuote(acbQuote.quoteId, acbQuoteInput)).quoteId, acbQuote.quoteId);
  await assert.rejects(() => requireShippingQuote(acbQuote.quoteId, { ...acbQuoteInput, destination: { ...acbQuoteInput.destination, postalCode: "8001" } }), (error: unknown) => error instanceof Error && "code" in error && error.code === "QUOTE_MISMATCH");
  await assert.rejects(() => requireShippingQuote(acbQuote.quoteId, { ...acbQuoteInput, items: [{ productId: createdFromScoop.product.id, quantity: 2 }] }), (error: unknown) => error instanceof Error && "code" in error && error.code === "QUOTE_MISMATCH");
  const expiredQuote = { ...acbQuote, quoteId: "shipping-expired-test", expiresAt: new Date(Date.now() - 1_000).toISOString() };
  await saveShippingQuote(expiredQuote);
  await assert.rejects(() => requireShippingQuote(expiredQuote.quoteId, acbQuoteInput), (error: unknown) => error instanceof Error && "code" in error && error.code === "QUOTE_EXPIRED");
  const unchangedZoneSettings = await updateShippingSettings(zoneSettings.shipping);
  assert.equal(unchangedZoneSettings.shipping.localRateCard.version, 1);
  const noImageParsed = { ...parsedLiveShapeScoop.products[0], supplierSku: "NO-IMAGE", imageUrl: undefined };
  await syncScoopCatalogueProducts({ ...parsedScoop, products: [...parsedScoop.products, ...parsedLiveShapeScoop.products, noImageParsed] });
  const noImageOffer = (await getScoopCatalogueProduct("NO-IMAGE"))!;
  const missingLogisticsDiagnostic = await testScoopZoneEstimate({ supplierSku: "NO-IMAGE", quantity: 1, destination: { province: "Western Cape", city: "Cape Town", postalCode: "7460" } });
  assert.equal(missingLogisticsDiagnostic.success, false);
  assert.equal(missingLogisticsDiagnostic.blocker, "MISSING_LOGISTICS");
  const noImageProduct = await createTekCentralProductFromScoop({ supplierSku: "NO-IMAGE", name: suggestScoopProductTitles(noImageOffer)[0], categorySlug: "networking", confirmed: true });
  assert.deepEqual(noImageProduct.product.images, []);
  assert.equal(noImageProduct.product.provenance.sourceImage, undefined);
  assert.equal(deriveScoopLaunchReadiness({ product: (await getScoopCatalogueProduct("ACB-ISP"))!, mapping: createdFromScoop.mapping, proposal: approvedProposal }).blockers.includes("MAPPING_NOT_VERIFIED"), false);

  const suggestedScoopMapping = await saveSupplierProductMapping({
    productId: "demo-router-gigabit",
    supplierCode: "SCOOP",
    supplierSku: "FLY-2G",
    supplierOfferId: "SCOOP:FLY-2G",
    supplierProductId: "FLY-2G",
    supplierProductSku: "FLY-2G",
    status: "SUGGESTED",
    source: "SCOOP_FEED",
  });
  assert.equal(suggestedScoopMapping.status, "SUGGESTED");
  assert.equal(suggestedScoopMapping.supplierSku, "FLY-2G");
  assert.equal(suggestedScoopMapping.supplierOfferId, "SCOOP:FLY-2G");
  const verifiedScoopMapping = await setSupplierProductMappingStatus(suggestedScoopMapping.id!, "VERIFIED");
  assert.equal(verifiedScoopMapping?.status, "VERIFIED");
  assert.ok(verifiedScoopMapping?.verifiedAt);
  const mappedScoopOffer = scoopProductToSupplierOffer(
    (await getScoopCatalogueProduct("FLY-2G"))!,
    verifiedScoopMapping,
  );
  assert.equal(mappedScoopOffer.id, "SCOOP:FLY-2G");
  assert.equal(mappedScoopOffer.tekcentralProductId, "demo-router-gigabit");
  assert.equal(mappedScoopOffer.mappingStatus, "VERIFIED");
  await syncScoopCatalogueProducts({ ...parsedScoop, products: parsedScoop.products.slice(1) });
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.availability, "STALE");
  assert.equal((await getSupplierProductMappingById(suggestedScoopMapping.id!))?.status, "VERIFIED");
  await syncScoopCatalogueProducts(parsedScoop);
  assert.equal((await getScoopCatalogueProduct("FLY-2G"))?.availability, "AVAILABLE");
  assert.equal((await getSupplierProductMappingById(suggestedScoopMapping.id!))?.status, "VERIFIED");

  await syncScoopCatalogueProducts({ ...parsedScoop, products: [...parsedScoop.products, ...parsedLiveShapeScoop.products] });
  const websiteCsv = "sku,title,manufacturer,product_url,image_url,category,supplier_code\nWEB-ONLY,Example Wi-Fi Adapter,Example Corp,https://scoop.co.za/web-only,https://scoop.co.za/web-only.jpg,Networking,WEB-ONLY\nACB-ISP,Ubiquiti UISP airCube ISP Wi-Fi Access Point,Ubiquiti Ltd,https://scoop.co.za/acb-isp,https://scoop.co.za/acb.jpg,Networking,ACB-ISP";
  const websitePreview = previewScoopWebsiteImport(websiteCsv);
  assert.equal(websitePreview.summary.valid, 2);
  assert.equal(websitePreview.summary.rejected, 0);
  const firstWebsiteImport = await applyScoopWebsiteImport(websiteCsv, websitePreview.importFingerprint);
  assert.equal(firstWebsiteImport.newWebsiteOnly, 1);
  assert.equal(firstWebsiteImport.mergedWithXml, 1);
  assert.equal((await getScoopCatalogueProduct("WEB-ONLY"))?.reconciliationStatus, "WEBSITE_ONLY");
  assert.equal((await getScoopCatalogueProduct("WEB-ONLY"))?.availability, "UNKNOWN");
  assert.equal((await getScoopCatalogueProduct("WEB-ONLY"))?.dealerPriceExVat, undefined);
  assert.equal((await getScoopCatalogueProduct("ACB-ISP"))?.reconciliationStatus, "BOTH");
  assert.equal((await getScoopCatalogueProduct("ACB-ISP"))?.dealerPriceExVat, 475);
  assert.equal((await applyScoopWebsiteImport(websiteCsv, websitePreview.importFingerprint)).unchanged, 2);
  assert.equal((await listScoopCatalogueProducts()).filter((product) => product.supplierSku === "WEB-ONLY").length, 1);
  assert.equal(previewScoopWebsiteImport("sku,title\nDUP,One\nDUP,Two").summary.rejected, 2);
  assert.equal(previewScoopWebsiteImport("sku,title,product_url\nBAD,Unsafe,javascript:alert(1)").summary.rejected, 1);
  assert.equal((await discoverScoopWebsiteProducts({ mode: "SAFE_DIRECT_DISCOVERY", discover: async () => ({ products: [], status: 403, bodySample: "Just a moment... Cloudflare" }) })).status, "SOURCE_UNAVAILABLE");
  assert.equal(scoopIdentityConflict((await getScoopCatalogueProduct("ACB-ISP"))!, { sku: "ACB-ISP", title: "Ubiquiti airCube ISP WiFi Access Point", manufacturer: "Ubiquiti Limited" }).length, 0);
  assert.equal(scoopIdentityConflict((await getScoopCatalogueProduct("ACB-ISP"))!, { sku: "ACB-ISP", title: "Different", manufacturer: "Other Brand" }).length, 1);
  await assert.rejects(() => generateScoopPricingProposal({ productId: createdFromScoop.product.id, supplierSku: "WEB-ONLY" }), /Authoritative Scoop dealer cost/);
  await setScoopLaunchAssortmentState({ supplierSku: "WEB-ONLY", state: "SELECTED_FOR_LAUNCH" });
  await saveScoopAdminLogistics({ supplierSku: "WEB-ONLY", weightGrams: 100, lengthMm: 10, widthMm: 20, heightMm: 30 });
  const websiteMapping = await saveSupplierProductMapping({ productId: "website-only-product", supplierCode: "SCOOP", supplierSku: "WEB-ONLY", supplierOfferId: "SCOOP:WEB-ONLY", status: "SUGGESTED", source: "WEBSITE_IMPORT" });
  await setSupplierProductMappingStatus(websiteMapping.id!, "VERIFIED");
  const websiteBeforeUpgrade = (await getScoopCatalogueProduct("WEB-ONLY"))!;
  assert.equal(deriveScoopLaunchReadiness({ product: websiteBeforeUpgrade, mapping: { status: "VERIFIED" } as SupplierProductMapping }).blockers.includes("AUTHORITATIVE_COMMERCIAL_DATA_MISSING"), true);
  const webXmlProduct = { ...parsedScoop.products[0], supplierSku: "WEB-ONLY", description: "Example Wi-Fi Adapter", manufacturer: "Example", sourceObservations: parsedScoop.products[0].sourceObservations.map((source) => ({ ...source, fields: { ...source.fields, sku: "WEB-ONLY", description: "Example Wi-Fi Adapter", manufacturer: "Example" } })) };
  const upgradeSync = await syncScoopCatalogueProducts({ ...parsedScoop, products: [...parsedScoop.products, ...parsedLiveShapeScoop.products, webXmlProduct] });
  assert.equal(upgradeSync.upgradedToBoth, 1);
  const websiteAfterUpgrade = (await getScoopCatalogueProduct("WEB-ONLY"))!;
  assert.equal(websiteAfterUpgrade.reconciliationStatus, "BOTH");
  assert.equal(websiteAfterUpgrade.dealerPriceExVat, 25);
  assert.equal(websiteAfterUpgrade.totalStock, 702);
  assert.equal(websiteAfterUpgrade.launchAssortment?.state, "SELECTED_FOR_LAUNCH");
  assert.equal(websiteAfterUpgrade.logisticsMetadata?.status, "COMPLETE");
  assert.equal((await getSupplierProductMappingById(websiteMapping.id!))?.status, "VERIFIED");
  assert.equal((await getInternalProduct(createdFromScoop.product.id))?.provenance.sourceSupplierOfferId, "SCOOP:ACB-ISP");
  assert.equal((await listScoopCatalogueProducts()).filter((product) => product.supplierSku === "ACB-ISP").length, 1);

  const zeroStockMapping = await saveSupplierProductMapping({
    productId: "demo-switch-poe-8",
    supplierCode: "SCOOP",
    supplierSku: "ZERO-STOCK",
    supplierOfferId: "SCOOP:ZERO-STOCK",
    status: "SUGGESTED",
    source: "SCOOP_FEED",
  });
  await setSupplierProductMappingStatus(zeroStockMapping.id!, "VERIFIED");
  assert.equal((await getScoopCatalogueProduct("ZERO-STOCK"))?.availability, "OUT_OF_STOCK");
  assert.equal((await getSupplierProductMappingById(zeroStockMapping.id!))?.status, "VERIFIED");
  const rejectedScoopMapping = await setSupplierProductMappingStatus(zeroStockMapping.id!, "REJECTED");
  assert.equal(rejectedScoopMapping?.status, "REJECTED");
  assert.equal(getSupplierRegistryEntry("SCOOP").capabilities.catalogue, "SUPPORTED");
  assert.equal(getSupplierRegistryEntry("SCOOP").capabilities.stock, "SUPPORTED");
  assert.equal(getSupplierRegistryEntry("SCOOP").capabilities.pricing, "SUPPORTED");
  assert.equal(getSupplierRegistryEntry("SCOOP").capabilities.orderCreate, "UNSUPPORTED");

  await saveOrder(order);
  const cancelledPaymentOrder = await updatePaymentStatus(
    order.orderNumber,
    "CANCELLED",
  );
  assert.equal(cancelledPaymentOrder?.payment.status, "CANCELLED");
  assert.equal(cancelledPaymentOrder?.status, "PENDING");

  await saveOrder({
    ...order,
    id: "admin-order-paid",
    orderNumber: "TC-2026-000010",
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000010-PF",
    },
    status: "CONFIRMED",
    statusHistory: [
      {
        status: "CONFIRMED",
        label: "Confirmed",
        createdAt: "2026-09-05T00:00:00.000Z",
        note: "Payment confirmed.",
      },
    ],
    returns: [
      {
        id: "return-admin-1",
        orderId: "admin-order-paid",
        items: [
          {
            productId: "demo-laptop-pro-14",
            name: "14-inch Business Laptop",
            quantity: 1,
            unitPrice: 18999,
            lineTotal: 18999,
          },
        ],
        reason: "Faulty",
        createdAt: "2026-09-05T00:00:00.000Z",
        status: "REQUESTED",
      },
    ],
    refunds: [],
  });

  const processingOrder = await updateAdminOrderStatus(
    "TC-2026-000010",
    "PROCESSING",
    "Ready for fulfilment.",
  );
  assert.equal(processingOrder?.status, "PROCESSING");
  assert.equal(processingOrder?.statusHistory.at(-1)?.note, "Ready for fulfilment.");

  await assert.rejects(
    updateAdminOrderStatus("TC-2026-000010", "DELIVERED"),
    /Invalid order transition/,
  );

  await saveOrder({
    ...order,
    id: "admin-order-unpaid",
    orderNumber: "TC-2026-000011",
    payment: {
      ...order.payment,
      status: "PENDING",
      paymentReference: "TC-2026-000011-PF",
    },
    status: "PENDING",
  });
  await assert.rejects(
    updateAdminOrderStatus("TC-2026-000011", "PROCESSING"),
    /Paid payment confirmation is required/,
  );

  await saveOrder({
    ...order,
    id: "admin-order-paid-second",
    orderNumber: "TC-2026-000012",
    total: 2199,
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000012-PF",
      confirmedAt: "2026-09-05T10:00:00.000Z",
    },
    status: "CONFIRMED",
  });

  const initialPaidAlerts = derivePaidOrderAlerts(await listOrders());
  assert.equal(initialPaidAlerts.some((alert) => alert.orderNumber === "TC-2026-000010"), true);
  assert.equal(initialPaidAlerts.some((alert) => alert.orderNumber === "TC-2026-000012"), true);
  assert.equal(initialPaidAlerts.some((alert) => alert.orderNumber === "TC-2026-000011"), false);
  const listedAdminOrders = await listAdminOrders();
  assert.equal(
    listedAdminOrders.find((item) => item.orderNumber === "TC-2026-000010")?.opsPaymentAcknowledgedAt,
    undefined,
  );
  assert.equal(derivePaidOrderAlerts(listedAdminOrders).some((alert) => alert.orderNumber === "TC-2026-000010"), true);

  const acknowledgedPaidOrder = await acknowledgePaidOrder("TC-2026-000010");
  assert.ok(acknowledgedPaidOrder?.opsPaymentAcknowledgedAt);
  const acknowledgedAt = acknowledgedPaidOrder?.opsPaymentAcknowledgedAt;
  const duplicateAcknowledgement = await acknowledgePaidOrder("TC-2026-000010");
  assert.equal(duplicateAcknowledgement?.opsPaymentAcknowledgedAt, acknowledgedAt);
  const remainingPaidAlerts = derivePaidOrderAlerts(await listOrders());
  assert.equal(remainingPaidAlerts.some((alert) => alert.orderNumber === "TC-2026-000010"), false);
  assert.equal(remainingPaidAlerts.some((alert) => alert.orderNumber === "TC-2026-000012"), true);
  await acknowledgePaidOrder("TC-2026-000011");
  const afterUnpaidAcknowledgement = derivePaidOrderAlerts(await listOrders());
  assert.equal(afterUnpaidAcknowledgement.some((alert) => alert.orderNumber === "TC-2026-000010"), false);
  assert.equal(afterUnpaidAcknowledgement.some((alert) => alert.orderNumber === "TC-2026-000012"), true);

  const baseline = await baselinePaidOrderAlerts("2026-09-05T11:00:00.000Z");
  assert.equal(baseline.orderNumbers.includes("TC-2026-000012"), true);
  assert.equal(baseline.orderNumbers.includes("TC-2026-000011"), false);
  const baselinedOrders = await listOrders();
  assert.equal(
    baselinedOrders.find((item) => item.orderNumber === "TC-2026-000012")?.opsPaymentAcknowledgedAt,
    "2026-09-05T11:00:00.000Z",
  );
  assert.equal(
    baselinedOrders.find((item) => item.orderNumber === "TC-2026-000012")?.payment.status,
    "PAID",
  );
  assert.equal(
    baselinedOrders.find((item) => item.orderNumber === "TC-2026-000012")?.status,
    "CONFIRMED",
  );
  assert.equal(
    derivePaidOrderAlerts(await listOrders()).some((alert) => alert.orderNumber === "TC-2026-000012"),
    false,
  );
  const secondBaseline = await baselinePaidOrderAlerts("2026-09-05T12:00:00.000Z");
  assert.equal(secondBaseline.count, 0);

  const stalePendingOrder = await saveOrder({
    ...order,
    id: "admin-order-attention",
    orderNumber: "TC-2026-000013",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    payment: {
      ...order.payment,
      status: "PENDING",
      paymentReference: "TC-2026-000013-PF",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
    status: "PENDING",
  });
  assert.equal(
    deriveAttentionReasons(stalePendingOrder, new Date("2026-09-05T02:00:00.000Z"))[0]?.code,
    "PAYMENT_PENDING_TOO_LONG",
  );
  assert.equal(
    deriveAttentionReasons(stalePendingOrder, new Date("2026-09-04T02:00:00.000Z")).length,
    0,
  );

  const heldOrder = await setOperationalHold({
    orderNumber: "TC-2026-000010",
    reason: "ADDRESS_REVIEW",
    notes: "Confirm unit number.",
  });
  assert.equal(heldOrder?.operationalHold?.active, true);
  assert.equal(deriveAttentionReasons(heldOrder!).some((reason) => reason.code === "ORDER_ON_HOLD"), true);
  await assert.rejects(
    updateAdminOrderStatus("TC-2026-000010", "SHIPPED"),
    /Release the operational hold/,
  );
  const releasedOrder = await releaseOperationalHold("TC-2026-000010");
  assert.equal(releasedOrder?.operationalHold?.active, false);
  const shippedAfterRelease = await updateAdminOrderStatus("TC-2026-000010", "SHIPPED");
  assert.equal(shippedAfterRelease?.status, "SHIPPED");

  const notedOrder = await addInternalNote("TC-2026-000010", "Call customer before dispatch.");
  assert.equal(notedOrder?.internalNotes?.length, 1);
  assert.equal(notedOrder?.internalNotes?.[0]?.authorLabel, "TekCentral Staff");

  const allocatedOrder = await createSupplierAllocation({
    orderNumber: "TC-2026-000010",
    supplierCode: "MANUAL",
    orderItemIds: ["demo-laptop-pro-14"],
    notes: "Manual fulfilment review.",
  });
  assert.equal(allocatedOrder?.supplierAllocations?.[0]?.supplierCode, "MANUAL");
  assert.deepEqual(allocatedOrder?.supplierAllocations?.[0]?.orderItemIds, [
    "demo-laptop-pro-14",
  ]);

  await saveOrder({
    ...order,
    id: "admin-order-split",
    orderNumber: "TC-2026-000012",
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000012-PF",
    },
    status: "CONFIRMED",
    items: [
      ...order.items,
      {
        productId: "demo-ssd-1tb",
        slug: "1tb-portable-ssd",
        sku: "TC-SSD-1TB",
        name: "1TB Portable SSD",
        brand: "TekCentral",
        quantity: 1,
        unitPrice: 2299,
        lineTotal: 2299,
      },
    ],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000012",
    supplierCode: "MANUAL",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  const splitOrder = await createSupplierAllocation({
    orderNumber: "TC-2026-000012",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  assert.equal(splitOrder?.supplierAllocations?.length, 2);
  assert.deepEqual(
    splitOrder?.supplierAllocations?.flatMap((allocation) => allocation.orderItemIds).sort(),
    ["demo-laptop-pro-14", "demo-ssd-1tb"],
  );

  const parcelOrder = await createParcel({
    orderNumber: "TC-2026-000012",
    itemQuantities: [{ orderItemId: "demo-laptop-pro-14", quantity: 1 }],
    weightKg: 2.5,
    reference: "PKG-1",
  });
  assert.equal(parcelOrder?.parcels?.[0]?.reference, "PKG-1");
  await assert.rejects(
    createParcel({
      orderNumber: "TC-2026-000012",
      itemQuantities: [{ orderItemId: "demo-laptop-pro-14", quantity: 2 }],
    }),
    /Shipment quantity exceeds ordered quantity/,
  );

  const partialShipment = await createAdminShipment({
    orderNumber: "TC-2026-000012",
    items: [{ orderItemId: "demo-laptop-pro-14", quantity: 1 }],
    courier: "Manual courier",
    trackingNumber: "TRACK-1",
    trackingUrl: "https://tracking.example/TRACK-1",
    dispatchedAt: "2026-09-05",
  });
  assert.equal(partialShipment?.status, "PARTIALLY_SHIPPED");
  const fullShipment = await createAdminShipment({
    orderNumber: "TC-2026-000012",
    items: [{ orderItemId: "demo-ssd-1tb", quantity: 1 }],
    courier: "Manual courier",
    trackingNumber: "TRACK-2",
    trackingUrl: "https://tracking.example/TRACK-2",
    dispatchedAt: "2026-09-05",
  });
  assert.equal(fullShipment?.status, "SHIPPED");
  await assert.rejects(
    createAdminShipment({
      orderNumber: "TC-2026-000012",
      items: [{ orderItemId: "demo-ssd-1tb", quantity: 1 }],
    }),
    /Shipment quantity exceeds ordered quantity/,
  );

  const supplierBaseOrder: BackendOrder = {
    ...order,
    id: "supplier-order-base",
    orderNumber: "TC-2026-000020",
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000020-PF",
    },
    status: "CONFIRMED",
    items: [
      {
        productId: "demo-laptop-pro-14",
        slug: "tekpro-14-business-laptop",
        sku: "TC-LTP-14",
        name: "14-inch Business Laptop",
        brand: "TekPro",
        quantity: 2,
        unitPrice: 18999,
        lineTotal: 37998,
      },
      {
        productId: "demo-ssd-1tb",
        slug: "1tb-portable-ssd",
        sku: "TC-SSD-1TB",
        name: "1TB Portable SSD",
        brand: "TekCentral",
        quantity: 1,
        unitPrice: 2299,
        lineTotal: 2299,
      },
    ],
  };
  await saveOrder(supplierBaseOrder);
  await createSupplierAllocation({
    orderNumber: "TC-2026-000020",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-laptop-pro-14", "demo-ssd-1tb"],
  });
  const oneSupplierOrders = await generateSupplierOrders("TC-2026-000020");
  assert.equal(oneSupplierOrders?.length, 1);
  assert.equal(oneSupplierOrders?.[0]?.status, "READY_FOR_APPROVAL");
  assert.equal(
    deriveSupplierOrderAttention(oneSupplierOrders![0])[0]?.code,
    "SUPPLIER_ORDER_AWAITING_APPROVAL",
  );
  await assert.rejects(
    mockSubmitSupplierOrder(oneSupplierOrders![0].id, "SUCCESS"),
    /Invalid supplier order transition/,
  );
  await assert.rejects(
    approveSupplierOrder(oneSupplierOrders![0].id),
    /Supplier SKU mapping is required/,
  );
  await mapSupplierOrderSkus(oneSupplierOrders![0]);
  const approvedOne = await approveSupplierOrder(oneSupplierOrders![0].id);
  assert.equal(approvedOne?.status, "APPROVED");
  const submittedOne = await mockSubmitSupplierOrder(oneSupplierOrders![0].id, "SUCCESS");
  const duplicateSubmit = await mockSubmitSupplierOrder(oneSupplierOrders![0].id, "SUCCESS");
  assert.equal(submittedOne?.mockSubmissions.length, 1);
  assert.equal(duplicateSubmit?.mockSubmissions.length, 1);
  const confirmedOne = await applyMockSupplierOutcome(oneSupplierOrders![0].id);
  assert.equal(confirmedOne?.status, "CONFIRMED");
  assert.ok(confirmedOne?.supplierOrderReference?.startsWith("SCOOP-MOCK-"));

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-split",
    orderNumber: "TC-2026-000021",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000021-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000021",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000021",
    supplierCode: "MUSTEK",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const twoSupplierOrders = await generateSupplierOrders("TC-2026-000021");
  assert.equal(twoSupplierOrders?.length, 2);
  for (const supplierOrder of twoSupplierOrders ?? []) {
    await mapSupplierOrderSkus(supplierOrder);
    await approveSupplierOrder(supplierOrder.id);
    await mockSubmitSupplierOrder(supplierOrder.id, "SUCCESS");
    const outcome = await applyMockSupplierOutcome(supplierOrder.id);
    assert.equal(outcome?.status, "CONFIRMED");
  }

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-backorder",
    orderNumber: "TC-2026-000022",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000022-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000022",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000022",
    supplierCode: "MUSTEK",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const mixedOrders = await generateSupplierOrders("TC-2026-000022");
  const successSupplierOrder = mixedOrders![0];
  const backorderSupplierOrder = mixedOrders![1];
  await mapSupplierOrderSkus(successSupplierOrder);
  await approveSupplierOrder(successSupplierOrder.id);
  await mockSubmitSupplierOrder(successSupplierOrder.id, "SUCCESS");
  assert.equal((await applyMockSupplierOutcome(successSupplierOrder.id))?.status, "CONFIRMED");
  await mapSupplierOrderSkus(backorderSupplierOrder);
  await approveSupplierOrder(backorderSupplierOrder.id);
  await mockSubmitSupplierOrder(backorderSupplierOrder.id, "BACKORDER");
  const backordered = await applyMockSupplierOutcome(backorderSupplierOrder.id);
  assert.equal(backordered?.status, "BACKORDERED");
  assert.equal(
    deriveSupplierOrderAttention(backordered!)[0]?.code,
    "SUPPLIER_BACKORDER",
  );

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-partial",
    orderNumber: "TC-2026-000023",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000023-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000023",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  const partialOrders = await generateSupplierOrders("TC-2026-000023");
  await mapSupplierOrderSkus(partialOrders![0]);
  await approveSupplierOrder(partialOrders![0].id);
  await mockSubmitSupplierOrder(partialOrders![0].id, "PARTIAL_CONFIRMATION");
  await assert.rejects(
    applyMockSupplierOutcome(partialOrders![0].id, [
      { orderItemId: "demo-laptop-pro-14", confirmedQuantity: 3 },
    ]),
    /Confirmed quantity exceeds ordered quantity/,
  );
  const partial = await applyMockSupplierOutcome(partialOrders![0].id, [
    { orderItemId: "demo-laptop-pro-14", confirmedQuantity: 1, backorderedQuantity: 1 },
  ]);
  assert.equal(partial?.status, "PARTIALLY_CONFIRMED");

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-rejected",
    orderNumber: "TC-2026-000024",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000024-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000024",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  const rejectedOrders = await generateSupplierOrders("TC-2026-000024");
  await mapSupplierOrderSkus(rejectedOrders![0]);
  await approveSupplierOrder(rejectedOrders![0].id);
  await mockSubmitSupplierOrder(rejectedOrders![0].id, "REJECTED");
  const rejectedSupplierOrder = await applyMockSupplierOutcome(rejectedOrders![0].id);
  assert.equal(rejectedSupplierOrder?.status, "REJECTED");
  assert.equal(
    deriveSupplierOrderAttention(rejectedSupplierOrder!)[0]?.code,
    "SUPPLIER_ORDER_REJECTED",
  );
  const reallocatedOrder = await createSupplierAllocation({
    orderNumber: "TC-2026-000024",
    supplierCode: "MUSTEK",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  assert.equal(reallocatedOrder?.supplierAllocations?.length, 2);
  const regenerated = await generateSupplierOrders("TC-2026-000024");
  assert.equal(regenerated?.length, 1);
  assert.equal(regenerated?.[0]?.supplierCode, "MUSTEK");

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-supersede",
    orderNumber: "TC-2026-000025",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000025-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000025",
    supplierCode: "MANUAL",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const firstSupersedeOrders = await generateSupplierOrders("TC-2026-000025");
  await createSupplierAllocation({
    orderNumber: "TC-2026-000025",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const replacementOrders = await generateSupplierOrders("TC-2026-000025");
  assert.equal(replacementOrders?.length, 1);
  assert.equal(replacementOrders?.[0]?.supplierCode, "SCOOP");
  const superseded = await getAdminSupplierOrder(firstSupersedeOrders![0].id);
  assert.equal(superseded?.status, "SUPERSEDED");
  assert.equal(superseded?.supersededBySupplierOrderId, replacementOrders?.[0]?.id);
  await assert.rejects(
    approveSupplierOrder(firstSupersedeOrders![0].id),
    /Invalid supplier order transition/,
  );

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-duplicate-block",
    orderNumber: "TC-2026-000026",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000026-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000026",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const protectedOrders = await generateSupplierOrders("TC-2026-000026");
  await mapSupplierOrderSkus(protectedOrders![0]);
  await approveSupplierOrder(protectedOrders![0].id);
  await createSupplierAllocation({
    orderNumber: "TC-2026-000026",
    supplierCode: "MUSTEK",
    orderItemIds: ["demo-ssd-1tb"],
  });
  await assert.rejects(
    generateSupplierOrders("TC-2026-000026"),
    /Total active supplier quantity cannot exceed customer ordered quantity/,
  );

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-held-generation",
    orderNumber: "TC-2026-000027",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000027-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000027",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  await setOperationalHold({ orderNumber: "TC-2026-000027", reason: "ADDRESS_REVIEW" });
  await assert.rejects(
    generateSupplierOrders("TC-2026-000027"),
    /blocked until this hold is released/,
  );

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-held-approval",
    orderNumber: "TC-2026-000028",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000028-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000028",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const heldApprovalOrders = await generateSupplierOrders("TC-2026-000028");
  await mapSupplierOrderSkus(heldApprovalOrders![0]);
  await setOperationalHold({ orderNumber: "TC-2026-000028", reason: "ADDRESS_REVIEW" });
  await assert.rejects(
    approveSupplierOrder(heldApprovalOrders![0].id),
    /blocked until this hold is released/,
  );
  await releaseOperationalHold("TC-2026-000028");
  assert.equal((await approveSupplierOrder(heldApprovalOrders![0].id))?.status, "APPROVED");

  await saveOrder({
    ...supplierBaseOrder,
    id: "supplier-order-held-submit",
    orderNumber: "TC-2026-000029",
    payment: {
      ...supplierBaseOrder.payment,
      paymentReference: "TC-2026-000029-PF",
    },
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000029",
    supplierCode: "SCOOP",
    orderItemIds: ["demo-ssd-1tb"],
  });
  const heldSubmitOrders = await generateSupplierOrders("TC-2026-000029");
  await mapSupplierOrderSkus(heldSubmitOrders![0]);
  await approveSupplierOrder(heldSubmitOrders![0].id);
  await setOperationalHold({ orderNumber: "TC-2026-000029", reason: "ADDRESS_REVIEW" });
  await assert.rejects(
    mockSubmitSupplierOrder(heldSubmitOrders![0].id, "SUCCESS"),
    /blocked until this hold is released/,
  );
  await releaseOperationalHold("TC-2026-000029");
  assert.equal((await mockSubmitSupplierOrder(heldSubmitOrders![0].id, "SUCCESS"))?.status, "SUBMITTED");

  await createSupplierAllocation({
    orderNumber: "TC-2026-000023",
    supplierCode: "MUSTEK",
    orderItemIds: ["demo-laptop-pro-14"],
  });
  const partialReallocation = await generateSupplierOrders("TC-2026-000023");
  assert.equal(partialReallocation?.length, 1);
  assert.equal(partialReallocation?.[0]?.itemLines[0]?.quantity, 1);

  await assert.rejects(
    dispatchSupplierOrder({
      id: confirmedOne!.id,
      trackingNumber: "MOCK-TRACK-1",
      dispatchedAt: "2026-09-06",
    }),
    /Courier, tracking number and dispatch date are required/,
  );
  await assert.rejects(
    dispatchSupplierOrder({
      id: confirmedOne!.id,
      courier: "Mock courier",
      dispatchedAt: "2026-09-06",
    }),
    /Courier, tracking number and dispatch date are required/,
  );
  await assert.rejects(
    dispatchSupplierOrder({
      id: confirmedOne!.id,
      courier: "Mock courier",
      trackingNumber: "MOCK-TRACK-1",
    }),
    /Courier, tracking number and dispatch date are required/,
  );
  const dispatchedSupplierOrder = await dispatchSupplierOrder({
    id: confirmedOne!.id,
    courier: "Mock courier",
    trackingNumber: "MOCK-TRACK-1",
    trackingUrl: "https://tracking.example/MOCK-TRACK-1",
    dispatchedAt: "2026-09-06",
  });
  assert.equal(dispatchedSupplierOrder?.status, "DISPATCHED");

  const customerView = toCustomerOrder({
    ...supplierBaseOrder,
    internalNotes: [
      {
        id: "note-private",
        orderId: supplierBaseOrder.id,
        createdAt: "2026-09-05T00:00:00.000Z",
        authorLabel: "Ops",
        body: "Supplier note",
      },
    ],
    supplierAllocations: [
      {
        id: "allocation-private",
        orderId: supplierBaseOrder.id,
        orderItemIds: ["demo-ssd-1tb"],
        supplierCode: "SCOOP",
        supplierName: "Scoop Distribution",
        status: "ASSIGNED",
        supplierOrderReference: "SO-PRIVATE",
        notes: "Private supplier note",
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
    ],
    operationalHold: {
      active: true,
      reason: "ADDRESS_REVIEW",
      createdAt: "2026-09-05T00:00:00.000Z",
    },
    parcels: [],
    shipments: [],
  });
  assert.equal("supplierAllocations" in customerView, false);
  assert.equal("internalNotes" in customerView, false);
  assert.equal("operationalHold" in customerView, false);
  assert.equal("parcels" in customerView, false);
  assert.equal("shipments" in customerView, false);

  const returnReviewOrder = await updateAdminReturnStatus(
    "return-admin-1",
    "UNDER_REVIEW",
  );
  assert.equal(returnReviewOrder?.returns[0]?.status, "UNDER_REVIEW");
  const returnApprovedOrder = await updateAdminReturnStatus("return-admin-1", "APPROVED");
  assert.equal(returnApprovedOrder?.returns[0]?.status, "APPROVED");

  const refundOrder = await createAdminRefund("TC-2026-000010", "return-admin-1");
  const refund = refundOrder?.refunds[0];
  assert.equal(refund?.amount, 18999);
  assert.equal(refund?.items?.[0]?.quantity, 1);
  assert.equal(refund?.items?.[0]?.lineTotal, 18999);

  const refundApproved = await updateAdminRefundStatus(refund?.id ?? "", "APPROVED");
  assert.equal(refundApproved?.refunds[0]?.status, "APPROVED");
  const refundProcessing = await updateAdminRefundStatus(refund?.id ?? "", "PROCESSING");
  assert.equal(refundProcessing?.payment.status, "REFUND_PENDING");
  const refundComplete = await updateAdminRefundStatus(refund?.id ?? "", "REFUNDED");
  assert.equal(refundComplete?.payment.status, "REFUNDED");
  await assert.rejects(
    updateAdminRefundStatus(refund?.id ?? "", "PENDING"),
    /Invalid refund transition/,
  );

  const cjOrderClient = new MockCjOrderClient();
  delete process.env.CJ_REAL_ORDER_CREATION_ENABLED;
  const unselectedPreflight = await prepareCjOrderPreflight({
    supplierOrderId: approvedCjSupplierOrder!.id,
    client: cjOrderClient,
  });
  assert.equal(unselectedPreflight.status, "BLOCKED");
  assert.equal(unselectedPreflight.logisticsOptions[0]?.logisticName, "CJPacket Sensitive");
  assert.equal(
    cjOrderClient.calls.some((call) => call.path === "/shopping/order/createOrderV2"),
    false,
  );
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: approvedCjSupplierOrder!.id,
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: cjOrderClient,
    }),
    /Real CJ order creation is disabled/,
  );
  process.env.CJ_REAL_ORDER_CREATION_ENABLED = "true";
  const readyPreflight = await prepareCjOrderPreflight({
    supplierOrderId: approvedCjSupplierOrder!.id,
    selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
    client: cjOrderClient,
  });
  assert.equal(readyPreflight.status, "READY");
  assert.equal(readyPreflight.payloadPreview?.payType, 3);
  assert.equal(readyPreflight.payloadPreview?.shippingCountryCode, "ZA");
  assert.equal(readyPreflight.payloadPreview?.shippingPhone, "27821234567");
  assert.equal(readyPreflight.payloadPreview?.consigneeID, "8001015009087");
  assert.equal(readyPreflight.payloadPreview?.products[0]?.vid, "VID-UNVERIFIED");
  assert.equal(readyPreflight.recipientValidation?.phone.status, "READY");
  assert.equal(readyPreflight.recipientValidation?.consigneeId.status, "READY");
  assert.equal(readyPreflight.recipientValidation?.consigneeId.maskedValue, "*********9087");
  const sanitizedReadyPreflight = sanitizeCjOrderPreflightForAdmin(readyPreflight);
  assert.equal(sanitizedReadyPreflight.payloadPreview?.consigneeID, "*********9087");
  assert.equal(sanitizedReadyPreflight.recipientValidation?.consigneeId.normalizedValue, undefined);
  assert.equal(readyPreflight.supplierShippingAmount, 7.25);
  assert.equal(readyPreflight.currency, "USD");
  const preflightTipCall = cjOrderClient.calls.find((call) => call.path === "/logistic/freightCalculateTip");
  assert.equal(Boolean(preflightTipCall), true);
  assert.equal(
    cjOrderClient.calls.some((call) => call.path === "/logistic/freightCalculate"),
    false,
  );
  assert.equal(
    ((preflightTipCall?.body as { reqDTOS?: { freightTrialSkuList?: { skuQuantity?: number }[] }[] } | undefined)
      ?.reqDTOS?.[0]?.freightTrialSkuList?.[0]?.skuQuantity),
    approvedCjSupplierOrder!.itemLines[0]?.quantity,
  );
  const noLogisticsClient = new MockCjOrderClient();
  noLogisticsClient.logisticsMode = "empty";
  const noLogisticsPreflight = await prepareCjOrderPreflight({
    supplierOrderId: approvedCjSupplierOrder!.id,
    selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
    client: noLogisticsClient,
  });
  assert.equal(noLogisticsPreflight.status, "BLOCKED");
  assert.equal(noLogisticsPreflight.blockers[0], "This CJ variant currently has no available shipping method to the selected destination.");
  assert.equal(noLogisticsPreflight.diagnostics?.destinationCountryCode, "ZA");
  assert.equal(noLogisticsPreflight.diagnostics?.itemCount, 1);
  assert.equal(noLogisticsPreflight.diagnostics?.responseMessage?.includes("Weight unsupported"), true);
  assert.equal(
    noLogisticsClient.calls.some((call) => call.path === "/shopping/order/createOrderV2"),
    false,
  );

  await saveOrder({
    ...order,
    id: "cj-real-order-no-id",
    orderNumber: "TC-2026-000033",
    customer: { ...order.customer, consigneeId: undefined },
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000033-PF",
    },
    status: "CONFIRMED",
    items: [
      {
        productId: "demo-usbc-dock",
        slug: "dockworks-usb-c-business-dock",
        sku: "TC-DOCK-USBC",
        name: "USB-C Business Dock",
        brand: "DockWorks",
        quantity: 1,
        unitPrice: 3299,
        lineTotal: 3299,
      },
    ],
  });
  await saveSupplierOrder({
    ...approvedCjSupplierOrder!,
    id: "SO-CJ-NO-ID",
    customerOrderNumber: "TC-2026-000033",
    externalSubmission: undefined,
    events: [...approvedCjSupplierOrder!.events],
  });
  const autoRouteClient = new MockCjOrderClient();
  autoRouteClient.logisticsOptions = [
    { name: "CJPacket Sensitive", cost: "7.25", estimate: "10-18 days" },
    { name: "PostNL", cost: "12.25", estimate: "15-45" },
    { name: "DHL Official", cost: "19.00", estimate: "7-12" },
    { name: "Unproven Diagnostic Route", cost: "5.00", estimate: "8-20" },
  ];
  const autoRoutePreflight = await prepareCjOrderPreflight({
    supplierOrderId: "SO-CJ-NO-ID",
    client: autoRouteClient,
  });
  assert.equal(autoRoutePreflight.status, "READY");
  assert.equal(autoRoutePreflight.selectedLogistics?.logisticName, "PostNL");
  assert.equal(autoRoutePreflight.selectionMode, "AUTO");
  assert.equal(autoRoutePreflight.selectionReason, "AUTO_SELECTED_NO_ID_LOWEST_COST");
  assert.equal((await getAdminSupplierOrder("SO-CJ-NO-ID"))?.cjOperations?.selectedLogistics?.logisticName, "PostNL");

  const optionalRequirementClient = new MockCjOrderClient();
  optionalRequirementClient.logisticsName = "PostNL";
  const optionalRequirementPreflight = await prepareCjOrderPreflight({
    supplierOrderId: "SO-CJ-NO-ID",
    selectedLogistics: { logisticName: "PostNL", fromCountryCode: "CN" },
    client: optionalRequirementClient,
  });
  assert.equal(optionalRequirementPreflight.status, "READY");
  assert.equal(optionalRequirementPreflight.recipientRequirements?.consigneeId, "OPTIONAL");
  assert.equal(optionalRequirementPreflight.recipientValidation?.consigneeId.status, "NOT_REQUIRED");
  assert.equal(optionalRequirementPreflight.payloadPreview?.consigneeID, undefined);

  const unknownRequirementClient = new MockCjOrderClient();
  unknownRequirementClient.logisticsName = "Unproven Diagnostic Route";
  const unknownRequirementPreflight = await prepareCjOrderPreflight({
    supplierOrderId: "SO-CJ-NO-ID",
    selectedLogistics: { logisticName: "Unproven Diagnostic Route", fromCountryCode: "CN" },
    client: unknownRequirementClient,
  });
  assert.equal(unknownRequirementPreflight.status, "READY");
  assert.equal(unknownRequirementPreflight.recipientRequirements?.consigneeId, "UNKNOWN");
  assert.equal(unknownRequirementPreflight.recipientValidation?.consigneeId.status, "UNKNOWN");
  assert.equal(unknownRequirementPreflight.payloadPreview?.consigneeID, undefined);

  const requiredRouteClient = new MockCjOrderClient();
  requiredRouteClient.logisticsName = "CJPacket Liquid Line";
  const requiredRoutePreflight = await prepareCjOrderPreflight({
    supplierOrderId: "SO-CJ-NO-ID",
    selectedLogistics: { logisticName: "CJPacket Liquid Line", fromCountryCode: "CN" },
    client: requiredRouteClient,
  });
  assert.equal(requiredRoutePreflight.status, "BLOCKED");
  assert.equal(requiredRoutePreflight.recipientRequirements?.consigneeId, "REQUIRED");
  assert.equal(requiredRoutePreflight.recipientValidation?.consigneeId.status, "NEEDS_CORRECTION");
  assert.equal(
    requiredRoutePreflight.blockers.includes("The selected CJ route requires a 13-digit consignee ID for this South Africa shipment."),
    true,
  );
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: "SO-CJ-NO-ID",
      selectedLogistics: { logisticName: "CJPacket Liquid Line", fromCountryCode: "CN" },
      client: requiredRouteClient,
    }),
    /CJ order preflight is not ready/,
  );
  assert.equal(
    requiredRouteClient.calls.filter((call) => call.path === "/shopping/order/createOrderV2").length,
    0,
  );
  assert.equal((await getAdminSupplierOrder("SO-CJ-NO-ID"))?.cjOperations?.attention?.active, true);
  assert.equal(
    deriveSupplierOrderAttention((await getAdminSupplierOrder("SO-CJ-NO-ID"))!).some((reason) => reason.code === "CJ_RECIPIENT_INFORMATION_REQUIRED"),
    true,
  );

  const savedIdClient = new MockCjOrderClient();
  savedIdClient.logisticsOptions = [{ name: "CJPacket Sensitive", cost: "7.25", estimate: "10-18 days" }];
  const savedIdResult = await saveCjOperationalConsigneeId({
    supplierOrderId: "SO-CJ-NO-ID",
    consigneeId: "800101-5009-087",
    client: savedIdClient,
  });
  assert.equal(savedIdResult.supplierOrder.cjOperations?.recipientInfo?.consigneeIdMasked, "*********9087");
  const selectedRequired = await selectCjLogisticsOverride({
    supplierOrderId: "SO-CJ-NO-ID",
    selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
    client: savedIdClient,
  });
  assert.equal(selectedRequired.preflight?.status, "READY");
  assert.equal(selectedRequired.preflight?.recipientValidation?.consigneeId.status, "READY");
  assert.equal((await getAdminSupplierOrder("SO-CJ-NO-ID"))?.cjOperations?.attention?.active, false);
  const removedIdResult = await removeCjOperationalConsigneeId({
    supplierOrderId: "SO-CJ-NO-ID",
    client: optionalRequirementClient,
  });
  assert.equal(removedIdResult.supplierOrder.cjOperations?.recipientInfo, undefined);

  await saveOrder({
    ...supplierBaseOrder,
    id: "cj-real-order-held",
    orderNumber: "TC-2026-000030",
    payment: {
      ...supplierBaseOrder.payment,
      status: "PAID",
      paymentReference: "TC-2026-000030-PF",
    },
    status: "CONFIRMED",
    items: [
      {
        productId: "demo-usbc-dock",
        slug: "dockworks-usb-c-business-dock",
        sku: "TC-DOCK-USBC",
        name: "USB-C Business Dock",
        brand: "DockWorks",
        quantity: 1,
        unitPrice: 3299,
        lineTotal: 3299,
      },
    ],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000030",
    supplierCode: "CJ",
    orderItemIds: ["demo-usbc-dock"],
  });
  const heldCjOrders = await generateSupplierOrders("TC-2026-000030");
  await approveSupplierOrder(heldCjOrders![0].id);
  await setOperationalHold({ orderNumber: "TC-2026-000030", reason: "ADDRESS_REVIEW" });
  await assert.rejects(
    prepareCjOrderPreflight({
      supplierOrderId: heldCjOrders![0].id,
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: cjOrderClient,
    }),
    /Customer order is on hold/,
  );

  await saveOrder({
    ...supplierBaseOrder,
    id: "cj-real-order-missing-address",
    orderNumber: "TC-2026-000031",
    payment: {
      ...supplierBaseOrder.payment,
      status: "PAID",
      paymentReference: "TC-2026-000031-PF",
    },
    status: "CONFIRMED",
    customer: { ...supplierBaseOrder.customer, mobile: "" },
    deliveryAddress: { ...supplierBaseOrder.deliveryAddress, postalCode: "" },
    items: [
      {
        productId: "demo-usbc-dock",
        slug: "dockworks-usb-c-business-dock",
        sku: "TC-DOCK-USBC",
        name: "USB-C Business Dock",
        brand: "DockWorks",
        quantity: 1,
        unitPrice: 3299,
        lineTotal: 3299,
      },
    ],
  });
  await createSupplierAllocation({
    orderNumber: "TC-2026-000031",
    supplierCode: "CJ",
    orderItemIds: ["demo-usbc-dock"],
  });
  const missingAddressOrders = await generateSupplierOrders("TC-2026-000031");
  await approveSupplierOrder(missingAddressOrders![0].id);
  await assert.rejects(
    prepareCjOrderPreflight({
      supplierOrderId: missingAddressOrders![0].id,
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: cjOrderClient,
    }),
    /Phone number.*Postal code/,
  );

  await saveSupplierOrder({
    ...approvedCjSupplierOrder!,
    id: "SO-CJ-UNVERIFIED",
    customerOrderNumber: "TC-2026-000009",
    externalSubmission: undefined,
    itemLines: [
      {
        ...approvedCjSupplierOrder!.itemLines[0],
        orderItemId: "demo-no-map",
        productId: "demo-no-map",
        supplierSku: undefined,
        supplierProductId: undefined,
        supplierProductSku: undefined,
        supplierVariantId: undefined,
        supplierVariantSku: undefined,
      },
    ],
  });
  await assert.rejects(
    prepareCjOrderPreflight({
      supplierOrderId: "SO-CJ-UNVERIFIED",
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: cjOrderClient,
    }),
    /Verified CJ product and variant mapping is required/,
  );

  await saveOrder({
    ...order,
    id: "cj-real-order-invalid-recipient",
    orderNumber: "TC-2026-000032",
    customer: { ...order.customer, mobile: "555-INVALID", consigneeId: "12345" },
    payment: {
      ...order.payment,
      status: "PAID",
      paymentReference: "TC-2026-000032-PF",
    },
    status: "CONFIRMED",
    items: [
      {
        productId: "demo-usbc-dock",
        slug: "dockworks-usb-c-business-dock",
        sku: "TC-DOCK-USBC",
        name: "USB-C Business Dock",
        brand: "DockWorks",
        quantity: 1,
        unitPrice: 3299,
        lineTotal: 3299,
      },
    ],
  });
  await saveSupplierOrder({
    ...approvedCjSupplierOrder!,
    id: "SO-CJ-INVALID-RECIPIENT",
    customerOrderNumber: "TC-2026-000032",
    externalSubmission: undefined,
    events: [...approvedCjSupplierOrder!.events],
  });
  const invalidRecipientClient = new MockCjOrderClient();
  const invalidRecipientPreflight = await prepareCjOrderPreflight({
    supplierOrderId: "SO-CJ-INVALID-RECIPIENT",
    selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
    client: invalidRecipientClient,
  });
  assert.equal(invalidRecipientPreflight.status, "BLOCKED");
  assert.equal(invalidRecipientPreflight.recipientValidation?.phone.status, "NEEDS_CORRECTION");
  assert.equal(invalidRecipientPreflight.recipientValidation?.consigneeId.status, "NEEDS_CORRECTION");
  assert.equal(
    invalidRecipientPreflight.blockers.includes("CJ recipient phone must be a valid South African number."),
    true,
  );
  assert.equal(
    invalidRecipientPreflight.blockers.includes("CJ consignee ID must be 13 numeric digits when supplied."),
    true,
  );
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: "SO-CJ-INVALID-RECIPIENT",
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: invalidRecipientClient,
    }),
    /CJ order preflight is not ready/,
  );
  assert.equal(
    invalidRecipientClient.calls.filter((call) => call.path === "/shopping/order/createOrderV2").length,
    0,
  );

  const createClient = new MockCjOrderClient();
  const createdCjOrder = await createRealCjOrder({
    supplierOrderId: approvedCjSupplierOrder!.id,
    selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
    client: createClient,
  });
  assert.equal(createdCjOrder.supplierOrder.externalSubmission?.status, "CREATED");
  assert.equal(createdCjOrder.supplierOrder.externalSubmission?.externalOrderNumber, "CJ-ORDER-1");
  assert.equal(createdCjOrder.supplierOrder.status, "APPROVED");
  assert.equal(
    createClient.calls.filter((call) => call.path === "/shopping/order/createOrderV2").length,
    1,
  );
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: approvedCjSupplierOrder!.id,
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: createClient,
    }),
    /already been created/,
  );

  await saveSupplierOrder({
    ...approvedCjSupplierOrder!,
    id: "SO-CJ-UNKNOWN",
    externalSubmission: undefined,
    supplierOrderReference: undefined,
    externalReference: undefined,
    events: [...approvedCjSupplierOrder!.events],
  });
  const timeoutClient = new MockCjOrderClient();
  timeoutClient.failCreate = "network";
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: "SO-CJ-UNKNOWN",
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: timeoutClient,
    }),
    /CJ API unavailable/,
  );
  assert.equal((await getAdminSupplierOrder("SO-CJ-UNKNOWN"))?.externalSubmission?.status, "UNKNOWN_RESULT");
  await assert.rejects(
    createRealCjOrder({
      supplierOrderId: "SO-CJ-UNKNOWN",
      selectedLogistics: { logisticName: "CJPacket Sensitive", fromCountryCode: "CN" },
      client: timeoutClient,
    }),
    /Reconcile before retrying/,
  );
  assert.equal(
    timeoutClient.calls.filter((call) => call.path === "/shopping/order/createOrderV2").length,
    1,
  );
  const reconcileClient = new MockCjOrderClient();
  const reconciled = await reconcileCjOrder({ supplierOrderId: "SO-CJ-UNKNOWN", client: reconcileClient });
  assert.equal(reconciled.supplierOrder.externalSubmission?.status, "CREATED");
  assert.equal(reconciled.supplierOrder.externalSubmission?.externalOrderNumber, "CJ-ORDER-FOUND");
  assert.equal(
    reconcileClient.calls.some((call) => call.path === "/shopping/order/createOrderV2"),
    false,
  );
  const refreshed = await refreshCjOrderStatus({ supplierOrderId: "SO-CJ-UNKNOWN", client: reconcileClient });
  assert.equal(refreshed.supplierOrder.externalSubmission?.externalStatus, "Awaiting Payment");
  assert.equal(
    reconcileClient.calls.some((call) => call.path === "/shopping/order/list"),
    true,
  );
  const refreshFailureClient = new MockCjOrderClient();
  refreshFailureClient.listMode = "unavailable";
  await assert.rejects(
    refreshCjOrderStatus({ supplierOrderId: "SO-CJ-UNKNOWN", client: refreshFailureClient }),
    /CJ API unavailable/,
  );
  assert.equal((await getAdminSupplierOrder("SO-CJ-UNKNOWN"))?.externalSubmission?.status, "CREATED");
  assert.equal((await getAdminSupplierOrder("SO-CJ-UNKNOWN"))?.externalSubmission?.externalOrderNumber, "CJ-ORDER-FOUND");
} finally {
  chdir(originalCwd);
  if (originalCjApiKey === undefined) delete process.env.CJ_API_KEY;
  else process.env.CJ_API_KEY = originalCjApiKey;
  if (originalCjRealOrderFlag === undefined) delete process.env.CJ_REAL_ORDER_CREATION_ENABLED;
  else process.env.CJ_REAL_ORDER_CREATION_ENABLED = originalCjRealOrderFlag;
  await rm(tempDir, { recursive: true, force: true });
}

const frontendProductIds = products.map((product) => product.id).sort();
const backendProductIds = backendProducts.map((product) => product.productId).sort();
assert.deepEqual(backendProductIds, frontendProductIds);

const portableSsd = backendProducts.find(
  (product) => product.productId === "demo-ssd-1tb",
);
assert.equal(portableSsd?.name, "1TB Portable SSD");
assert.equal(portableSsd?.price, 2299);

const businessLaptop = backendProducts.find(
  (product) => product.productId === "demo-laptop-pro-14",
);
assert.equal(businessLaptop?.price, 18999);
assert.equal((portableSsd?.price ?? 0) + (businessLaptop?.price ?? 0), 21298);
assert.equal(calculateBackendTotals(21298, 149).total, 21447);

assert.deepEqual(defaultShippingSettings, {
  shippingEnabled: true,
  quoteValidityMinutes: 30,
  shippingPriceBufferPercent: 0,
  minimumShippingCharge: 0,
  allowMixedSupplierCheckout: true,
  requireFreshQuoteBeforePayment: true,
  scoopMode: "MANUAL_QUOTE",
  scoopZones: [],
  localRateCard: { enabled: false, version: 0, environment: "PRODUCTION", origin: { city: "", province: "" }, volumetricDivisorCm3PerKg: 5000, percentageBuffer: 0, fixedBufferRand: 0, roundingMode: "NEAREST_1", zones: [] },
});
const legacyShipping = normalizeShippingSettings({ shippingEnabled: true, quoteValidityMinutes: 20, scoopMode: "MANUAL_QUOTE" });
assert.equal(legacyShipping.quoteValidityMinutes, 20);
assert.equal(legacyShipping.scoopMode, "MANUAL_QUOTE");
assert.equal(legacyShipping.localRateCard.version, 0);
assert.equal(legacyShipping.localRateCard.enabled, false);
assert.deepEqual(legacyShipping.localRateCard.zones, []);
assert.equal(normalizeShippingSettings({ localRateCard: { enabled: false } }).localRateCard.version, 0);
assert.equal(applyShippingPolicy(100, { ...defaultShippingSettings, shippingPriceBufferPercent: 10 }), 110);
assert.equal(applyShippingPolicy(20, { ...defaultShippingSettings, minimumShippingCharge: 50 }), 50);
assert.equal(selectCustomerSafeCjRoute([
  { logisticName: "CJPacket Sensitive", fromCountryCode: "CN", destCountryCode: "ZA", shippingCost: 5, currency: "USD", estimatedDelivery: "10-20", fetchedAt: new Date().toISOString() },
  { logisticName: "PostNL", fromCountryCode: "CN", destCountryCode: "ZA", shippingCost: 9, currency: "USD", estimatedDelivery: "15-45", fetchedAt: new Date().toISOString() },
])?.logisticName, "PostNL");
const estimatorCard: LocalShippingRateCard = {
  enabled: true, version: 7, environment: "TEST_NOT_PRODUCTION", origin: { city: "Cape Town", province: "Western Cape" }, volumetricDivisorCm3PerKg: 5_000, percentageBuffer: 10, fixedBufferRand: 5, roundingMode: "NEAREST_5",
  zones: [
    { id: "LOCAL_METRO", label: "Local metro", enabled: true, postalCodeRanges: [{ from: 7400, to: 7999 }], provinces: [], cities: ["Cape Town"], baseCharge: 80, includedWeightKg: 1, additionalRatePerKg: 20, minimumCharge: 90, maximumCharge: 150, estimatedTransitDaysMin: 2, estimatedTransitDaysMax: 5 },
    { id: "MAJOR_METRO", label: "Major metro", enabled: true, postalCodeRanges: [{ from: 2000, to: 2199 }], provinces: [], cities: ["Johannesburg"], baseCharge: 100, includedWeightKg: 1, additionalRatePerKg: 25, minimumCharge: 100, estimatedTransitDaysMin: 3, estimatedTransitDaysMax: 6 },
    { id: "REGIONAL", label: "Regional", enabled: true, postalCodeRanges: [], provinces: ["Free State"], cities: [], baseCharge: 120, includedWeightKg: 1, additionalRatePerKg: 30, minimumCharge: 120, estimatedTransitDaysMin: 4, estimatedTransitDaysMax: 8 },
  ],
};
assert.equal(calculateVolumetricWeightKg(500, 400, 300, 5000), 12);
assert.throws(() => calculateVolumetricWeightKg(0, 400, 300, 5000), LocalShippingEstimateError);
assert.equal(resolveLocalShippingZone({ province: "Western Cape", city: "Cape Town", postalCode: "7460" }, estimatorCard.zones)?.id, "LOCAL_METRO");
assert.equal(resolveLocalShippingZoneMatch({ province: "Western Cape", city: "Cape Town", postalCode: "7460" }, estimatorCard.zones)?.matchMethod, "POSTAL_CODE");
assert.equal(resolveLocalShippingZoneMatch({ province: "Western Cape", city: "Cape Town", postalCode: "8100" }, estimatorCard.zones)?.matchMethod, "CITY");
assert.equal(resolveLocalShippingZone({ province: "Gauteng", city: "Johannesburg", postalCode: "2001" }, estimatorCard.zones)?.id, "MAJOR_METRO");
assert.equal(resolveLocalShippingZone({ province: "Free State", city: "Welkom", postalCode: "9460" }, estimatorCard.zones)?.id, "REGIONAL");
assert.equal(resolveLocalShippingZoneMatch({ province: "Free State", city: "Welkom", postalCode: "9460" }, estimatorCard.zones)?.matchMethod, "PROVINCE");
assert.equal(resolveLocalShippingZone({ province: "Limpopo", city: "Polokwane", postalCode: "0700" }, estimatorCard.zones), undefined);
assert.throws(() => resolveLocalShippingZone({ province: "", postalCode: "bad" }, estimatorCard.zones), LocalShippingEstimateError);
const actualDominant = estimateLocalShipping({ items: [{ productId: "heavy", quantity: 1, weightGrams: 20_000, lengthMm: 100, widthMm: 100, heightMm: 100 }], destination: { province: "Western Cape", city: "Cape Town", postalCode: "7460" }, rateCard: estimatorCard });
assert.equal(actualDominant.billableWeightKg, actualDominant.actualWeightKg);
assert.equal(actualDominant.estimatedInternalFreightCost, 150);
assert.equal(actualDominant.customerShippingCharge, 170);
const volumetricDominant = estimateLocalShipping({ items: [{ productId: "large", quantity: 2, weightGrams: 500, lengthMm: 500, widthMm: 400, heightMm: 300 }], destination: { province: "Western Cape", postalCode: "7460" }, rateCard: estimatorCard });
assert.equal(volumetricDominant.billableWeightKg, 24);
assert.equal(volumetricDominant.volumetricWeightKg, 24);
const baseOnly = estimateLocalShipping({ items: [{ productId: "small", quantity: 1, weightGrams: 200, lengthMm: 100, widthMm: 100, heightMm: 100 }], destination: { province: "Western Cape", postalCode: "7460" }, rateCard: estimatorCard });
assert.equal(baseOnly.estimatedInternalFreightCost, 90);
assert.equal(baseOnly.percentageBufferAmount, 9);
assert.equal(baseOnly.fixedBufferAmount, 5);
const additionalWeightCard = { ...estimatorCard, percentageBuffer: 0, fixedBufferRand: 0, roundingMode: "NONE" as const, zones: [{ ...estimatorCard.zones[0], minimumCharge: 0, maximumCharge: undefined }] };
assert.equal(estimateLocalShipping({ items: [{ productId: "two-kg", quantity: 1, weightGrams: 2_000, lengthMm: 100, widthMm: 100, heightMm: 100 }], destination: { province: "Western Cape", postalCode: "7460" }, rateCard: additionalWeightCard }).estimatedInternalFreightCost, 100);
assert.throws(() => estimateLocalShipping({ items: [{ productId: "invalid", quantity: 1, weightGrams: 0, lengthMm: 1, widthMm: 1, heightMm: 1 }], destination: { province: "Western Cape", postalCode: "7460" }, rateCard: estimatorCard }), LocalShippingEstimateError);
assert.throws(() => estimateLocalShipping({ items: [{ productId: "small", quantity: 1, weightGrams: 200, lengthMm: 100, widthMm: 100, heightMm: 100 }], destination: { province: "Western Cape", postalCode: "7460" }, rateCard: { ...estimatorCard, enabled: false } }), LocalShippingEstimateError);
const checkoutSource = readFileSync(join(originalCwd, "src/pages/CheckoutPage.tsx"), "utf8");
assert.equal(checkoutSource.includes(">Calculate delivery<"), false);
assert.equal(checkoutSource.includes("quoteRequestRef.current"), true);
assert.equal(checkoutSource.includes("window.setTimeout"), true);
const shippingAdminSource = readFileSync(join(originalCwd, "src/pages/admin/AdminShippingSettingsPage.tsx"), "utf8");
const backendServerSource = readFileSync(join(originalCwd, "backend/server.ts"), "utf8");
const shippingTesterPath = "/api/admin/settings/shipping/test-estimate";
assert.equal(shippingAdminSource.includes(`apiRequest<ShippingTestResult>("${shippingTesterPath}", { method: "POST"`), true);
assert.equal(backendServerSource.includes(`request.method === "POST" && url.pathname === "${shippingTesterPath}"`), true);
assert.equal(backendServerSource.indexOf(shippingTesterPath) < backendServerSource.lastIndexOf("Endpoint not found."), true);
assert.equal(backendServerSource.includes('url.pathname === "/api/admin/settings/shipping/test"'), false);
assert.equal(roundShippingCharge(102.49, "NEAREST_1"), 102);
assert.equal(roundShippingCharge(102.49, "NEAREST_5"), 100);
assert.equal(calculateFreightReconciliation({ estimatedInternalFreightCost: 100, actualFreightCost: 120, customerShippingCharge: 110, toleranceRand: 5 }).status, "UNDER_RECOVERED");
assert.equal(calculateFreightReconciliation({ estimatedInternalFreightCost: 100, actualFreightCost: 100, customerShippingCharge: 103, toleranceRand: 5 }).status, "WITHIN_TOLERANCE");
const publicQuote = publicShippingQuote({
  quoteId: "shipping-test", cartFingerprint: "fingerprint", items: [{ productId: "demo-ssd-1tb", quantity: 1 }],
  destination: { country: "South Africa", province: "Gauteng", postalCode: "2000" }, deliveryMethodId: "standard", currency: "ZAR",
  fulfilmentGroups: [{ groupId: "CJ:test", kind: "INTERNATIONAL", itemProductIds: ["demo-ssd-1tb"], customerLabel: "Standard international delivery", customerCharge: 180, supplierShippingCost: 160, estimatedInternalFreightCost: 150, bufferAmount: 30, zone: "INTERNAL", rateCardVersion: 4, currency: "ZAR", source: "CJ_LOGISTICS", internalSupplierCode: "CJ", internalMethod: "PostNL", warnings: [] }],
  customerShippingCharge: 180, supplierShippingCost: 160, estimatedInternalFreightCost: 150, generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), status: "READY", warnings: [], settingsSnapshot: defaultShippingSettings,
});
assert.equal("supplierShippingCost" in publicQuote, false);
assert.equal("estimatedInternalFreightCost" in publicQuote, false);
assert.equal("bufferAmount" in publicQuote.fulfilmentGroups[0], false);
assert.equal("zone" in publicQuote.fulfilmentGroups[0], false);
assert.equal("internalSupplierCode" in publicQuote.fulfilmentGroups[0], false);
assert.equal("source" in publicQuote.fulfilmentGroups[0], false);

console.log("PayFast backend tests passed.");
