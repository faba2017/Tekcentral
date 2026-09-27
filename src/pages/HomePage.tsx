import {
  Component,
  lazy,
  Suspense,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FiMenu, FiSearch, FiShoppingCart, FiUser, FiX } from "react-icons/fi";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { BusinessSolutionsSection } from "@/components/sections/BusinessSolutionsSection";
import { CategorySection } from "@/components/sections/CategorySection";
import { FeaturedCollectionsSection } from "@/components/sections/FeaturedCollectionsSection";
import { FeaturedProductsSection } from "@/components/sections/FeaturedProductsSection";
import { FinalCtaSection } from "@/components/sections/FinalCtaSection";
import { ProductCollectionSection } from "@/components/sections/ProductCollectionSection";
import { RoboIntroSection } from "@/components/sections/RoboIntroSection";
import { WhyShopSection } from "@/components/sections/WhyShopSection";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/page-title";
import { useCart } from "@/state/cart";
import "./HomePage.css";

const ZeusScene = lazy(() =>
  import("@/components/ui/robot-hero").then((module) => ({
    default: module.ZeusScene,
  })),
);

class HeroEffectBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback ?? null : this.props.children;
  }
}

const storeNavItems = [
  {
    label: "Shop",
    href: "/shop",
    desktopOrder: 10,
    mobileOrder: 10,
  },
  {
    label: "Categories",
    href: "/shop",
    desktopOrder: 20,
    mobileOrder: 20,
  },
  {
    label: "Computers",
    href: "/category/computers",
    mobileOrder: 30,
  },
  {
    label: "Networking",
    href: "/category/networking",
    mobileOrder: 40,
  },
  {
    label: "Printing & Office",
    href: "/category/printing-office",
    mobileOrder: 50,
  },
  {
    label: "Security",
    href: "/category/security",
    mobileOrder: 60,
  },
  {
    label: "Power",
    href: "/category/power",
    mobileOrder: 70,
  },
  {
    label: "Smart Tech",
    href: "/category/smart-tech",
    mobileOrder: 80,
  },
  {
    label: "Accessories",
    href: "/category/accessories",
    mobileOrder: 90,
  },
  {
    label: "Business",
    mobileLabel: "Business Solutions",
    href: "/business",
    desktopOrder: 30,
    mobileOrder: 100,
  },
  {
    label: "Ask Zeus",
    href: "/zeus",
    desktopOrder: 40,
    mobileOrder: 110,
  },
  {
    label: "About",
    href: "/about",
    desktopOrder: 50,
  },
  {
    label: "Account",
    href: "/account",
    mobileOrder: 120,
  },
];

const desktopNavItems = storeNavItems
  .filter((item) => item.desktopOrder)
  .sort((a, b) => Number(a.desktopOrder) - Number(b.desktopOrder));

const mobileNavItems = storeNavItems
  .filter((item) => item.mobileOrder)
  .sort((a, b) => Number(a.mobileOrder) - Number(b.mobileOrder));

export function HomePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  usePageTitle("TekCentral | Technology, made easier.");

  return (
    <>
      <ContainedHero
        onNavigate={navigate}
        reduceMotion={Boolean(reduceMotion)}
      />
      <FeaturedCollectionsSection onNavigate={navigate} />
      <CategorySection onNavigate={navigate} />
      <FeaturedProductsSection />
      <BusinessSolutionsSection onNavigate={navigate} />
      <RoboIntroSection onNavigate={navigate} />
      <ProductCollectionSection />
      <WhyShopSection />
      <FinalCtaSection onNavigate={navigate} />
    </>
  );
}

