import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ComparisonBar } from "@/components/commerce/ComparisonBar";
import { ScrollToTop } from "@/components/navigation/ScrollToTop";
import { RouteMetadata } from "@/components/navigation/RouteMetadata";
import { AboutPage } from "@/pages/AboutPage";
import { AccountPage } from "@/pages/AccountPage";
import { AccountOrdersPage } from "@/pages/AccountOrdersPage";
import { AccountOrderDetailPage } from "@/pages/AccountOrderDetailPage";
import { HomePage } from "@/pages/HomePage";
import { CartPage } from "@/pages/CartPage";
import { BusinessPage } from "@/pages/BusinessPage";
import { CategoryPage } from "@/pages/CategoryPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { ComparePage } from "@/pages/ComparePage";
import { ContactPage } from "@/pages/ContactPage";
import { LegalPolicyPage } from "@/pages/LegalPolicyPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { PayfastCancelPage } from "@/pages/PayfastCancelPage";
import { PayfastReturnPage } from "@/pages/PayfastReturnPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { RoboPage } from "@/pages/RoboPage";
import { ShopPage } from "@/pages/ShopPage";
import { OrderConfirmationPage } from "@/pages/OrderConfirmationPage";
import { OrderDetailPage } from "@/pages/OrderDetailPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { ReturnRequestPage } from "@/pages/ReturnRequestPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminCjSupplierPage } from "@/pages/admin/AdminCjSupplierPage";
import { AdminCjImportedProductsPage } from "@/pages/admin/AdminCjImportedProductsPage";
import { AdminOrderDetailPage } from "@/pages/admin/AdminOrderDetailPage";
import { AdminOrdersPage } from "@/pages/admin/AdminOrdersPage";
import { AdminPackingSlipPage } from "@/pages/admin/AdminPackingSlipPage";
import { AdminRefundsPage } from "@/pages/admin/AdminRefundsPage";
import { AdminReturnsPage } from "@/pages/admin/AdminReturnsPage";
import { AdminSupplierOrderDetailPage } from "@/pages/admin/AdminSupplierOrderDetailPage";
import { AdminSupplierOrdersPage } from "@/pages/admin/AdminSupplierOrdersPage";
import { AdminSupplierBaseRedirect, AdminSupplierWorkspacePage } from "@/pages/admin/AdminSupplierWorkspacePage";
import { AdminSupplierMappingsPage } from "@/pages/admin/AdminSupplierMappingsPage";
import { AdminSuppliersPage } from "@/pages/admin/AdminSuppliersPage";
import { AdminScoopSupplierPage } from "@/pages/admin/AdminScoopSupplierPage";
import { AdminSyntechSupplierPage } from "@/pages/admin/AdminSyntechSupplierPage";
import { AdminPricingSettingsPage } from "@/pages/admin/AdminPricingSettingsPage";
import { AdminShippingSettingsPage } from "@/pages/admin/AdminShippingSettingsPage";
import { CartProvider } from "@/state/cart";
import { ComparisonProvider } from "@/state/comparison";
import { OrdersProvider } from "@/state/orders";
import { CatalogueProvider } from "@/state/catalogue";
import { AdminProductPublicationPage } from "@/pages/admin/AdminProductPublicationPage";
import { AdminProductPublicationPreviewPage } from "@/pages/admin/AdminProductPublicationPreviewPage";
import { AdminProductsPage } from "@/pages/admin/AdminProductsPage";
import { AdminTaxonomyPage } from "@/pages/admin/AdminTaxonomyPage";
import { AdminReportsPage } from "@/pages/admin/AdminReportsPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";
import { AdminGeneralSettingsPage } from "@/pages/admin/AdminGeneralSettingsPage";
import { AdminSettingsDomainPage } from "@/pages/admin/AdminSettingsDomainPage";
import { AdminIntegrationsSettingsPage } from "@/pages/admin/AdminIntegrationsSettingsPage";
import { AdminSystemHealthPage } from "@/pages/admin/AdminSystemHealthPage";
import { AdminPricingPolicySettingsPage } from "@/pages/admin/AdminPricingPolicySettingsPage";
import { AdminNotificationSettingsPage } from "@/pages/admin/AdminNotificationSettingsPage";
import { AdminAutomationSettingsPage } from "@/pages/admin/AdminAutomationSettingsPage";
import { AdminAiAssistantSettingsPage } from "@/pages/admin/AdminAiAssistantSettingsPage";
import { AdminAiAutomationsPage } from "@/pages/admin/AdminAiAutomationsPage";
import { AdminAiOperationsPage } from "@/pages/admin/AdminAiOperationsPage";
import { AdminAiChatPage } from "@/pages/admin/AdminAiChatPage";
import { AdminAuditPage } from "@/pages/admin/AdminAuditPage";
import { AdminAuditDetailPage } from "@/pages/admin/AdminAuditDetailPage";
import { AdminPaymentsSettingsPage } from "@/pages/admin/AdminPaymentsSettingsPage";
import { CustomerAuthProvider } from "@/state/customer-auth";
import { StorefrontAnalyticsTracker } from "@/components/analytics/StorefrontAnalyticsTracker";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminZeusAnalyticsPage } from "@/pages/admin/AdminZeusAnalyticsPage";
import { AdminCustomersPage } from "@/pages/admin/AdminCustomersPage";
import { AdminCustomerDetailPage } from "@/pages/admin/AdminCustomerDetailPage";
import { AdminMerchandisingPage } from "@/pages/admin/AdminMerchandisingPage";
import { AdminContactInboxPage } from "@/pages/admin/AdminContactInboxPage";
import { AdminContactConversationPage } from "@/pages/admin/AdminContactConversationPage";
import { AdminContactNewMessagePage } from "@/pages/admin/AdminContactNewMessagePage";
import { AdminSystemAlertsPage } from "@/pages/admin/AdminSystemAlertsPage";
import { AdminSystemAlertDetailPage } from "@/pages/admin/AdminSystemAlertDetailPage";
import { AdminAuthPage } from "@/pages/admin/AdminAuthPage";
import { AdminStaffAccountPage } from "@/pages/admin/AdminStaffAccountPage";
import { AdminStaffPage } from "@/pages/admin/AdminStaffPage";
import { AdminForbiddenPage } from "@/pages/admin/AdminForbiddenPage";
import { AdminNotFoundPage } from "@/pages/admin/AdminNotFoundPage";
import { AdminRouteGuard } from "@/components/admin/AdminRouteGuard";
import { isAdminHost } from "@/lib/admin-host";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const dedicatedAdminHost = isAdminHost();
  useEffect(() => { if (dedicatedAdminHost && location.pathname.startsWith("/admin")) navigate(`${location.pathname.slice(6) || "/"}${location.search}${location.hash}`, { replace: true }); }, [dedicatedAdminHost, location.hash, location.pathname, location.search, navigate]);
  if (!import.meta.env.DEV && !dedicatedAdminHost && location.pathname.startsWith("/admin")) return <PlaceholderPage title="Page Not Found" eyebrow="404" description="This route does not exist." isNotFound />;
  const routingLocation = dedicatedAdminHost && !location.pathname.startsWith("/admin") ? { ...location, pathname: `/admin${location.pathname === "/" ? "" : location.pathname}` } : location;
  return (
    <CatalogueProvider>
    <CustomerAuthProvider>
    <CartProvider>
      <OrdersProvider>
        <ComparisonProvider>
          <ScrollToTop />
          <RouteMetadata />
          <StorefrontAnalyticsTracker />
          <AppShell>
            <Routes location={routingLocation}>
              <Route path="/" element={<HomePage />} />
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/shop/:categorySlug" element={<CategoryPage />} />
              <Route path="/shop/:categorySlug/:subcategorySlug" element={<CategoryPage />} />
              <Route path="/shop/:categorySlug/:subcategorySlug/:productTypeSlug" element={<CategoryPage />} />
              <Route path="/category/:slug" element={<CategoryPage />} />
              <Route path="/product/:slug" element={<ProductDetailPage />} />
              <Route path="/business" element={<BusinessPage />} />
              <Route path="/zeus" element={<RoboPage />} />
              <Route path="/robo" element={<Navigate to="/zeus" replace />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route
                path="/order/:orderNumber/confirmation"
                element={<OrderConfirmationPage />}
              />
              <Route
                path="/payment/payfast/return"
                element={<PayfastReturnPage />}
              />
              <Route
                path="/payment/payfast/cancel"
                element={<PayfastCancelPage />}
              />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/order/:orderNumber" element={<OrderDetailPage />} />
              <Route path="/order/:orderNumber/return" element={<ReturnRequestPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/orders" element={<AccountOrdersPage />} />
              <Route path="/account/orders/:orderNumber" element={<AccountOrderDetailPage />} />
              <Route path="/admin/login" element={<AdminAuthPage mode="LOGIN" />} />
              <Route path="/admin/forgot-password" element={<AdminAuthPage mode="FORGOT" />} />
              <Route path="/admin/reset-password" element={<AdminAuthPage mode="RESET" />} />
              <Route path="/admin/accept-invite" element={<AdminAuthPage mode="INVITE" />} />
              <Route path="/admin/change-password" element={<AdminAuthPage mode="CHANGE" />} />
              <Route element={<AdminRouteGuard />}>
              <Route path="/admin/account" element={<AdminStaffAccountPage />} />
              <Route path="/admin/staff" element={<AdminStaffPage />} />
              <Route path="/admin/forbidden" element={<AdminForbiddenPage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/ai" element={<AdminAiChatPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:orderNumber" element={<AdminOrderDetailPage />} />
              <Route
                path="/admin/orders/:orderNumber/packing-slip"
                element={<AdminPackingSlipPage />}
              />
              <Route path="/admin/returns" element={<AdminReturnsPage />} />
              <Route path="/admin/refunds" element={<AdminRefundsPage />} />
              <Route path="/admin/customers" element={<AdminCustomersPage />} />
              <Route path="/admin/customers/:customerId" element={<AdminCustomerDetailPage />} />
              <Route path="/admin/contact" element={<AdminContactInboxPage />} />
              <Route path="/admin/contact/new" element={<AdminContactNewMessagePage />} />
              <Route path="/admin/contact/:id" element={<AdminContactConversationPage />} />
              <Route path="/admin/supplier-orders" element={<AdminSupplierOrdersPage />} />
              <Route path="/admin/supplier-mappings" element={<AdminSupplierMappingsPage />} />
              <Route path="/admin/suppliers" element={<AdminSuppliersPage />} />
              <Route path="/admin/suppliers/cj" element={<AdminCjSupplierPage />} />
              <Route path="/admin/suppliers/cj/imported" element={<AdminCjImportedProductsPage />} />
              <Route path="/admin/suppliers/scoop" element={<AdminScoopSupplierPage />} />
              <Route path="/admin/suppliers/syntech" element={<AdminSyntechSupplierPage />} />
              <Route path="/admin/suppliers/:supplierId" element={<AdminSupplierBaseRedirect />} />
              <Route path="/admin/suppliers/:supplierId/:section" element={<AdminSupplierWorkspacePage />} />
              <Route path="/admin/settings/pricing" element={<AdminPricingPolicySettingsPage />} />
              <Route path="/admin/settings/shipping" element={<AdminShippingSettingsPage />} />
              <Route path="/admin/settings/payments" element={<AdminPaymentsSettingsPage />} />
              <Route path="/admin/pricing" element={<AdminPricingSettingsPage />} />
              <Route path="/admin/merchandising" element={<AdminMerchandisingPage />} />
              <Route path="/admin/shipping" element={<AdminShippingSettingsPage />} />
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route path="/admin/taxonomy" element={<AdminTaxonomyPage />} />
              <Route path="/admin/products/:productId/publishing" element={<AdminProductPublicationPage />} />
              <Route path="/admin/products/:productId/publishing/preview" element={<AdminProductPublicationPreviewPage />} />
              <Route path="/admin/reports" element={<AdminReportsPage />} />
              <Route path="/admin/reports/analytics" element={<AdminAnalyticsPage />} />
              <Route path="/admin/reports/zeus" element={<AdminZeusAnalyticsPage />} />
              <Route path="/admin/settings" element={<AdminSettingsPage />} />
              <Route path="/admin/settings/general" element={<AdminGeneralSettingsPage />} />
              <Route path="/admin/settings/commerce" element={<AdminSettingsDomainPage domain="commerce" />} />
              <Route path="/admin/settings/products" element={<AdminSettingsDomainPage domain="products" />} />
              <Route path="/admin/settings/suppliers" element={<AdminSettingsDomainPage domain="suppliers" />} />
              <Route path="/admin/settings/notifications" element={<AdminNotificationSettingsPage />} />
              <Route path="/admin/settings/integrations" element={<AdminIntegrationsSettingsPage />} />
              <Route path="/admin/settings/automation" element={<AdminAutomationSettingsPage />} />
              <Route path="/admin/settings/ai-assistant" element={<AdminAiAssistantSettingsPage />} />
              <Route path="/admin/settings/ai-assistant/operations" element={<AdminAiOperationsPage />} />
              <Route path="/admin/settings/ai-assistant/automations" element={<AdminAiAutomationsPage />} />
              <Route path="/admin/settings/users-security" element={<AdminSettingsDomainPage domain="users-security" />} />
              <Route path="/admin/settings/system" element={<AdminSettingsDomainPage domain="system" />} />
              <Route path="/admin/settings/health" element={<AdminSystemHealthPage />} />
              <Route path="/admin/alerts" element={<AdminSystemAlertsPage />} />
              <Route path="/admin/alerts/:alertId" element={<AdminSystemAlertDetailPage />} />
              <Route path="/admin/audit" element={<AdminAuditPage />} />
              <Route path="/admin/audit/:auditId" element={<AdminAuditDetailPage />} />
              <Route path="/admin/cj" element={<Navigate to="/admin/suppliers/cj" replace />} />
              <Route path="/admin/cj/imported" element={<Navigate to="/admin/suppliers/cj/imported" replace />} />
              <Route
                path="/admin/supplier-orders/:supplierOrderId"
                element={<AdminSupplierOrderDetailPage />}
              />
              <Route path="/admin/*" element={<AdminNotFoundPage />} />
              </Route>
              <Route path="/terms" element={<LegalPolicyPage policyId="terms" />} />
              <Route path="/privacy" element={<LegalPolicyPage policyId="privacy" />} />
              <Route path="/refund-policy" element={<LegalPolicyPage policyId="refund" />} />
              <Route path="/cancellation-policy" element={<LegalPolicyPage policyId="cancellation" />} />
              <Route path="/shipping-delivery" element={<LegalPolicyPage policyId="shipping" />} />
              <Route path="/returns" element={<Navigate to="/refund-policy" replace />} />
              <Route
                path="*"
                element={
                  <PlaceholderPage
                    title="Page Not Found"
                    eyebrow="404"
                    description="This route does not exist yet. Use the links below to return to a working TekCentral area."
                    isNotFound
                  />
                }
              />
            </Routes>
          </AppShell>
          <ComparisonBar />
        </ComparisonProvider>
      </OrdersProvider>
    </CartProvider>
    </CustomerAuthProvider>
    </CatalogueProvider>
  );
}
