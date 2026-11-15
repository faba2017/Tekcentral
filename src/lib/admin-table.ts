export const ADMIN_PAGE_SIZES = [10, 15, 25, 50] as const;

export interface AdminPaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function normalizeAdminPagination(page: number, pageSize: number, totalItems: number): AdminPaginationMeta {
  const safePageSize = ADMIN_PAGE_SIZES.includes(pageSize as (typeof ADMIN_PAGE_SIZES)[number]) ? pageSize : 15;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  return { page: Math.min(Math.max(1, page), totalPages), pageSize: safePageSize, totalItems, totalPages };
}