function ContainedHero({
  onNavigate,
  reduceMotion,
}: {
  onNavigate: (path: string) => void;
  reduceMotion: boolean;
}) {
  return (
    <section className="overflow-x-hidden bg-[#07090C]">
      <div className="hero-product-stage relative min-h-[790px] w-full overflow-hidden bg-[#07090C] text-white min-[521px]:min-h-[860px] sm:min-h-[900px] min-[900px]:min-h-[760px] lg:min-h-[800px]">
        <div className="hero-circuit-lines pointer-events-none absolute inset-0 opacity-55" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_52%,rgba(70,157,139,0.25),transparent_31%),linear-gradient(90deg,rgba(7,9,12,0.98)_0%,rgba(7,9,12,0.86)_42%,rgba(7,9,12,0.32)_76%,rgba(7,9,12,0.82)_100%)]" aria-hidden="true" />
        <HeroNav onNavigate={onNavigate} />
        <div className="relative z-[3] mx-auto grid min-h-[790px] w-full max-w-[1440px] min-w-0 items-center gap-3 overflow-hidden px-5 pb-6 pt-28 min-[521px]:min-h-[860px] min-[521px]:gap-6 min-[521px]:pb-10 sm:min-h-[900px] sm:px-8 sm:pt-32 min-[900px]:min-h-[760px] min-[900px]:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)] min-[900px]:gap-2 min-[900px]:px-10 min-[900px]:pb-12 min-[900px]:pt-28 lg:min-h-[800px] xl:px-16">
          <HeroMessage onNavigate={onNavigate} reduceMotion={reduceMotion} />
          <HeroProductComposition reduceMotion={reduceMotion} />
        </div>
      </div>
    </section>
  );
}

function HeroNav({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { itemCount } = useCart();

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="absolute left-1/2 top-5 z-[5] w-full -translate-x-1/2 px-2 sm:top-7 sm:px-5 min-[900px]:top-7 min-[900px]:px-0">
      <nav
        className="relative mx-auto flex h-[58px] w-full max-w-[calc(100vw-1rem)] items-center justify-between gap-2 rounded-[22px] border border-white/[0.12] bg-[rgba(24,20,38,0.76)] px-2.5 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-[18px] sm:h-[62px] sm:max-w-[calc(100vw-2.5rem)] sm:gap-3 sm:px-3 min-[900px]:h-[72px] min-[900px]:w-[calc(100%_-_32px)] min-[900px]:max-w-[1180px] min-[900px]:gap-2 min-[900px]:px-3 min-[900px]:py-[10px] min-[1200px]:w-[calc(100%_-_80px)] min-[1200px]:gap-6 min-[1200px]:px-5 xl:px-6"
        aria-label="Homepage"
      >
        <Link
          to="/"
          className="flex shrink-0 items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3]"
          aria-label="TekCentral home"
        >
          <span className="min-w-0 text-[1rem] font-black leading-none tracking-[-0.01em] text-white min-[430px]:text-[1.18rem] sm:text-[1.55rem] min-[900px]:text-[1.22rem] min-[1100px]:text-[1.45rem] xl:text-[1.65rem]">
            Tek<span className="text-[#00E6C3]">Central</span>
          </span>
        </Link>

        <div
          data-store-header-desktop-nav
          className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 min-[900px]:flex min-[1200px]:gap-2 xl:gap-3"
        >
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "shrink-0 rounded-full px-1.5 py-2 text-[11px] font-extrabold text-white/78 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] min-[960px]:px-2 min-[1040px]:text-xs min-[1120px]:px-2.5 min-[1120px]:text-[13px] min-[1200px]:px-3 xl:px-3.5 xl:text-sm",
                  item.label === "Ask Zeus" &&
                    "bg-[#00E6C3] px-2.5 text-[#06100E] shadow-[0_0_24px_rgba(0,230,195,0.2)] hover:bg-white hover:text-[#06100E] min-[1120px]:px-3.5 xl:px-4",
                  isActive && "bg-white/[0.1] text-white",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div
          data-store-header-utilities
          className="hidden shrink-0 items-center gap-1 min-[900px]:flex min-[1200px]:gap-1.5 xl:gap-2"
        >
          <HeroSearchButton onNavigate={onNavigate} />
          <NavIconLink to="/account" label="Account">
            <FiUser aria-hidden="true" />
          </NavIconLink>
          <NavIconLink to="/cart" label="Cart">
            <FiShoppingCart aria-hidden="true" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#00E6C3] px-1 text-[10px] font-black text-[#06100E]">
                {itemCount}
              </span>
            )}
          </NavIconLink>
        </div>

        <div
          data-store-header-mobile-controls
          className="ml-auto flex items-center gap-1.5 sm:gap-2 min-[900px]:hidden"
        >
          <button
            type="button"
            onClick={() => onNavigate("/shop")}
            className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] text-xs font-black text-white transition hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] sm:h-10 sm:w-auto sm:px-2.5"
            aria-label="Search"
          >
            <FiSearch aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
          </button>
          <Link
            to="/cart"
            className="relative inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] text-xs font-black text-white transition hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] sm:h-10 sm:w-auto sm:px-2.5"
            aria-label={`Cart${itemCount ? `, ${itemCount} items` : ""}`}
          >
            <FiShoppingCart aria-hidden="true" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#00E6C3] px-1 text-[10px] font-black text-[#06100E]">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white text-xs font-black text-[#07090C] transition hover:bg-[#00E6C3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] sm:h-10 sm:w-auto sm:px-2.5"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="absolute left-3 right-3 top-[calc(100%+0.7rem)] z-[6] rounded-2xl border border-white/[0.14] bg-[#07090C]/96 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:left-5 sm:right-5 min-[900px]:hidden">
          <HeroSearchForm onNavigate={onNavigate} onSubmitComplete={closeDrawer} />
          <div className="mt-3 grid gap-1">
            {mobileNavItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={closeDrawer}
                className={cn(
                  "rounded-xl px-3 py-3 text-sm font-black text-white/78 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3]",
                  item.label === "Ask Zeus" &&
                    "border border-[#00E6C3]/40 bg-[#00E6C3] text-[#06100E] hover:bg-white hover:text-[#06100E]",
                )}
              >
                {"mobileLabel" in item ? item.mobileLabel : item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroSearchButton({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate("/shop")}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.08] text-[13px] font-extrabold text-white/78 transition hover:bg-white/[0.14] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] min-[1200px]:w-auto min-[1200px]:px-3 xl:text-sm"
      aria-label="Search"
    >
      <FiSearch aria-hidden="true" />
      <span className="hidden min-[1200px]:inline">Search</span>
    </button>
  );
}

