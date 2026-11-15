import { createContext, useContext, type ReactNode } from "react";
import type { StaffSessionView } from "@/lib/staff-auth";

const StaffSessionContext = createContext<StaffSessionView | undefined>(undefined);
export function StaffSessionProvider({ value, children }: { value: StaffSessionView; children: ReactNode }) { return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>; }
export function useStaffSession() { const value = useContext(StaffSessionContext); if (!value) throw new Error("Staff session context is unavailable."); return value; }
export function hasStaffPermission(session: StaffSessionView | undefined, permission: string) { return Boolean(session?.effectivePermissions?.includes(permission)); }

