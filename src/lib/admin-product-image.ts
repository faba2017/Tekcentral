import { apiBaseUrl } from "@/lib/api";

export function resolveAdminProductImageUrl(src?: string) {
  return src?.startsWith("/api/public/assets/products/") ? `${apiBaseUrl}${src}` : undefined;
}
