import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, registry, navigation, notFound] = await Promise.all([
  readFile("src/App.tsx", "utf8"),
  readFile("src/lib/supplier-registry.ts", "utf8"),
  readFile("src/components/admin/SupplierWorkspaceNav.tsx", "utf8"),
  readFile("src/pages/admin/AdminNotFoundPage.tsx", "utf8"),
]);

assert.match(registry, /\["MUSTEK", "TVR", "TEKCENTRAL"\]\.includes\(supplier\.code\)[\s\S]*?`\$\{supplier\.route\}\/products`/);
assert.match(navigation, /label: "Catalogue", to: catalogueRoute/);
assert.match(app, /path="\/admin\/suppliers\/:supplierId" element=\{<AdminSupplierBaseRedirect \/>\}/);
assert.match(app, /path="\/admin\/suppliers\/:supplierId\/:section" element=\{<AdminSupplierWorkspacePage \/>\}/);
assert.match(app, /path="\/admin\/\*" element=\{<AdminNotFoundPage \/>\}/);
assert.ok(app.indexOf('path="/admin/*"') < app.indexOf("</Route>\n              <Route path=\"/terms\""), "Admin wildcard must remain inside AdminRouteGuard");
assert.match(notFound, /This Admin page does not exist or is no longer available\./);
assert.match(notFound, /Back to Dashboard/);
assert.match(notFound, />Suppliers</);
assert.doesNotMatch(notFound, /Shop Technology|Ask Zeus|Back to Home/);
assert.match(app, /path="\*"[\s\S]*?<PlaceholderPage[\s\S]*?isNotFound/);

console.log("Admin supplier routing and route-aware 404 tests passed.");
