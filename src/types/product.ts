export type Currency = "ZAR";

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "unknown";

export interface ProductSpecification {
  name: string;
  value: string;
}

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
  price: number;
  currency: Currency;
  isDemoPrice: boolean;
  shortDescription: string;
  description?: string;
  images?: string[];
  stockStatus: StockStatus;
  specifications?: ProductSpecification[];
  featured?: boolean;
  newArrival?: boolean;
  tags?: string[];
  catalogueSource?: "DEMO_SEED" | "PUBLISHED";
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  accent: string;
  subcategories: string[];
}
