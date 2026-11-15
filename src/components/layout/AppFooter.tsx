import { Link } from "react-router-dom";
import { emailHref, publicBusiness } from "@/lib/public-business";

const footerGroups = [
  {
    title: "Shop",
    links: [
      { label: "Shop All", to: "/shop" },
      { label: "Computers", to: "/category/computers" },
      { label: "Networking", to: "/category/networking" },
      { label: "Printing & Office", to: "/category/printing-office" },
      { label: "Accessories", to: "/category/accessories" },
    ],
  },
  {
    title: "Business",
    links: [
      { label: "Business Solutions", to: "/business" },
      { label: "Procurement", to: "/business" },
      { label: "Network Planning", to: "/business" },
      { label: "Quotations", to: "/business" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { label: "Contact Us", to: "/contact" },
      { label: "Shipping & Delivery", to: "/shipping-delivery" },
      { label: "Refund Policy", to: "/refund-policy" },
      { label: "Cancellation Policy", to: "/cancellation-policy" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Account", to: "/account" },
      { label: "Ask Zeus", to: "/zeus" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact Us", to: "/contact" },
    ],
  },
];

export function AppFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0A0A0A] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <Link to="/" className="text-left text-2xl font-black tracking-[-0.01em]">
            Tek<span className="text-[var(--tek-accent)]">Central</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">
            Technology, made easier. Technology for home, work and business.
          </p>
          <p className="mt-6 text-sm font-semibold text-[var(--tek-accent)]">
            {publicBusiness.websiteLabel} | {publicBusiness.country}
          </p>
          <p className="mt-3 text-xs font-semibold leading-5 text-zinc-500">
            {publicBusiness.legalName}<br />Reg. {publicBusiness.registrationNumber}
          </p>
          <address className="mt-4 space-y-2 text-sm not-italic text-zinc-400">
            <a className="block transition hover:text-[var(--tek-accent)]" href={emailHref(publicBusiness.email.support)}>{publicBusiness.email.support}</a>
            <a className="block transition hover:text-[var(--tek-accent)]" href={emailHref(publicBusiness.email.sales)}>{publicBusiness.email.sales}</a>
            <a className="block transition hover:text-[var(--tek-accent)]" href={publicBusiness.phone.href}>{publicBusiness.phone.display}</a>
          </address>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link className="transition hover:text-[var(--tek-accent)]" to={link.to}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
