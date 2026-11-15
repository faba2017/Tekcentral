import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { proxyDiagnostic } from "../proxyDiagnostics.js";

const request = { socket: { remoteAddress: "10.0.0.2" }, headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.2", "x-forwarded-proto": "https", host: "api-staging.tekcentral.co.za", cookie: "must-not-log", authorization: "must-not-log" } } as unknown as IncomingMessage;
assert.equal(proxyDiagnostic(request, {}), undefined);
const diagnostic = proxyDiagnostic(request, { TRUSTED_PROXY_DIAGNOSTICS: "true" });
assert.deepEqual(diagnostic, { event: "TRUSTED_PROXY_DIAGNOSTIC", remoteAddress: "10.0.0.2", forwardedFor: "203.0.113.4, 10.0.0.2", forwardedProto: "https", host: "api-staging.tekcentral.co.za" });
assert.equal(JSON.stringify(diagnostic).includes("must-not-log"), false);
console.log("Trusted proxy diagnostic tests passed.");
