import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return null;
}
