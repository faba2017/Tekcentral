import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStorefrontCatalogue } from "@/state/catalogue";

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartToast {
  id: number;
  productName: string;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  toast?: CartToast;
  dismissToast: () => void;
  addProduct: (productId: string, quantity?: number) => void;
  removeProduct: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  restoreCart: (lines: CartLine[]) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const storageKey = "project-claude-demo-cart";

function readInitialCart(): CartLine[] {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) =>
        typeof line.productId === "string" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useStorefrontCatalogue();
  const [lines, setLines] = useState<CartLine[]>(readInitialCart);
  const [toast, setToast] = useState<CartToast | undefined>();
  const recentAddsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [lines]);

  const addProduct = useCallback((productId: string, quantity = 1) => {
    const now = Date.now();
    if (recentAddsRef.current[productId] && now - recentAddsRef.current[productId] < 650) return;
    recentAddsRef.current = { ...recentAddsRef.current, [productId]: now };
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
            : line,
        );
      }
      return [...current, { productId, quantity: Math.max(1, quantity) }];
    });
    const product = products.find((item) => item.id === productId);
    setToast({
      id: now,
      productName: product?.name ?? "Product",
      quantity: Math.max(1, quantity),
    });
  }, [products]);

  const dismissToast = useCallback(() => setToast(undefined), []);

  const removeProduct = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.max(0, Math.min(99, quantity)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => setLines([]), []);
  const restoreCart = useCallback((nextLines: CartLine[]) => {
    setLines(
      nextLines.filter(
        (line) =>
          typeof line.productId === "string" &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0,
      ),
    );
  }, []);

  const value = useMemo(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => {
      const item = products.find((product) => product.id === line.productId);
      return sum + (item?.price ?? 0) * line.quantity;
    }, 0);

    return {
      lines,
      itemCount,
      subtotal,
      toast,
      dismissToast,
      addProduct,
      removeProduct,
      updateQuantity,
      restoreCart,
      clearCart,
    };
  }, [addProduct, clearCart, dismissToast, lines, products, removeProduct, restoreCart, toast, updateQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
