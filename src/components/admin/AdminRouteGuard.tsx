import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getStaffSession, type StaffSessionView } from "@/lib/staff-auth";
import { adminPath } from "@/lib/admin-host";
import { StaffSessionProvider, hasStaffPermission } from "@/state/staff-session";
import { permissionForAdminPage } from "@/lib/admin-page-permissions";

export function AdminRouteGuard() {
  const location = useLocation();
  const [session, setSession] = useState<StaffSessionView>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; getStaffSession().then((value) => { if (active) setSession(value); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, []);
  if (!session && !failed) return <div role="status" className="grid min-h-[50vh] place-items-center bg-[#F6F7F9] p-6 text-sm font-bold text-[#727986]">Checking staff access…</div>;
  if (failed || !session?.authenticated) return <Navigate to={adminPath("login")} replace state={{ from: location.pathname }} />;
  if (session.mustChangePassword && location.pathname !== adminPath("change-password")) return <Navigate to={adminPath("change-password")} replace />;
  if (session.staff?.twoFactorRequired && !session.staff.twoFactorEnabled && location.pathname !== adminPath("account")) return <Navigate to={adminPath("account")} replace />;
  const required = permissionForAdminPage(location.pathname);
  if (required && !hasStaffPermission(session, required)) return <Navigate to={adminPath("forbidden")} replace />;
  return <StaffSessionProvider value={session}><Outlet /></StaffSessionProvider>;
}

