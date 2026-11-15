import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { listOrders } from "./orderRepository.js";
import { listPublicProducts } from "./productPublicationRepository.js";
import { getActiveCartSummary } from "./cartService.js";
import { zeusUsageGuard } from "./zeus/usageGuard.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query, withTransaction } from "./persistence/postgres.js";

export const analyticsDefinitions = {
  activeVisitorMinutes: 5,
  sessionTimeoutMinutes: 30,
  detailedRetentionDays: 30,
  aggregateRetentionDays: 400,
  conversionFormula: "Orders placed / storefront sessions",
} as const;

export type StorefrontAnalyticsEventType = "HEARTBEAT" | "PAGE_VIEW" | "PRODUCT_VIEW" | "SEARCH" | "CHECKOUT_START";
type SafeActivityType = StorefrontAnalyticsEventType | "ADD_TO_CART";
interface SessionRecord { sessionId: string; startedAt: string; lastSeenAt: string; authenticated: boolean; entryPath: string; currentPath: string; pageViewCount: number }
interface ActivityRecord { id: string; type: SafeActivityType; occurredAt: string; audience: "Guest" | "Authenticated"; label: string }
interface DailyRecord { date: string; sessions: number; guestSessions: number; authenticatedSessions: number; pageViews: number; productViews: number; checkoutStarts: number; cartAdditions: number; pages: Record<string, number>; products: Record<string, number>; categories: Record<string, number>; searches: Record<string, { count: number; noResults: number }> }
interface Store { version: 1; sessions: Record<string, SessionRecord>; days: Record<string, DailyRecord>; recent: ActivityRecord[]; dedupe: Record<string, string> }
export interface BrowserAnalyticsInput { eventId: string; type: StorefrontAnalyticsEventType; path?: string; productId?: string; category?: string; searchTerm?: string; resultCount?: number }
export class StorefrontAnalyticsError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

let storePath = resolve(process.cwd(), ".data", "storefront-analytics.json");
let queue = Promise.resolve();
let nowProvider = () => new Date();
let productSource: typeof listPublicProducts = listPublicProducts;
let orderSource: typeof listOrders = listOrders;
let cartSummarySource: typeof getActiveCartSummary = getActiveCartSummary;
let zeusAnalyticsSource = (days: number) => zeusUsageGuard.analytics(days);
const empty = (): Store => ({ version: 1, sessions: {}, days: {}, recent: [], dedupe: {} });
const dayKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const newDay = (date: string): DailyRecord => ({ date, sessions: 0, guestSessions: 0, authenticatedSessions: 0, pageViews: 0, productViews: 0, checkoutStarts: 0, cartAdditions: 0, pages: {}, products: {}, categories: {}, searches: {} });
async function read(): Promise<Store> {if(loadPersistenceConfig().provider==="POSTGRES")return(await query<{payload:Store}>("SELECT payload FROM operational_state WHERE namespace='analytics' AND key='storefront'")).rows[0]?.payload??empty();try { const parsed = JSON.parse(await readFile(storePath, "utf8")) as Store; return parsed?.version === 1 ? parsed : empty(); } catch { return empty(); } }
const prune=(store:Store)=>{const now=nowProvider().getTime();const detailCutoff=now-analyticsDefinitions.detailedRetentionDays*86_400_000;const aggregateCutoff=dayKey(new Date(now-analyticsDefinitions.aggregateRetentionDays*86_400_000));store.sessions=Object.fromEntries(Object.entries(store.sessions).filter(([,item])=>Date.parse(item.lastSeenAt)>=detailCutoff));store.recent=store.recent.filter(item=>Date.parse(item.occurredAt)>=detailCutoff).slice(-2_000);store.dedupe=Object.fromEntries(Object.entries(store.dedupe).filter(([,occurredAt])=>Date.parse(occurredAt)>=now-86_400_000));store.days=Object.fromEntries(Object.entries(store.days).filter(([date])=>date>=aggregateCutoff));};
async function mutate<T>(operation: (store: Store) => Promise<T> | T) {if(loadPersistenceConfig().provider==="POSTGRES")return withTransaction(async client=>{await client.query("SELECT pg_advisory_xact_lock($1)",[9_110_003]);const store=(await client.query<{payload:Store}>("SELECT payload FROM operational_state WHERE namespace='analytics' AND key='storefront'")).rows[0]?.payload??empty();prune(store);const result=await operation(store);await client.query("INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES('analytics','storefront',1,$1::jsonb,now()) ON CONFLICT(namespace,key) DO UPDATE SET version=operational_state.version+1,payload=excluded.payload,updated_at=excluded.updated_at",[JSON.stringify(store)]);return result;});let result!: T; const run = queue.catch(() => undefined).then(async () => { const store = await read(); prune(store); result = await operation(store); await mkdir(dirname(storePath), { recursive: true }); await writeFile(storePath, JSON.stringify(store, null, 2)); }); queue = run.catch(() => undefined); await run; return result; }
const normalizePath = (value?: string) => { if (!value) return "/"; const pathname = value.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/"); if (!pathname.startsWith("/") || pathname.startsWith("/admin") || pathname.startsWith("/api")) throw new StorefrontAnalyticsError("INVALID_ANALYTICS_PATH", "Analytics path is not eligible for collection."); if (pathname.startsWith("/product/")) return "/product/:slug"; if (pathname.startsWith("/shop/")) return "/shop/:category"; if (pathname.startsWith("/order/")) return "/order/:reference"; return pathname.slice(0, 120); };
const normalizeSearch = (value?: string) => value?.trim().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s+._-]/gu, "").slice(0, 80).toLowerCase() || undefined;
const bump = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };
const activityLabel = (type: SafeActivityType, path: string, productName?: string) => type === "PRODUCT_VIEW" ? `Viewed ${productName ?? "a Product"}` : type === "ADD_TO_CART" ? "Added a Product to cart" : type === "CHECKOUT_START" ? "Started checkout" : type === "SEARCH" ? "Searched the catalogue" : type === "PAGE_VIEW" ? `Viewed ${path}` : "Active on the storefront";

