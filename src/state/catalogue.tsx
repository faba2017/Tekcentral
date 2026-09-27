import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { products as demoProducts } from "@/data/catalogue";
import { apiRequest } from "@/lib/api";
import type { Product } from "@/types/product";

interface CatalogueContextValue { products: Product[]; publishedProducts: Product[]; loading: boolean; }
const CatalogueContext = createContext<CatalogueContextValue | null>(null);
const demos = demoProducts.map((product) => ({ ...product, catalogueSource: "DEMO_SEED" as const }));

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [publishedProducts, setPublishedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    apiRequest<{ products: Product[] }>("/api/public/catalogue")
      .then((result) => { if (active) setPublishedProducts(result.products); })
      .catch(() => { if (active) setPublishedProducts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const products = useMemo(() => {
    const publishedIds = new Set(publishedProducts.map((product) => product.id));
    return [...publishedProducts, ...demos.filter((product) => !publishedIds.has(product.id))];
  }, [publishedProducts]);
  return <CatalogueContext.Provider value={{ products, publishedProducts, loading }}>{children}</CatalogueContext.Provider>;
}
export function useStorefrontCatalogue() { const value = useContext(CatalogueContext); if (!value) throw new Error("useStorefrontCatalogue must be used inside CatalogueProvider"); return value; }
