import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api";

export interface CustomerProfile { id: string; email: string; firstName: string; lastName: string; phone?: string; status: "ACTIVE" | "DISABLED"; createdAt: string; updatedAt: string; lastLoginAt?: string }
type AuthState = "loading" | "authenticated" | "unauthenticated";
interface CustomerAuthValue { state: AuthState; customer?: CustomerProfile; refresh(): Promise<void>; register(input: { firstName: string; lastName: string; email: string; password: string; recaptchaToken: string }): Promise<void>; login(input: { email: string; password: string }): Promise<void>; logout(): Promise<void>; updateProfile(input: { firstName: string; lastName: string; phone?: string }): Promise<void> }

const CustomerAuthContext = createContext<CustomerAuthValue | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [customer, setCustomer] = useState<CustomerProfile>();
  const refresh = useCallback(async () => { try { const result = await apiRequest<{ customer: CustomerProfile }>("/api/account/me"); setCustomer(result.customer); setState("authenticated"); } catch { setCustomer(undefined); setState("unauthenticated"); } }, []);
  useEffect(() => {
    let active = true;
    void apiRequest<{ customer: CustomerProfile }>("/api/account/me")
      .then((result) => { if (active) { setCustomer(result.customer); setState("authenticated"); } })
      .catch(() => { if (active) { setCustomer(undefined); setState("unauthenticated"); } });
    return () => { active = false; };
  }, []);
  const establish = (next: CustomerProfile) => { setCustomer(next); setState("authenticated"); };
  const value = useMemo<CustomerAuthValue>(() => ({ state, customer, refresh,
    async register(input) { const result = await apiRequest<{ customer: CustomerProfile }>("/api/account/register", { method: "POST", body: JSON.stringify(input) }); establish(result.customer); },
    async login(input) { const result = await apiRequest<{ customer: CustomerProfile }>("/api/account/login", { method: "POST", body: JSON.stringify(input) }); establish(result.customer); },
    async logout() { await apiRequest("/api/account/logout", { method: "POST" }); setCustomer(undefined); setState("unauthenticated"); },
    async updateProfile(input) { const result = await apiRequest<{ customer: CustomerProfile }>("/api/account/profile", { method: "PATCH", body: JSON.stringify(input) }); establish(result.customer); },
  }), [state, customer, refresh]);
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() { const value = useContext(CustomerAuthContext); if (!value) throw new Error("useCustomerAuth must be used within CustomerAuthProvider."); return value; }
