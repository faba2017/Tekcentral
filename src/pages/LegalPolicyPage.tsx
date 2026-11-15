import { Link } from "react-router-dom";
import { usePageMetadata } from "@/lib/page-metadata";
import { emailHref, publicBusiness } from "@/lib/public-business";

type PolicyId = "terms" | "privacy" | "refund" | "cancellation" | "shipping";
interface Policy { title: string; eyebrow: string; description: string; path: string; introduction: string; sections: Array<{ title: string; paragraphs: string[] }> }

const policyContactKind: Record<PolicyId, keyof typeof publicBusiness.email> = {
  terms: "general",
  privacy: "general",
  refund: "support",
  cancellation: "support",
  shipping: "support",
};

const policies: Record<PolicyId, Policy> = {
  terms: {
    title: "Terms & Conditions", eyebrow: "Legal", path: "/terms", description: "Terms governing use of the TekCentral website and purchases from the store.",
    introduction: "These terms govern your use of the TekCentral website and orders placed through the store. They should be read with the policies linked throughout this page.",
    sections: [
      { title: "Using the website", paragraphs: ["You may use this website for lawful personal or business purchasing and product research. You must not interfere with the website, attempt unauthorized access, misuse customer accounts, or submit false or harmful information."] },
      { title: "Product information and availability", paragraphs: ["TekCentral aims to present accurate descriptions, images, specifications, pricing and availability. Product appearance may vary slightly by screen or manufacturer revision. Availability can change and is revalidated during checkout and order processing.", "An item appearing on the website or entering the cart does not reserve stock or guarantee fulfilment."] },
      { title: "Prices and VAT", paragraphs: ["Customer-facing prices and totals are shown in South African rand. Where checkout states that VAT is included, the displayed VAT forms part of the total and is not added again. Delivery charges are calculated separately and displayed before payment."] },
      { title: "Orders and acceptance", paragraphs: ["Submitting checkout and starting payment creates an order request; it does not by itself guarantee acceptance or fulfilment. TekCentral may still need to confirm payment, current availability, address validity and a viable delivery path.", "If an order cannot be fulfilled, TekCentral will use the available order contact details to address cancellation or refund handling. A PayFast browser redirect alone is not payment confirmation; TekCentral relies on backend confirmation from PayFast."] },
      { title: "Payment", paragraphs: ["PayFast hosts the payment step. TekCentral does not collect or store payment-card numbers, expiry dates or CVV values. Payment status remains separate from order, delivery, return and refund status."] },
      { title: "Delivery", paragraphs: ["Delivery charges and available estimates are shown at checkout. Estimates are not guaranteed delivery dates. Items in the same order may occasionally be delivered separately. The Shipping & Delivery Policy forms part of these terms."] },
      { title: "Cancellations, returns and refunds", paragraphs: ["Cancellation requests are available while an order is pending, confirmed or processing, but approval depends on whether fulfilment can still be stopped. Dispatched or delivered goods follow the return process. Returns and refunds are reviewed separately and are not automatic."] },
      { title: "Warranties", paragraphs: ["Products may carry manufacturer warranty rights where applicable. Warranty coverage, remedy and duration depend on the specific product and supporting evidence. TekCentral does not promise additional warranty terms that are not shown with the product or confirmed in writing."] },
      { title: "Accounts and security", paragraphs: ["You are responsible for information submitted through your account and for protecting access to your email and devices. Guest order access and customer sessions are order- or account-specific and must not be shared."] },
      { title: "Intellectual property", paragraphs: ["The TekCentral name, site presentation and original website content may not be copied or commercially reused without permission. Third-party product names and marks remain the property of their respective owners."] },
      { title: "Liability", paragraphs: ["To the extent permitted by applicable law, TekCentral is not responsible for indirect loss caused by events outside its reasonable control. Nothing in these terms excludes rights or remedies that cannot lawfully be excluded under South African law."] },
      { title: "Privacy and changes", paragraphs: ["Personal information is handled as described in the Privacy Policy. TekCentral may update these terms when operations or law change; the fixed effective date identifies the version currently published."] },
      { title: "South African framework", paragraphs: ["These terms are intended for a South African ecommerce context and operate subject to applicable South African law, including mandatory consumer and data-protection rights."] },
    ],
  },
  privacy: {
    title: "Privacy Policy", eyebrow: "Privacy", path: "/privacy", description: "How TekCentral handles customer and website information in a South African ecommerce context.",
    introduction: "This policy explains the personal information TekCentral uses to operate the store. It is structured with South Africa's Protection of Personal Information Act in mind, but publishing it is not a claim of complete compliance.",
    sections: [
      { title: "Information we collect", paragraphs: ["We may process names, email addresses, mobile numbers, company details, saved addresses, checkout addresses, account credentials, order history, return and refund requests, support information, and technical security records.", "When you use Zeus or another assistance feature, your submitted question and relevant product context may be processed to provide the interaction. Do not submit unnecessary confidential or sensitive information."] },
      { title: "How information is used", paragraphs: ["Information is used to create and secure accounts, process checkout, validate addresses, calculate delivery, manage orders, provide tracking, handle support, returns and refunds, prevent abuse, maintain records and improve store reliability."] },
      { title: "Payments", paragraphs: ["PayFast hosts the payment experience and receives the information required to process payment. TekCentral does not store customer payment-card credentials such as card number, expiry date or CVV. TekCentral does retain order and payment status references needed to reconcile the transaction."] },
      { title: "Service providers", paragraphs: ["TekCentral may provide the minimum necessary information to service providers used for payment, hosting, email, address validation, delivery, fulfilment, security and technical operations. Supplier and fulfilment arrangements remain internal unless disclosure is operationally or legally required."] },
      { title: "Cookies, sessions and analytics", paragraphs: ["The website uses browser storage and cookies where needed for carts, secure customer sessions, guest order access and preferences. TekCentral also measures anonymous website activity such as page and Product views, searches, cart activity and checkout starts to operate and improve the store. This analytics collection does not record form entries, payment details, raw Zeus conversations or session replays. Server logs and security records may contain network, request and error information used to protect and operate the service."] },
      { title: "Retention", paragraphs: ["Information is kept only for as long as reasonably required for the purpose collected, legal and financial records, dispute handling, fraud prevention and security. Retention periods may differ by record type.", "Contact-form enquiries and operational messages sent through TekCentral Admin are retained as support correspondence with delivery metadata. TekCentral does not add tracking pixels, email-open tracking or click tracking to these messages."] },
      { title: "Security", paragraphs: ["TekCentral uses access controls, hashed credentials or tokens where implemented, server-managed sessions and restricted operational records. No internet service can guarantee absolute security."] },
      { title: "Your choices and rights", paragraphs: ["Subject to applicable law, you may ask about personal information held by TekCentral, request correction of inaccurate information, or raise an objection or deletion request where legally available. Some records may need to be retained for lawful operational purposes."] },
      { title: "Contact and complaints", paragraphs: ["Use the Contact Us page for privacy questions or requests. TekCentral may need to verify your identity before disclosing or changing account or order information."] },
    ],
  },
  refund: {
    title: "Refund Policy", eyebrow: "Customer care", path: "/refund-policy", description: "How TekCentral reviews and processes customer refund requests.",
    introduction: "Refunds are reviewed against the order, payment and any related return evidence. A return request or cancellation request does not automatically create a refund.",
    sections: [
      { title: "Eligibility", paragraphs: ["Refund eligibility depends on the order and payment state, the reason for the request, product condition where inspection is relevant, and applicable consumer rights. Delivered orders can enter the return-request workflow from the customer order page."] },
      { title: "Request process", paragraphs: ["Open the relevant order and use Request a return when it is available, or use Contact Us for assistance. Select the affected item quantity and provide an accurate reason. TekCentral may request reasonable supporting information for damaged, faulty or incorrect goods."] },
      { title: "Inspection and outcome", paragraphs: ["Returned goods may require receipt and inspection before a final outcome. Approval, rejection, replacement handling and financial refund status are recorded separately. Physical receipt does not itself confirm that a refund is approved."] },
      { title: "Partial refunds", paragraphs: ["A refund may cover selected items or quantities rather than the complete order where the reviewed issue affects only part of an order. The amount is based on the order-time item values and the approved outcome."] },
      { title: "How refunds are processed", paragraphs: ["Approved refunds are processed through the original payment channel where applicable. Processing is not automatic and the time for funds to appear can also depend on PayFast and the customer's financial institution; TekCentral does not promise a fixed bank-processing period."] },
      { title: "Damaged, faulty or incorrect items", paragraphs: ["Report damaged, faulty or incorrect goods through the order return flow or Contact Us, including relevant detail. Do not dispose of the item or packaging until the review process confirms what is required."] },
      { title: "Failed or cancelled orders", paragraphs: ["If a paid order cannot be fulfilled or an approved cancellation requires a refund, the payment and refund records are handled separately from the order cancellation. A cancelled PayFast payment does not mean a paid transaction exists to refund."] },
    ],
  },
  cancellation: {
    title: "Cancellation Policy", eyebrow: "Customer care", path: "/cancellation-policy", description: "When and how customers can request cancellation of a TekCentral order.",
    introduction: "TekCentral accepts cancellation requests while an order is still pending, confirmed or processing. A request is reviewed because fulfilment may already have progressed.",
    sections: [
      { title: "Before fulfilment", paragraphs: ["Open the order and use Request cancellation when available, or use Contact Us. TekCentral will review whether procurement, packing or dispatch can still be stopped. Submitting the request does not itself guarantee cancellation."] },
      { title: "After dispatch", paragraphs: ["Cancellation is no longer offered once an order has shipped. If goods have been delivered, use the return process where eligible. Partially shipped orders may require separate handling for dispatched and undispatched items."] },
      { title: "Payment and refunds", paragraphs: ["Payment cancellation on the PayFast hosted page leaves the TekCentral order available for another payment attempt and does not permanently cancel the customer order. An order cancellation and a financial refund are separate states. Where a paid order is cancelled and a refund is approved, it is processed under the Refund Policy."] },
      { title: "Contact", paragraphs: ["Use Contact Us and provide the order number without sharing payment-card information. TekCentral may verify account or guest-order access before discussing order details."] },
    ],
  },
  shipping: {
    title: "Shipping & Delivery Policy", eyebrow: "Delivery", path: "/shipping-delivery", description: "TekCentral delivery scope, charges, estimates and customer responsibilities.",
    introduction: "TekCentral currently supports delivery to eligible South African addresses. Available delivery pricing and estimates are calculated for the products and destination entered at checkout.",
    sections: [
      { title: "Delivery area and address", paragraphs: ["Enter a complete and accurate South African street address, suburb, city, province and postal code. Address suggestions or validation may assist but you remain responsible for confirming the delivery information."] },
      { title: "Charges and estimates", paragraphs: ["Delivery is charged separately from product pricing. The available method, charge and estimate are displayed before payment and a fresh delivery quote is required when configured by the store. Estimates are business-day ranges, not guaranteed arrival dates."] },
      { title: "Processing and availability", paragraphs: ["Payment confirmation does not bypass current availability and fulfilment checks. TekCentral may need to confirm a valid fulfilment and delivery path before processing continues."] },
      { title: "Separate deliveries", paragraphs: ["Items in the same order may occasionally be delivered separately. This does not change the customer-facing order total already accepted at checkout."] },
      { title: "Tracking and delays", paragraphs: ["Tracking is shown on the order when available. Carrier, weather, service disruption, address review and other events outside reasonable control may affect estimates. TekCentral will not present an estimate as a guaranteed date."] },
      { title: "Failed delivery", paragraphs: ["Incorrect or incomplete address details, unavailable recipients or access restrictions may delay or prevent delivery. Additional handling will be reviewed based on the actual circumstances; no automatic redelivery promise is made."] },
      { title: "Damaged or incorrect goods", paragraphs: ["Check the delivery as soon as reasonably possible and report damaged or incorrect goods through Contact Us or the eligible order return process. Keep the item and available packaging while the request is reviewed."] },
    ],
  },
};