export async function recordBrowserAnalytics(sessionId: string, authenticated: boolean, input: BrowserAnalyticsInput) {
  if (!input || !["HEARTBEAT", "PAGE_VIEW", "PRODUCT_VIEW", "SEARCH", "CHECKOUT_START"].includes(input.type) || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.eventId)) throw new StorefrontAnalyticsError("INVALID_ANALYTICS_EVENT", "Analytics event is invalid.");
  const path = normalizePath(input.path); const now = nowProvider(); const occurredAt = now.toISOString();
  let productName: string | undefined;
  if (input.type === "PRODUCT_VIEW") { const product = (await productSource()).find((item) => item.id === input.productId); if (!product) throw new StorefrontAnalyticsError("INVALID_ANALYTICS_PRODUCT", "Product is not available in the public catalogue."); productName = product.name; }
  return mutate((store) => {
    if (store.dedupe[input.eventId]) return { accepted: true, deduplicated: true };
    store.dedupe[input.eventId] = occurredAt;
    const prior = store.sessions[sessionId]; const expired = !prior || Date.parse(prior.lastSeenAt) < now.getTime() - analyticsDefinitions.sessionTimeoutMinutes * 60_000;
    const session = expired ? { sessionId, startedAt: occurredAt, lastSeenAt: occurredAt, authenticated, entryPath: path, currentPath: path, pageViewCount: 0 } : prior;
    const day = store.days[dayKey(now)] ?? newDay(dayKey(now));
    if (expired) { day.sessions += 1; day[authenticated ? "authenticatedSessions" : "guestSessions"] += 1; }
    session.lastSeenAt = occurredAt; session.currentPath = path; session.authenticated ||= authenticated;
    if (input.type === "PAGE_VIEW" || input.type === "PRODUCT_VIEW") { session.pageViewCount += 1; day.pageViews += 1; bump(day.pages, path); }
    if (input.type === "PRODUCT_VIEW" && input.productId) { day.productViews += 1; bump(day.products, input.productId); }
    if (input.category) bump(day.categories, input.category.slice(0, 80));
    if (input.type === "CHECKOUT_START") day.checkoutStarts += 1;
    if (input.type === "SEARCH") { const term = normalizeSearch(input.searchTerm); if (term) { const row = day.searches[term] ?? { count: 0, noResults: 0 }; row.count += 1; if (input.resultCount === 0) row.noResults += 1; day.searches[term] = row; } }
    store.sessions[sessionId] = session; store.days[day.date] = day;
    store.recent.push({ id: randomUUID(), type: input.type, occurredAt, audience: authenticated ? "Authenticated" : "Guest", label: activityLabel(input.type, path, productName) });
    return { accepted: true, deduplicated: false };
  });
}

export async function recordCartAddition(owner: string) { const now = nowProvider(); const occurredAt = now.toISOString(); await mutate((store) => { const day = store.days[dayKey(now)] ?? newDay(dayKey(now)); day.cartAdditions += 1; store.days[day.date] = day; store.recent.push({ id: randomUUID(), type: "ADD_TO_CART", occurredAt, audience: owner.startsWith("customer:") ? "Authenticated" : "Guest", label: "Added a Product to cart" }); }); }

