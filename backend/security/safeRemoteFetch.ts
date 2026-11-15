import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type RemoteFetchErrorCode =
  | "REMOTE_SOURCE_INVALID"
  | "REMOTE_SOURCE_NOT_ALLOWED"
  | "REMOTE_SOURCE_UNAVAILABLE"
  | "REMOTE_REDIRECT_INVALID"
  | "REMOTE_REDIRECT_LIMIT"
  | "REMOTE_CONTENT_TYPE_UNSUPPORTED"
  | "REMOTE_RESPONSE_TOO_LARGE"
  | "REMOTE_RESPONSE_TIMEOUT";

export class SafeRemoteFetchError extends Error {
  constructor(public readonly code: RemoteFetchErrorCode) { super(code); }
}

export interface SafeRemoteFetchResult {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  headers: Headers;
  redirectCount: number;
  status: number;
}

type Resolver = (hostname: string) => Promise<string[]>;
type TestFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SafeRemoteFetchOptions {
  allowedHosts?: readonly string[];
  allowedContentTypes: readonly string[];
  fetcher?: TestFetcher;
  headers?: Record<string, string>;
  maxBytes: number;
  maxRedirects?: number;
  resolver?: Resolver;
  timeoutMs?: number;
  validateUrl?: (url: URL) => boolean;
}

const ipv4Number = (value: string) => value.split(".").reduce((result, part) => (result << 8) + Number(part), 0) >>> 0;
const inV4 = (value: number, network: string, bits: number) => bits === 0 || (value >>> (32 - bits)) === (ipv4Number(network) >>> (32 - bits));

export function isPublicRemoteAddress(input: string) {
  let value = input.toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:")) value = value.slice(7);
  const family = isIP(value);
  if (family === 4) {
    const address = ipv4Number(value);
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([network, bits]) => inV4(address, network, bits));
  }
  if (family === 6) {
    // Only globally routable unicast is accepted. This excludes unspecified,
    // loopback, ULA, link-local, multicast and documentation ranges.
    if (!value.match(/^[23][0-9a-f]{3}:/)) return false;
    if (value.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

const defaultResolver: Resolver = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((item) => item.address);

function allowedHost(hostname: string, hosts?: readonly string[]) {
  if (!hosts?.length) return true;
  const value = hostname.toLowerCase();
  return hosts.some((host) => value === host.toLowerCase() || value.endsWith(`.${host.toLowerCase()}`));
}

async function validateUrl(value: string | URL, options: SafeRemoteFetchOptions) {
  let url: URL;
  try { url = new URL(value); } catch { throw new SafeRemoteFetchError("REMOTE_SOURCE_INVALID"); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHost(hostname, options.allowedHosts) || (options.validateUrl && !options.validateUrl(url))) throw new SafeRemoteFetchError("REMOTE_SOURCE_NOT_ALLOWED");
  if (["localhost", "localhost.localdomain"].includes(hostname.toLowerCase())) throw new SafeRemoteFetchError("REMOTE_SOURCE_NOT_ALLOWED");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [hostname] : await (options.resolver ?? defaultResolver)(hostname).catch(() => []);
  if (!addresses.length || addresses.some((address) => !isPublicRemoteAddress(address))) throw new SafeRemoteFetchError("REMOTE_SOURCE_NOT_ALLOWED");
  return { url, addresses };
}

async function readResponse(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new SafeRemoteFetchError("REMOTE_RESPONSE_TOO_LARGE");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.length;
      if (total > maxBytes) throw new SafeRemoteFetchError("REMOTE_RESPONSE_TOO_LARGE");
      chunks.push(item.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function pinnedRequest(url: URL, addresses: string[], options: SafeRemoteFetchOptions) {
  return new Promise<{ status: number; headers: Headers; bytes: Uint8Array }>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(overallTimer); callback(); };
    const request = httpsRequest(url, {
      headers: options.headers,
      lookup: (_hostname, _lookupOptions, callback) => callback(null, addresses[0], isIP(addresses[0]) as 4 | 6),
      servername: url.hostname.replace(/^\[|\]$/g, ""),
    }, (response) => {
      const headers = new Headers();
      for (const [name, raw] of Object.entries(response.headers)) if (raw !== undefined) headers.set(name, Array.isArray(raw) ? raw.join(", ") : raw);
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) { response.destroy(); finish(() => resolve({ status: response.statusCode ?? 0, headers, bytes: new Uint8Array() })); return; }
      const declared = Number(headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > options.maxBytes) { response.destroy(); finish(() => reject(new SafeRemoteFetchError("REMOTE_RESPONSE_TOO_LARGE"))); return; }
      const chunks: Buffer[] = []; let total = 0;
      response.on("data", (chunk: Buffer) => { total += chunk.length; if (total > options.maxBytes) { response.destroy(new SafeRemoteFetchError("REMOTE_RESPONSE_TOO_LARGE")); return; } chunks.push(chunk); });
      response.on("end", () => finish(() => resolve({ status: response.statusCode ?? 0, headers, bytes: new Uint8Array(Buffer.concat(chunks)) })));
      response.on("error", (error) => finish(() => reject(error)));
    });
    const overallTimer = setTimeout(() => request.destroy(new SafeRemoteFetchError("REMOTE_RESPONSE_TIMEOUT")), options.timeoutMs ?? 15_000);
    request.setTimeout(options.timeoutMs ?? 15_000, () => request.destroy(new SafeRemoteFetchError("REMOTE_RESPONSE_TIMEOUT")));
    request.on("error", (error) => finish(() => reject(error)));
    request.end();
  });
}

export async function safeRemoteFetch(source: string, options: SafeRemoteFetchOptions): Promise<SafeRemoteFetchResult> {
  const maxRedirects = options.maxRedirects ?? 4;
  const visited = new Set<string>();
  let current = source;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validated = await validateUrl(current, options);
    if (visited.has(validated.url.href)) throw new SafeRemoteFetchError("REMOTE_REDIRECT_LIMIT");
    visited.add(validated.url.href);
    let result: { status: number; headers: Headers; bytes: Uint8Array };
    try {
      if (options.fetcher) {
        const response = await options.fetcher(validated.url, { redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? 15_000), headers: options.headers });
        result = { status: response.status, headers: response.headers, bytes: await readResponse(response, options.maxBytes) };
      } else result = await pinnedRequest(validated.url, validated.addresses, options);
    } catch (error) {
      if (error instanceof SafeRemoteFetchError) throw error;
      throw new SafeRemoteFetchError(error instanceof DOMException && error.name === "TimeoutError" ? "REMOTE_RESPONSE_TIMEOUT" : "REMOTE_SOURCE_UNAVAILABLE");
    }
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (redirectCount === maxRedirects) throw new SafeRemoteFetchError("REMOTE_REDIRECT_LIMIT");
      const location = result.headers.get("location");
      if (!location) throw new SafeRemoteFetchError("REMOTE_REDIRECT_INVALID");
      try { current = new URL(location, validated.url).href; } catch { throw new SafeRemoteFetchError("REMOTE_REDIRECT_INVALID"); }
      continue;
    }
    if (result.status < 200 || result.status >= 300) throw new SafeRemoteFetchError("REMOTE_SOURCE_UNAVAILABLE");
    const contentType = result.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!options.allowedContentTypes.includes(contentType)) throw new SafeRemoteFetchError("REMOTE_CONTENT_TYPE_UNSUPPORTED");
    return { ...result, contentType, finalUrl: validated.url.href, redirectCount };
  }
  throw new SafeRemoteFetchError("REMOTE_REDIRECT_LIMIT");
}
