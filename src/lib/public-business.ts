export const publicBusiness = {
  name: "TekCentral",
  legalName: "TEKCENTRAL (Pty) Ltd",
  registrationNumber: "2026/701802/07",
  websiteLabel: "tekcentral.co.za",
  websiteUrl: "https://tekcentral.co.za",
  country: "South Africa",
  contactPath: "/contact",
  policyEffectiveDate: "22 October 2026",
  email: {
    general: "info@tekcentral.co.za",
    support: "support@tekcentral.co.za",
    sales: "sales@tekcentral.co.za",
    accounts: "accounts@tekcentral.co.za",
  },
  phone: {
    display: "+27 87 351 1146",
    href: "tel:+27873511146",
  },
  registeredAddress: {
    street: "6 Parklands Main Road",
    locality: "Table View",
    area: "Blouberg",
    postalCode: "7441",
    country: "South Africa",
    lines: ["6 Parklands Main Road", "Table View", "Blouberg", "7441", "South Africa"],
    inline: "6 Parklands Main Road, Table View, Blouberg, 7441, South Africa",
  },
} as const;

export const emailHref = (address: string) => `mailto:${address}`;

export const policyLinks = [
  { label: "Terms & Conditions", to: "/terms" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Refund Policy", to: "/refund-policy" },
  { label: "Cancellation Policy", to: "/cancellation-policy" },
  { label: "Shipping & Delivery", to: "/shipping-delivery" },
] as const;
