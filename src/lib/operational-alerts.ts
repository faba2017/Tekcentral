export type OperationalSeverity = "CRITICAL" | "WARNING" | "INFO";
export type OperationalAlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type OperationalSubsystem = "PAYMENTS" | "CHECKOUT" | "SHIPPING" | "SUPPLIERS" | "PRICING" | "EMAIL" | "ZEUS" | "ACCOUNTS" | "SYSTEM";
export interface OperationalAlert { id: string; type: string; severity: Exclude<OperationalSeverity, "INFO">; subsystem: OperationalSubsystem; title: string; summary: string; status: OperationalAlertStatus; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; customerImpactCount: number; entityType?: string; entityId?: string; targetRoute: string; recommendedAction: string; diagnosticCode: string; acknowledgedAt?: string; resolvedAt?: string; }
export interface OperationalEvent { id: string; timestamp: string; severity: OperationalSeverity; subsystem: OperationalSubsystem; eventType: string; summary: string; entityType?: string; entityId?: string; diagnosticCode: string; }
export interface OperationalAlertSummary { critical: number; warning: number; alerts: OperationalAlert[]; }
