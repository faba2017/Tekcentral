import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
import { toCustomerOrder } from "./customerOrderView.js";
import { getOrder, listOrders, saveOrder, updateOrder, updatePaymentStatus } from "./orderRepository.js";
import { recordPayfastItnEvent } from "./payfastItnLog.js";
import {
  getSupplierProductMappingById,
  listSupplierProductMappings,
  saveSupplierProductMapping,
  setSupplierProductMappingStatus,
} from "./supplierProductMappingRepository.js";
import { prepareSupplierPricing } from "./supplierPricing.js";
import { getBusinessSettings, updatePricingSettings, updateShippingSettings, type PricingSettings, type ShippingSettings } from "./businessSettingsRepository.js";
import { createShippingOptionsResult, createShippingQuote, publicShippingQuote, requireShippingQuote, revalidateShippingQuote, ShippingQuoteError, testScoopZoneEstimate } from "./shippingService.js";
import { validateDeliveryAddress } from "./addressValidation.js";
import { calculateFreightReconciliation } from "./localShippingEstimator.js";
import { ingestPublicProductImage, publicImageContentType, readPublicProductImage } from "./publicImageIngestion.js";
import { listPricingProposals, setPricingProposalStatus } from "./pricingProposalRepository.js";
import { createPricingOverride, generateCjPricingProposal, generateScoopPricingProposal, previewPricingOverride } from "./pricingService.js";
import { listAdminProducts } from "./internalProductRepository.js";
import { getPublicationPreview, getPublicationReview, getPublicationSummary, getPublicProductBySlug, listPublicProducts, publishProduct, rollbackProduct, unpublishProduct } from "./productPublicationRepository.js";
import {
  buildPayfastPaymentRequest,
  isDuplicatePayfastItn,
  readPayfastConfig,
  validatePayfastItn,
} from "./payfast.js";
import {
  applyMockSupplierOutcome,
  acknowledgeSupplierOrder,
  approveSupplierOrder,
  autoAllocatePaidOrder,
  createSupplierPayloadPreview,
  dispatchSupplierOrder,
  deriveSupplierOrderAttention,
  generateSupplierOrders,
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
  refreshCjProduct,
  rejectSupplierMappingById,
  searchCjProducts,
  suggestCjMapping,
  testCjConnection,
  verifySupplierMappingById,
} from "./suppliers/cj/cjCatalogueAdapter.js";
import { getCjCatalogueProduct, listCjCatalogueProducts } from "./suppliers/cj/cjCatalogueRepository.js";
import { getSupplierRegistryEntry } from "./supplierRegistry.js";
import { getSupplierOrderNotification, retryScoopActionRequiredNotification } from "./internalNotificationService.js";
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
import { enrichScoopLogisticsBatch } from "./suppliers/scoop/scoopLogisticsEnrichment.js";
import { applyScoopLogisticsCsv, exportMissingScoopLogisticsCsv, previewScoopLogisticsCsv } from "./suppliers/scoop/scoopLogisticsCsv.js";
import { acquireScoopManufacturerLogistics } from "./suppliers/scoop/scoopManufacturerLogistics.js";
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
import { deriveScoopLaunchReadiness, latestScoopProposal, scoopAssortmentState, suggestScoopLaunchCandidates } from "./suppliers/scoop/scoopLaunchReadiness.js";
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

