import { featuredProducts } from "@/data/catalogue";
import { ProductCard } from "@/components/commerce/ProductCard";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { useCart } from "@/state/cart";
import { useComparison } from "@/state/comparison";

export function FeaturedProductsSection() {
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Featured products"
          title="Popular technology picks."
          description="Explore technology for home, work and business."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProducts.map((product) => (
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
