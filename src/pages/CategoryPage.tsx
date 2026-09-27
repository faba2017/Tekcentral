import { useParams } from "react-router-dom";
import { CatalogueView } from "@/components/commerce/CatalogueView";

export function CategoryPage() {
  const { slug = "" } = useParams();
  return <CatalogueView categorySlug={slug} />;
}
