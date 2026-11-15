import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAdminAiAccess, assertAdminAiAccess } from "../aiAccessControl.js";
import { loadPersistenceConfig } from "../persistence/config.js";
import { mutateOperationalState, readOperationalState } from "../persistence/operationalState.js";
import type { StaffAuthorizationContext } from "../staffAuthorization.js";
import type { StaffPermission, StaffRoleId } from "../staffRbac.js";
import type { AdminAiService } from "./service.js";

export const ADMIN_AI_TUTOR_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
export type AdminAiTutorStatus = (typeof ADMIN_AI_TUTOR_STATUSES)[number];
export type AdminAiTutorAction = "START" | "PROGRESS" | "COMPLETE" | "SKIP" | "RESTART";

export interface AdminAiTutorPreference {
  version: 1;
  status: AdminAiTutorStatus;
  currentTopicId?: string;
  startedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  updatedAt?: string;
}

export interface AdminAiTutorTopic {
  id: string;
  label: string;
  description: string;
  route?: string;
  requiredAnyPermission?: StaffPermission[];
  routeOptions?: readonly { permission: StaffPermission; route: string }[];
  kind: "WELCOME" | "AREA" | "AI" | "FINISH";
}

const TOPICS: readonly AdminAiTutorTopic[] = [
  { id: "welcome", label: "Welcome to TekCentral Ops", description: "See how your role and current access shape this workspace.", kind: "WELCOME" },
  { id: "dashboard", label: "Dashboard", description: "Review the operational overview and current priorities.", requiredAnyPermission: ["dashboard.read"], routeOptions: [{ permission: "dashboard.read", route: "/admin" }], kind: "AREA" },
  { id: "commerce", label: "Orders and customer operations", description: "Review the customer, order, returns and contact workflows available to you.", requiredAnyPermission: ["orders.read", "returns.read", "customers.read", "contact.read"], routeOptions: [{ permission: "orders.read", route: "/admin/orders" }, { permission: "returns.read", route: "/admin/returns" }, { permission: "customers.read", route: "/admin/customers" }, { permission: "contact.read", route: "/admin/contact" }], kind: "AREA" },
  { id: "catalogue", label: "Products and catalogue", description: "Work with canonical Products, taxonomy, media and merchandising where permitted.", requiredAnyPermission: ["products.read", "merchandising.read"], routeOptions: [{ permission: "products.read", route: "/admin/products" }, { permission: "merchandising.read", route: "/admin/merchandising" }], kind: "AREA" },
  { id: "pricing", label: "Pricing and finance", description: "Review pricing, payment and financial reporting areas included in your access.", requiredAnyPermission: ["pricing.read", "payments.read", "reports.revenue", "reports.profitability"], routeOptions: [{ permission: "pricing.read", route: "/admin/pricing" }, { permission: "payments.read", route: "/admin/settings/payments" }, { permission: "reports.revenue", route: "/admin/reports" }, { permission: "reports.profitability", route: "/admin/reports" }], kind: "AREA" },
  { id: "supply", label: "Suppliers and fulfilment", description: "Review supplier, supplier-order, inventory and shipping operations available to you.", requiredAnyPermission: ["suppliers.read", "supplier_orders.read", "inventory.read", "shipping.read"], routeOptions: [{ permission: "suppliers.read", route: "/admin/suppliers" }, { permission: "supplier_orders.read", route: "/admin/supplier-orders" }, { permission: "shipping.read", route: "/admin/shipping" }], kind: "AREA" },
  { id: "insights", label: "Reports and operational oversight", description: "Use permitted reports, alerts and audit views to understand platform activity.", requiredAnyPermission: ["reports.sales", "reports.orders", "reports.products", "reports.suppliers", "reports.fulfilment", "reports.returns", "reports.payments", "reports.shipping", "reports.zeus", "reports.analytics", "alerts.read", "audit.read"], routeOptions: [{ permission: "reports.sales", route: "/admin/reports" }, { permission: "reports.analytics", route: "/admin/reports/analytics" }, { permission: "reports.zeus", route: "/admin/reports/zeus" }, { permission: "alerts.read", route: "/admin/alerts" }, { permission: "audit.read", route: "/admin/audit" }], kind: "AREA" },
  { id: "administration", label: "Settings and staff administration", description: "Manage the settings, staff and permission areas explicitly granted to you.", requiredAnyPermission: ["settings.general", "settings.business_identity", "settings.payments", "settings.shipping", "settings.suppliers", "settings.email", "settings.zeus", "settings.security", "staff.read", "roles.read"], routeOptions: [{ permission: "settings.general", route: "/admin/settings" }, { permission: "settings.payments", route: "/admin/settings/payments" }, { permission: "settings.shipping", route: "/admin/settings/shipping" }, { permission: "settings.suppliers", route: "/admin/settings/suppliers" }, { permission: "settings.zeus", route: "/admin/settings/ai-assistant" }, { permission: "staff.read", route: "/admin/staff" }], kind: "AREA" },
  { id: "admin-ai", label: "How Admin AI can help", description: "Admin AI currently provides orientation and concise explanations from trusted supplied context. It cannot change Products, pricing, orders, suppliers or any business state.", kind: "AI" },
  { id: "finish", label: "You are ready", description: "You can restart this tour at any time from Help in the Admin header.", kind: "FINISH" },
] as const;

