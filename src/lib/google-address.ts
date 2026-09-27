export interface GoogleAddressComponent { longText?: string; shortText?: string; types: string[]; }
export interface ParsedGoogleAddress { streetAddress: string; suburb: string; city: string; province: string; postalCode: string; country: string; }
const value = (items: GoogleAddressComponent[], type: string, short = false) => { const item = items.find((entry) => entry.types.includes(type)); return (short ? item?.shortText : item?.longText)?.trim() ?? ""; };
export function parseGoogleAddressComponents(items: GoogleAddressComponent[]): ParsedGoogleAddress {
  const streetNumber = value(items, "street_number"); const route = value(items, "route");
  const premise = value(items, "premise"); const subpremise = value(items, "subpremise");
  return {
    streetAddress: [subpremise, streetNumber, route || premise].filter(Boolean).join(" ").trim(),
    suburb: value(items, "sublocality_level_1") || value(items, "sublocality"),
    city: value(items, "locality") || value(items, "postal_town") || value(items, "administrative_area_level_2"),
    province: value(items, "administrative_area_level_1"), postalCode: value(items, "postal_code"),
    country: value(items, "country") || "South Africa",
  };
}
export function isCompleteSouthAfricanAddress(address: ParsedGoogleAddress) { return Boolean(address.streetAddress && address.city && address.province && /^\d{4}$/.test(address.postalCode) && /south africa/i.test(address.country)); }
