export type Currency = "ZAR";

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "unknown";
export type ProductAvailabilityState = "IN_STOCK" | "LOW_STOCK" | "AVAILABLE_FROM_SUPPLIER" | "OUT_OF_STOCK" | "BACKORDER" | "PREORDER" | "AVAILABILITY_UNKNOWN" | "CHECK_REQUIRED" | "DELIVERY_CHECK_REQUIRED" | "DISCONTINUED";

export interface ProductSpecification {
  name: string;
  value: string;
  group?: string;
  isKey?: boolean;
}

export interface ProductDocument { type: "DATASHEET" | "COMPLIANCE_CERTIFICATE" | "USER_MANUAL" | "INSTALLATION_GUIDE" | "WARRANTY_DOCUMENT" | "BROCHURE" | "SPECIFICATION_SHEET" | "SAFETY_DOCUMENT" | "OTHER" | "QUICK_START_GUIDE" | "WARRANTY"; title: string; url: string; verified: boolean; }
export interface ProductImage { id: string; url: string; altText: string; isPrimary: boolean; displayOrder: number; }

export interface Product {
  id: string;
  slug: string;
  sku?: string;
  name: string;
  brand: string;
  model?: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  categoryId?: string;
  subcategoryId?: string;
  productTypeId?: string;
  taxonomyVersion?: 1;
  taxonomyStatus?: "VERIFIED" | "REVIEW_REQUIRED" | "UNMAPPED";
  price: number;
  regularPrice?: number;
  promotion?: { badgeText: string; publicLabel?: string; endsAt: string };
  currency: Currency;
  isDemoPrice: boolean;
  shortDescription: string;
  description?: string;
  overview?: string;
  images?: string[];
  media?: ProductImage[];
  stockStatus: StockStatus;
  availability?: { state: ProductAvailabilityState; label: string; freshness: "FRESH" | "STALE" | "UNKNOWN"; observedAt?: string; purchasable: boolean };
  specifications?: ProductSpecification[];
  documents?: ProductDocument[];
  featured?: boolean;
  newArrival?: boolean;
  tags?: string[];
  collections?: string[];
  catalogueSource?: "DEMO_SEED" | "PUBLISHED";
}

export interface Category {
  id?: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  subcategories: string[];
}
