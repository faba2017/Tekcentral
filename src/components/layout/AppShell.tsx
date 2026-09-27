import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { CartToast } from "@/components/commerce/CartToast";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const isAdminPage = location.pathname.startsWith("/admin");

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0A0A0A]">
      {!isHomePage && !isAdminPage && <AppHeader />}
      <main>{children}</main>
      {!isAdminPage && <CartToast />}
      {!isAdminPage && <AppFooter />}
    </div>
  );
}
