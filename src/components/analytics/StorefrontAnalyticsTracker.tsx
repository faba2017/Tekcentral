import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordStorefrontEvent } from "@/lib/storefront-analytics";
import { useStorefrontCatalogue } from "@/state/catalogue";

export function StorefrontAnalyticsTracker() {
  const location = useLocation(); const { products, loading } = useStorefrontCatalogue();
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    const productRoute = location.pathname.startsWith("/product/");
    const product = productRoute ? products.find((item) => `/product/${item.slug}` === location.pathname) : undefined;
    if (productRoute && loading) return;
    const key = `tekcentral.analytics.route.${location.pathname}`; const last = Number(window.sessionStorage.getItem(key) ?? 0); if (Date.now() - last < 1_500) return; window.sessionStorage.setItem(key, String(Date.now()));
    const type = product ? "PRODUCT_VIEW" : location.pathname === "/checkout" ? "CHECKOUT_START" : "PAGE_VIEW";
    void recordStorefrontEvent(type, { path: location.pathname, productId: product?.id, category: product?.category }).catch(() => undefined);
  }, [loading, location.pathname, products]);
  useEffect(() => { if (location.pathname.startsWith("/admin")) return; const heartbeat = () => void recordStorefrontEvent("HEARTBEAT", { path: window.location.pathname }).catch(() => undefined); const id = window.setInterval(heartbeat, 120_000); return () => window.clearInterval(id); }, [location.pathname]);
  return null;
}
