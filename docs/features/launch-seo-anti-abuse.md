# Launch SEO and anti-abuse

Public Contact, account registration, and password-reset request submissions use Google reCAPTCHA v3. The browser requests a token for the exact action and the backend independently validates success, action, score, age, and production hostname before any side effect. Existing origin, rate-limit, honeypot, validation, and request-size controls remain in force. Guest order recovery is not currently a public feature, so no route was invented.

Required configuration: `VITE_RECAPTCHA_SITE_KEY`, server-only `RECAPTCHA_SECRET_KEY`, optional `RECAPTCHA_MIN_SCORE` (default `0.5`), and optional `RECAPTCHA_ALLOWED_HOSTNAMES`. `RECAPTCHA_TEST_BYPASS=true` is accepted only outside production.

Public pages use route metadata with canonical URLs rooted at `https://tekcentral.co.za`, Open Graph/X metadata, robots directives, and structured data. Product metadata uses published catalogue price and supplier-neutral availability only. Filtered catalogue pages and private/admin/commerce routes are noindex. `/sitemap.xml` is generated from the canonical published catalogue; `/robots.txt` advertises it and excludes private paths.

The current Vite storefront is a client-rendered SPA. Metadata is route-aware after hydration and the backend exposes crawl discovery files. Full HTML prerendering is deliberately deferred to deployment architecture because introducing a second rendering pipeline here would duplicate runtime catalogue behavior; launch hosting should route `/sitemap.xml` and `/robots.txt` to the backend and verify rendered-page indexing in Search Console.

Post-launch Search Console checklist: verify the `tekcentral.co.za` domain property; submit `https://tekcentral.co.za/sitemap.xml`; inspect Home, one category, and one published Product; request indexing only where needed; then monitor indexing coverage and Product structured-data reports.
