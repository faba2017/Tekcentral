export const spacesDeploymentPolicy = {
  publicBucket: {
    anonymous: { getObject: true, listBucket: false, putObject: false, deleteObject: false },
    applicationCredential: { scope: "PUBLIC_BUCKET_ONLY", permission: "READ_WRITE_DELETE" },
    cors: { methods: ["GET", "HEAD"], origins: "PUBLIC_STOREFRONT_ORIGIN_ONLY", allowedHeaders: [] },
  },
  privateBucket: {
    anonymous: { getObject: false, listBucket: false, putObject: false, deleteObject: false },
    applicationCredential: { scope: "PRIVATE_BUCKET_ONLY", permission: "READ_WRITE_DELETE" },
    cors: { methods: [], origins: "NONE", allowedHeaders: [] },
    download: { method: "PRESIGNED_EXACT_GET", minimumTtlSeconds: 30, defaultTtlSeconds: 300, maximumTtlSeconds: 900 },
  },
} as const;
