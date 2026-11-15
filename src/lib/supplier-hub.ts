import type { SupplierRegistryEntry } from "@/lib/supplier-registry";

export interface SupplierSyncRecord { type: string; startedAt?: string; completedAt: string; status: string; recordsProcessed?: number; expectedCount?: number; parsedCount?: number; createdCount?: number; updatedCount?: number; missingCount?: number; warningCount?: number; errors?: number; source: string; }
export interface SupplierOperations {
  supplier: { id: "TEKCENTRAL" | "CJ" | "SCOOP" | "SYNTECH" | "MUSTEK" | "TVR"; displayName: string; description?: string; enabled: boolean; supportedOrderModes: string[]; defaultOrderMode: string; capabilities: SupplierRegistryEntry["capabilitiesV2"]; adapterAvailable: boolean; configurationSource?: string };
  configurationStatus: string;
  connectionStatus: string;
  healthStatus: string;
  catalogue: { productCount: number; availableCount?: number; staleCount?: number; lastSyncAt?: string };
  mappings: { total: number; verified: number; reviewRequired: number };
  orders: { total: number; attention: number };
  manualOffers?: { total: number; active: number; inactive: number; mapped: number; unitsOnHand: number; staleStock: number; staleCost: number };
  syncHistory: SupplierSyncRecord[];
  syntechSync?: { configured: boolean; syncInProgress: boolean; canRunFullSync: boolean; blockReason?: "NOT_CONFIGURED" | "SYNC_IN_PROGRESS" | "RATE_LIMITED" | "ACCOUNT_BLOCKED"; requestBudget: { limit: number; used: number; remaining: number; rateLimitedUntil?: string; accountBlocked: boolean } };
  syntechProcurement?: {
    deployment: { enabled: boolean; environment: string; configured: boolean; productionOperational: boolean };
    operational: { enabled: boolean; revision: number; updatedAt?: string; updatedBy?: string };
    effectiveEnabled: boolean;
    blockedBy?: "DEPLOYMENT_DISABLED" | "OPERATIONALLY_DISABLED" | "CONFIGURATION_INCOMPLETE" | "ENVIRONMENT_NOT_APPROVED";
    manualFallbackEnabled: boolean;
    lastAttempt?: { at: string; status?: string; code?: string };
  };
  lastError?: string;
}
export interface SupplierHubResponse { suppliers: SupplierOperations[]; }