export function LegalPolicyPage({ policyId }: { policyId: PolicyId }) {
  const policy = policies[policyId];
  const contactEmail = publicBusiness.email[policyContactKind[policyId]];
  usePageMetadata(`${policy.title} | TekCentral`, policy.description, policy.path);
  return <article className="bg-[#F6F7F9] px-4 py-10 print:bg-white sm:px-6 sm:py-14 lg:px-8"><div className="mx-auto max-w-5xl"><header className="border-b border-[#D0D5DD] pb-8"><p className="text-sm font-black uppercase tracking-[0.16em] text-[#176B5C]">{policy.eyebrow}</p><h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">{policy.title}</h1><p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-[#475467]">{policy.introduction}</p><p className="mt-4 text-sm font-bold text-[#667085]">Effective and last updated: {publicBusiness.policyEffectiveDate}</p></header><div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]"><nav aria-label={`${policy.title} contents`} className="h-fit lg:sticky lg:top-24"><h2 className="text-sm font-black uppercase text-[#475467]">On this page</h2><ol className="mt-3 space-y-2">{policy.sections.map((section, index) => <li key={section.title}><a href={`#section-${index + 1}`} className="text-sm font-bold text-[#176B5C] underline-offset-4 hover:underline">{section.title}</a></li>)}</ol></nav><div className="space-y-9">{policy.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title} className="scroll-mt-24"><h2 className="text-2xl font-black">{section.title}</h2><div className="mt-3 space-y-3">{section.paragraphs.map((paragraph) => <p key={paragraph} className="text-base leading-7 text-[#3F4652]">{paragraph}</p>)}</div></section>)}<section className="rounded-lg border border-[#B9E2DB] bg-[#EFFFFB] p-5"><h2 className="text-xl font-black">Business and contact details</h2><p className="mt-2 text-sm font-black text-[#101828]">{publicBusiness.legalName}</p><p className="mt-1 text-sm leading-6 text-[#3F4652]">Registration No. {publicBusiness.registrationNumber}</p><address className="mt-2 text-sm not-italic leading-6 text-[#3F4652]">Registered address: {publicBusiness.registeredAddress.inline}</address><p className="mt-3 text-sm leading-6 text-[#3F4652]">Questions about this policy can be sent to <a className="font-black text-[#176B5C] underline underline-offset-2" href={emailHref(contactEmail)}>{contactEmail}</a>{policyId === "refund" ? <>. Billing and account questions can be sent to <a className="font-black text-[#176B5C] underline underline-offset-2" href={emailHref(publicBusiness.email.accounts)}>{publicBusiness.email.accounts}</a></> : null}.</p><p className="mt-2 text-sm leading-6 text-[#3F4652]">You can also call <a className="font-black text-[#176B5C] underline underline-offset-2" href={publicBusiness.phone.href}>{publicBusiness.phone.display}</a>.</p><Link to={publicBusiness.contactPath} className="mt-4 inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2.5 text-sm font-black text-[var(--tek-accent-ink)]">Open Contact Us</Link><p className="mt-3 text-xs font-semibold text-[#667085]">{publicBusiness.name} · {publicBusiness.websiteLabel} · {publicBusiness.country}</p></section></div></div></div></article>;
}
