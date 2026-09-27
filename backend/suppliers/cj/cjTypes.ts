import type { SupplierCatalogueProduct, SupplierCatalogueVariant } from "../../types.js";

export const CJ_API_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

export interface CjApiEnvelope<T> {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  data?: T;
  requestId?: string;
}

export interface CjTokenData {
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
  createDate?: string;
}

export interface CjAuthMetadata {
  supplier: "CJ";
  configured: boolean;
  authenticated: boolean;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  lastSuccessfulRequestAt?: string;
  lastError?: string | null;
}

export interface CjSearchParams {
  keyword: string;
  categoryId?: string;
  scope?: "technology" | "all";
  page?: number;
  size?: number;
}

export interface CjCategoryNode {
  categoryId?: string;
  name: string;
  level: 1 | 2 | 3;
  children: CjCategoryNode[];
}

export interface CjProductLookup {
  pid?: string;
  productSku?: string;
  variantSku?: string;
}

export interface CjNormalizedSearchResult {
  product: SupplierCatalogueProduct;
  requestId?: string;
}

export interface CjNormalizedDetail {
  product: SupplierCatalogueProduct;
  variants: SupplierCatalogueVariant[];
  requestId?: string;
}
