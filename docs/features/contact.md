# Contact enquiries

`POST /api/contact` accepts structured public enquiries and persists them in `.data/contact-enquiries.json` before attempting SMTP delivery. Categories are canonical values shared by the storefront and backend. The backend maps categories to the verified TekCentral general, sales, support or accounts mailbox; the browser cannot choose a recipient or sender.

Authenticated context comes only from the HttpOnly customer session. A selected order is included as verified context only when its stored `customerAccountId` matches that session. Guest-entered order numbers remain unverified references and do not expose or attach private order data. Product references are resolved against TekCentral's backend catalogue before public Product identity is included.

Returns, cancellation and tracking categories retain the contact option while linking signed-in customers to existing secure order workflows. Contact submission never creates a return, cancellation, refund, payment action or account mutation.

Admin customer support lists only enquiries with an explicit persisted `customerAccountId`. Historic guest enquiries are not attached through email matching. The admin DTO includes reference, category, safe subject, delivery state and verified order reference; raw message bodies, routing fingerprints, headers and mailbox internals are excluded.

Enquiries persist as `RECEIVED`, `EMAIL_SENT` or `EMAIL_FAILED`. The version-2 store migrates existing version-1 enquiries into `PUBLIC_CONTACT` conversations without changing the original submission. The original inbound body remains immutable; replies append bounded message records with `PENDING`, `SENT`, or `EMAIL_FAILED` delivery state. Writes use a temporary file and atomic rename.

Admin Contact Inbox routes provide server-side search, filters and pagination, conversation detail, replies, explicit failed-delivery retry, and one-to-one new outbound messages. Category determines General, Sales, Accounts or Support; the browser cannot provide an arbitrary sender. Reply subjects normalize to one `Re:` prefix. Outbound requests use persisted idempotency keys and in-flight locks, so repeat requests do not create another message or SMTP send.

Registered customers are linked only through explicit customer selection or the authenticated public submission context. External recipients do not create accounts. Verified order linkage is explicit and customer ownership is checked when a registered customer is selected. Customer profiles continue to expose summaries rather than duplicating full message bodies.

The Admin inbox contains Contact-form conversations and messages sent from TekCentral Admin. Replies sent by customers to department mailboxes are not synchronized back into Admin because IMAP/mailbox ingestion is intentionally out of scope. Attachments, persistent drafts, bulk mail, open tracking and click tracking are not supported. File persistence retains at most the 10,000 most recently active conversations and their source enquiries. Formal time-based retention/archive policy and database storage should replace this operational cap before high-volume production use.

The endpoint enforces trusted browser origins, a 32 KB request limit, bounded field validation, header-injection checks, a honeypot, short duplicate suppression and shared PostgreSQL IP/email rate limits in PostgreSQL mode. Local development and explicitly injected tests retain local limiters. Logs contain only enquiry ID, category, delivery state and timestamp. Responses expose only the safe enquiry reference.

Future Zeus integration may direct a customer to a category or secure workflow, but Zeus cannot submit or send contact email.
# Zeus escalation integration

Zeus routes human follow-up into the existing Contact Us form using a server-approved Contact category. The Contact service remains authoritative for recipient selection: general enquiries route to General, product/business requests to Sales, billing to Accounts, and order/support/technical requests to Support. Zeus may preselect a category and an authorized order reference, but it never submits an enquiry or chooses an email recipient.
# Abuse protection

Public enquiry submission requires an action-bound `contact_submit` reCAPTCHA token verified by the backend before enquiry persistence and routing. Trusted-origin enforcement, the honeypot, request-size limits, validation, duplicate suppression, and IP/email rate limits remain active. Provider or verification failure returns a retryable customer-safe error and does not submit unprotected.

Failed outbound Contact delivery creates a Warning alert linked to the conversation. A later successful retry resolves the matching alert. Alert records contain no message body, recipient address, SMTP credentials or provider response.

## Audit projection

Successful/failed Admin outbound delivery and retry outcomes project a bounded conversation/message reference into Admin Audit / Activity. Message bodies and recipient personal data are not duplicated into audit.
