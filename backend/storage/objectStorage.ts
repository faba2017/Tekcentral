import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadPersistenceConfig, type PersistenceConfig } from "../persistence/config.js";

export type ObjectAccess = "PUBLIC" | "PRIVATE";
export interface StoredObject { key: string; access: ObjectAccess; contentType: string; byteSize: number; contentHash: string; publicUrl?: string; }
export interface ObjectStorage {
  storeObject(input: { key: string; access: ObjectAccess; bytes: Uint8Array; contentType: string; expectedHash?: string }): Promise<StoredObject>;
  readObject(key: string, access: ObjectAccess): Promise<Uint8Array | undefined>;
  deleteObject(key: string, access: ObjectAccess): Promise<void>;
  getPublicUrl(key: string): string;
  createSignedDownload(key: string, expiresSeconds?: number, options?: { filename?: string; contentType?: string }): Promise<string>;
  ready(): Promise<boolean>;
}

function safeKey(key: string) { if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,511}$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("OBJECT_KEY_INVALID"); return key; }

export class LocalObjectStorage implements ObjectStorage {
  constructor(private root: string, private publicBaseUrl = "/api/public/assets") {}
  private path(key: string, access: ObjectAccess) { return resolve(this.root, access === "PUBLIC" ? "public" : "private", safeKey(key)); }
  async storeObject(input: { key: string; access: ObjectAccess; bytes: Uint8Array; contentType: string; expectedHash?: string }) { const hash = createHash("sha256").update(input.bytes).digest("hex"); if (input.expectedHash && input.expectedHash !== hash) throw new Error("OBJECT_HASH_MISMATCH"); const path = this.path(input.key, input.access); try { const existing = new Uint8Array(await readFile(path)); const existingHash = createHash("sha256").update(existing).digest("hex"); if (existingHash !== hash) throw new Error("OBJECT_IMMUTABLE_CONFLICT"); return { key: input.key, access: input.access, contentType: input.contentType, byteSize: existing.length, contentHash: hash, publicUrl: input.access === "PUBLIC" ? this.getPublicUrl(input.key) : undefined }; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } await mkdir(dirname(path), { recursive: true }); try { await writeFile(path, input.bytes, { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const existing = new Uint8Array(await readFile(path)); if (createHash("sha256").update(existing).digest("hex") !== hash) throw new Error("OBJECT_IMMUTABLE_CONFLICT", { cause: error }); } return { key: input.key, access: input.access, contentType: input.contentType, byteSize: input.bytes.length, contentHash: hash, publicUrl: input.access === "PUBLIC" ? this.getPublicUrl(input.key) : undefined }; }
  async readObject(key: string, access: ObjectAccess) { try { return new Uint8Array(await readFile(this.path(key, access))); } catch { return undefined; } }
  async deleteObject(key: string, access: ObjectAccess) { await rm(this.path(key, access), { force: true }); }
  getPublicUrl(key: string) { return `${this.publicBaseUrl.replace(/\/$/, "")}/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`; }
  async createSignedDownload(key: string): Promise<string> { safeKey(key); throw new Error("LOCAL_SIGNED_DOWNLOAD_REQUIRES_AUTHORIZED_APPLICATION_ROUTE"); }
  async ready() { try { await mkdir(this.root, { recursive: true }); return true; } catch { return false; } }
}

export class SpacesObjectStorage implements ObjectStorage {
  private publicClient: S3Client;
  private privateClient: S3Client;
  constructor(
    private config: PersistenceConfig["objectStorage"],
    clients: { publicClient?: S3Client; privateClient?: S3Client } = {},
    private signer: typeof getSignedUrl = getSignedUrl,
  ) {
    const client = (accessKeyId: string, secretAccessKey: string) => new S3Client({ endpoint: config.endpoint, region: config.region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: false });
    this.publicClient = clients.publicClient ?? client(config.publicAccessKey!, config.publicSecretKey!);
    this.privateClient = clients.privateClient ?? client(config.privateAccessKey!, config.privateSecretKey!);
  }
  private bucket(access: ObjectAccess) { return access === "PUBLIC" ? this.config.publicBucket! : this.config.privateBucket!; }
  private client(access: ObjectAccess) { return access === "PUBLIC" ? this.publicClient : this.privateClient; }
  private missing(error: unknown) { const value = error as { name?: string; $metadata?: { httpStatusCode?: number } }; return value?.name === "NotFound" || value?.name === "NoSuchKey" || value?.$metadata?.httpStatusCode === 404; }
  async storeObject(input: { key: string; access: ObjectAccess; bytes: Uint8Array; contentType: string; expectedHash?: string }) {
    const key = safeKey(input.key); const hash = createHash("sha256").update(input.bytes).digest("hex"); if (input.expectedHash && input.expectedHash !== hash) throw new Error("OBJECT_HASH_MISMATCH");
    try {
      const existing = await this.client(input.access).send(new HeadObjectCommand({ Bucket: this.bucket(input.access), Key: key }));
      if (existing.Metadata?.sha256 === hash && existing.ContentLength === input.bytes.length) return { key, access: input.access, contentType: existing.ContentType ?? input.contentType, byteSize: input.bytes.length, contentHash: hash, publicUrl: input.access === "PUBLIC" ? this.getPublicUrl(key) : undefined };
      throw new Error("OBJECT_IMMUTABLE_CONFLICT");
    } catch (error) { if (!this.missing(error)) throw error; }
    await this.client(input.access).send(new PutObjectCommand({ Bucket: this.bucket(input.access), Key: key, Body: input.bytes, ContentType: input.contentType, Metadata: { sha256: hash }, CacheControl: input.access === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store", ACL: input.access === "PUBLIC" ? "public-read" : "private" }));
    return { key, access: input.access, contentType: input.contentType, byteSize: input.bytes.length, contentHash: hash, publicUrl: input.access === "PUBLIC" ? this.getPublicUrl(key) : undefined };
  }
  async readObject(key: string, access: ObjectAccess) { try { const result = await this.client(access).send(new GetObjectCommand({ Bucket: this.bucket(access), Key: safeKey(key) })); return result.Body ? new Uint8Array(await result.Body.transformToByteArray()) : undefined; } catch (error) { if (this.missing(error)) return undefined; throw error; } }
  async deleteObject(key: string, access: ObjectAccess) { await this.client(access).send(new DeleteObjectCommand({ Bucket: this.bucket(access), Key: safeKey(key) })); }
  getPublicUrl(key: string) { return `${this.config.publicBaseUrl}/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`; }
  async createSignedDownload(key: string, expiresSeconds = 300, options: { filename?: string; contentType?: string } = {}) {
    const filename = options.filename && /^[A-Za-z0-9._-]{1,160}$/.test(options.filename) ? options.filename : undefined;
    return this.signer(this.privateClient, new GetObjectCommand({ Bucket: this.bucket("PRIVATE"), Key: safeKey(key), ResponseCacheControl: "private, no-store", ResponseContentType: options.contentType, ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined }), { expiresIn: Math.min(900, Math.max(30, expiresSeconds)) });
  }
  async ready() { try { await Promise.all([this.publicClient.send(new HeadBucketCommand({ Bucket: this.bucket("PUBLIC") })), this.privateClient.send(new HeadBucketCommand({ Bucket: this.bucket("PRIVATE") }))]); return true; } catch { return false; } }
}

let shared: ObjectStorage | undefined;
export function objectStorage(environment: NodeJS.ProcessEnv = process.env): ObjectStorage { if (shared) return shared; const config = loadPersistenceConfig(environment); const created: ObjectStorage = config.objectStorage.provider === "SPACES" ? new SpacesObjectStorage(config.objectStorage) : new LocalObjectStorage(resolve(process.cwd(), config.objectStorage.localRoot)); shared = created; return created; }
export function setObjectStorageForTests(value?: ObjectStorage) { shared = value; }
export const productMediaKey = (hash: string, extension: string) => `products/${hash.slice(0, 2)}/${hash}.${extension.replace(/^\./, "")}`;
export const privateInvoiceKey = (invoiceNumber: string, hash: string) => {
  if (!/^INV-\d{4}-\d{6}$/.test(invoiceNumber) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("PRIVATE_INVOICE_KEY_INVALID");
  return `invoices/${invoiceNumber}/${hash}.pdf`;
};
