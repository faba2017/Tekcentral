import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { PersistenceConfig } from "../persistence/config.js";
import { SpacesObjectStorage } from "../storage/objectStorage.js";
import { spacesDeploymentPolicy } from "../storage/spacesPolicy.js";

class FakeSpacesClient {
  readonly commands: unknown[] = [];
  readonly objects = new Map<string, { bytes: Uint8Array; hash: string; contentType: string }>();
  async send(command: unknown) {
    this.commands.push(command);
    const input = (command as { input: { Bucket: string; Key?: string; Body?: Uint8Array; ContentType?: string; Metadata?: Record<string, string> } }).input;
    const identity = `${input.Bucket}/${input.Key ?? ""}`;
    if (command instanceof HeadBucketCommand) return {};
    if (command instanceof HeadObjectCommand) {
      const existing = this.objects.get(identity);
      if (!existing) throw Object.assign(new Error("missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      return { Metadata: { sha256: existing.hash }, ContentLength: existing.bytes.length, ContentType: existing.contentType };
    }
    if (command instanceof PutObjectCommand) {
      const bytes = input.Body!;
      this.objects.set(identity, { bytes, hash: input.Metadata!.sha256, contentType: input.ContentType! });
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const existing = this.objects.get(identity);
      if (!existing) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return { Body: { transformToByteArray: async () => existing.bytes } };
    }
    if (command instanceof DeleteObjectCommand) { this.objects.delete(identity); return {}; }
    throw new Error("UNEXPECTED_COMMAND");
  }
}

const config: PersistenceConfig["objectStorage"] = {
  provider: "SPACES",
  endpoint: "https://jnb1.digitaloceanspaces.com",
  region: "jnb1",
  publicBucket: "tekcentral-public-test",
  privateBucket: "tekcentral-private-test",
  publicAccessKey: "public-key",
  publicSecretKey: "public-secret",
  privateAccessKey: "private-key",
  privateSecretKey: "private-secret",
  publicBaseUrl: "https://tekcentral-public-test.jnb1.digitaloceanspaces.com",
  localRoot: ".data/object-storage",
};
const publicClient = new FakeSpacesClient();
const privateClient = new FakeSpacesClient();
let signed: { client?: unknown; command?: GetObjectCommand; expiresIn?: number } = {};
const storage = new SpacesObjectStorage(config, { publicClient: publicClient as unknown as S3Client, privateClient: privateClient as unknown as S3Client }, async (client, command, options) => {
  signed = { client, command: command as unknown as GetObjectCommand, expiresIn: options?.expiresIn };
  return "https://tekcentral-private-test.jnb1.digitaloceanspaces.com/invoices/exact.pdf?X-Amz-Signature=redacted";
});

const bytes = new TextEncoder().encode("immutable-public-object");
const hash = createHash("sha256").update(bytes).digest("hex");
await storage.storeObject({ key: `products/${hash}.bin`, access: "PUBLIC", bytes, contentType: "application/octet-stream", expectedHash: hash });
assert.equal(publicClient.commands.some((command) => command instanceof PutObjectCommand), true);
assert.equal(privateClient.commands.some((command) => command instanceof PutObjectCommand), false);
const publicPut = publicClient.commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
assert.equal(publicPut.input.ACL, "public-read");
assert.equal(publicPut.input.Bucket, config.publicBucket);

const commandCount = publicClient.commands.length;
await storage.storeObject({ key: `products/${hash}.bin`, access: "PUBLIC", bytes, contentType: "application/octet-stream", expectedHash: hash });
assert.equal(publicClient.commands.slice(commandCount).some((command) => command instanceof PutObjectCommand), false, "same hash is idempotent");
await assert.rejects(() => storage.storeObject({ key: `products/${hash}.bin`, access: "PUBLIC", bytes: new TextEncoder().encode("different"), contentType: "application/octet-stream" }), /OBJECT_IMMUTABLE_CONFLICT/);

const privateBytes = new TextEncoder().encode("private-invoice");
await storage.storeObject({ key: "invoices/INV-2026-000001/exact.pdf", access: "PRIVATE", bytes: privateBytes, contentType: "application/pdf" });
const privatePut = privateClient.commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
assert.equal(privatePut.input.ACL, "private");
assert.equal(privatePut.input.Bucket, config.privateBucket);
assert.equal(publicClient.commands.some((command) => (command as { input?: { Bucket?: string } }).input?.Bucket === config.privateBucket), false);
assert.equal(privateClient.commands.some((command) => (command as { input?: { Bucket?: string } }).input?.Bucket === config.publicBucket), false);

const signedUrl = await storage.createSignedDownload("invoices/INV-2026-000001/exact.pdf", 5_000, { filename: "invoice.pdf", contentType: "application/pdf" });
assert.match(signedUrl, /X-Amz-Signature=/);
assert.equal(signed.client, privateClient);
assert.equal(signed.command?.input.Bucket, config.privateBucket);
assert.equal(signed.command?.input.Key, "invoices/INV-2026-000001/exact.pdf");
assert.equal(signed.command?.input.ResponseCacheControl, "private, no-store");
assert.equal(signed.expiresIn, 900);
await assert.rejects(() => storage.createSignedDownload("../neighbor.pdf"), /OBJECT_KEY_INVALID/);

assert.deepEqual(spacesDeploymentPolicy.publicBucket.anonymous, { getObject: true, listBucket: false, putObject: false, deleteObject: false });
assert.deepEqual(spacesDeploymentPolicy.privateBucket.anonymous, { getObject: false, listBucket: false, putObject: false, deleteObject: false });
assert.deepEqual(spacesDeploymentPolicy.privateBucket.cors.methods, []);
assert.equal(await storage.ready(), true);

console.log("Spaces credential separation, immutable-object and signed-download tests passed.");
