export const TVR_COMMERCIAL_WORKBOOK_ID = "TVR_COMMERCIAL_WORKBOOK";
export const TVR_PUBLIC_CATALOGUE_ID = "TVR_PUBLIC_CATALOGUE";
export const tvrSourceManifest = [
  { id: TVR_COMMERCIAL_WORKBOOK_ID, label: "TVR Distribution commercial workbook", purpose: "PRICE_LIST" as const, format: "XLSX" as const, sourceUrl: "https://docs.google.com/spreadsheets/d/1XHiaA1r3TcExezaySoYYFJGOhmEVmT4MrNr303PTbJE/export?format=xlsx", allowedHost: "docs.google.com", expectedMimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], hints: { authority: "COMMERCIAL_STOCK", workbookTitle: "TVR DISTRIBUTION SHEETS" } },
  { id: TVR_PUBLIC_CATALOGUE_ID, label: "TVR public catalogue", purpose: "HTML_CATALOGUE" as const, format: "HTML" as const, sourceUrl: "https://www.tvr.co.za/shop/", allowedHost: "www.tvr.co.za", expectedMimeTypes: ["text/html"], hints: { authority: "CONTENT_SPECIFICATION_MEDIA", acquisition: "WOOCOMMERCE_STORE_API", apiPath: "/wp-json/wc/store/v1/products", activationPhase: "TVR_F1" } },
] as const;
