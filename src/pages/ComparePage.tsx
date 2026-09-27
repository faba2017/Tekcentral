import { Link, useSearchParams } from "react-router-dom";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { usePageTitle } from "@/lib/page-title";
import { formatCurrency } from "@/lib/format";
import { ProductVisual } from "@/components/commerce/ProductVisual";
import { useCart } from "@/state/cart";

export function ComparePage() {
  const { products } = useStorefrontCatalogue();
  usePageTitle("Compare | TekCentral");
  const [params, setParams] = useSearchParams();
  const { addProduct } = useCart();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 3);
  const selected = products.filter((product) => ids.includes(product.id));
  const specNames = Array.from(
    new Set(
      selected.flatMap(
        (product) => product.specifications?.map((spec) => spec.name) ?? [],
      ),
    ),
  );
  const hasMixedCategories =
    new Set(selected.map((product) => product.categorySlug)).size > 1;

  const stockLabels = {
    "in-stock": "Available",
    "low-stock": "Limited",
    "out-of-stock": "Unavailable",
    unknown: "Stock TBC",
  };

  const removeProduct = (productId: string) => {
    const next = selected
      .filter((product) => product.id !== productId)
      .map((product) => product.id);
    setParams(
      next.length
        ? new URLSearchParams({ ids: next.join(",") })
        : new URLSearchParams(),
    );
  };

  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          Product comparison
        </p>
        <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">Compare Products</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#3F4652]">
          Compare up to three technology products side-by-side.
        </p>
        {selected.length >= 2 && hasMixedCategories && (
          <p className="mt-4 max-w-3xl rounded-md bg-[#F6F7F9] px-4 py-3 text-sm font-semibold leading-6 text-[#3F4652]">
            These products are from different categories, so some specifications
            are not directly comparable.
          </p>
        )}

        {selected.length < 2 ? (
          <div className="mt-10 rounded-lg border border-dashed border-[#BFC7D4] bg-[#F6F7F9] p-10 text-center">
            <h2 className="text-2xl font-black text-[#0A0A0A]">
              Choose at least two products to compare.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3F4652]">
              Use Compare on product cards to build a side-by-side technology shortlist.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto rounded-lg border border-[#E4E7EC]">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#F6F7F9]">
                <tr>
                  <th className="w-48 p-4 font-black text-[#3F4652]">Product</th>
                  {selected.map((product) => (
                    <th key={product.id} className="w-[28%] p-4 align-top">
                      <div className="max-w-[220px]">
                        <ProductVisual product={product} />
                      </div>
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#727986]">
                        {product.brand}
                      </p>
                      <Link
                        to={`/product/${product.slug}`}
                        className="mt-1 block text-base font-black leading-6 text-[#0A0A0A] hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-2 text-lg font-black text-[#0A0A0A]">
                        {formatCurrency(product.price, product.currency)}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => addProduct(product.id)}
                          className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                        >
                          Add to Cart
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(product.id)}
                          className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black text-[#3F4652] transition hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                        >
                          Remove
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]">
                <tr>
                  <td className="p-4 font-black text-[#3F4652]">Brand</td>
                  {selected.map((product) => (
                    <td key={product.id} className="p-4 font-semibold text-[#0A0A0A]">
                      {product.brand}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-4 font-black text-[#3F4652]">Category</td>
                  {selected.map((product) => (
                    <td key={product.id} className="p-4 font-semibold text-[#0A0A0A]">
                      {product.category}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-4 font-black text-[#3F4652]">Price</td>
                  {selected.map((product) => (
                    <td key={product.id} className="p-4 font-semibold text-[#0A0A0A]">
                      {formatCurrency(product.price, product.currency)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-4 font-black text-[#3F4652]">Availability</td>
                  {selected.map((product) => (
                    <td key={product.id} className="p-4 font-semibold text-[#0A0A0A]">
                      {stockLabels[product.stockStatus]}
                    </td>
                  ))}
                </tr>
                {specNames.map((name) => (
                  <tr key={name}>
                    <td className="p-4 font-black text-[#3F4652]">{name}</td>
                    {selected.map((product) => {
                      const value = product.specifications?.find(
                        (spec) => spec.name === name,
                      )?.value;
                      return (
                        <td
                          key={product.id}
                          className="p-4 font-semibold text-[#0A0A0A]"
                        >
                          {value ?? (
                            <span className="text-[#727986]">Not applicable</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
