export function redactAdminPayload(value: unknown, input: { pathname: string; permissions: ReadonlySet<string> }): unknown {
  if (Array.isArray(value)) return value.map((item) => redactAdminPayload(item, input));
  if (!value || typeof value !== "object") return value;
  const { pathname, permissions } = input;
  const customerSensitive = /\/api\/admin\/(?:customers|contact|orders)/.test(pathname) && !permissions.has("customers.read_contact_details");
  const supplierSensitive = /\/api\/admin\/(?:suppliers|supplier-mappings|supplier-orders|pricing)/.test(pathname) || /\/api\/admin\/products\/[^/]+\/(?:onboarding-readiness|publication)$/.test(pathname);
  const canViewCost = permissions.has("suppliers.view_cost") || permissions.has("pricing.view_supplier_cost");
  const canViewMargin = permissions.has("pricing.view_margin");
  const canViewPrivateStock = permissions.has("suppliers.view_private_stock");
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (customerSensitive && ["email", "phone", "phoneNumber", "deliveryAddress", "billingAddress", "address"].includes(key)) continue;
    if (supplierSensitive && !canViewCost && ["cost", "supplierCost", "supplierCostExVat", "sourceCostExVat", "sourceCostAmount", "landedCostExVat", "unitCost", "dealerPrice", "dealerPriceExVat", "dealerPriceInclVat", "effectiveDealerCostExVat", "normalDealerCostExVat", "authoritativeCost", "normalizedCostZar", "costPrice", "procurementCost", "priceEvidence", "factAlternatives"].includes(key)) continue;
    if (supplierSensitive && !canViewMargin && ["margin", "grossMargin", "grossMarginPercent", "grossProfit", "grossProfitExVat", "marginPercent", "markupPercent"].includes(key)) continue;
    if (supplierSensitive && !canViewPrivateStock && ["quantity", "stockQuantity", "stockTotal", "totalStock", "onHand", "reserved", "available", "stockByWarehouse", "inventories", "branchStock", "privateStock", "stockEvidence"].includes(key)) continue;
    result[key] = redactAdminPayload(nested, input);
  }
  return result;
}
