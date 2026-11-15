import { supplierAdapters } from "./mockSupplierAdapters.js";
import { getOrder, updateOrder } from "./orderRepository.js";
import {
  getSupplierOrder,
  listSupplierOrders,
  saveSupplierOrder,
  updateSupplierOrder,
} from "./supplierOrderRepository.js";
import {
  getSupplierProductMapping,
  listSupplierProductMappings,
  saveSupplierProductMapping,
} from "./supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { getSyntechCatalogueProduct } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { consumeTekCentralManualReservation, getTekCentralManualOffer, releaseTekCentralManualReservation, reserveTekCentralManualStock } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { getSupplierPolicySettings } from "./businessSettingsRepository.js";
import { getSupplierRegistryEntry } from "./supplierRegistry.js";
import { notifyNewScoopActionRequired } from "./internalNotificationService.js";
import { supplierOfferFromMapping } from "./supplierDomain.js";
import { createAdminShipment } from "./adminOperations.js";
import { finalizeCostBasis, resolveSelectedSupplierCost } from "./orderCostBasis.js";
import type {
  AttentionReason,
  BackendOrder,
  MockSupplierScenario,
  SupplierAllocation,
  SupplierOrder,
  SupplierOrderEvent,
  SupplierOrderLine,
  SupplierOrderStatus,
} from "./types.js";

export class SupplierWorkflowError extends Error {
  constructor(
    public code:
      | "ORDER_ON_HOLD"
      | "SUPPLIER_MAPPING_REQUIRED"
      | "DUPLICATE_PROCUREMENT"
      | "INVALID_SUPPLIER_TRANSITION"
      | "INVALID_SUPPLIER_QUANTITY"
      | "DISPATCH_FIELDS_REQUIRED"
      | "INSUFFICIENT_STOCK"
      | "SUPPLIER_EVIDENCE_CHANGED",
    message: string,
  ) {
    super(message);
  }
}

export const supplierAttentionConfig = {
  confirmationDelayedHours: 24,
  dispatchOverdueHours: 48,
};

