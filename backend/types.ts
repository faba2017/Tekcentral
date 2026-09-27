export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "PARTIALLY_SHIPPED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURN_IN_PROGRESS"
  | "RETURNED"
  | "REFUND_REQUESTED"
  | "REFUND_APPROVED"
  | "REFUND_REJECTED"
  | "REFUNDED";

export type PaymentStatus =
  | "UNPAID"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

export interface PaymentRecord {
  provider: "payfast";
  status: PaymentStatus;
  paymentReference: string;
  payfastPaymentId?: string;
  grossAmount?: number;
  confirmedAt?: string;
  updatedAt: string;
  processedItnIds: string[];
}

export interface BackendOrderItem {
  productId: string;
  slug: string;
  sku?: string;
  name: string;
  brand: string;
  stockStatus?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderShippingQuoteSnapshot {
  quoteId: string;
  amountCharged: number;
  supplierShippingCost?: number;
  estimatedInternalFreightCost?: number;
  fulfilmentGroups: {
    customerLabel: string;
    customerDescription?: string;
    customerCharge: number;
    supplierShippingCost?: number;
    estimatedInternalFreightCost?: number;
    actualSupplierFreightCost?: number;
    bufferAmount?: number;
    policyType?: string;
    zone?: string;
    actualWeightKg?: number;
    volumetricWeightKg?: number;
    billableWeightKg?: number;
    rateCardVersion?: number;
    calculationVersion?: string;
    provenance?: string;
    estimate?: string;
    internalSupplierCode?: string;
    internalMethod?: string;
  }[];
  acceptedAt: string;
  generatedAt: string;
  expiresAt: string;
  settingsSnapshot: unknown;
  freightReconciliation?: {
    estimatedInternalFreightCost: number;
    actualFreightCost: number;
    customerShippingCharge: number;
    varianceRand: number;
    variancePercent?: number;
    status: "WITHIN_TOLERANCE" | "UNDER_RECOVERED" | "OVER_RECOVERED";
    reconciledAt: string;
    reconciledBy: string;
    note?: string;
  };
}

export type ReturnStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "AWAITING_RETURN"
  | "RECEIVED"
  | "COMPLETED";

export type RefundStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PROCESSING"
  | "REFUNDED";

export interface BackendReturnRequestItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface BackendReturnRequest {
  id: string;
  orderId: string;
  items: BackendReturnRequestItem[];
  reason: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  status: ReturnStatus;
}

export interface BackendRefundItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface BackendRefund {
  id: string;
  orderId: string;
  returnRequestId?: string;
  items?: BackendRefundItem[];
  amount: number;
  status: RefundStatus;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface InternalNote {
  id: string;
  orderId: string;
  createdAt: string;
  authorLabel: string;
  body: string;
}

export type SupplierCode =
  | "SCOOP"
  | "PINNACLE"
  | "MIRO"
  | "RECTRON"
  | "MUSTEK"
  | "AXIZ"
  | "CJ"
  | "MANUAL";

export type SupplierAllocationStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "READY_TO_ORDER"
  | "ORDER_PENDING_APPROVAL"
  | "APPROVED_FOR_ORDER"
  | "ORDER_SUBMITTED"
  | "SUPPLIER_CONFIRMED"
  | "BACKORDERED"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

export interface SupplierAllocation {
  id: string;
  orderId: string;
  orderItemIds: string[];
  supplierCode: SupplierCode;
  supplierName: string;
  status: SupplierAllocationStatus;
  supplierOrderReference?: string;
  notes?: string;
  allocationMethod?: "AUTO" | "MANUAL";
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentRecord {
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  dispatchDate?: string;
  notes?: string;
  updatedAt?: string;
}

export type AttentionReasonCode =
  | "PAYMENT_PENDING_TOO_LONG"
  | "PAYMENT_CANCELLED_ORDER_OPEN"
  | "ADDRESS_REVIEW"
  | "FULFILMENT_UNASSIGNED"
  | "RETURN_AWAITING_REVIEW"
  | "REFUND_AWAITING_REVIEW"
  | "SHIPMENT_MISSING_TRACKING"
  | "MANUAL_HOLD"
  | "ORDER_ON_HOLD"
  | "SUPPLIER_ALLOCATION_REQUIRED"
  | "SUPPLIER_MAPPING_REQUIRED"
  | "SUPPLIER_ORDER_AWAITING_APPROVAL"
  | "SUPPLIER_ORDER_REJECTED"
  | "SUPPLIER_BACKORDER"
  | "SUPPLIER_CONFIRMATION_DELAYED"
  | "SUPPLIER_DISPATCH_OVERDUE"
  | "CJ_RECIPIENT_INFORMATION_REQUIRED"
  | "DUPLICATE_PROCUREMENT_BLOCKED";

export interface AttentionReason {
  code: AttentionReasonCode;
  label: string;
  detail: string;
  createdAt?: string;
}

export type OperationalHoldReason =
  | "ADDRESS_REVIEW"
  | "PAYMENT_REVIEW"
  | "INVENTORY_EXCEPTION"
  | "CUSTOMER_REQUEST"
  | "MANUAL";

export interface OperationalHold {
  active: boolean;
  reason?: OperationalHoldReason;
  notes?: string;
  createdAt?: string;
  releasedAt?: string;
}

export interface ParcelItemQuantity {
  orderItemId: string;
  quantity: number;
}

export interface Parcel {
  id: string;
  orderId: string;
  itemQuantities: ParcelItemQuantity[];
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  packageType?: string;
  declaredValue?: number;
  reference?: string;
  createdAt: string;
  updatedAt: string;
}

export type ShipmentStatus = "DRAFT" | "READY" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

export interface ShipmentItem {
  orderItemId: string;
  quantity: number;
}

export interface Shipment {
  id: string;
  orderId: string;
  items: ShipmentItem[];
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type SupplierOrderStatus =
  | "DRAFT"
  | "ACTION_REQUIRED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "ORDERED"
  | "CONFIRMED"
  | "BACKORDERED"
  | "PARTIALLY_CONFIRMED"
  | "REJECTED"
  | "DISPATCHED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "SUPERSEDED";

export type SupplierSubmissionMode = "EMAIL" | "PORTAL" | "PORTAL_AUTOMATION" | "MANUAL" | "API";

export type SupplierFulfilmentMode =
  | "SHIP_TO_CUSTOMER"
  | "SHIP_TO_TEKCENTRAL"
  | "DIRECT_TO_CUSTOMER"
  | "PENDING_LOGISTICS"
  | "MANUAL";

export type MockSupplierScenario =
  | "SUCCESS"
  | "BACKORDER"
  | "PARTIAL_CONFIRMATION"
  | "REJECTED"
  | "DELAYED_CONFIRMATION";

export interface SupplierOrderLine {
  orderItemId: string;
  productId: string;
  supplierSku?: string;
  supplierProductId?: string;
  supplierProductSku?: string;
  supplierVariantId?: string;
  supplierVariantSku?: string;
  supplierOfferId?: string;
  customerSku?: string;
  description: string;
  quantity: number;
  confirmedQuantity?: number;
  backorderedQuantity?: number;
  unitCost?: number | null;
  costCurrency?: string;
  costExcludesVat?: boolean;
  expectedMerchandiseCost?: number | null;
  costCapturedAt?: string;
  costSourceOfferId?: string;
  sellingPriceSnapshot: number;
}

export interface SupplierOrderEvent {
  timestamp: string;
  type: string;
  description: string;
}

export interface MockSubmissionRecord {
  id: string;
  createdAt: string;
  scenario: MockSupplierScenario;
  payloadPreview: unknown;
}

export type SupplierExternalSubmissionStatus =
  | "NOT_PREPARED"
  | "READY"
  | "SUBMITTING"
  | "CREATED"
  | "FAILED"
  | "UNKNOWN_RESULT";

export interface SupplierExternalSubmission {
  mode: "CJ_API";
  status: SupplierExternalSubmissionStatus;
  externalOrderId?: string;
  externalOrderNumber?: string;
  externalStatus?: string;
  externalPaymentStatus?: string;
  paymentUrl?: string;
  submittedAt?: string;
  lastSyncedAt?: string;
  requestFingerprint?: string;
  idempotencyKey?: string;
  externalReference?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  rawResponseFingerprint?: string;
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
}

export interface SupplierOrder {
  id: string;
  customerOrderNumber: string;
  supplierCode: SupplierCode;
  supplierName: string;
  allocationIds: string[];
  itemLines: SupplierOrderLine[];
  status: SupplierOrderStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  orderedAt?: string;
  orderedBy?: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  confirmedAt?: string;
  rejectedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  supersededAt?: string;
  supersededBySupplierOrderId?: string;
  supplierOrderReference?: string;
  externalReference?: string;
  notes?: string;
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  submissionMode: SupplierSubmissionMode;
  fulfilmentMode: SupplierFulfilmentMode;
  mockScenario?: MockSupplierScenario;
  supplierSubtotal?: number | null;
  supplierDeliveryCost?: number | null;
  supplierTotalCost?: number | null;
  mockSubmissions: MockSubmissionRecord[];
  cjOperations?: {
    selectedLogistics?: {
      logisticName: string;
      fromCountryCode: string;
      shippingCost?: number;
      totalCost?: number;
      currency?: string;
      estimatedDelivery?: string;
      selectedAt: string;
      selectedBy: "AUTO" | "STAFF";
      reason: string;
    };
    recipientInfo?: {
      consigneeIdEncrypted?: string;
      consigneeIdMasked?: string;
      savedAt?: string;
      invalidReason?: string;
    };
    attention?: {
      code: "CJ_RECIPIENT_INFORMATION_REQUIRED";
      active: boolean;
      message: string;
      createdAt: string;
      resolvedAt?: string;
    };
  };
  externalSubmission?: SupplierExternalSubmission;
  events: SupplierOrderEvent[];
}

export interface SupplierProductMapping {
  id?: string;
  productId: string;
  supplierCode: SupplierCode;
  supplierSku: string;
  supplierOfferId?: string;
  supplierProductId?: string;
  supplierProductSku?: string;
  supplierVariantId?: string;
  supplierVariantSku?: string;
  status?: "UNMAPPED" | "SUGGESTED" | "VERIFIED" | "REJECTED" | "STALE";
  confidence?: number;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
  matchMethod?: string;
  evidence?: string[];
  verifiedBy?: string;
  verifiedAt?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCatalogueVariant {
  supplierVariantId: string;
  supplierVariantSku?: string;
  supplierProductId?: string;
  supplierProductSku?: string;
  name?: string;
  attributes?: Record<string, string>;
  price?: number;
  currency?: string;
  weight?: number;
  imageUrl?: string;
  stockTotal?: number;
  stockByWarehouse?: {
    warehouseId?: string;
    warehouseName?: string;
    countryCode?: string;
    quantity: number;
  }[];
  rawSourceFingerprint?: string;
}

export interface SupplierCatalogueProduct {
  supplierCode: SupplierCode;
  supplierProductId: string;
  supplierSku?: string;
  supplierProductName: string;
  brand?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  model?: string;
  gtin?: string;
  ean?: string;
  upc?: string;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  imageUrl?: string;
  weight?: number;
  supplierPrice?: number;
  currency?: string;
  tekcentralCategoryGroup?: string;
  tekcentralRelevanceScore?: number;
  stockTotal?: number;
  stockByWarehouse?: {
    warehouseId?: string;
    warehouseName?: string;
    countryCode?: string;
    quantity: number;
  }[];
  variants: SupplierCatalogueVariant[];
  sourceUpdatedAt?: string;
  importedAt: string;
  lastFetchedAt?: string;
  lastSuccessfulRefreshAt?: string;
  rawSourceFingerprint: string;
}

export interface AdminActivityEntry {
  timestamp: string;
  type: string;
  description: string;
}

export interface BackendOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    companyName?: string;
    vatNumber?: string;
    consigneeId?: string;
  };
  deliveryAddress: {
    streetAddress: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  deliveryMethod: {
    id: string;
    name: string;
    description: string;
    estimatedRange: string;
    price: number;
    enabled: boolean;
  };
  paymentMethod: {
    id: "payfast";
    name: "PayFast";
    description: string;
    settlementNote: string;
    enabled: true;
  };
  payment: PaymentRecord;
  items: BackendOrderItem[];
  subtotal: number;
  deliveryAmount: number;
  shippingQuoteSnapshot?: OrderShippingQuoteSnapshot;
  taxAmount: number;
  total: number;
  currency: "ZAR";
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    label: string;
    createdAt: string;
    note?: string;
  }[];
  opsPaymentAcknowledgedAt?: string;
  cancellationReason?: string;
  returns: BackendReturnRequest[];
  refunds: BackendRefund[];
  internalNotes?: InternalNote[];
  supplierAllocations?: SupplierAllocation[];
  shipment?: ShipmentRecord;
  operationalHold?: OperationalHold;
  parcels?: Parcel[];
  shipments?: Shipment[];
}