export async function getStorefrontAnalytics(rangeDays: 1 | 7 | 30 = 30) {
  const store = await read(); const now = nowProvider().getTime(); const from = dayKey(new Date(now - (rangeDays - 1) * 86_400_000)); const days = Object.values(store.days).filter((item) => item.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = days.reduce((sum, item) => sum + item.sessions, 0); const orders = (await orderSource()).filter((item) => dayKey(new Date(item.createdAt)) >= from); const paid = orders.filter((item) => item.payment.status === "PAID" && item.status !== "CANCELLED");
  const products = await productSource(); const productById = new Map(products.map((item) => [item.id, item])); const activeCutoff = now - analyticsDefinitions.activeVisitorMinutes * 60_000;
  const activeVisitors = Object.values(store.sessions).filter((item) => Date.parse(item.lastSeenAt) >= activeCutoff); const carts = await cartSummarySource(); const zeus = await zeusAnalyticsSource(rangeDays);
  const sum = (key: keyof Pick<DailyRecord, "pageViews" | "productViews" | "checkoutStarts" | "cartAdditions">) => days.reduce((total, item) => total + item[key], 0);
  const combineNumberMap = (key: "pages" | "products" | "categories") => { const result: Record<string, number> = {}; days.forEach((day) => Object.entries(day[key]).forEach(([name, value]) => { result[name] = (result[name] ?? 0) + value; })); return result; };
  const pageMap = combineNumberMap("pages"), productMap = combineNumberMap("products"), categoryMap = combineNumberMap("categories"); const searchMap: Record<string, { count: number; noResults: number }> = {}; days.forEach((day) => Object.entries(day.searches).forEach(([term, row]) => { const result = searchMap[term] ?? { count: 0, noResults: 0 }; result.count += row.count; result.noResults += row.noResults; searchMap[term] = result; }));
  const availability = products.reduce<Record<string, number>>((all, item) => ({ ...all, [item.availability.state]: (all[item.availability.state] ?? 0) + 1 }), {});
  return { definitions: analyticsDefinitions, rangeDays, kpis: { visitorsOnline: activeVisitors.length, sessions, productViews: sum("productViews"), activeCarts: carts.total, checkoutStarts: sum("checkoutStarts"), orders: orders.length, paidOrders: paid.length, paidRevenue: paid.reduce((total, item) => total + item.total, 0), conversionRate: sessions ? orders.length / sessions * 100 : 0, zeusRequests: zeus.requests }, audience: { guestSessions: days.reduce((sum, item) => sum + item.guestSessions, 0), authenticatedSessions: days.reduce((sum, item) => sum + item.authenticatedSessions, 0), activeGuestCarts: carts.guest, activeAuthenticatedCarts: carts.authenticated }, trend: days.map((item) => ({ date: item.date, sessions: item.sessions, pageViews: item.pageViews, productViews: item.productViews, cartAdditions: item.cartAdditions, checkoutStarts: item.checkoutStarts })), funnel: { productViews: sum("productViews"), cartAdditions: sum("cartAdditions"), activeCarts: carts.total, checkoutStarts: sum("checkoutStarts"), ordersPlaced: orders.length, paidOrders: paid.length }, popularPages: Object.entries(pageMap).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([path, views]) => ({ path, views })), popularProducts: Object.entries(productMap).sort((a, b) => b[1] - a[1]).slice(0, 20).flatMap(([id, views]) => { const product = productById.get(id); return product ? [{ id, name: product.name, image: product.images[0], price: product.price, views }] : []; }), popularCategories: Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([category, views]) => ({ category, views })), searches: Object.entries(searchMap).sort((a, b) => b[1].count - a[1].count).slice(0, 20).map(([term, row]) => ({ term, ...row })), recentActivity: store.recent.slice(-30).reverse(), availability: { published: products.length, purchasable: products.filter((item) => item.availability.purchasable).length, states: availability }, zeus };
}

export function newAnalyticsSessionId() { return randomUUID().replace(/-/g, ""); }
export function setStorefrontAnalyticsPathForTests(path: string) { storePath = path; queue = Promise.resolve(); }
export function setStorefrontAnalyticsSourcesForTests(input?: { now?: () => Date; products?: typeof listPublicProducts; orders?: typeof listOrders; carts?: typeof getActiveCartSummary; zeus?: (days: number) => ReturnType<typeof zeusUsageGuard.analytics> }) { nowProvider = input?.now ?? (() => new Date()); productSource = input?.products ?? listPublicProducts; orderSource = input?.orders ?? listOrders; cartSummarySource = input?.carts ?? getActiveCartSummary; zeusAnalyticsSource = input?.zeus ?? ((days) => zeusUsageGuard.analytics(days)); }
