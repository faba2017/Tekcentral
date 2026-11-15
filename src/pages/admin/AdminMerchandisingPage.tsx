import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { usePageTitle } from "@/lib/page-title";

interface ProductChoice {
  id: string;
  name: string;
  sku?: string;
  price: number;
  regularPrice?: number;
  availability: { label: string; purchasable: boolean };
}
interface Section {
  id: string;
  key: string;
  type: "PRODUCT_LIST" | "CATEGORY_LIST";
  title: string;
  subtitle: string;
  enabled: boolean;
  order: number;
  maximumItems: number;
  fallbackMode: "MANUAL_ONLY" | "MANUAL_WITH_AUTOMATIC_FALLBACK";
  categoryId?: string;
  productIds: string[];
  categoryIds: string[];
  warnings: string[];
}
interface Promotion {
  id: string;
  name: string;
  internalReference: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  badgeText: string;
  publicLabel?: string;
  products: { productId: string; promotionalPrice: number }[];
  status: string;
  warnings: string[];
  createdAt?: string;
  updatedAt?: string;
}
interface Data {
  sections: Section[];
  promotions: Promotion[];
  metrics: {
    enabledSections: number;
    activePromotions: number;
    scheduledPromotions: number;
    warnings: number;
  };
}
interface TaxonomyNode {
  id: string;
  name: string;
  label: string;
}
export function AdminMerchandisingPage() {
  usePageTitle("Merchandising | TekCentral Ops");
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "overview";
  const [data, setData] = useState<Data>();
  const [products, setProducts] = useState<ProductChoice[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [feedback, setFeedback] = useState("");
  const load = useCallback(
    () =>
      Promise.all([
        apiRequest<Data>("/api/admin/merchandising"),
        apiRequest<{ products: ProductChoice[] }>(
          "/api/admin/merchandising/products",
        ),
        apiRequest<{ categories: TaxonomyNode[] }>("/api/admin/product-taxonomy"),
      ]).then(([next, choices, taxonomyResult]) => {
        setData(next);
        setProducts(choices.products);
        setTaxonomy(taxonomyResult.categories);
      }),
    [],
  );
  const searchProducts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("productSearch") ?? "",
    ).trim();
    const result = await apiRequest<{ products: ProductChoice[] }>(
      `/api/admin/merchandising/products?search=${encodeURIComponent(query)}`,
    );
    setProducts(result.products);
  };
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Merchandising"
        description="Control homepage discovery and time-bounded promotional pricing independently from Product publication."
      />
      <nav
        className="mt-5 flex gap-2 overflow-x-auto"
        aria-label="Merchandising sections"
      >
        {[
          ["overview", "Overview"],
          ["sections", "Homepage Sections"],
          ["featured", "Featured Products"],
          ["promotions", "Promotions & Sales"],
          ["categories", "Category Highlights"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setParams({ view: id })}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-black ${view === id ? "bg-[#176B5C] text-white" : "border bg-white"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {view !== "overview" && view !== "categories" && (
        <form onSubmit={searchProducts} className="mt-4 flex max-w-xl gap-2">
          <label className="sr-only" htmlFor="merchandising-product-search">
            Search published Products
          </label>
          <input
            id="merchandising-product-search"
            name="productSearch"
            placeholder="Search published Products by title, SKU or brand"
            className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm"
          />
          <button className="rounded-md border bg-white px-4 text-sm font-black">
            Search
          </button>
        </form>
      )}
      {feedback && (
        <div className="mt-4">
          <AdminFeedback variant="success" message={feedback} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-sm font-bold text-[#667085]">
          Loading merchandising...
        </p>
      ) : view === "overview" ? (
        <Overview data={data} />
      ) : view === "promotions" ? (
        <Promotions
          data={data}
          products={products}
          refresh={load}
          notify={setFeedback}
        />
      ) : (
        <Sections
          data={data}
          products={products}
          focus={view}
          taxonomy={taxonomy}
          refresh={load}
          notify={setFeedback}
        />
      )}
    </AdminShell>
  );
}
function Overview({ data }: { data: Data }) {
  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Live homepage sections", data.metrics.enabledSections],
          ["Active promotions", data.metrics.activePromotions],
          ["Scheduled promotions", data.metrics.scheduledPromotions],
          ["Eligibility warnings", data.metrics.warnings],
        ].map(([label, value]) => (
          <article key={label} className="rounded-lg border bg-white p-5">
            <p className="text-xs font-black uppercase text-[#667085]">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </article>
        ))}
      </section>
      <p className="mt-6 rounded-lg border bg-white p-5 text-sm text-[#667085]">
        Publishing makes a Product discoverable in Shop, category pages, search
        and Zeus. It does not place the Product on the homepage. Homepage
        selection and promotions require explicit configuration here.
      </p>
    </>
  );
}
function Sections({
  data,
  products,
  focus,
  taxonomy,
  refresh,
  notify,
}: {
  data: Data;
  products: ProductChoice[];
  focus: string;
  taxonomy: TaxonomyNode[];
  refresh: () => Promise<unknown>;
  notify: (v: string) => void;
}) {
  const sections = data.sections.filter((item) =>
    focus === "featured"
      ? item.key === "featured"
      : focus === "categories"
        ? item.type === "CATEGORY_LIST"
        : true,
  );
  const save = async (section: Section) => {
    const { warnings: unused, ...payload } = section;
    void unused;
    await apiRequest("/api/admin/merchandising/sections", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await refresh();
    notify("Homepage configuration saved.");
  };
  return (
    <div className="mt-6 space-y-5">
      {sections.map((section) => (
        <section key={section.id} className="rounded-lg border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[#667085]">
                {section.type.replace("_", " ")} · {section.key}
              </p>
              <h2 className="mt-1 text-xl font-black">{section.title}</h2>
              <p className="text-sm text-[#667085]">{section.subtitle}</p>
            </div>
            <label className="text-sm font-bold">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(e) =>
                  void save({ ...section, enabled: e.target.checked })
                }
              />{" "}
              Enabled
            </label>
          </div>
          {section.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-3 rounded bg-[#FFFAEB] p-2 text-sm font-bold text-[#B54708]"
            >
              {warning}
            </p>
          ))}
          {section.type === "PRODUCT_LIST" ? (
            <ProductPlacement
              section={section}
              products={products}
              taxonomy={taxonomy}
              save={save}
            />
          ) : (
            <CategoryPlacement section={section} taxonomy={taxonomy} save={save} />
          )}
        </section>
      ))}
    </div>
  );
}
function ProductPlacement({
  section,
  products,
  taxonomy,
  save,
}: {
  section: Section;
  products: ProductChoice[];
  taxonomy: TaxonomyNode[];
  save: (s: Section) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const move = (index: number, delta: number) => {
    const ids = [...section.productIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void save({ ...section, productIds: ids });
  };
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-bold">
          Fallback
          <select
            value={section.fallbackMode}
            onChange={(e) =>
              void save({
                ...section,
                fallbackMode: e.target.value as Section["fallbackMode"],
              })
            }
            className="mt-1 block h-10 w-full rounded-md border px-3"
          >
            <option>MANUAL_ONLY</option>
            <option>MANUAL_WITH_AUTOMATIC_FALLBACK</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Maximum items
          <input
            type="number"
            min="1"
            max="12"
            value={section.maximumItems}
            onChange={(e) =>
              void save({ ...section, maximumItems: Number(e.target.value) })
            }
            className="mt-1 block h-10 w-full rounded-md border px-3"
          />
        </label>
        <label className="text-sm font-bold">
          Fallback category
          <select
            value={section.categoryId ?? ""}
            onChange={(e) =>
              void save({ ...section, categoryId: e.target.value || undefined })
            }
            className="mt-1 block h-10 w-full rounded-md border px-3"
          >
            <option value="">All categories</option>
            {taxonomy.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <select
          aria-label="Published Product"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border px-3"
        >
          <option value="">Select published Product</option>
          {products
            .filter((item) => !section.productIds.includes(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {formatCurrency(item.price, "ZAR")} ·{" "}
                {item.availability.label}
              </option>
            ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => {
            void save({
              ...section,
              productIds: [...section.productIds, selected],
            });
            setSelected("");
          }}
          className="rounded-md bg-[#176B5C] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <ol className="mt-4 divide-y">
        {section.productIds.map((id, index) => {
          const product = products.find((item) => item.id === id);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <strong>{product?.name ?? id}</strong>
                <p className="text-xs text-[#667085]">
                  {product
                    ? `${product.sku ?? "No SKU"} · ${formatCurrency(product.price, "ZAR")} · ${product.availability.label}`
                    : "Not publicly eligible"}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  aria-label="Move up"
                  onClick={() => move(index, -1)}
                  className="rounded border px-2 py-1"
                >
                  ↑
                </button>
                <button
                  aria-label="Move down"
                  onClick={() => move(index, 1)}
                  className="rounded border px-2 py-1"
                >
                  ↓
                </button>
                <button
                  onClick={() =>
                    void save({
                      ...section,
                      productIds: section.productIds.filter(
                        (item) => item !== id,
                      ),
                    })
                  }
                  className="rounded border px-2 py-1 text-[#B42318]"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
function CategoryPlacement({
  section,
  taxonomy,
  save,
}: {
  section: Section;
  taxonomy: TaxonomyNode[];
  save: (s: Section) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const move = (index: number, delta: number) => {
    const ids = [...section.categoryIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void save({ ...section, categoryIds: ids });
  };
  return (
    <>
      <div className="mt-4 flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-10 flex-1 rounded-md border px-3"
        >
          <option value="">Select canonical category</option>
          {taxonomy
            .filter((item) => !section.categoryIds.includes(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => {
            void save({
              ...section,
              categoryIds: [...section.categoryIds, selected],
            });
            setSelected("");
          }}
          className="rounded-md bg-[#176B5C] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <ol className="mt-4 divide-y">
        {section.categoryIds.map((id, index) => {
          const category = taxonomy.find((item) => item.id === id);
          return (
            <li key={id} className="flex justify-between py-3">
              <strong>{category?.label ?? "Invalid category"}</strong>
              <span className="flex gap-1">
                <button
                  aria-label="Move category up"
                  onClick={() => move(index, -1)}
                  className="rounded border px-2"
                >
                  ↑
                </button>
                <button
                  aria-label="Move category down"
                  onClick={() => move(index, 1)}
                  className="rounded border px-2"
                >
                  ↓
                </button>
                <button
                  onClick={() =>
                    void save({
                      ...section,
                      categoryIds: section.categoryIds.filter(
                        (item) => item !== id,
                      ),
                    })
                  }
                  className="rounded border px-2 text-[#B42318]"
                >
                  Remove
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
function Promotions({
  data,
  products,
  refresh,
  notify,
}: {
  data: Data;
  products: ProductChoice[];
  refresh: () => Promise<unknown>;
  notify: (v: string) => void;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = String(form.get("productId"));
    await apiRequest("/api/admin/merchandising/promotions", {
      method: "PUT",
      body: JSON.stringify({
        id: `promotion-${crypto.randomUUID()}`,
        name: form.get("name"),
        internalReference: form.get("reference"),
        enabled: false,
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        badgeText: form.get("badge"),
        products: [{ productId, promotionalPrice: Number(form.get("price")) }],
      }),
    });
    await refresh();
    formElement.reset();
    notify("Draft promotion created.");
  };
  const toggle = async (promotion: Promotion) => {
    const payload = {
      id: promotion.id,
      name: promotion.name,
      internalReference: promotion.internalReference,
      enabled: !promotion.enabled,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      badgeText: promotion.badgeText,
      publicLabel: promotion.publicLabel,
      products: promotion.products,
    };
    await apiRequest("/api/admin/merchandising/promotions", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await refresh();
    notify(promotion.enabled ? "Promotion disabled." : "Promotion enabled.");
  };
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
      <form onSubmit={submit} className="rounded-lg border bg-white p-5">
        <h2 className="font-black">Create promotion draft</h2>
        {[
          ["name", "Promotion name"],
          ["reference", "Internal reference"],
          ["badge", "Badge text"],
          ["startsAt", "Starts"],
          ["endsAt", "Ends"],
          ["price", "Promotional price"],
        ].map(([name, label]) => (
          <label key={name} className="mt-3 block text-sm font-bold">
            {label}
            <input
              required
              name={name}
              type={
                name === "startsAt" || name === "endsAt"
                  ? "datetime-local"
                  : name === "price"
                    ? "number"
                    : "text"
              }
              step={name === "price" ? "0.01" : undefined}
              className="mt-1 h-10 w-full rounded-md border px-3"
            />
          </label>
        ))}
        <label className="mt-3 block text-sm font-bold">
          Published Product
          <select
            required
            name="productId"
            className="mt-1 h-10 w-full rounded-md border px-3"
          >
            <option value="">Select Product</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · regular{" "}
                {formatCurrency(item.regularPrice ?? item.price, "ZAR")}
              </option>
            ))}
          </select>
        </label>
        <button className="mt-4 rounded-md bg-[#176B5C] px-4 py-2 text-sm font-black text-white">
          Create draft
        </button>
      </form>
      <section className="space-y-3">
        {data.promotions.map((promotion) => (
          <article
            key={promotion.id}
            className="rounded-lg border bg-white p-5"
          >
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-black">{promotion.name}</h3>
                <p className="text-xs text-[#667085]">
                  {promotion.internalReference} ·{" "}
                  {new Date(promotion.startsAt).toLocaleString("en-ZA")} –{" "}
                  {new Date(promotion.endsAt).toLocaleString("en-ZA")}
                </p>
              </div>
              <AdminStatusBadge
                label={promotion.status}
                status={promotion.status}
              />
            </div>
            <div className="mt-3 text-sm">
              {promotion.products.map((item) => (
                <p key={item.productId}>
                  {products.find((product) => product.id === item.productId)
                    ?.name ?? item.productId}
                  : {formatCurrency(item.promotionalPrice, "ZAR")}
                </p>
              ))}
            </div>
            {promotion.warnings.map((warning) => (
              <p
                key={warning}
                className="mt-2 text-sm font-bold text-[#B54708]"
              >
                {warning}
              </p>
            ))}
            <button
              onClick={() => void toggle(promotion)}
              className="mt-3 rounded border px-3 py-2 text-sm font-black"
            >
              {promotion.enabled ? "Disable" : "Enable"}
            </button>
          </article>
        ))}
        {!data.promotions.length && (
          <p className="rounded-lg border bg-white p-5 text-sm text-[#667085]">
            No promotions configured.
          </p>
        )}
      </section>
    </div>
  );
}
