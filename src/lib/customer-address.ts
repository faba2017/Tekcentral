export const southAfricanProvinces = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"] as const;
export interface CustomerAddressInput { label?: string; recipientFirstName: string; recipientLastName: string; company?: string; phone: string; addressLine1: string; addressLine2?: string; suburb: string; city: string; province: string; postalCode: string; country: string }
export interface CustomerAddress extends CustomerAddressInput { id: string; customerAccountId: string; isDefault: boolean; createdAt: string; updatedAt: string }
export function validateCustomerAddress(input: CustomerAddressInput) {
  const errors: Record<string, string> = {};
  if (!input.recipientFirstName?.trim()) errors.recipientFirstName = "Recipient first name is required.";
  if (!input.recipientLastName?.trim()) errors.recipientLastName = "Recipient last name is required.";
  if (!/^[0-9+\s()-]{7,20}$/.test(input.phone?.trim() ?? "")) errors.phone = "Enter a valid phone number.";
  if (!input.addressLine1?.trim()) errors.addressLine1 = "Address line 1 is required.";
  if (!input.suburb?.trim()) errors.suburb = "Suburb is required.";
  if (!input.city?.trim()) errors.city = "City is required.";
  if (!(southAfricanProvinces as readonly string[]).includes(input.province)) errors.province = "Choose a supported South African province.";
  if (!/^\d{4}$/.test(input.postalCode?.trim() ?? "")) errors.postalCode = "Enter a four-digit postal code.";
  if (input.country?.trim() !== "South Africa") errors.country = "Country must be South Africa.";
  return errors;
}
