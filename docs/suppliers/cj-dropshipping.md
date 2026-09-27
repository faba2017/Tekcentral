# CJdropshipping

## CONFIRMED

- Potential supplier under evaluation.
- Phase 7A-CJ uses CJ Dropshipping API V2 for backend-only, read-only supplier
  catalogue and mapping foundation work.
- API base URL: `https://developers.cjdropshipping.com/api2.0/v1`.
- Authentication uses `POST /authentication/getAccessToken` with backend
  `CJ_API_KEY`.
- Subsequent read calls use the `CJ-Access-Token` header.
- Product search uses `GET /product/listV2`.
- Product details use `GET /product/query`.
- Variant lookup uses `GET /product/variant/query` and
  `GET /product/variant/queryByVid`.
- Stock lookup uses `GET /product/stock/queryByVid`.
- Phase 7B-CJ uses `POST /shopping/order/createOrderV2` with `payType=3` for
  staff-approved unpaid order creation only.
- Real CJ creation is controlled by server-only
  `CJ_REAL_ORDER_CREATION_ENABLED`.
- CJ order creation does not pay CJ, confirm supplier fulfilment, dispatch
  goods or change the customer order lifecycle.

## PENDING CONFIRMATION

- XML feeds
- CSV feeds
- Product catalogue access
- Real-time stock
- Cost pricing
- Automated ordering
- Direct fulfilment
- Dropshipping
- Blind shipping
- Reseller discounts
- Credit account terms
- Shipping arrangements