interface CreateOrderBody {
  customer: BackendOrder["customer"];
  deliveryAddress: BackendOrder["deliveryAddress"];
  deliveryMethodId: string;
  shippingQuoteId: string;
  items: { productId: string; quantity: number }[];
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

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
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
  const orders = await listOrders();
  const maxSequence = orders.reduce((max, order) => {
    if (!order.orderNumber.startsWith(prefix)) return max;
    const sequence = Number(order.orderNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(6, "0")}`;
}

async function createOrder(body: CreateOrderBody) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("Order requires at least one item.");
  }
  const deliveryMethod = backendDeliveryMethods.find(
    (method) => method.id === body.deliveryMethodId && method.enabled,
  );
  if (!deliveryMethod) throw new Error("Invalid delivery method.");

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
    const product = await getBackendProduct(line.productId);
    if (!product) throw new Error(`Unknown product ${line.productId}.`);
    const quantity = Math.max(1, Math.min(99, Math.trunc(line.quantity)));
    return {
      productId: product.productId,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      stockStatus: product.stockStatus,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    };
  }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const totals = calculateBackendTotals(subtotal, shippingQuote.customerShippingCharge!);
  const now = new Date().toISOString();
  const orderNumber = await nextOrderNumber();

  const order: BackendOrder = {
    id: createLocalId("order"),
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
  return saveOrder(order);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");

  try {
    const publicAssetMatch = url.pathname.match(/^\/api\/public\/assets\/products\/([^/]+)$/);
    if (request.method === "GET" && publicAssetMatch) {
      const filename = decodeURIComponent(publicAssetMatch[1]); const asset = await readPublicProductImage(filename); const contentType = publicImageContentType(filename);
      if (!asset || !contentType) { sendJson(response, 404, { error: "Image not found." }); return; }
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" }); response.end(asset); return;
    }
    if (request.method === "GET" && url.pathname === "/api/public/catalogue") {
      sendJson(response, 200, { products: await listPublicProducts() });
      return;
    }
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

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/freight-reconciliation$/)) {
      const orderNumber = decodeURIComponent(url.pathname.replace("/api/admin/orders/", "").replace("/freight-reconciliation", ""));
      const body = await readJsonBody<{ actualFreightCost: number; note?: string; toleranceRand?: number }>(request);
      if (!Number.isFinite(body.actualFreightCost) || body.actualFreightCost < 0) throw new Error("Actual freight cost must be a valid non-negative amount.");
      const order = await updateOrder(orderNumber, (current) => {
        const snapshot = current.shippingQuoteSnapshot;
        if (!snapshot?.estimatedInternalFreightCost) throw new Error("This order has no estimated internal freight cost to reconcile.");
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
      const order = await updateAdminOrderStatus(orderNumber, body.status, body.note);
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
      url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/notes$/)
    ) {
      const orderNumber = decodeURIComponent(
        url.pathname.replace("/api/admin/orders/", "").replace("/notes", ""),
      );
      const body = await readJsonBody<{ body: string; authorLabel?: string }>(request);
      const order = await addInternalNote(orderNumber, body.body, body.authorLabel);
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
      sendJson(response, 200, { returns: await listAdminReturns() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/settings/pricing") {
      sendJson(response, 200, await getBusinessSettings());
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/pricing") {
      const body = await readJsonBody<{ pricing: PricingSettings }>(request);
      sendJson(response, 200, await updatePricingSettings(body.pricing));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/settings/shipping") {
      sendJson(response, 200, await getBusinessSettings());
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/settings/shipping") {
      const body = await readJsonBody<{ shipping: ShippingSettings }>(request);
      sendJson(response, 200, await updateShippingSettings(body.shipping));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/settings/shipping/test-estimate") {
      const body = await readJsonBody<Parameters<typeof testScoopZoneEstimate>[0]>(request);
      sendJson(response, 200, await testScoopZoneEstimate(body));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/admin/pricing/proposals") {
      sendJson(response, 200, { proposals: await listPricingProposals() });
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
      const proposal = await setPricingProposalStatus(id, action === "approve" ? "APPROVED" : "REJECTED");
      if (!proposal) { sendJson(response, 404, { error: "Pricing proposal not found." }); return; }
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

    if (request.method === "GET" && url.pathname === "/api/admin/refunds") {
      sendJson(response, 200, { refunds: await listAdminRefunds() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/status") {
      sendJson(response, 200, await getCjConnectionStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/scoop/status") {
      sendJson(response, 200, await getScoopCatalogueSyncStatus());
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
      const [products, mappings, proposals] = await Promise.all([
        listScoopCatalogueProducts(),
        listSupplierProductMappings(),
        listPricingProposals(),
      ]);
      const rows = await Promise.all(products.map(async (product) => {
        const supplierMappings = mappings.filter((mapping) => mapping.supplierCode === "SCOOP" && mapping.supplierSku === product.supplierSku);
        const mapping = supplierMappings.find((item) => item.status === "VERIFIED") ?? supplierMappings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        const proposal = latestScoopProposal(proposals, product.supplierSku, mapping?.productId);
        return {
          product: { ...product, pricing: prepareSupplierPricing({ currency: product.currency, vatRate: product.vatRate, supplierCostExVat: product.dealerPriceExVat, referenceRetailInclVat: product.retailPriceInclVat }) },
          mapping,
          proposal,
          readiness: deriveScoopLaunchReadiness({ product, mapping, proposal }),
          publication: mapping ? await getPublicationSummary(mapping.productId) : { state: "NOT_PUBLISHED", versionCount: 0 },
        };
      }));
      sendJson(response, 200, {
        rows,
        metrics: {
          totalOffers: rows.length,
          launchCandidates: rows.filter(({ product }) => scoopAssortmentState(product) === "CANDIDATE").length,
          selectedForLaunch: rows.filter(({ product }) => scoopAssortmentState(product) === "SELECTED_FOR_LAUNCH").length,
          verifiedMappings: rows.filter(({ mapping }) => mapping?.status === "VERIFIED").length,
          logisticsComplete: rows.filter(({ product }) => product.logisticsMetadata?.status === "COMPLETE").length,
          approvedPricing: rows.filter(({ proposal }) => proposal?.status === "APPROVED").length,
          readyForPublishReview: rows.filter(({ readiness }) => readiness.status === "READY_FOR_PUBLISH_REVIEW").length,
        },
      });
      return;
    }

    const publicationReviewMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication$/);
    if (request.method === "GET" && publicationReviewMatch) {
      sendJson(response, 200, await getPublicationReview(decodeURIComponent(publicationReviewMatch[1])));
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
      const body = await readJsonBody<{ sourceUrl: string; sourceType?: string }>(request);
      sendJson(response, 201, await ingestPublicProductImage({ internalProductId: decodeURIComponent(publicationImageMatch[1]), sourceUrl: body.sourceUrl, sourceType: body.sourceType ?? "SUPPLIER_SOURCE" }));
      return;
    }
    const publicationPublishMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publish$/);
    if (request.method === "POST" && publicationPublishMatch) {
      const body = await readJsonBody<Parameters<typeof publishProduct>[0]>(request);
      const internalProductId = decodeURIComponent(publicationPublishMatch[1]);
      sendJson(response, 200, { version: await publishProduct({ ...body, internalProductId }) });
      return;
    }
    const publicationUnpublishMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/unpublish$/);
    if (request.method === "POST" && publicationUnpublishMatch) {
      const body = await readJsonBody<{ actor?: string }>(request);
      sendJson(response, 200, { publication: await unpublishProduct(decodeURIComponent(publicationUnpublishMatch[1]), body.actor) });
      return;
    }
    const publicationRollbackMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/publication-versions\/([^/]+)\/rollback$/);
    if (request.method === "POST" && publicationRollbackMatch) {
      const body = await readJsonBody<{ pricingProposalId: string; idempotencyKey: string; actor?: string }>(request);
      sendJson(response, 200, { version: await rollbackProduct({ ...body, internalProductId: decodeURIComponent(publicationRollbackMatch[1]), sourceVersionId: decodeURIComponent(publicationRollbackMatch[2]) }) });
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
      sendJson(response, 200, { sync: await syncScoopCatalogueFromFeed() });
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
      const body = await readJsonBody<{ supplierVariantId?: string }>(request);
      sendJson(response, 200, {
        deliveryCheck: await checkCjVariantDeliveryToSouthAfrica({
          supplierVariantId: body.supplierVariantId ?? "",
        }),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/suppliers/cj/products") {
      sendJson(response, 200, { products: await listCjCatalogueProducts() });
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
      sendJson(response, 200, { products: await listAdminProducts() });
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
      try { sendJson(response, 201, await createTekCentralProductFromScoop({ supplierSku, ...body })); }
      catch (error) { sendJson(response, error instanceof Error && error.message === "PRODUCT_ALREADY_CREATED_FROM_OFFER" ? 409 : 400, { error: error instanceof Error ? error.message : "TekCentral product could not be created." }); }
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-mappings\/[^/]+\/verify$/)
    ) {
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
        : await setSupplierProductMappingStatus(id, "VERIFIED");
      if (!mapping) {
        sendJson(response, 404, { error: "Supplier mapping not found." });
        return;
      }
      sendJson(response, 200, { mapping });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname.match(/^\/api\/admin\/supplier-mappings\/[^/]+\/reject$/)
    ) {
      const id = decodeURIComponent(
        url.pathname.replace("/api/admin/supplier-mappings/", "").replace("/reject", ""),
      );
      const current = await getSupplierProductMappingById(id);
      const mapping = current?.supplierCode === "CJ"
        ? await rejectSupplierMappingById(id)
        : await setSupplierProductMappingStatus(id, "REJECTED");
      if (!mapping) {
        sendJson(response, 404, { error: "Supplier mapping not found." });
        return;
      }
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
      sendJson(response, 200, {
        supplierOrder,
        supplierConfiguration: getSupplierRegistryEntry(supplierOrder.supplierCode),
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

    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/admin\/supplier-orders\/[^/]+\/manual-order$/)
    ) {
      const id = decodeURIComponent(url.pathname.replace("/api/admin/supplier-orders/", "").replace("/manual-order", ""));
      const body = await readJsonBody<{ supplierReference?: string; note?: string }>(request);
      const supplierOrder = await markManualSupplierOrderOrdered({ id, supplierReference: body.supplierReference ?? "", note: body.note });
      if (!supplierOrder) { sendJson(response, 404, { error: "Supplier order not found." }); return; }
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
      const body = await readJsonBody<CreateOrderBody>(request);
      const order = await createOrder(body);
      sendJson(response, 201, { order: toCustomerOrder(order) });
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
      sendJson(response, 200, { orders: (await listOrders()).map(toCustomerOrder) });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/orders/")) {
      const orderNumber = decodeURIComponent(url.pathname.replace("/api/orders/", ""));
      const order = await getOrder(orderNumber);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, { order: toCustomerOrder(order) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/payfast/create") {
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      if (!body.orderNumber) throw new Error("Order number is required.");
      const order = await getOrder(body.orderNumber);
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      const settings = await getBusinessSettings();
      if (settings.shipping.requireFreshQuoteBeforePayment && order.shippingQuoteSnapshot) {
        const result = await revalidateShippingQuote(order.shippingQuoteSnapshot.quoteId);
        if (result.changed) {
          sendJson(response, 409, { error: "Delivery cost changed. Review the updated delivery quote before payment.", code: "SHIPPING_QUOTE_CHANGED", quote: publicShippingQuote(result.quote) });
          return;
        }
      }
      const paymentRequest = buildPayfastPaymentRequest(order, readPayfastConfig());
      sendJson(response, 200, paymentRequest);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/payments/")) {
      const match = url.pathname.match(/^\/api\/payments\/([^/]+)\/status$/);
      if (!match) {
        sendJson(response, 404, { error: "Endpoint not found." });
        return;
      }
      const order = await getOrder(decodeURIComponent(match[1]));
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
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
        readPayfastConfig(),
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
        sendJson(response, 400, { error: validation.reason });
        return;
      }
      await updatePaymentStatus(order.orderNumber, "PAID", {
        payfastPaymentId: data.pf_payment_id,
        grossAmount: Number(data.amount_gross),
        confirmedAt: new Date().toISOString(),
        processedItnIds: duplicateKey
          ? [...order.payment.processedItnIds, duplicateKey]
          : order.payment.processedItnIds,
      });
      try {
        await autoAllocatePaidOrder(order.orderNumber);
      } catch (error) {
        console.error("Paid-order supplier allocation failed", {
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
        reason: "Payment confirmed.",
      });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/payfast/cancel") {
      const body = await readJsonBody<{ orderNumber?: string }>(request);
      if (!body.orderNumber) throw new Error("Order number is required.");
      const order = await updatePaymentStatus(body.orderNumber, "CANCELLED");
      if (!order) {
        sendJson(response, 404, { error: "Order not found." });
        return;
      }
      sendJson(response, 200, {
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment.status,
      });
      return;
    }

    sendJson(response, 404, { error: "Endpoint not found." });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Request failed.",
      code:
        error instanceof SupplierWorkflowError || error instanceof CjApiError || error instanceof ShippingQuoteError
          ? error.code
          : error instanceof CjOrderError
          ? error.code
          : undefined,
      requestId: error instanceof CjApiError ? error.requestId : undefined,
    });
  }
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
createServer(handleRequest).listen(port, host, () => {
  console.log(`TekCentral payment backend listening on http://${host}:${port}`);
});
