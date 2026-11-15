import assert from "node:assert/strict";
import { fetchPublicScoopProductPage, inspectScoopProductUrl, normalizeScoopProductUrl } from "../suppliers/scoop/scoopUrlReconciliation.js";

assert.equal(normalizeScoopProductUrl("https://www.scoop.co.za/test?utm_source=test#details"), "https://scoop.co.za/test");
assert.equal(inspectScoopProductUrl("https://scoop.co.za/customer/account/?sid=secret").diagnostic, "AUTHENTICATED_URL_SUSPECTED");
assert.equal(inspectScoopProductUrl("http://127.0.0.1/product").diagnostic, "UNSUPPORTED_SCOOP_URL");

let safeFetchCalls = 0;
const safeFetch = await fetchPublicScoopProductPage({ url: "https://scoop.co.za/test.html", fetchImpl: async () => { safeFetchCalls += 1; return new Response("<p>SKU: TEST</p>", { status: 200, headers: { "Content-Type": "text/html" } }); } });
assert.equal(safeFetch.diagnostic, "URL_RESOLVED");
assert.equal(safeFetchCalls, 1);

const blockedRedirect = await fetchPublicScoopProductPage({ url: "https://scoop.co.za/test.html", fetchImpl: async () => new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }) });
assert.equal(blockedRedirect.diagnostic, "FETCH_BLOCKED");
const loginRedirect = await fetchPublicScoopProductPage({ url: "https://scoop.co.za/test.html", fetchImpl: async () => new Response(null, { status: 302, headers: { Location: "https://scoop.co.za/customer/account/login" } }) });
assert.equal(loginRedirect.diagnostic, "AUTHENTICATED_URL_SUSPECTED");

console.log("Scoop workflow tests passed.");
