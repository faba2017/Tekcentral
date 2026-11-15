import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isAdminHost } from "@/lib/admin-host";
const privatePath = /^\/(admin(?:\/|$)|account(?:\/|$)|cart$|checkout$|orders(?:\/|$)|order(?:\/|$)|payment(?:\/|$)|compare$)/;
export function RouteMetadata() { const location = useLocation(); useEffect(() => { let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]'); if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); } robots.content = isAdminHost() || privatePath.test(location.pathname) ? "noindex,nofollow" : "index,follow"; }, [location.pathname]); return null; }