function HeroSearchForm({
  onNavigate,
  onSubmitComplete,
}: {
  onNavigate: (path: string) => void;
  onSubmitComplete?: () => void;
}) {
  const [query, setQuery] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    onNavigate(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : "/shop");
    onSubmitComplete?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.08] px-3 py-2 text-white"
      role="search"
    >
      <FiSearch className="shrink-0 text-white/62" aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white placeholder:text-white/42 focus:outline-none lg:w-24 xl:w-32"
        aria-label="Search products"
      />
    </form>
  );
}

function NavIconLink({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.08] text-[13px] font-extrabold text-white/78 transition hover:bg-white/[0.14] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] min-[1200px]:w-auto min-[1200px]:px-3 xl:text-sm"
      aria-label={label}
      title={label}
    >
      {children}
      <span className="hidden min-[1200px]:inline">{label}</span>
    </Link>
  );
}

function HeroMessage({
  onNavigate,
  reduceMotion,
}: {
  onNavigate: (path: string) => void;
  reduceMotion: boolean;
}) {
  const entrance = reduceMotion
    ? {
        initial: false as const,
        animate: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <div className="relative z-[4] flex w-full min-w-0 flex-col justify-center overflow-hidden text-left max-[899px]:items-center max-[899px]:text-center">
      <motion.div
        {...entrance}
        className="pointer-events-auto flex w-full min-w-0 flex-col max-[899px]:items-center"
      >
        <p className="max-w-full text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#00E6C3] sm:text-xs sm:tracking-[0.2em]">
          Technology for home, work & business
        </p>
        <h1
          className="mt-5 w-full max-w-[720px] break-words text-[2rem] font-black leading-[0.98] tracking-normal text-white min-[430px]:text-[2.35rem] sm:text-[3.6rem] min-[900px]:text-[clamp(3.25rem,5vw,4.7rem)]"
          style={{ textShadow: "0 18px 60px rgba(0,0,0,0.7)" }}
        >
          <span className="block">Computers,</span>
          <span className="block">Networking &amp; Office Tech.</span>
          <span className="mt-1 block">All in One Place.</span>
        </h1>
        <p
          className="mt-6 max-w-[620px] text-base font-semibold leading-7 text-white/75 sm:text-lg"
          style={{ textShadow: "0 12px 42px rgba(0,0,0,0.72)" }}
        >
          Shop computers, networking, printers, security, power, accessories and more, with Zeus ready to help you choose the right setup.
        </p>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <button
            type="button"
            onClick={() => onNavigate("/shop")}
            className="hero-shop-cta rounded-lg bg-[#00E6C3] px-6 py-3.5 text-sm font-black text-[#06110F] shadow-[0_16px_42px_rgba(0,230,195,0.18)] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#07090C]"
          >
            Shop Technology
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/zeus")}
            className="rounded-lg border border-white/35 bg-black/15 px-6 py-3.5 text-sm font-black text-white backdrop-blur-xl transition hover:border-[#00E6C3] hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] focus-visible:ring-offset-4 focus-visible:ring-offset-[#07090C]"
          >
            Ask Zeus
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const heroProducts = [
  { id: "wireless", name: "Ubiquiti wireless access point", image: "/images/hero/ubiquiti-aircube-acb-isp.png", href: "/category/networking", className: "hero-product-wireless" },
  { id: "switch", name: "Cudy managed network switch", image: "/images/hero/cudy-managed-switch.png", href: "/category/networking", className: "hero-product-switch" },
  { id: "ups", name: "FSP uninterruptible power supply", image: "/images/hero/ups-power.png", href: "/category/power", className: "hero-product-ups" },
  { id: "phone", name: "Fanvil office IP phone", image: "/images/hero/fanvil-ip-phone.png", href: "/category/printing-office", className: "hero-product-phone" },
  { id: "printer", name: "Canon office printer", image: "/images/hero/office-printer.png", href: "/category/printing-office", className: "hero-product-printer" },
  { id: "cable", name: "Cat6 Ethernet cable", image: "/images/hero/ethernet-cat6-cable-transparent.png", href: "/category/accessories", className: "hero-product-cable" },
] as const;

function HeroProductComposition({ reduceMotion }: { reduceMotion: boolean }) {
  const entrance = reduceMotion ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } } : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.65, delay: 0.15, ease: [0.22, 1, 0.36, 1] } };
  return <motion.div {...entrance} className="hero-product-composition relative mx-auto h-[310px] w-full min-w-0 max-w-[650px] min-[521px]:h-[420px] sm:h-[470px] min-[900px]:h-[580px]" aria-label="Shop technology categories">
    <div className="hero-product-glow pointer-events-none absolute inset-[12%_2%_2%_5%] rounded-full bg-[radial-gradient(circle,rgba(0,230,195,0.2),rgba(70,157,139,0.08)_38%,transparent_70%)] blur-2xl" aria-hidden="true" />
    {heroProducts.map((product, index) => <Link key={product.id} to={product.href} aria-label={`Shop ${product.name}`} className={`hero-product-layer ${product.className} group absolute focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3]`}>
      <img src={product.image} alt={product.name} width="900" height="800" loading="eager" fetchPriority={index < 2 ? "high" : "auto"} className="h-full w-full object-contain" />
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#07090C]/85 px-2 py-1 text-[10px] font-black text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">{product.name}</span>
    </Link>)}
    <Link to="/zeus" aria-label="Ask Zeus for help matching your setup" className="hero-zeus group absolute right-[1%] top-[2%] z-20 h-[124px] w-[124px] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E6C3] min-[430px]:h-[145px] min-[430px]:w-[145px] min-[900px]:right-[-2%] min-[900px]:top-[5%] min-[900px]:h-[170px] min-[900px]:w-[170px]">
      <span className="absolute right-[72%] top-0 w-[170px] rounded-lg border border-white/20 bg-[#14151C]/95 px-3 py-2 text-xs font-semibold leading-5 text-white shadow-[0_12px_35px_rgba(0,0,0,0.45)] min-[900px]:w-[190px]">Need help matching your setup? I can help.</span>
      <HeroEffectBoundary fallback={<span className="absolute inset-5 rounded-full border border-[#00E6C3]/50 bg-[#0D1716]" aria-hidden="true" />}><Suspense fallback={null}><ZeusScene className="absolute inset-0" color="#8A8A8A" scale={0.9} pantallaColor="#00ffc6" pantallaBrillo={1.3} blinkCycle={3} metalness={0} sceneOffsetY={0.03} motionRange={0.18} /></Suspense></HeroEffectBoundary>
    </Link>
  </motion.div>;
}
