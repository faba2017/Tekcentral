import { createHash } from "node:crypto";
import { ingestPublicProductImageBytes, type ImageIngestionResult } from "../../publicImageIngestion.js";
import type { SupplierMediaCandidate } from "../../supplierProductEnrichment.js";
import { objectStorage } from "../../storage/objectStorage.js";
import { extractMustekMsiEmbeddedImage } from "./mustekMsiEvidenceParser.js";
import { getMustekProductEnrichment } from "./mustekProductEnrichment.js";

export interface ResolvedPrivateMedia {
  candidate: SupplierMediaCandidate;
  readBytes: () => Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export async function ingestResolvedPrivateMedia(input: {
  internalProductId: string;
  candidateId: string;
  resolve: () => Promise<ResolvedPrivateMedia | undefined>;
}): Promise<ImageIngestionResult> {
  const resolved = await input.resolve();
  if (!resolved || resolved.candidate.id !== input.candidateId || resolved.candidate.sourceType !== "PRIVATE_SUPPLIER_EVIDENCE" || !resolved.candidate.privateEvidence) throw new Error("PRIVATE_MEDIA_CANDIDATE_INVALID");
  const loaded = await resolved.readBytes();
  const fingerprint = createHash("sha256").update(loaded.bytes).digest("hex");
  if (fingerprint !== resolved.candidate.privateEvidence.contentFingerprint) throw new Error("PRIVATE_MEDIA_FINGERPRINT_MISMATCH");
  if (loaded.mimeType !== resolved.candidate.privateEvidence.mimeType) throw new Error("PRIVATE_MEDIA_MIME_MISMATCH");
  return ingestPublicProductImageBytes({
    internalProductId: input.internalProductId,
    bytes: loaded.bytes,
    mimeType: loaded.mimeType,
    sourceReference: `private-supplier-evidence://${resolved.candidate.id}`,
    sourceType: "MUSTEK_PRIVATE_SUPPLIER_EVIDENCE",
  });
}

export async function ingestMustekPrivateMedia(input: { internalProductId: string; candidateId: string }) {
  return ingestResolvedPrivateMedia({
    ...input,
    resolve: async () => {
      const resolution = await getMustekProductEnrichment(input.internalProductId);
      const candidate = resolution?.enrichment.imageCandidates.find((item) => item.id === input.candidateId);
      const image = resolution?.evidence.embeddedImage;
      const objectKey = resolution?.evidence.provenance.objectKey;
      if (!resolution || !candidate || !image || !objectKey) return undefined;
      return {
        candidate,
        readBytes: async () => {
          const sourceBytes = await objectStorage().readObject(objectKey, "PRIVATE");
          if (!sourceBytes) throw new Error("PRIVATE_MEDIA_SOURCE_MISSING");
          const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
          if (sourceHash !== resolution.evidence.provenance.sourceFingerprint) throw new Error("PRIVATE_MEDIA_SOURCE_FINGERPRINT_MISMATCH");
          return extractMustekMsiEmbeddedImage(sourceBytes, resolution.evidence.supplierSku, image.contentFingerprint);
        },
      };
    },
  });
}