const allowedSupplierOrderTransitions: Partial<Record<SupplierOrderStatus, SupplierOrderStatus[]>> = {
  DRAFT: ["READY_FOR_APPROVAL", "CANCELLED"],
  ACTION_REQUIRED: ["ACKNOWLEDGED", "CANCELLED"],
  READY_FOR_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  ACKNOWLEDGED: ["APPROVED", "CONFIRMED", "BACKORDERED", "PARTIALLY_CONFIRMED", "REJECTED"],
  APPROVED: ["SUBMITTING", "SUBMITTED", "REJECTED", "CANCELLED"],
  SUBMITTING: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["ACKNOWLEDGED", "CONFIRMED", "BACKORDERED", "PARTIALLY_CONFIRMED", "REJECTED"],
  ORDERED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["DISPATCHED", "COMPLETED"],
  SHIPPED: ["DELIVERED"],
  PARTIALLY_CONFIRMED: ["CONFIRMED", "BACKORDERED", "DISPATCHED", "REJECTED"],
  BACKORDERED: ["CONFIRMED", "REJECTED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
};

const activeProcurementStatuses = new Set<SupplierOrderStatus>([
  "DRAFT",
  "ACTION_REQUIRED",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "SUBMITTING",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "ORDERED",
  "CONFIRMED",
  "PARTIALLY_CONFIRMED",
  "DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);

const supersedableStatuses = new Set<SupplierOrderStatus>(["DRAFT", "READY_FOR_APPROVAL"]);

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function event(type: string, description: string): SupplierOrderEvent {
  return { timestamp: new Date().toISOString(), type, description };
}

function assertTransition(current: SupplierOrderStatus, next: SupplierOrderStatus) {
  if (current === next) return;
  if (!allowedSupplierOrderTransitions[current]?.includes(next)) {
    throw new SupplierWorkflowError(
      "INVALID_SUPPLIER_TRANSITION",
      `Invalid supplier order transition from ${current} to ${next}.`,
    );
  }
}

function requiresSupplierSku(supplierOrder: SupplierOrder) {
  return supplierOrder.supplierCode !== "MANUAL";
}

function assertOrderNotHeld(order: BackendOrder) {
  if (order.operationalHold?.active) {
    throw new SupplierWorkflowError(
      "ORDER_ON_HOLD",
      "Supplier procurement and fulfilment are blocked until this hold is released.",
    );
  }
}

async function allocationLines(
  order: BackendOrder,
  allocations: SupplierAllocation[],
  quantities: Map<string, number>,
): Promise<SupplierOrderLine[]> {
  const lines: SupplierOrderLine[] = [];
  for (const allocation of allocations) {
    for (const itemId of allocation.orderItemIds) {
      const item = order.items.find((orderItem) => orderItem.productId === itemId);
      if (!item) throw new Error("Supplier allocation contains an invalid order item.");
      const mapping = await getSupplierProductMapping(item.productId, allocation.supplierCode);
      const supplierSku =
        allocation.supplierCode === "CJ" && mapping?.status !== "VERIFIED"
          ? undefined
          : mapping?.supplierSku;
      const verifiedCjMapping = allocation.supplierCode === "CJ" && mapping?.status === "VERIFIED"
        ? mapping
        : undefined;
      const scoopOffer = allocation.supplierCode === "SCOOP" && mapping?.status === "VERIFIED"
        ? await getScoopCatalogueProduct(mapping.supplierSku)
        : undefined;
      const unitCost = scoopOffer?.dealerPriceExVat;
      const quantity = quantities.get(item.productId) ?? item.quantity;
      const cost = mapping ? await resolveSelectedSupplierCost(allocation.supplierCode, mapping) : undefined;
      const syntechOffer = allocation.supplierCode === "SYNTECH" && mapping?.status === "VERIFIED"
        ? await getSyntechCatalogueProduct(mapping.supplierSku)
        : undefined;
      lines.push({
        orderItemId: item.productId,
        productId: item.productId,
        supplierSku,
        supplierProductId: verifiedCjMapping?.supplierProductId,
        supplierProductSku: verifiedCjMapping?.supplierProductSku,
        supplierVariantId: verifiedCjMapping?.supplierVariantId,
        supplierVariantSku: verifiedCjMapping?.supplierVariantSku,
        supplierOfferId: mapping ? supplierOfferFromMapping(mapping).id : undefined,
        customerSku: item.sku,
        description: item.name,
        quantity,
        unitCost: unitCost ?? null,
        costCurrency: unitCost !== undefined ? scoopOffer?.currency : undefined,
        costExcludesVat: unitCost !== undefined ? true : undefined,
        expectedMerchandiseCost: unitCost !== undefined ? Math.round(unitCost * quantity * 100) / 100 : null,
        costCapturedAt: unitCost !== undefined ? new Date().toISOString() : undefined,
        costSourceOfferId: unitCost !== undefined ? (mapping?.supplierOfferId ?? `SCOOP:${mapping?.supplierSku}`) : undefined,
        normalizedUnitCostZar: cost?.normalizedUnitCostZar,
        sourceUnitCost: cost?.sourceUnitCost,
        sourceCurrency: cost?.sourceCurrency,
        fxRate: cost?.fxRate,
        fxProvider: cost?.fxProvider,
        fxEffectiveAt: cost?.fxEffectiveAt,
        costEvidenceObservedAt: cost?.observedAt,
        costSourceFingerprint: cost?.sourceFingerprint,
        costSourceReference: cost?.sourceReference,
        pricingPolicyReference: cost?.pricingPolicyReference,
        mappingId: mapping?.id,
        sellingPriceSnapshot: item.unitPrice,
        normalDealerCostExVat: syntechOffer?.normalDealerCostExVat,
        promoPriceExVat: syntechOffer?.promoPriceExVat,
        promotionActive: syntechOffer?.promotionActive,
        promotionStarts: syntechOffer?.promoStarts,
        promotionEnds: syntechOffer?.promoEnds,
        ...(allocation.supplierCode === "TEKCENTRAL" ? {
          unitCost: cost?.sourceUnitCost ?? null,
          costCurrency: cost?.sourceCurrency,
          costExcludesVat: true,
          expectedMerchandiseCost: cost ? Math.round(cost.normalizedUnitCostZar * quantity * 100) / 100 : null,
          costCapturedAt: cost?.observedAt,
          costSourceOfferId: mapping?.supplierOfferId,
        } : {}),
      });
    }
  }
  return lines;
}

function assertReadyForSupplierOrder(order: BackendOrder) {
  if (order.payment.status !== "PAID") {
    throw new Error("Paid payment confirmation is required before supplier ordering.");
  }
  assertOrderNotHeld(order);
}

function nextSupplierOrderId(supplierCode: string, existingCount: number) {
  return `SO-${supplierCode}-${String(existingCount + 1).padStart(6, "0")}`;
}

export async function listAdminSupplierOrders() {
  return listSupplierOrders();
}

export async function getAdminSupplierOrder(id: string) {
  return getSupplierOrder(id);
}

function committedQuantityForLine(line: SupplierOrderLine, status: SupplierOrderStatus) {
  if (!activeProcurementStatuses.has(status)) return 0;
  if (status === "PARTIALLY_CONFIRMED") return line.confirmedQuantity ?? 0;
  if (status === "BACKORDERED" || status === "REJECTED" || status === "CANCELLED" || status === "SUPERSEDED") return 0;
  return line.quantity;
}

function activeQuantityMap(orderNumber: string, supplierOrders: SupplierOrder[]) {
  const quantities = new Map<string, number>();
  supplierOrders
    .filter((supplierOrder) => supplierOrder.customerOrderNumber === orderNumber)
    .forEach((supplierOrder) => {
      supplierOrder.itemLines.forEach((line) => {
        quantities.set(
          line.orderItemId,
          (quantities.get(line.orderItemId) ?? 0) +
            committedQuantityForLine(line, supplierOrder.status),
        );
      });
    });
  return quantities;
}

function assertSupplierSkuMappings(supplierOrder: SupplierOrder) {
  if (!requiresSupplierSku(supplierOrder)) return;
  const missing = supplierOrder.itemLines.filter((line) => !line.supplierSku?.trim());
  if (missing.length > 0) {
    throw new SupplierWorkflowError(
      "SUPPLIER_MAPPING_REQUIRED",
      supplierOrder.supplierCode === "CJ"
        ? "Verified CJ mapping is required before approval or mock submission."
        : "Supplier SKU mapping is required before approval or mock submission.",
    );
  }
}

async function assertSupplierOrderActionReady(supplierOrder: SupplierOrder) {
  const order = await getOrder(supplierOrder.customerOrderNumber);
  if (!order) throw new Error("Customer order not found.");
  assertOrderNotHeld(order);
  return order;
}

async function withResolvedSupplierMappings(supplierOrder: SupplierOrder) {
  const itemLines = await Promise.all(
    supplierOrder.itemLines.map(async (line) => {
      const mapping = await getSupplierProductMapping(line.productId, supplierOrder.supplierCode);
      if (supplierOrder.supplierCode === "SYNTECH" && mapping?.status === "VERIFIED" && mapping.supplierSku) {
        const [cost, offer] = await Promise.all([
          resolveSelectedSupplierCost("SYNTECH", mapping),
          getSyntechCatalogueProduct(mapping.supplierSku),
        ]);
        return {
          ...line,
          supplierSku: mapping.supplierSku,
          supplierOfferId: mapping.supplierOfferId ?? `SYNTECH:${mapping.supplierSku}`,
          mappingId: mapping.id,
          normalizedUnitCostZar: cost?.normalizedUnitCostZar,
          sourceUnitCost: cost?.sourceUnitCost,
          sourceCurrency: cost?.sourceCurrency,
          costEvidenceObservedAt: cost?.observedAt,
          costSourceFingerprint: cost?.sourceFingerprint,
          costSourceReference: cost?.sourceReference,
          normalDealerCostExVat: offer?.normalDealerCostExVat,
          promoPriceExVat: offer?.promoPriceExVat,
          promotionActive: offer?.promotionActive,
          promotionStarts: offer?.promoStarts,
          promotionEnds: offer?.promoEnds,
        };
      }
      if (supplierOrder.supplierCode === "TEKCENTRAL" && mapping?.status === "VERIFIED" && mapping.supplierOfferId) {
        const cost = await resolveSelectedSupplierCost("TEKCENTRAL", mapping);
        return { ...line, supplierSku: mapping.supplierSku, supplierOfferId: mapping.supplierOfferId, mappingId: mapping.id, normalizedUnitCostZar: cost?.normalizedUnitCostZar, sourceUnitCost: cost?.sourceUnitCost, sourceCurrency: cost?.sourceCurrency, costEvidenceObservedAt: cost?.observedAt, costSourceFingerprint: cost?.sourceFingerprint, costSourceReference: cost?.sourceReference };
      }
      if (line.supplierSku?.trim()) return line;
      if (supplierOrder.supplierCode === "CJ" && mapping?.status !== "VERIFIED") return line;
      return mapping?.supplierSku
        ? {
            ...line,
            supplierSku: mapping.supplierSku,
            supplierProductId: mapping.supplierProductId,
            supplierProductSku: mapping.supplierProductSku,
            supplierVariantId: mapping.supplierVariantId,
            supplierVariantSku: mapping.supplierVariantSku,
          }
        : line;
    }),
  );
  return { ...supplierOrder, itemLines };
}

export async function generateSupplierOrders(orderNumber: string) {
  const order = await getOrder(orderNumber);
  if (!order) return undefined;
  assertReadyForSupplierOrder(order);
  const allocations = order.supplierAllocations ?? [];
  if (allocations.length === 0) throw new Error("Supplier allocation is required.");
  const existing = await listSupplierOrders();
  const created: SupplierOrder[] = [];
  const grouped = new Map<string, SupplierAllocation[]>();
  const selectedItemIds = new Set<string>();
  const supersededByItemId = new Map<string, SupplierOrder[]>();
  const committed = activeQuantityMap(order.orderNumber, existing);
  allocations.forEach((allocation) => {
    if (allocation.status === "CANCELLED") return;
    if (
      existing.some((supplierOrder) =>
        allocation.id && supplierOrder.allocationIds.includes(allocation.id),
      )
    ) {
      return;
    }
    allocation.orderItemIds.forEach((itemId) => {
      if (selectedItemIds.has(itemId)) {
        throw new SupplierWorkflowError(
          "DUPLICATE_PROCUREMENT",
          "Only one active supplier procurement path may exist for an order item quantity.",
        );
      }
      selectedItemIds.add(itemId);
      const activeForItem = existing.filter(
        (supplierOrder) =>
          supplierOrder.customerOrderNumber === order.orderNumber &&
          supplierOrder.itemLines.some((line) => line.orderItemId === itemId) &&
          committedQuantityForLine(
            supplierOrder.itemLines.find((line) => line.orderItemId === itemId)!,
            supplierOrder.status,
          ) > 0,
      );
      const supersedable = activeForItem.filter((supplierOrder) =>
        supersedableStatuses.has(supplierOrder.status),
      );
      if (supersedable.length > 0) supersededByItemId.set(itemId, supersedable);
      supersedable.forEach((supplierOrder) => {
        supplierOrder.itemLines.forEach((line) => {
          if (line.orderItemId === itemId) {
            committed.set(itemId, Math.max(0, (committed.get(itemId) ?? 0) - line.quantity));
          }
        });
      });
    });
    grouped.set(allocation.supplierCode, [
      ...(grouped.get(allocation.supplierCode) ?? []),
      allocation,
    ]);
  });

  for (const [supplierCode, supplierAllocations] of grouped.entries()) {
    const adapter = supplierAdapters[supplierCode as keyof typeof supplierAdapters];
    if (!adapter) {
      throw new SupplierWorkflowError("SUPPLIER_MAPPING_REQUIRED", "Supplier adapter is not available.");
    }
    const now = new Date().toISOString();
    const quantities = new Map<string, number>();
    supplierAllocations.forEach((allocation) => {
      allocation.orderItemIds.forEach((itemId) => {
        const orderedQuantity = order.items.find((item) => item.productId === itemId)?.quantity ?? 0;
        const availableQuantity = orderedQuantity - (committed.get(itemId) ?? 0);
        if (availableQuantity < 1) {
          throw new SupplierWorkflowError(
            "DUPLICATE_PROCUREMENT",
            "Total active supplier quantity cannot exceed customer ordered quantity.",
          );
        }
        quantities.set(itemId, availableQuantity);
        committed.set(itemId, (committed.get(itemId) ?? 0) + availableQuantity);
      });
    });
    const itemLines = await allocationLines(order, supplierAllocations, quantities);
    const supplierSubtotal = itemLines.every((line) => line.expectedMerchandiseCost !== null && line.expectedMerchandiseCost !== undefined)
      ? Math.round(itemLines.reduce((sum, line) => sum + (line.expectedMerchandiseCost ?? 0), 0) * 100) / 100
      : null;
    const automaticScoop = supplierCode === "SCOOP" && supplierAllocations.every((allocation) => allocation.allocationMethod === "AUTO");
    let supplierOrder: SupplierOrder = {
      id: nextSupplierOrderId(supplierCode, existing.length + created.length),
      customerOrderNumber: order.orderNumber,
      supplierCode: adapter.code,
      supplierName: adapter.name,
      allocationIds: supplierAllocations.map((allocation) => allocation.id),
      itemLines,
      status: automaticScoop ? "ACTION_REQUIRED" : "READY_FOR_APPROVAL",
      createdAt: now,
      updatedAt: now,
      submissionMode: adapter.defaultSubmissionMode,
      fulfilmentMode: adapter.defaultFulfilmentMode,
      supplierSubtotal,
      supplierDeliveryCost: null,
      supplierTotalCost: null,
      mockSubmissions: [],
      events: [event("SUPPLIER_ORDER_GENERATED", automaticScoop ? "Paid order automatically allocated to Scoop for staff acknowledgement." : "Supplier order generated for approval.")],
    };
    if (supplierCode === "TEKCENTRAL") {
      const policy = await getSupplierPolicySettings(); const reserved = [] as NonNullable<SupplierOrder["tekcentralOperations"]>["reservations"];
      try {
        for (const line of itemLines) {
          const offer = line.supplierOfferId ? await getTekCentralManualOffer(line.supplierOfferId) : undefined;
          if (!offer || !offer.active || offer.mappingStatus !== "VERIFIED" || offer.productId !== line.productId || offer.supplierSku !== line.supplierSku) throw new SupplierWorkflowError("SUPPLIER_MAPPING_REQUIRED", "An active verified TekCentral Manual Supplier mapping is required.");
          if (Date.now() - Date.parse(offer.stockObservedAt) > policy.stockFreshnessHours * 3_600_000 || Date.now() - Date.parse(offer.costObservedAt) > policy.sourcePriceFreshnessHours * 3_600_000 || line.normalizedUnitCostZar === undefined) throw new SupplierWorkflowError("SUPPLIER_EVIDENCE_CHANGED", "Current TekCentral stock and cost evidence is required before reservation.");
          try { const result = await reserveTekCentralManualStock({ offerId: offer.id, supplierOrderId: supplierOrder.id, orderNumber: order.orderNumber, quantity: line.quantity, expectedFingerprint: offer.sourceFingerprint }); reserved.push({ manualOfferId: offer.id, supplierSku: offer.supplierSku, quantity: line.quantity, stockEvidenceFingerprint: offer.sourceFingerprint, costEvidenceFingerprint: offer.sourceFingerprint, reservedAt: result.reservation.reservedAt }); }
          catch (error) { if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") throw new SupplierWorkflowError("INSUFFICIENT_STOCK", "Insufficient available TekCentral stock for this order."); throw error; }
        }
        supplierOrder = { ...supplierOrder, tekcentralOperations: { stage: "RESERVED", reservations: reserved }, events: [...supplierOrder.events, event("TEKCENTRAL_STOCK_RESERVED", "TekCentral-controlled stock reserved for the paid order.")] };
        created.push(await saveSupplierOrder(supplierOrder));
      } catch (error) {
        for (const reservation of reserved) await releaseTekCentralManualReservation({ offerId: reservation.manualOfferId, supplierOrderId: supplierOrder.id });
        if (error instanceof SupplierWorkflowError && ["INSUFFICIENT_STOCK", "SUPPLIER_EVIDENCE_CHANGED"].includes(error.code)) await updateOrder(order.orderNumber, (current) => ({ ...current, updatedAt: new Date().toISOString(), operationalHold: { active: true, reason: "INVENTORY_STOCK_ISSUE", notes: error.message, createdAt: new Date().toISOString() } }));
        throw error;
      }
    } else created.push(await saveSupplierOrder(supplierOrder));
    const replaced = supplierAllocations.flatMap((allocation) =>
      allocation.orderItemIds.flatMap((itemId) => supersededByItemId.get(itemId) ?? []),
    );
    for (const oldSupplierOrder of Array.from(new Set(replaced))) {
      await updateSupplierOrder(oldSupplierOrder.id, (current) => ({
        ...current,
        status: "SUPERSEDED",
        supersededAt: now,
        supersededBySupplierOrderId: supplierOrder.id,
        updatedAt: now,
        events: [
          ...current.events,
          event("SUPPLIER_ORDER_SUPERSEDED", `Replaced by ${supplierOrder.id}.`),
        ],
      }));
    }
  }
  await updateOrder(orderNumber, (current) => ({
    ...current,
    status: current.status === "CONFIRMED" ? "PROCESSING" : current.status,
    updatedAt: new Date().toISOString(),
  }));
  return created;
}

export async function autoAllocatePaidOrder(orderNumber: string) {
  const order = await getOrder(orderNumber);
  if (!order || order.payment.status !== "PAID" || order.operationalHold?.active) return { allocationsCreated: 0, supplierOrders: [] as SupplierOrder[] };
  const mappings = await listSupplierProductMappings();
  const existingAllocations = order.supplierAllocations ?? [];
  const allocatedItems = new Set(existingAllocations.filter((allocation) => allocation.status !== "CANCELLED").flatMap((allocation) => allocation.orderItemIds));
  const grouped = new Map<string, string[]>();
  for (const item of order.items) {
    if (allocatedItems.has(item.productId)) continue;
    const verified = mappings.filter((mapping) => mapping.productId === item.productId && mapping.status === "VERIFIED");
    const eligible = [];
    for (const mapping of verified) {
      if (mapping.supplierCode !== "SCOOP") continue;
      const offer = await getScoopCatalogueProduct(mapping.supplierSku);
      if (offer?.availability === "AVAILABLE" && !offer.staleAt) eligible.push(mapping);
    }
    if (eligible.length !== 1) continue;
    const mapping = eligible[0];
    grouped.set(mapping.supplierCode, [...(grouped.get(mapping.supplierCode) ?? []), item.productId]);
  }
  if (!grouped.size) return { allocationsCreated: 0, supplierOrders: [] as SupplierOrder[] };
  const now = new Date().toISOString();
  const updated = await updateOrder(orderNumber, (current) => ({
    ...current,
    updatedAt: now,
    supplierAllocations: [
      ...(current.supplierAllocations ?? []),
      ...Array.from(grouped.entries()).map(([supplierCode, orderItemIds]) => ({
        id: `allocation-auto-${order.orderNumber}-${supplierCode}`,
        orderId: order.id,
        orderItemIds,
        supplierCode: supplierCode as SupplierAllocation["supplierCode"],
        supplierName: getSupplierRegistryEntry(supplierCode as SupplierAllocation["supplierCode"]).displayName,
        status: "ASSIGNED" as const,
        allocationMethod: "AUTO" as const,
        notes: "Automatically allocated from one active verified supplier mapping.",
        createdAt: now,
        updatedAt: now,
      })),
    ],
  }));
  if (!updated) return { allocationsCreated: 0, supplierOrders: [] as SupplierOrder[] };
  const supplierOrders = (await generateSupplierOrders(orderNumber)) ?? [];
  for (const supplierOrder of supplierOrders) {
    if (supplierOrder.supplierCode === "SCOOP" && supplierOrder.status === "ACTION_REQUIRED") {
      try { await notifyNewScoopActionRequired(updated, supplierOrder); }
      catch (error) {
        console.error("Scoop action-required notification failed", { supplierOrderId: supplierOrder.id, error: error instanceof Error ? error.message : "Unknown notification error" });
      }
    }
  }
  return { allocationsCreated: grouped.size, supplierOrders };
}

export async function acknowledgeSupplierOrder(id: string, actor = "TekCentral Staff") {
  const supplierOrder = await getSupplierOrder(id);
  if (!supplierOrder) return undefined;
  await assertSupplierOrderActionReady(supplierOrder);
  return updateSupplierOrder(id, (current) => {
    assertTransition(current.status, "ACKNOWLEDGED");
    const now = new Date().toISOString();
    return { ...current, status: "ACKNOWLEDGED", acknowledgedAt: now, updatedAt: now, events: [...current.events, event("SUPPLIER_ORDER_ACKNOWLEDGED", `${actor} acknowledged the procurement task.`)] };
  });
}

export function manualProcurementBlocker(supplierOrder: SupplierOrder) {
  const manualSupported = getSupplierRegistryEntry(supplierOrder.supplierCode).procurement.mode === "MANUAL_SUPPORTED" || supplierOrder.submissionMode === "MANUAL";
  if (!manualSupported || supplierOrder.status !== "APPROVED") return "Manual procurement must be supported and approved before it can be marked ordered.";
  if (supplierOrder.supplierOrderReference) return "This supplier order has already been placed.";
  if (["CREATED", "SUBMITTING", "UNKNOWN_RESULT"].includes(supplierOrder.externalSubmission?.status ?? "")) return "Existing supplier submission state must be reconciled before manual procurement.";
  return undefined;
}

export async function markManualSupplierOrderOrdered(input: { id: string; supplierReference: string; actor?: string; note?: string }) {
  const supplierOrder = await getSupplierOrder(input.id);
  if (!supplierOrder) return undefined;
  await assertSupplierOrderActionReady(supplierOrder);
  const initialBlocker = manualProcurementBlocker(supplierOrder);
  if (initialBlocker) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", initialBlocker);
  const reference = input.supplierReference.trim();
  if (!reference) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Supplier order reference is required before marking the order as ordered.");
  const hasControlCharacters = (value: string, allowNewlines = false) => [...value].some((character) => { const code = character.charCodeAt(0); return code === 127 || (code < 32 && !(allowNewlines && (code === 9 || code === 10 || code === 13))); });
  if (reference.length > 120 || hasControlCharacters(reference)) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Supplier order reference must be 120 characters or fewer and contain no control characters.");
  const note = input.note?.trim();
  if (note && (note.length > 1_000 || hasControlCharacters(note, true))) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Manual procurement note must be 1,000 characters or fewer.");
  return updateSupplierOrder(input.id, (current) => {
    const blocker = manualProcurementBlocker(current);
    if (blocker) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", blocker);
    const now = new Date().toISOString();
    return { ...current, status: "ORDERED", supplierOrderReference: reference, orderedAt: now, orderedBy: input.actor?.trim() || "TekCentral Staff", notes: note || current.notes, updatedAt: now, events: [...current.events, event("SUPPLIER_ORDER_PLACED", "Manual supplier order placement recorded by staff.")] };
  });
}

export async function approveSupplierOrder(id: string) {
  const supplierOrder = await getSupplierOrder(id);
  if (!supplierOrder) return undefined;
  if (supplierOrder.supplierCode === "TEKCENTRAL") {
    for (const reservation of supplierOrder.tekcentralOperations?.reservations ?? []) {
      const offer = await getTekCentralManualOffer(reservation.manualOfferId);
      if (!offer || !offer.active || offer.sourceFingerprint !== reservation.costEvidenceFingerprint) throw new SupplierWorkflowError("SUPPLIER_EVIDENCE_CHANGED", "TekCentral Manual Supplier evidence changed after reservation. Cancel and review the allocation before approval.");
    }
  }
  const mappedSupplierOrder = await withResolvedSupplierMappings(supplierOrder);
  await assertSupplierOrderActionReady(mappedSupplierOrder);
  assertSupplierSkuMappings(mappedSupplierOrder);
  const approved = await updateSupplierOrder(id, (supplierOrder) => {
    assertTransition(supplierOrder.status, "APPROVED");
    const now = new Date().toISOString();
    return {
      ...supplierOrder,
      itemLines: mappedSupplierOrder.itemLines,
      status: "APPROVED",
      approvedAt: now,
      updatedAt: now,
      events: [...supplierOrder.events, event("SUPPLIER_ORDER_APPROVED", "Supplier order approved by staff.")],
    };
  });
  if (approved) {
    await updateOrder(approved.customerOrderNumber, (current) => { const now = new Date().toISOString(); return { ...current, updatedAt: now, items: current.items.map((item) => { const line = approved.itemLines.find((entry) => entry.orderItemId === item.productId); return line && item.costBasis ? { ...item, costBasis: finalizeCostBasis(item, line, approved.supplierCode, now) } : item; }) }; });
  }
  return approved;
}

export async function progressTekCentralFulfilment(input: { id: string; action: "START_PICKING" | "MARK_PACKED" | "MARK_READY"; actor?: string }) {
  const supplierOrder = await getSupplierOrder(input.id); if (!supplierOrder) return undefined;
  if (supplierOrder.supplierCode !== "TEKCENTRAL" || !supplierOrder.tekcentralOperations) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "This action is only available for TekCentral internal fulfilment.");
  await assertSupplierOrderActionReady(supplierOrder); if (supplierOrder.status !== "APPROVED") throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Approve the SupplierOrder before internal fulfilment.");
  const expected = input.action === "START_PICKING" ? "RESERVED" : input.action === "MARK_PACKED" ? "PICKING" : "PACKED"; const next = input.action === "START_PICKING" ? "PICKING" : input.action === "MARK_PACKED" ? "PACKED" : "READY_FOR_DISPATCH"; if (supplierOrder.tekcentralOperations.stage === next) return supplierOrder; if (supplierOrder.tekcentralOperations.stage !== expected) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", `Internal fulfilment must progress from ${expected}.`);
  const now = new Date().toISOString(); const actor = input.actor?.trim() || "TekCentral Staff"; return updateSupplierOrder(input.id, (current) => ({ ...current, updatedAt: now, tekcentralOperations: { ...current.tekcentralOperations!, stage: next, ...(next === "PICKING" ? { pickingAt: now } : next === "PACKED" ? { packedAt: now } : { readyAt: now }) }, events: [...current.events, event(`TEKCENTRAL_${next}`, `${actor} moved internal fulfilment to ${next.replace(/_/g, " ").toLowerCase()}.`)] }));
}

export async function fulfilTekCentralSupplierOrder(input: { id: string; actor?: string }) {
  const supplierOrder = await getSupplierOrder(input.id); if (!supplierOrder) return undefined;
  if (supplierOrder.supplierCode !== "TEKCENTRAL" || !supplierOrder.tekcentralOperations) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "This action is only available for TekCentral internal fulfilment.");
  if (supplierOrder.status === "COMPLETED" && supplierOrder.tekcentralOperations.stage === "FULFILLED") return supplierOrder;
  await assertSupplierOrderActionReady(supplierOrder); if (supplierOrder.status !== "APPROVED" || supplierOrder.tekcentralOperations.stage !== "READY_FOR_DISPATCH") throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Stock can be fulfilled only after the internal order is ready for dispatch.");
  const actor = input.actor?.trim() || "TekCentral Staff";
  for (const reservation of supplierOrder.tekcentralOperations.reservations) await consumeTekCentralManualReservation({ offerId: reservation.manualOfferId, supplierOrderId: supplierOrder.id, orderNumber: supplierOrder.customerOrderNumber, actor });
  const now = new Date().toISOString(); const completed = await updateSupplierOrder(input.id, (current) => ({ ...current, status: "COMPLETED", completedAt: now, updatedAt: now, tekcentralOperations: { ...current.tekcentralOperations!, stage: "FULFILLED", fulfilledAt: now, reservations: current.tekcentralOperations!.reservations.map((item) => ({ ...item, consumedAt: item.consumedAt ?? now })) }, events: [...current.events, event("TEKCENTRAL_ORDER_FULFILLED", `${actor} confirmed irreversible internal fulfilment and stock consumption.`)] }));
  await updateOrder(supplierOrder.customerOrderNumber, (current) => ({ ...current, status: current.status === "CONFIRMED" ? "PROCESSING" : current.status, updatedAt: now, supplierAllocations: (current.supplierAllocations ?? []).map((item) => supplierOrder.allocationIds.includes(item.id) ? { ...item, status: "COMPLETED", updatedAt: now } : item) }));
  return completed;
}

export async function cancelTekCentralSupplierOrder(input: { id: string; actor?: string; reason?: string }) {
  const supplierOrder = await getSupplierOrder(input.id); if (!supplierOrder) return undefined;
  if (supplierOrder.supplierCode !== "TEKCENTRAL" || !supplierOrder.tekcentralOperations) throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "This action is only available for TekCentral internal fulfilment.");
  if (supplierOrder.status === "CANCELLED") return supplierOrder; if (supplierOrder.tekcentralOperations.stage === "FULFILLED" || supplierOrder.status === "COMPLETED") throw new SupplierWorkflowError("INVALID_SUPPLIER_TRANSITION", "Fulfilled stock cannot be restored through cancellation. Use the future returns workflow.");
  const actor = input.actor?.trim() || "TekCentral Staff"; for (const reservation of supplierOrder.tekcentralOperations.reservations) await releaseTekCentralManualReservation({ offerId: reservation.manualOfferId, supplierOrderId: supplierOrder.id, actor });
  const now = new Date().toISOString(); const cancelled = await updateSupplierOrder(input.id, (current) => ({ ...current, status: "CANCELLED", updatedAt: now, notes: input.reason?.trim() || current.notes, tekcentralOperations: { ...current.tekcentralOperations!, stage: "CANCELLED", cancelledAt: now, reservations: current.tekcentralOperations!.reservations.map((item) => ({ ...item, releasedAt: item.releasedAt ?? now })) }, events: [...current.events, event("TEKCENTRAL_ALLOCATION_CANCELLED", `${actor} cancelled the internal allocation and released reserved stock.`)] }));
  await updateOrder(supplierOrder.customerOrderNumber, (current) => ({ ...current, updatedAt: now, supplierAllocations: (current.supplierAllocations ?? []).map((item) => supplierOrder.allocationIds.includes(item.id) ? { ...item, status: "CANCELLED", updatedAt: now } : item) })); return cancelled;
}

export async function releaseTekCentralReservationsForCancelledOrder(orderNumber: string, actor = "TekCentral Staff") {
  const orders = (await listSupplierOrders()).filter((item) => item.customerOrderNumber === orderNumber && item.supplierCode === "TEKCENTRAL" && item.status !== "CANCELLED" && item.status !== "COMPLETED");
  for (const supplierOrder of orders) await cancelTekCentralSupplierOrder({ id: supplierOrder.id, actor, reason: "Customer order cancelled before fulfilment." });
  return orders.length;
}

export async function mockSubmitSupplierOrder(id: string, scenario: MockSupplierScenario) {
  const supplierOrder = await getSupplierOrder(id);
  if (!supplierOrder) return undefined;
  if (supplierOrder.status === "SUBMITTED" || supplierOrder.status === "ACKNOWLEDGED" || supplierOrder.status === "CONFIRMED") {
    return supplierOrder;
  }
  const mappedSupplierOrder = await withResolvedSupplierMappings(supplierOrder);
  assertTransition(mappedSupplierOrder.status, "SUBMITTED");
  assertSupplierSkuMappings(mappedSupplierOrder);
  const order = await assertSupplierOrderActionReady(mappedSupplierOrder);
  assertReadyForSupplierOrder(order);
  const adapter = supplierAdapters[mappedSupplierOrder.supplierCode];
  const result = await adapter.submitOrder(order, mappedSupplierOrder, scenario);
  const now = new Date().toISOString();
  const submission = {
    id: createLocalId("mock-submission"),
    createdAt: now,
    scenario,
    payloadPreview: result.payloadPreview,
  };

  return updateSupplierOrder(id, (current) => ({
    ...current,
    itemLines: mappedSupplierOrder.itemLines,
    status: "SUBMITTED",
    submittedAt: now,
    updatedAt: now,
    supplierOrderReference: result.supplierReference,
    mockScenario: scenario,
    mockSubmissions: current.mockSubmissions.length ? current.mockSubmissions : [submission],
    events: current.mockSubmissions.length
      ? current.events
      : [...current.events, event("MOCK_SUPPLIER_SUBMISSION", `Mock supplier submission created for ${scenario}.`)],
  }));
}

export async function applyMockSupplierOutcome(
  id: string,
  confirmations?: { orderItemId: string; confirmedQuantity: number; backorderedQuantity?: number }[],
) {
  const supplierOrder = await getSupplierOrder(id);
  if (!supplierOrder) return undefined;
  if (!["SUBMITTED", "ACKNOWLEDGED"].includes(supplierOrder.status)) return supplierOrder;
  await assertSupplierOrderActionReady(supplierOrder);
  const scenario = supplierOrder.mockScenario ?? "SUCCESS";
  const now = new Date().toISOString();

  return updateSupplierOrder(id, (current) => {
    if (scenario === "REJECTED") {
      assertTransition(current.status, "REJECTED");
      return {
        ...current,
        status: "REJECTED",
        rejectedAt: now,
        updatedAt: now,
        events: [...current.events, event("SUPPLIER_REJECTED", "Mock supplier rejected the order.")],
      };
    }
    if (scenario === "BACKORDER") {
      assertTransition(current.status, "BACKORDERED");
      return {
        ...current,
        status: "BACKORDERED",
        updatedAt: now,
        itemLines: current.itemLines.map((line) => ({
          ...line,
          confirmedQuantity: 0,
          backorderedQuantity: line.quantity,
        })),
        events: [...current.events, event("SUPPLIER_BACKORDERED", "Mock supplier reported a backorder.")],
      };
    }
    if (scenario === "PARTIAL_CONFIRMATION") {
      assertTransition(current.status, "PARTIALLY_CONFIRMED");
      return {
        ...current,
        status: "PARTIALLY_CONFIRMED",
        confirmedAt: now,
        updatedAt: now,
        itemLines: current.itemLines.map((line) => {
          const explicit = confirmations?.find((item) => item.orderItemId === line.orderItemId);
          const confirmedQuantity =
            explicit?.confirmedQuantity ??
            Math.max(1, Math.min(line.quantity, line.quantity - 1));
          if (confirmedQuantity > line.quantity) {
            throw new Error("Confirmed quantity exceeds ordered quantity.");
          }
          const backorderedQuantity =
            explicit?.backorderedQuantity ?? line.quantity - confirmedQuantity;
          if (confirmedQuantity + backorderedQuantity > line.quantity) {
            throw new Error("Confirmed and backordered quantities exceed ordered quantity.");
          }
          return {
            ...line,
            confirmedQuantity,
            backorderedQuantity,
          };
        }),
        events: [...current.events, event("SUPPLIER_PARTIAL", "Mock supplier partially confirmed the order.")],
      };
    }
    const nextStatus = scenario === "DELAYED_CONFIRMATION" ? "ACKNOWLEDGED" : "CONFIRMED";
    assertTransition(current.status, nextStatus);
    return {
      ...current,
      status: nextStatus,
      acknowledgedAt: now,
      confirmedAt: nextStatus === "CONFIRMED" ? now : current.confirmedAt,
      updatedAt: now,
      itemLines: current.itemLines.map((line) => ({
        ...line,
        confirmedQuantity: nextStatus === "CONFIRMED" ? line.quantity : line.confirmedQuantity,
        backorderedQuantity: nextStatus === "CONFIRMED" ? 0 : line.backorderedQuantity,
      })),
      events: [
        ...current.events,
        event(
          nextStatus === "CONFIRMED" ? "SUPPLIER_CONFIRMED" : "SUPPLIER_ACKNOWLEDGED",
          nextStatus === "CONFIRMED"
            ? "Mock supplier confirmed the order."
            : "Mock supplier acknowledged the order.",
        ),
      ],
    };
  });
}

export async function rejectSupplierOrder(id: string, reason: string) {
  const supplierOrder = await getSupplierOrder(id);
  if (!supplierOrder) return undefined;
  await assertSupplierOrderActionReady(supplierOrder);
  return updateSupplierOrder(id, (supplierOrder) => {
    assertTransition(supplierOrder.status, "REJECTED");
    const now = new Date().toISOString();
    return {
      ...supplierOrder,
      status: "REJECTED",
      rejectedAt: now,
      updatedAt: now,
      notes: reason.trim() || supplierOrder.notes,
      events: [...supplierOrder.events, event("SUPPLIER_REJECTED", reason.trim() || "Supplier order rejected.")],
    };
  });
}

export async function dispatchSupplierOrder(input: {
  id: string;
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  dispatchedAt?: string;
}) {
  const supplierOrder = await getSupplierOrder(input.id);
  if (!supplierOrder) return undefined;
  await assertSupplierOrderActionReady(supplierOrder);
  if (!input.courier?.trim() || !input.trackingNumber?.trim() || !input.dispatchedAt?.trim()) {
    throw new SupplierWorkflowError(
      "DISPATCH_FIELDS_REQUIRED",
      "Courier, tracking number and dispatch date are required before dispatch.",
    );
  }
  assertTransition(supplierOrder.status, "DISPATCHED");
  await createAdminShipment({
    orderNumber: supplierOrder.customerOrderNumber,
    items: supplierOrder.itemLines.map((line) => ({
      orderItemId: line.orderItemId,
      quantity: line.confirmedQuantity ?? line.quantity,
    })),
    courier: input.courier,
    trackingNumber: input.trackingNumber,
    trackingUrl: input.trackingUrl,
    dispatchedAt: input.dispatchedAt,
    status: "DISPATCHED",
  });
  const now = new Date().toISOString();
  return updateSupplierOrder(input.id, (current) => ({
    ...current,
    status: "DISPATCHED",
    dispatchedAt: now,
    updatedAt: now,
    events: [...current.events, event("SUPPLIER_DISPATCHED", "Mock supplier dispatch recorded.")],
  }));
}

export async function mapSupplierOrderLineSku(input: {
  supplierOrderId: string;
  productId: string;
  supplierSku: string;
}) {
  const supplierOrder = await getSupplierOrder(input.supplierOrderId);
  if (!supplierOrder) return undefined;
  if (!supplierOrder.itemLines.some((line) => line.productId === input.productId)) {
    throw new SupplierWorkflowError("SUPPLIER_MAPPING_REQUIRED", "Supplier order line not found.");
  }
  const mapping = await saveSupplierProductMapping({
    productId: input.productId,
    supplierCode: supplierOrder.supplierCode,
    supplierSku: input.supplierSku,
  });
  const now = new Date().toISOString();
  return updateSupplierOrder(input.supplierOrderId, (current) => ({
    ...current,
    updatedAt: now,
    itemLines: current.itemLines.map((line) =>
      line.productId === input.productId
        ? { ...line, supplierSku: mapping.supplierSku }
        : line,
    ),
    events: [
      ...current.events,
      event("SUPPLIER_SKU_MAPPED", `Supplier SKU mapped for ${input.productId}.`),
    ],
  }));
}

export function createSupplierPayloadPreview(order: BackendOrder, supplierOrder: SupplierOrder) {
  return supplierAdapters[supplierOrder.supplierCode].createOrderPayload(order, supplierOrder);
}

export function deriveSupplierOrderAttention(
  supplierOrder: SupplierOrder,
  now = new Date(),
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (supplierOrder.status === "ACTION_REQUIRED") {
    reasons.push({
      code: "SUPPLIER_ORDER_AWAITING_APPROVAL",
      label: "Procurement action required",
      detail: "Paid supplier order is awaiting staff acknowledgement",
      createdAt: supplierOrder.createdAt,
    });
  }
  if (supplierOrder.status === "READY_FOR_APPROVAL") {
    reasons.push({
      code: "SUPPLIER_ORDER_AWAITING_APPROVAL",
      label: "Supplier approval",
      detail: "Supplier order awaiting approval",
      createdAt: supplierOrder.createdAt,
    });
  }
  if (requiresSupplierSku(supplierOrder) && supplierOrder.itemLines.some((line) => !line.supplierSku?.trim())) {
    reasons.push({
      code: "SUPPLIER_MAPPING_REQUIRED",
      label: supplierOrder.supplierCode === "CJ" ? "CJ mapping required" : "Mapping required",
      detail:
        supplierOrder.supplierCode === "CJ"
          ? "Verified CJ mapping required before approval"
          : "Supplier SKU required before approval",
      createdAt: supplierOrder.updatedAt,
    });
  }
  if (supplierOrder.status === "REJECTED") {
    reasons.push({
      code: "SUPPLIER_ORDER_REJECTED",
      label: "Supplier rejected",
      detail: "Reallocate affected items",
      createdAt: supplierOrder.rejectedAt,
    });
  }
  if (supplierOrder.status === "BACKORDERED" || supplierOrder.status === "PARTIALLY_CONFIRMED") {
    reasons.push({
      code: "SUPPLIER_BACKORDER",
      label: "Supplier backorder",
      detail: "Supplier reported unavailable quantities",
      createdAt: supplierOrder.updatedAt,
    });
  }
  if (
    supplierOrder.status === "SUBMITTED" &&
    (now.getTime() - new Date(supplierOrder.submittedAt ?? supplierOrder.updatedAt).getTime()) /
      3_600_000 >=
      supplierAttentionConfig.confirmationDelayedHours
  ) {
    reasons.push({
      code: "SUPPLIER_CONFIRMATION_DELAYED",
      label: "Supplier confirmation",
      detail: "Supplier confirmation delayed",
      createdAt: supplierOrder.submittedAt,
    });
  }
  if (
    supplierOrder.status === "CONFIRMED" &&
    (now.getTime() - new Date(supplierOrder.confirmedAt ?? supplierOrder.updatedAt).getTime()) /
      3_600_000 >=
      supplierAttentionConfig.dispatchOverdueHours
  ) {
    reasons.push({
      code: "SUPPLIER_DISPATCH_OVERDUE",
      label: "Supplier dispatch",
      detail: "Confirmed supplier order awaiting dispatch",
      createdAt: supplierOrder.confirmedAt,
    });
  }
  if (supplierOrder.cjOperations?.attention?.active) {
    reasons.push({
      code: "CJ_RECIPIENT_INFORMATION_REQUIRED",
      label: "CJ fulfilment paused",
      detail: supplierOrder.cjOperations.attention.message,
      createdAt: supplierOrder.cjOperations.attention.createdAt,
    });
  }
  if (supplierOrder.supplierCode === "SYNTECH" && supplierOrder.status === "APPROVED" && supplierOrder.externalSubmission?.status !== "CREATED") {
    const isRc3 = supplierOrder.externalSubmission?.lastErrorCode === "RC3";
    reasons.push({
      code: "SYNTECH_PROCUREMENT_REVIEW",
      label: supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT" ? "Syntech result unknown" : isRc3 ? "Procurement action required" : "Syntech procurement review",
      detail: supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT"
        ? "Investigate the external reference before any retry"
        : isRc3
        ? "Syntech could not resolve the reseller accounting account. Do not retry the API submission. Place the order through the approved manual reseller-portal process and record the Syntech reference, or wait for Syntech account configuration to be corrected."
        : supplierOrder.externalSubmission?.lastErrorMessage ?? "Approved Syntech procurement requires controlled staff action",
      createdAt: supplierOrder.updatedAt,
    });
  }
  if (supplierOrder.supplierCode === "TEKCENTRAL" && supplierOrder.status === "APPROVED" && supplierOrder.tekcentralOperations && supplierOrder.tekcentralOperations.stage !== "FULFILLED") {
    reasons.push({ code: supplierOrder.tekcentralOperations.stage === "EXCEPTION" ? "TEKCENTRAL_FULFILMENT_EXCEPTION" : "TEKCENTRAL_FULFILMENT_REQUIRED", label: supplierOrder.tekcentralOperations.stage === "EXCEPTION" ? "Internal fulfilment exception" : "Internal fulfilment", detail: `TekCentral stock is ${supplierOrder.tekcentralOperations.stage.toLowerCase().replace(/_/g, " ")} and requires staff action.`, createdAt: supplierOrder.updatedAt });
  }
  return reasons;
}

export function hasMissingSupplierSkuMapping(supplierOrder: SupplierOrder) {
  return requiresSupplierSku(supplierOrder) && supplierOrder.itemLines.some((line) => !line.supplierSku?.trim());
}
