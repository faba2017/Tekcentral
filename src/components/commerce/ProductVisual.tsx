import { useState } from "react";
import type { Product } from "@/types/product";
import { cn } from "@/lib/utils";
import { resolveProductImageUrl } from "@/lib/image-url";
import {
  FiBatteryCharging,
  FiCpu,
  FiHardDrive,
  FiMonitor,
  FiPrinter,
  FiRadio,
  FiShield,
} from "react-icons/fi";

const categoryVisuals = {
  computers: {
    label: "Computer visual",
    icon: FiMonitor,
    beam: "from-[#DDE5FF]",
  },
  networking: {
    label: "Network visual",
    icon: FiRadio,
    beam: "from-[#D6FFF6]",
  },
  "printing-office": {
    label: "Office technology visual",
    icon: FiPrinter,
    beam: "from-[#E4E7EC]",
  },
  security: {
    label: "Security visual",
    icon: FiShield,
    beam: "from-[#DDE5FF]",
  },
  power: {
    label: "Power visual",
    icon: FiBatteryCharging,
    beam: "from-[#D6FFF6]",
  },
  "smart-tech": {
    label: "Smart technology visual",
    icon: FiCpu,
    beam: "from-[#E4E7EC]",
  },
  accessories: {
    label: "Accessory visual",
    icon: FiHardDrive,
    beam: "from-[#E4E7EC]",
  },
};

interface ProductVisualProps {
  product: Product;
  large?: boolean;
}

export function ProductVisual({ product, large = false }: ProductVisualProps) {
  const visual =
    categoryVisuals[product.categorySlug as keyof typeof categoryVisuals] ??
    categoryVisuals.accessories;
  const Icon = visual.icon;
  const imageUrl = resolveProductImageUrl(product.images?.[0]);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const showImage = Boolean(imageUrl && imageUrl !== failedImageUrl);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-[#E4E7EC] bg-[#F6F7F9]",
        large ? "aspect-[5/4] place-items-center p-8" : "aspect-[4/3] place-items-center p-5",
      )}
      role="img"
      aria-label={`${visual.label} for ${product.name}`}
    >
      {showImage && (
        <img src={imageUrl} alt="" onError={() => setFailedImageUrl(imageUrl)} className="absolute inset-0 h-full w-full object-contain p-4" />
      )}
      {!showImage && <>
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br via-white to-white",
          visual.beam,
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(70,157,139,0.24),transparent_32%),linear-gradient(135deg,rgba(10,10,10,0.04),transparent_42%)]" />
      <div className="absolute inset-x-8 bottom-8 h-3 rounded-full bg-[#0A0A0A]/10 blur-md" />

      <div
        className={cn(
          "absolute rounded-lg border border-[#0A0A0A]/10 bg-white/70 shadow-[0_22px_50px_rgba(10,10,10,0.14)] backdrop-blur",
          large
            ? "bottom-20 right-14 h-32 w-52"
            : "bottom-12 right-7 h-20 w-32",
        )}
      />
      <div
        className={cn(
          "absolute rounded-md border border-[var(--tek-accent)]/35 bg-[#0A0A0A] text-[var(--tek-accent)] shadow-[0_14px_36px_rgba(10,10,10,0.18)]",
          large
            ? "left-10 top-10 grid h-20 w-20 place-items-center text-3xl"
            : "left-5 top-5 grid h-14 w-14 place-items-center text-xl",
        )}
      >
        <Icon aria-hidden="true" />
      </div>
      <div
        className={cn(
          "absolute rounded-full border border-[var(--tek-accent)]/20 bg-white/55",
          large ? "bottom-12 left-14 h-16 w-16" : "bottom-7 left-8 h-10 w-10",
        )}
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-end">
        <div className="max-w-[80%]">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--tek-accent)]">
            {product.category}
          </p>
          <p
            className={cn(
              "mt-2 font-black leading-tight text-[#0A0A0A]",
              large ? "text-3xl" : "text-lg",
            )}
          >
            {product.brand}
          </p>
        </div>
      </div>
      </>}
    </div>
  );
}
