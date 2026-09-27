export type AddressValidationStatus = "VALIDATED" | "NEEDS_CONFIRMATION" | "INVALID" | "VALIDATION_UNAVAILABLE";
export interface StructuredDeliveryAddress {
  streetAddress: string; suburb: string; city: string; province: string; postalCode: string; country: string;
  placeId?: string; latitude?: number; longitude?: number;
}
export interface AddressValidationResult { status: AddressValidationStatus; normalizedAddress?: StructuredDeliveryAddress; unresolvedConcerns: string[]; validationId?: string; }

interface GoogleAddressResponse {
  responseId?: string;
  result?: {
    verdict?: { addressComplete?: boolean; hasUnconfirmedComponents?: boolean; hasInferredComponents?: boolean; hasReplacedComponents?: boolean };
    address?: { postalAddress?: { regionCode?: string; addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string }; addressComponents?: { componentName?: { text?: string }; componentType?: string; confirmationLevel?: string; inferred?: boolean; replaced?: boolean; unexpected?: boolean }[] };
    geocode?: { location?: { latitude?: number; longitude?: number }; placeId?: string };
  };
}

interface GoogleErrorResponse {
  error?: { code?: number; message?: string; status?: string };
}

export function classifyGoogleAddressValidationFailure(status: number, payload?: GoogleErrorResponse) {
  const googleStatus = payload?.error?.status;
  const message = payload?.error?.message ?? "";
  if (status === 400 && /unsupported region code/i.test(message)) return "ADDRESS_VALIDATION_REGION_UNSUPPORTED";
  if (status === 400) return "ADDRESS_VALIDATION_BAD_REQUEST";
  if (/billing/i.test(message)) return "ADDRESS_VALIDATION_BILLING_REQUIRED";
  if (/has not been used|not enabled|is disabled/i.test(message)) return "ADDRESS_VALIDATION_API_NOT_ENABLED";
  if (status === 401 || status === 403 || googleStatus === "PERMISSION_DENIED") return "ADDRESS_VALIDATION_REQUEST_DENIED";
  if (status === 429 || googleStatus === "RESOURCE_EXHAUSTED") return "ADDRESS_VALIDATION_QUOTA";
  if (status >= 500) return "ADDRESS_VALIDATION_SERVICE_UNAVAILABLE";
  return "ADDRESS_VALIDATION_FAILED";
}

function logValidationDiagnostic(category: string, status?: number, googleStatus?: string) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("Google Address Validation diagnostic", { category, httpStatus: status, googleStatus });
}
const component = (response: GoogleAddressResponse, type: string) => response.result?.address?.addressComponents?.find((item) => item.componentType === type)?.componentName?.text?.trim();
export function normalizeGoogleValidatedAddress(response: GoogleAddressResponse, fallback: StructuredDeliveryAddress): AddressValidationResult {
  const verdict = response.result?.verdict;
  if (!verdict) return { status: "INVALID", unresolvedConcerns: ["ADDRESS_VALIDATION_FAILED"] };
  const postal = response.result?.address?.postalAddress;
  const normalizedAddress: StructuredDeliveryAddress = {
    streetAddress: postal?.addressLines?.[0]?.trim() || fallback.streetAddress,
    suburb: component(response, "sublocality_level_1") || component(response, "sublocality") || fallback.suburb,
    city: postal?.locality?.trim() || component(response, "locality") || component(response, "postal_town") || fallback.city,
    province: postal?.administrativeArea?.trim() || component(response, "administrative_area_level_1") || fallback.province,
    postalCode: postal?.postalCode?.trim() || component(response, "postal_code") || fallback.postalCode,
    country: postal?.regionCode === "ZA" ? "South Africa" : fallback.country,
    placeId: response.result?.geocode?.placeId || fallback.placeId,
    latitude: response.result?.geocode?.location?.latitude ?? fallback.latitude,
    longitude: response.result?.geocode?.location?.longitude ?? fallback.longitude,
  };
  const concerns = response.result?.address?.addressComponents?.filter((item) => item.confirmationLevel === "UNCONFIRMED_BUT_PLAUSIBLE" || item.inferred || item.replaced || item.unexpected).map((item) => item.componentType ?? "ADDRESS_COMPONENT") ?? [];
  const complete = Boolean(verdict.addressComplete && normalizedAddress.streetAddress && normalizedAddress.city && normalizedAddress.province && /^\d{4}$/.test(normalizedAddress.postalCode));
  if (!complete) return { status: "INVALID", normalizedAddress, unresolvedConcerns: [...new Set(["INCOMPLETE_ADDRESS", ...concerns])], validationId: response.responseId };
  const materiallyChanged = ["streetAddress", "suburb", "city", "province", "postalCode"].some((key) => normalizedAddress[key as keyof StructuredDeliveryAddress] !== fallback[key as keyof StructuredDeliveryAddress]);
  const needsConfirmation = verdict.hasUnconfirmedComponents || verdict.hasInferredComponents || verdict.hasReplacedComponents || concerns.length > 0 || materiallyChanged;
  return { status: needsConfirmation ? "NEEDS_CONFIRMATION" : "VALIDATED", normalizedAddress, unresolvedConcerns: [...new Set(concerns)], validationId: response.responseId };
}

export async function validateDeliveryAddress(address: StructuredDeliveryAddress, fetcher: typeof fetch = fetch): Promise<AddressValidationResult> {
  const key = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY?.trim();
  if (!key) {
    logValidationDiagnostic("ADDRESS_VALIDATION_KEY_MISSING");
    return { status: "VALIDATION_UNAVAILABLE", unresolvedConcerns: ["ADDRESS_VALIDATION_KEY_MISSING"] };
  }
  if (!address.streetAddress.trim() || !address.city.trim() || !address.province.trim() || !/^\d{4}$/.test(address.postalCode.trim())) return { status: "INVALID", unresolvedConcerns: ["INCOMPLETE_ADDRESS"] };
  try {
    const response = await fetcher(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: { regionCode: "ZA", addressLines: [address.streetAddress, address.suburb].filter(Boolean), locality: address.city, administrativeArea: address.province, postalCode: address.postalCode }, sessionToken: undefined }) });
    if (!response.ok) {
      let payload: GoogleErrorResponse | undefined;
      try { payload = await response.json() as GoogleErrorResponse; } catch { payload = undefined; }
      const category = classifyGoogleAddressValidationFailure(response.status, payload);
      logValidationDiagnostic(category, response.status, payload?.error?.status);
      return { status: "VALIDATION_UNAVAILABLE", unresolvedConcerns: [category] };
    }
    return normalizeGoogleValidatedAddress(await response.json() as GoogleAddressResponse, address);
  } catch {
    logValidationDiagnostic("ADDRESS_VALIDATION_NETWORK_ERROR");
    return { status: "VALIDATION_UNAVAILABLE", unresolvedConcerns: ["ADDRESS_VALIDATION_NETWORK_ERROR"] };
  }
}