type PreferenceStore = { version: 1; staff: Record<string, AdminAiTutorPreference> };
const emptyPreference = (): AdminAiTutorPreference => ({ version: 1, status: "NOT_STARTED" });
const emptyStore = (): PreferenceStore => ({ version: 1, staff: {} });
let filePathOverride: string | undefined;
let fileQueue = Promise.resolve();
const filePath = () => filePathOverride ?? resolve(process.cwd(), ".data", "admin-ai-tutor.json");
export const setAdminAiTutorStorePathForTests = (value?: string) => { filePathOverride = value; };

async function readFileStore() {
  try { const value = JSON.parse(await readFile(filePath(), "utf8")) as PreferenceStore; return value.version === 1 && value.staff && typeof value.staff === "object" ? value : emptyStore(); }
  catch { return emptyStore(); }
}
async function mutateFileStore<T>(operation: (store: PreferenceStore) => T | Promise<T>) {
  let result!: T;
  const run = fileQueue.catch(() => undefined).then(async () => { const store = await readFileStore(); result = await operation(store); const target = filePath(); const temporary = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temporary, JSON.stringify(store, null, 2)); await rename(temporary, target); });
  fileQueue = run.catch(() => undefined); await run; return result;
}
async function readPreference(staffId: string) {
  if (!filePathOverride && loadPersistenceConfig().provider === "POSTGRES") return (await readOperationalState<AdminAiTutorPreference>("staff-preferences", `admin-ai-tutor:${staffId}`, emptyPreference()));
  return (await readFileStore()).staff[staffId] ?? emptyPreference();
}
async function mutatePreference<T>(staffId: string, operation: (preference: AdminAiTutorPreference) => T | Promise<T>) {
  if (!filePathOverride && loadPersistenceConfig().provider === "POSTGRES") return mutateOperationalState("staff-preferences", `admin-ai-tutor:${staffId}`, emptyPreference(), operation);
  return mutateFileStore((store) => { const preference = store.staff[staffId] ?? emptyPreference(); store.staff[staffId] = preference; return operation(preference); });
}

export function permittedAdminAiTutorTopics(permissions: ReadonlySet<StaffPermission>) {
  return TOPICS.filter((topic) => !topic.requiredAnyPermission || topic.requiredAnyPermission.some((permission) => permissions.has(permission))).map(({ routeOptions, ...topic }) => ({ ...topic, route: routeOptions?.find((option) => permissions.has(option.permission))?.route }));
}

const safeCurrentTopic = (preference: AdminAiTutorPreference, topics: readonly AdminAiTutorTopic[]) => topics.some((topic) => topic.id === preference.currentTopicId) ? preference.currentTopicId : topics[0]?.id;
const staffId = (context: StaffAuthorizationContext) => { if (!context.actorId) throw Object.assign(new Error("Authenticated staff identity is required."), { code: "AUTHENTICATION_REQUIRED", status: 401 }); return context.actorId; };
export async function getAdminAiTutorContext(context: StaffAuthorizationContext, environment = process.env) {
  const access = await getAdminAiAccess(context, environment);
  const preference = await readPreference(staffId(context));
  const topics = permittedAdminAiTutorTopics(context.permissions);
  const currentTopicId = safeCurrentTopic(preference, topics);
  return {
    access,
    role: context.role,
    roleLabel: roleLabel(context.role),
    preference: { ...preference, currentTopicId },
    topics,
    invitation: access.effective && preference.status === "NOT_STARTED",
  };
}

