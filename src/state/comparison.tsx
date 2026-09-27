import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ComparisonContextValue {
  productIds: string[];
  toggleProduct: (productId: string) => void;
  clearComparison: () => void;
  isComparing: (productId: string) => boolean;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [productIds, setProductIds] = useState<string[]>([]);

  const toggleProduct = useCallback((productId: string) => {
    setProductIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }
      return [...current, productId].slice(-3);
    });
  }, []);

  const clearComparison = useCallback(() => setProductIds([]), []);
  const isComparing = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds],
  );

  const value = useMemo(
    () => ({ productIds, toggleProduct, clearComparison, isComparing }),
    [clearComparison, isComparing, productIds, toggleProduct],
  );

  return (
    <ComparisonContext.Provider value={value}>
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error("useComparison must be used inside ComparisonProvider");
  }
  return context;
}
