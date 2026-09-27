import { apiBaseUrl } from "@/lib/api";

export function resolveProductImageUrl(value?: string) {
  const imageUrl = value?.trim();
  if (!imageUrl) return undefined;
  if (/^(https?:|data:|blob:)/i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith("/api/")) return `${apiBaseUrl.replace(/\/$/, "")}${imageUrl}`;
  return imageUrl;
}
