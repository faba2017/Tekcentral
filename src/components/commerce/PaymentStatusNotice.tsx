import { type ReactNode } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiInfo,
  FiLock,
} from "react-icons/fi";

export type PaymentStatusNoticeVariant =
  | "info"
  | "pending"
  | "success"
  | "warning"
  | "error";

interface PaymentStatusNoticeProps {
  variant?: PaymentStatusNoticeVariant;
  title: string;
  message: string;
  helper?: string;
  loading?: boolean;
  actions?: ReactNode;
  className?: string;
}

const variantStyles: Record<
  PaymentStatusNoticeVariant,
  { container: string; iconWrap: string; icon: ReactNode; live: "polite" | "assertive" }
> = {
  info: {
    container: "border-[#B9E2DB] bg-[#EFFFFB] text-[#0A0A0A]",
    iconWrap: "bg-white text-[var(--tek-accent)]",
    icon: <FiInfo aria-hidden="true" />,
    live: "polite",
  },
  pending: {
    container: "border-[#B9E2DB] bg-[#F4FFFD] text-[#0A0A0A]",
    iconWrap: "bg-white text-[var(--tek-accent)]",
    icon: <FiClock aria-hidden="true" />,
    live: "polite",
  },
  success: {
    container: "border-[#B8EACF] bg-[#F0FFF6] text-[#0A0A0A]",
    iconWrap: "bg-white text-[#17B26A]",
    icon: <FiCheckCircle aria-hidden="true" />,
    live: "polite",
  },
  warning: {
    container: "border-[#FEDF89] bg-[#FFFAEB] text-[#0A0A0A]",
    iconWrap: "bg-white text-[#B54708]",
    icon: <FiAlertCircle aria-hidden="true" />,
    live: "polite",
  },
  error: {
    container: "border-[#FDA29B] bg-[#FFFBFA] text-[#0A0A0A]",
    iconWrap: "bg-white text-[#B42318]",
    icon: <FiAlertCircle aria-hidden="true" />,
    live: "assertive",
  },
};

export function PaymentStatusNotice({
  variant = "info",
  title,
  message,
  helper,
  loading = false,
  actions,
  className = "",
}: PaymentStatusNoticeProps) {
  const styles = variantStyles[variant];

  return (
    <section
      className={`rounded-lg border p-4 shadow-sm ${styles.container} ${className}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={styles.live}
      tabIndex={variant === "error" ? -1 : undefined}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-xl shadow-sm ${styles.iconWrap}`}
        >
          {loading ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : variant === "info" ? (
            <FiLock aria-hidden="true" />
          ) : (
            styles.icon
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-[#0A0A0A]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#3F4652]">{message}</p>
          {helper && (
            <p className="mt-2 text-xs font-semibold leading-5 text-[#727986]">
              {helper}
            </p>
          )}
          {actions && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {actions}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
