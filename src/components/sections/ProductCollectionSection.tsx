import { products } from "@/data/catalogue";
import { ProductCard } from "@/components/commerce/ProductCard";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { useCart } from "@/state/cart";
import { useComparison } from "@/state/comparison";

const collectionProducts = products
  .filter((product) =>
    ["networking", "printing-office", "power", "accessories"].includes(
      product.categorySlug,
    ),
  )
  .slice(0, 4);

export function ProductCollectionSection() {
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Complete the setup"
          title="Accessories, networking and office essentials."
          description="Round out a workspace with the technology that supports daily work."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {collectionProducts.map((product) => (
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
