import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ComparisonBar } from "@/components/commerce/ComparisonBar";
import { ScrollToTop } from "@/components/navigation/ScrollToTop";
import { AboutPage } from "@/pages/AboutPage";
import { AccountPage } from "@/pages/AccountPage";
import { HomePage } from "@/pages/HomePage";
import { CartPage } from "@/pages/CartPage";
import { BusinessPage } from "@/pages/BusinessPage";
import { CategoryPage } from "@/pages/CategoryPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { ComparePage } from "@/pages/ComparePage";
import { ContactPage } from "@/pages/ContactPage";
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
import { AdminSupplierMappingsPage } from "@/pages/admin/AdminSupplierMappingsPage";
import { AdminSuppliersPage } from "@/pages/admin/AdminSuppliersPage";
import { AdminScoopSupplierPage } from "@/pages/admin/AdminScoopSupplierPage";
import { AdminPricingSettingsPage } from "@/pages/admin/AdminPricingSettingsPage";
import { AdminShippingSettingsPage } from "@/pages/admin/AdminShippingSettingsPage";
import { CartProvider } from "@/state/cart";
import { ComparisonProvider } from "@/state/comparison";
import { OrdersProvider } from "@/state/orders";
import { CatalogueProvider } from "@/state/catalogue";
import { AdminProductPublicationPage } from "@/pages/admin/AdminProductPublicationPage";
import { AdminProductPublicationPreviewPage } from "@/pages/admin/AdminProductPublicationPreviewPage";

export default function App() {
  return (
    <CatalogueProvider>
    <CartProvider>
      <OrdersProvider>
        <ComparisonProvider>
          <ScrollToTop />
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/shop" element={<ShopPage />} />
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
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:orderNumber" element={<AdminOrderDetailPage />} />
              <Route
                path="/admin/orders/:orderNumber/packing-slip"
                element={<AdminPackingSlipPage />}
              />
              <Route path="/admin/returns" element={<AdminReturnsPage />} />
              <Route path="/admin/refunds" element={<AdminRefundsPage />} />
              <Route path="/admin/supplier-orders" element={<AdminSupplierOrdersPage />} />
              <Route path="/admin/supplier-mappings" element={<AdminSupplierMappingsPage />} />
              <Route path="/admin/suppliers" element={<AdminSuppliersPage />} />
              <Route path="/admin/suppliers/cj" element={<AdminCjSupplierPage />} />
              <Route path="/admin/suppliers/cj/imported" element={<AdminCjImportedProductsPage />} />
              <Route path="/admin/suppliers/scoop" element={<AdminScoopSupplierPage />} />
              <Route path="/admin/settings/pricing" element={<AdminPricingSettingsPage />} />
              <Route path="/admin/settings/shipping" element={<AdminShippingSettingsPage />} />
              <Route path="/admin/products/:productId/publishing" element={<AdminProductPublicationPage />} />
              <Route path="/admin/products/:productId/publishing/preview" element={<AdminProductPublicationPreviewPage />} />
              <Route path="/admin/cj" element={<Navigate to="/admin/suppliers/cj" replace />} />
              <Route path="/admin/cj/imported" element={<Navigate to="/admin/suppliers/cj/imported" replace />} />
              <Route
                path="/admin/supplier-orders/:supplierOrderId"
                element={<AdminSupplierOrderDetailPage />}
              />
              <Route
                path="/privacy"
                element={
                  <PlaceholderPage
                    title="Privacy"
                    eyebrow="Policy"
                    description="TekCentral privacy policy content will be completed before launch."
                  />
                }
              />
              <Route
                path="/terms"
                element={
                  <PlaceholderPage
                    title="Terms"
                    eyebrow="Policy"
                    description="TekCentral terms of service will be completed before launch."
                  />
                }
              />
              <Route
                path="/returns"
                element={
                  <PlaceholderPage
                    title="Returns"
                    eyebrow="Support"
                    description="Returns and warranty policy details will be confirmed before launch."
                  />
                }
              />
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
    </CatalogueProvider>
  );
}
