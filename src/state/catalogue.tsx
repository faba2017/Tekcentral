import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { products as demoProducts } from "@/data/catalogue";
import { apiRequest } from "@/lib/api";
import type { Product } from "@/types/product";

export interface StorefrontTaxonomyNode { id:string; name:string; label:string; slug:string; aliases?:string[]; description?:string; parentId?:string; storefrontVisible:boolean; children:StorefrontTaxonomyNode[]; productTypes?:StorefrontTaxonomyNode[] }
interface CatalogueContextValue { products: Product[]; publishedProducts: Product[]; taxonomy: StorefrontTaxonomyNode[]; loading: boolean; }
const CatalogueContext = createContext<CatalogueContextValue | null>(null);
const demos = demoProducts.map((product) => ({ ...product, catalogueSource: "DEMO_SEED" as const }));

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [publishedProducts, setPublishedProducts] = useState<Product[]>([]);
  const [taxonomy, setTaxonomy] = useState<StorefrontTaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<{ products: Product[] }>("/api/public/catalogue"), apiRequest<{categories:StorefrontTaxonomyNode[]}>("/api/public/taxonomy")])
      .then(([catalogueResult,taxonomyResult]) => { if (active) { setPublishedProducts(catalogueResult.products); setTaxonomy(taxonomyResult.categories); } })
      .catch(() => { if (active) setPublishedProducts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const products = useMemo(() => {
    const publishedIds = new Set(publishedProducts.map((product) => product.id));
    return [...publishedProducts, ...demos.filter((product) => !publishedIds.has(product.id))];
  }, [publishedProducts]);
  return <CatalogueContext.Provider value={{ products, publishedProducts, taxonomy, loading }}>{children}</CatalogueContext.Provider>;
}
export function useStorefrontCatalogue() { const value = useContext(CatalogueContext); if (!value) throw new Error("useStorefrontCatalogue must be used inside CatalogueProvider"); return value; }
