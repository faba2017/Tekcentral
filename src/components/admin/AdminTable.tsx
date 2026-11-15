import { useState, type ReactNode } from "react";
import { FiChevronLeft, FiChevronRight, FiInbox, FiMoreHorizontal } from "react-icons/fi";
import { ADMIN_PAGE_SIZES, type AdminPaginationMeta } from "@/lib/admin-table";
import { resolveAdminProductImageUrl } from "@/lib/admin-product-image";

export function AdminTableToolbar({ children }: { children: ReactNode }) { return <div className="admin-table-toolbar">{children}</div>; }
export function AdminTableContainer({ children, label }: { children: ReactNode; label?: string }) { return <section className="admin-table-container" aria-label={label}>{children}</section>; }
export function AdminTable({ children, minWidth = 900 }: { children: ReactNode; minWidth?: number }) { return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>; }
export function AdminTableHead({ children }: { children: ReactNode }) { return <thead>{children}</thead>; }
export function AdminTableBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody>; }
export function AdminTableRow({ children, selected = false }: { children: ReactNode; selected?: boolean }) { return <tr className={selected ? "admin-table-row--selected" : undefined}>{children}</tr>; }
export function AdminTableHeader({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right" | "center"; className?: string }) { return <th scope="col" className={`admin-table-${align} ${className}`}>{children}</th>; }
export function AdminTableCell({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right" | "center"; className?: string }) { return <td className={`admin-table-${align} ${className}`}>{children}</td>; }

export function AdminProductImage({ src, alt, fallback }: { src?: string; alt: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveAdminProductImageUrl(src);
  return <span className="admin-identity-cell__media">{resolved && !failed ? <img src={resolved} alt={alt} onError={() => setFailed(true)} /> : fallback}</span>;
}

export function AdminIdentityCell({ imageUrl, imageAlt = "", fallback, primary, primaryTitle, secondary, tertiary, className = "" }: { imageUrl?: string; imageAlt?: string; fallback?: ReactNode; primary: ReactNode; primaryTitle?: string; secondary?: ReactNode; tertiary?: ReactNode; className?: string }) {
  return <div className={`admin-identity-cell ${className}`}>{(imageUrl || fallback) && <AdminProductImage key={imageUrl ?? "fallback"} src={imageUrl} alt={imageAlt} fallback={fallback} />}<span className="admin-identity-cell__content"><span className="admin-identity-cell__primary" title={primaryTitle}>{primary}</span>{secondary && <span className="admin-identity-cell__secondary">{secondary}</span>}{tertiary && <span className="admin-identity-cell__tertiary">{tertiary}</span>}</span></div>;
}

export function AdminTableActions({ primary, children, label = "More actions" }: { primary?: ReactNode; children?: ReactNode; label?: string }) {
  return <div className="admin-table-actions">{primary}{children && <details className="relative"><summary className="admin-icon-button" aria-label={label}><FiMoreHorizontal aria-hidden="true" /></summary><div className="admin-action-menu">{children}</div></details>}</div>;
}

export function AdminTableState({ colSpan, kind, title, detail, action }: { colSpan: number; kind: "loading" | "empty" | "error"; title: string; detail?: string; action?: ReactNode }) {
  return <tr><td colSpan={colSpan}><div className={`admin-table-state admin-table-state--${kind}`}>{kind === "empty" && <FiInbox aria-hidden="true" />}<p className="font-black">{title}</p>{detail && <p>{detail}</p>}{action}</div></td></tr>;
}

export function AdminPagination({ meta, onPageChange, onPageSizeChange, noun = "items" }: { meta: AdminPaginationMeta; onPageChange: (page: number) => void; onPageSizeChange?: (pageSize: number) => void; noun?: string }) {
  const start = meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.totalItems);
  return <div className="admin-pagination"><div className="flex flex-wrap items-center gap-3"><p>Showing {start}-{end} of {meta.totalItems} {noun}</p>{onPageSizeChange && <label className="admin-page-size">Rows<select aria-label="Rows per page" value={meta.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{ADMIN_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}</div><div className="admin-pagination__controls"><button type="button" onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} aria-label="Previous page"><FiChevronLeft aria-hidden="true" /> Previous</button><span aria-live="polite">Page {meta.page} of {meta.totalPages}</span><button type="button" onClick={() => onPageChange(meta.page + 1)} disabled={meta.page >= meta.totalPages} aria-label="Next page">Next <FiChevronRight aria-hidden="true" /></button></div></div>;
}