export async function updateAdminAiTutorPreference(context: StaffAuthorizationContext, input: { action: AdminAiTutorAction; topicId?: string }, now = new Date()) {
  const topics = permittedAdminAiTutorTopics(context.permissions);
  const allowedIds = new Set(topics.map((topic) => topic.id));
  if (input.topicId && !allowedIds.has(input.topicId)) throw Object.assign(new Error("This tour topic is not available."), { code: "TUTOR_TOPIC_NOT_AVAILABLE", status: 403 });
  return mutatePreference(staffId(context), (preference) => {
    const timestamp = now.toISOString();
    if (input.action === "START" && preference.status !== "NOT_STARTED") throw invalidTransition();
    if (input.action === "PROGRESS" && preference.status !== "IN_PROGRESS") throw invalidTransition();
    if (input.action === "COMPLETE" && preference.status !== "IN_PROGRESS") throw invalidTransition();
    if (input.action === "SKIP" && !["NOT_STARTED", "IN_PROGRESS"].includes(preference.status)) throw invalidTransition();
    if (input.action === "START" || input.action === "RESTART") { preference.status = "IN_PROGRESS"; preference.currentTopicId = input.topicId ?? topics[0]?.id; preference.startedAt = timestamp; preference.completedAt = undefined; preference.skippedAt = undefined; }
    else if (input.action === "PROGRESS") preference.currentTopicId = input.topicId ?? safeCurrentTopic(preference, topics);
    else if (input.action === "COMPLETE") { preference.status = "COMPLETED"; preference.currentTopicId = "finish"; preference.completedAt = timestamp; preference.skippedAt = undefined; }
    else if (input.action === "SKIP") { preference.status = "SKIPPED"; preference.skippedAt = timestamp; }
    preference.updatedAt = timestamp;
    return { ...preference, currentTopicId: safeCurrentTopic(preference, topics) };
  });
}

function invalidTransition() { return Object.assign(new Error("This tour state change is not available."), { code: "INVALID_TUTOR_TRANSITION", status: 409 }); }
function roleLabel(role?: StaffRoleId) { return role ? ({ SUPER_ADMIN: "Super Admin", OPERATIONS: "Operations", SUPPORT: "Sales & Customer Support", CATALOGUE: "Catalogue, Pricing & Merchandising", FINANCE: "Finance & Accounts", AUDITOR: "Auditor / Read Only" } as const)[role] : "Staff"; }

export async function explainAdminAiTutorTopic(input: { context: StaffAuthorizationContext; topicId: string; service: AdminAiService; environment?: NodeJS.ProcessEnv; resolveAccess?: typeof getAdminAiAccess }) {
  const topic = permittedAdminAiTutorTopics(input.context.permissions).find((item) => item.id === input.topicId);
  if (!topic) throw Object.assign(new Error("This tour topic is not available."), { code: "TUTOR_TOPIC_NOT_AVAILABLE", status: 403 });
  return assertAdminAiAccess(input.context, () => input.service.generate({
    callerFeature: "admin-ai-tutor",
    modelRole: "ROUTINE",
    messages: [{ role: "user", content: "Give a concise orientation for this permitted Admin area in no more than three short sentences." }],
    contextBlocks: [
      { label: "Staff context", content: `Role label: ${roleLabel(input.context.role)}. Effective permissions relevant to this topic: ${(topic.requiredAnyPermission ?? []).filter((permission) => input.context.permissions.has(permission)).join(", ") || "admin_ai.use only"}.` },
      { label: "Allowed topic", content: `${topic.label}\n${topic.description}\nRoute: ${topic.route ?? "No route"}` },
      { label: "Tutor boundary", content: "Explain only the supplied allowed topic. Do not claim access to unsupplied areas. Do not claim that Admin AI can mutate business state, use tools, access databases, or perform automation." },
    ],
    maxOutputTokens: 220,
    temperature: 0.1,
  }), input.environment ?? process.env, input.resolveAccess ?? getAdminAiAccess);
}
