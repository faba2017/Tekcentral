import { useParams } from "react-router-dom";
import { CatalogueView } from "@/components/commerce/CatalogueView";

export function CategoryPage() {
  const { slug = "", categorySlug, subcategorySlug, productTypeSlug } = useParams();
  return <CatalogueView categorySlug={categorySlug ?? slug} subcategorySlug={subcategorySlug} productTypeSlug={productTypeSlug} />;
}
