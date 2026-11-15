import { ingestPublicProductImageBytes, type ImageIngestionResult } from "../../publicImageIngestion.js";
import { SafeRemoteFetchError, safeRemoteFetch } from "../../security/safeRemoteFetch.js";
import type { SupplierMediaCandidate } from "../../supplierProductEnrichment.js";
import { getTvrProductEnrichment } from "./tvrProductEnrichment.js";

const maximumBytes = 5 * 1024 * 1024;
const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function fetchTvrMediaBytes(
  sourceUrl: string,
  fetcher?: typeof fetch,
  resolver?: (hostname: string) => Promise<string[]>,
) {
  try {
    const loaded = await safeRemoteFetch(sourceUrl, {
      allowedContentTypes: [...supportedMimeTypes], fetcher, headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" }, maxBytes: maximumBytes, maxRedirects: 3, resolver,
      validateUrl: (url) => {
        if (url.hostname.toLowerCase() !== "www.tvr.co.za") throw new Error("SOURCE_HOST_NOT_ALLOWED");
        if (!url.pathname.startsWith("/wp-content/uploads/")) throw new Error("TVR_MEDIA_PATH_NOT_ALLOWED");
        return true;
      },
    });
    return { bytes: loaded.bytes, mimeType: loaded.contentType, sourceUrl: loaded.finalUrl };
  } catch (error) {
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_SOURCE_NOT_ALLOWED") throw new Error("SOURCE_PRIVATE_ADDRESS_BLOCKED", { cause: error });
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_CONTENT_TYPE_UNSUPPORTED") throw new Error("IMAGE_CONTENT_TYPE_UNSUPPORTED", { cause: error });
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_RESPONSE_TOO_LARGE") throw new Error("IMAGE_TOO_LARGE", { cause: error });
    if (error instanceof SafeRemoteFetchError && error.code === "REMOTE_REDIRECT_LIMIT") throw new Error("TVR_MEDIA_REDIRECT_LIMIT", { cause: error });
    throw error;
  }
}

export async function ingestResolvedTvrMedia(input: {
  internalProductId: string;
  candidateId: string;
  resolve: () => Promise<SupplierMediaCandidate | undefined>;
  fetcher?: typeof fetch;
  resolver?: (hostname: string) => Promise<string[]>;
}): Promise<ImageIngestionResult> {
  const candidate = await input.resolve();
  if (!candidate || candidate.id !== input.candidateId || candidate.supplier !== "TVR" || candidate.sourceType !== "HTML" || !candidate.url) throw new Error("TVR_MEDIA_CANDIDATE_INVALID");
  if (!candidate.targetProductId || candidate.targetProductId !== input.internalProductId) throw new Error("TVR_MEDIA_PRODUCT_MISMATCH");
  const loaded = await fetchTvrMediaBytes(candidate.url, input.fetcher, input.resolver);
  return ingestPublicProductImageBytes({
    internalProductId: input.internalProductId,
    bytes: loaded.bytes,
    mimeType: loaded.mimeType,
    sourceReference: loaded.sourceUrl,
    sourceType: "TVR_PUBLIC_CATALOGUE",
  });
}

export async function ingestTvrWebsiteMedia(input: { internalProductId: string; candidateId: string }) {
  return ingestResolvedTvrMedia({
    ...input,
    resolve: async () => {
      const resolution = await getTvrProductEnrichment(input.internalProductId);
      return resolution.status === "RESOLVED"
        ? resolution.enrichment.imageCandidates.find((candidate) => candidate.id === input.candidateId)
        : undefined;
    },
  });
}
