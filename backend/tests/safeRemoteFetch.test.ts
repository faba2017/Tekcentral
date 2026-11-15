import assert from "node:assert/strict";
import { isPublicRemoteAddress, safeRemoteFetch } from "../security/safeRemoteFetch.js";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
const publicDns = async () => ["93.184.216.34"];
const response = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, init);

for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "2001:db8::1", "224.0.0.1"]) assert.equal(isPublicRemoteAddress(address), false, `${address} must be blocked`);
assert.equal(isPublicRemoteAddress("93.184.216.34"), true);
assert.equal(isPublicRemoteAddress("2606:4700:4700::1111"), true);

let neverCalls = 0;
const never = async () => { neverCalls += 1; throw new Error("transport must not be called"); };
for (const source of ["https://localhost/image.jpg", "https://127.0.0.1/image.jpg", "https://10.0.0.1/image.jpg", "https://192.168.1.1/image.jpg", "https://169.254.169.254/latest/meta-data", "http://example.com/image.jpg", "file:///etc/passwd", "data:image/png;base64,AA=="]) {
  await assert.rejects(() => safeRemoteFetch(source, { allowedContentTypes: ["image/jpeg"], fetcher: never, maxBytes: 100, resolver: publicDns }), /REMOTE_SOURCE_NOT_ALLOWED|REMOTE_SOURCE_INVALID/);
}
assert.equal(neverCalls, 0, "blocked literal/local sources must fail before transport");
await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", { allowedContentTypes: ["image/jpeg"], fetcher: never, maxBytes: 100, resolver: async () => ["10.0.0.1"] }), /REMOTE_SOURCE_NOT_ALLOWED/);
await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", { allowedContentTypes: ["image/jpeg"], fetcher: never, maxBytes: 100, resolver: async () => ["93.184.216.34", "10.0.0.1"] }), /REMOTE_SOURCE_NOT_ALLOWED/);

let privateRedirectCalled = false;
await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", {
  allowedContentTypes: ["image/jpeg"], maxBytes: 100, resolver: async (host) => host === "private.example" ? ["127.0.0.1"] : ["93.184.216.34"],
  fetcher: async (input) => { if (new URL(input.toString()).hostname === "private.example") privateRedirectCalled = true; return response(null, { status: 302, headers: { location: "https://private.example/image.jpg" } }); },
}), /REMOTE_SOURCE_NOT_ALLOWED/);
assert.equal(privateRedirectCalled, false);

await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", { allowedContentTypes: ["image/jpeg"], fetcher: async () => response(null, { status: 302, headers: { location: "http://public.example/image.jpg" } }), maxBytes: 100, resolver: publicDns }), /REMOTE_SOURCE_NOT_ALLOWED/);
let loopCalls = 0;
await assert.rejects(() => safeRemoteFetch("https://public.example/a", { allowedContentTypes: ["image/jpeg"], fetcher: async (input) => { loopCalls += 1; return response(null, { status: 302, headers: { location: new URL(input.toString()).pathname === "/a" ? "/b" : "/a" } }); }, maxBytes: 100, resolver: publicDns }), /REMOTE_REDIRECT_LIMIT/);
assert.equal(loopCalls, 2);

const valid = await safeRemoteFetch("https://public.example/a", { allowedContentTypes: ["image/jpeg"], fetcher: async (input) => new URL(input.toString()).pathname === "/a" ? response(null, { status: 302, headers: { location: "/b" } }) : response(jpeg, { headers: { "content-type": "image/jpeg" } }), maxBytes: 100, resolver: publicDns });
assert.deepEqual(valid.bytes, jpeg);
assert.equal(valid.redirectCount, 1);
await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", { allowedContentTypes: ["image/jpeg"], fetcher: async () => response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } }), maxBytes: 100, resolver: publicDns }), /REMOTE_CONTENT_TYPE_UNSUPPORTED/);

const oversizedStream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(60)); controller.enqueue(new Uint8Array(60)); controller.close(); } });
await assert.rejects(() => safeRemoteFetch("https://public.example/image.jpg", { allowedContentTypes: ["image/jpeg"], fetcher: async () => response(oversizedStream, { headers: { "content-type": "image/jpeg" } }), maxBytes: 100, resolver: publicDns }), /REMOTE_RESPONSE_TOO_LARGE/);
await assert.rejects(() => safeRemoteFetch("https://ui.com/doc.pdf", { allowedHosts: ["ui.com"], allowedContentTypes: ["application/pdf"], fetcher: async () => response(null, { status: 302, headers: { location: "https://evil.example/doc.pdf" } }), maxBytes: 100, resolver: publicDns }), /REMOTE_SOURCE_NOT_ALLOWED/);

console.log("Safe remote fetch security tests passed.");
