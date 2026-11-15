# Dashboard and reports

TekCentral management analytics are derived from existing persisted commerce and operations records. Dashboard and Reports share `backend/analyticsService.ts`; the frontend does not independently aggregate financial results.

## Metric authority

| Metric | Authoritative source | Date authority | Calculation | Destination |
| --- | --- | --- | --- | --- |
| Revenue | Paid stored orders | Payment confirmation, falling back to order creation for legacy paid records | Sum of stored order totals | Sales report |
| Orders | Stored orders | Order creation | Count of orders created in period | Orders |
| Average order value | Paid stored orders | Payment confirmation | Gross revenue / paid orders | Sales report |
| Refunds | Stored refunds with `REFUNDED` status | Refund creation for activity; payment period for sales summaries | Sum of persisted refund amounts | Returns & Refunds report |
| Net revenue | Paid orders and completed refunds | Payment confirmation | Gross revenue minus completed refunds | Sales report |
| Product performance | Stored order-line snapshots | Parent payment confirmation | Snapshot quantity and line total; never current Product price | Product Performance report |
| Supplier insight | Supplier Hub summary | Current state | Existing Hub catalogue, mapping, order and health summaries | Supplier workspace |
| Payment report | Gateway-neutral stored payment record | Payment creation | Persisted amount/status/provider metadata | Payment report |
| FX impact | Persisted FX impact records | Impact evaluation | Stored classifications and recommendations | Pricing / FX Impact report |
| VAT | Stored order-time tax values | Payment confirmation | Stored VAT less proportional VAT allocation for completed refunds | VAT Summary |
| Gross profit | Immutable COMPLETE order-line cost basis | Payment confirmation | Net product revenue excluding VAT minus procurement cost for net fulfilled quantity | Profitability report |
| Inventory movements | TekCentral manual stock ledger | Movement timestamp | Append-only receipt, fulfilment, return, recount and correction movements | Inventory Movements report |

All reporting boundaries use `Africa/Johannesburg`. Custom report dates are interpreted as complete Johannesburg calendar days.

## Financial semantics

- Gross revenue is the total of backend-confirmed paid order totals in the period.
- Refunds include only refunds whose stored status is `REFUNDED`.
- Net revenue is gross revenue less those completed refunds.
- Historical sales use order and line snapshots. Current Product prices are never substituted.
- Gross profit is product-line revenue excluding VAT less normalized procurement cost. Customer shipping revenue and unverified supplier/courier shipping costs are excluded from this product-line metric.
- Gross margin is gross profit divided by net product revenue excluding VAT.
- Profitability is calculated only from immutable `COMPLETE` order-line cost snapshots. Current supplier costs, Product prices, mappings, and FX are never used to reconstruct history.
- Dashboard and report summaries expose revenue coverage. Mixed historical periods are explicitly partial rather than presenting covered profit as a complete business total.
- Existing orders without a captured cost basis remain unavailable and are never backfilled.
- Physical return restock/write-off quantities appear in Returns & Refunds reporting but do not rewrite historical procurement cost or independently imply a refund.
- Completed line-attributable refunds reduce both revenue and cost for the refunded quantity. An unattributable refund makes affected profitability partial rather than allocating it speculatively.
- VAT uses each order's stored `taxAmount`. Refunded VAT is allocated proportionally from the stored order total and tax; it is not recalculated using current VAT settings.

## Workspace behavior

Dashboard offers eight fixed periods and keeps operational attention explicitly current. It displays six compact KPIs, revenue trend, current order-state composition, the existing attention model, Supplier Hub summaries and recent orders.

Reports currently supports Sales, Orders, Product Performance, Supplier Performance, Gross Margin / Profitability, Returns & Refunds, Inventory Movements, Payments, Pricing / FX Impact and VAT Summary. Categories, Shipping, and Audit remain labelled as future reports.

Period, custom dates, page and supported filters are URL-backed. Report rows are paginated server-side. Identity cells link to the corresponding order, Product, supplier workspace or Payments settings.

## Exports

CSV and XLSX exports run on the backend from the same filtered report query as the screen. Files include report name, date range, timezone, active filters and all matching rows. Filenames are deterministic. Exports do not contain provider payloads, credentials or supplier secrets.

The report definitions include required-role metadata for future RBAC enforcement. Saved presets, scheduled delivery and email delivery to `reports@tekcentral.co.za` are future capabilities and are not active.
