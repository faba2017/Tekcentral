import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";
import type { ReactNode } from "react";
import type { AdminToastVariant } from "@/lib/cj-workflow";

export interface AdminToastMessage {
  id: string;
  variant: AdminToastVariant;
  title?: string;
  message: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const toastClasses: Record<AdminToastVariant, string> = {
  success: "border-[#B8EACF] bg-[#F0FFF6]",
  warning: "border-[#FEDF89] bg-[#FFFAEB]",
  error: "border-[#FDA29B] bg-[#FFFBFA]",
  info: "border-[#B9E2DB] bg-[#EFFFFB]",
};

function ToastIcon({ variant }: { variant: AdminToastVariant }) {
  if (variant === "success") return <FiCheckCircle aria-hidden="true" />;
  if (variant === "error" || variant === "warning") return <FiAlertCircle aria-hidden="true" />;
  return <FiInfo aria-hidden="true" />;
}

export function AdminToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: AdminToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="fixed right-4 top-4 z-[100] grid w-[min(420px,calc(100vw-2rem))] gap-3"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-semibold text-[#0A0A0A] shadow-lg ${toastClasses[toast.variant]}`}
        >
          <span className="mt-0.5">
            <ToastIcon variant={toast.variant} />
          </span>
          <span className="min-w-0 flex-1">
            {toast.title && <span className="block font-black">{toast.title}</span>}
            <span className={toast.title ? "mt-1 block" : "block"}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={toast.action.onClick}
                className="mt-3 rounded-md bg-[#0A0A0A] px-3 py-2 text-xs font-black text-white"
              >
                {toast.action.label}
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="rounded p-1 text-[#3F4652] hover:bg-white/70"
            aria-label="Dismiss notification"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
