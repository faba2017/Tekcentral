import { Link } from "react-router-dom";
import { FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/state/cart";
import { usePageTitle } from "@/lib/page-title";
import { ProductVisual } from "@/components/commerce/ProductVisual";

export function CartPage() {
  const { products } = useStorefrontCatalogue();
  usePageTitle("Cart | TekCentral");
  const { lines, subtotal, updateQuantity, removeProduct, clearCart } = useCart();
  const items = lines
    .map((line) => ({
      line,
      product: products.find((product) => product.id === line.productId),
    }))
    .filter((item) => item.product);

  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          Cart
        </p>
        <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">Your Cart</h1>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-[#727986]">
          Review your selected technology before checkout.
        </p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-[#BFC7D4] bg-[#F6F7F9] p-10 text-center">
            <h2 className="text-2xl font-black text-[#0A0A0A]">Your cart is empty.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3F4652]">
              Add technology products for home, work or business.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
            >
              Shop Technology
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {items.map(({ line, product }) =>
                product ? (
                  <article
                    key={line.productId}
                    className="grid gap-4 rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm sm:grid-cols-[120px_1fr] lg:grid-cols-[120px_1fr_auto]"
                  >
                    <Link
                      to={`/product/${product.slug}`}
                className="block overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"
                    >
                      <ProductVisual product={product} />
                    </Link>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#727986]">
                        {product.brand}
                      </p>
                      <Link
                        to={`/product/${product.slug}`}
                        className="mt-1 block text-lg font-black text-[#0A0A0A] hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-[#727986]">
                        {product.model ?? product.category}
                      </p>
                      <p className="mt-3 text-sm text-[#3F4652]">
                        {formatCurrency(product.price, product.currency)} each
                      </p>
                      <p className="mt-1 text-sm font-black text-[#0A0A0A]">
                        Line total:{" "}
                        {formatCurrency(product.price * line.quantity, product.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1 lg:justify-end">
                      <div className="flex h-10 items-center rounded-md border border-[#E4E7EC]">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, line.quantity - 1)}
                          className="grid h-10 w-10 place-items-center"
                          aria-label={`Decrease quantity for ${product.name}`}
                        >
                          <FiMinus aria-hidden="true" />
                        </button>
                        <span className="w-8 text-center text-sm font-black">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, line.quantity + 1)}
                          className="grid h-10 w-10 place-items-center"
                          aria-label={`Increase quantity for ${product.name}`}
                        >
                          <FiPlus aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        className="grid h-10 w-10 place-items-center rounded-md border border-[#E4E7EC] text-[#3F4652] transition hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                        aria-label={`Remove ${product.name}`}
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ) : null,
              )}
            </div>
            <aside className="h-fit rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Order summary</h2>
              <div className="mt-5 flex items-center justify-between border-t border-[#E4E7EC] pt-5">
                <span className="text-sm font-bold text-[#3F4652]">Subtotal</span>
                <span className="text-xl font-black text-[#0A0A0A]">
                  {formatCurrency(subtotal, "ZAR")}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#727986]">
                VAT and delivery options are confirmed during checkout.
              </p>
              <Link
                to="/checkout"
                className="mt-5 block rounded-md bg-[var(--tek-accent)] px-5 py-3 text-center text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                Continue to Checkout
              </Link>
              <Link
                to="/business"
                className="mt-3 block rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Request Business Quote
              </Link>
              <button
                type="button"
                onClick={clearCart}
                className="mt-3 w-full rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-sm font-black text-[#3F4652] transition hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
              >
                Clear Cart
              </button>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
