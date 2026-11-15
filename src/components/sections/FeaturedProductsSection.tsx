import { ProductCard } from "@/components/commerce/ProductCard";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { useCart } from "@/state/cart";
import { useComparison } from "@/state/comparison";
import { useHomepageMerchandising } from "@/lib/merchandising";

export function FeaturedProductsSection() {
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();
  const section = useHomepageMerchandising()?.sections.find((item) => item.key === "featured");
  if (!section?.products?.length) return null;

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Featured products"
          title={section.title}
          description={section.subtitle}
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {section.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={addProduct}
              onCompare={toggleProduct}
              isCompared={isComparing(product.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
