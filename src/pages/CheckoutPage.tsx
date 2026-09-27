import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiChevronLeft, FiChevronRight, FiShoppingBag } from "react-icons/fi";
import { PaymentStatusNotice } from "@/components/commerce/PaymentStatusNotice";
import {
  calculateOrderTotals,
  deliveryMethods,
  demoTaxConfig,
  paymentMethods,
  southAfricanProvinces,
} from "@/lib/checkout-config";
import { formatCurrency } from "@/lib/format";
import { savePayfastCartSnapshot } from "@/lib/payfast-cart";
import { usePageTitle } from "@/lib/page-title";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { ApiError, apiRequest } from "@/lib/api";
import { useCart } from "@/state/cart";
import { useOrders } from "@/state/orders";
import { getCustomerPaymentError } from "@/lib/payment-errors";
import { GooglePlacesAddressInput } from "@/components/commerce/GooglePlacesAddressInput";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  Order,
  PaymentMethod,
} from "@/types/order";

type CheckoutStep = "customer" | "delivery" | "payment" | "review";
type CheckoutErrors = Partial<Record<string, string>>;
type CheckoutPaymentState = "redirecting" | "delayed" | "error" | null;
type DeliveryQuoteState = "ADDRESS_REQUIRED" | "QUOTE_CALCULATING" | "QUOTE_READY" | "QUOTE_NO_MATCHING_ZONE" | "QUOTE_RATE_NOT_CONFIGURED" | "QUOTE_MISSING_LOGISTICS" | "QUOTE_UNAVAILABLE_POLICY" | "QUOTE_FAILED" | "QUOTE_EXPIRED";
interface CheckoutShippingQuote {
  quoteId: string;
  currency: "ZAR";
  customerShippingCharge?: number;
  generatedAt: string;
  expiresAt: string;
  status: "READY" | "PARTIAL" | "UNAVAILABLE" | "EXPIRED";
  deliveryMethodId: string;
  warnings: string[];
  fulfilmentGroups: { groupId: string; customerLabel: string; customerDescription?: string; customerCharge?: number; estimate?: string; warnings: string[] }[];
}

interface CheckoutDraft {
  customer: CheckoutCustomer;
  deliveryAddress: DeliveryAddress;
  deliveryMethodId: DeliveryMethod["id"];
  paymentMethodId: PaymentMethod["id"] | "";
}
interface AddressValidationResult { status: "VALIDATED" | "NEEDS_CONFIRMATION" | "INVALID" | "VALIDATION_UNAVAILABLE"; normalizedAddress?: DeliveryAddress; unresolvedConcerns: string[]; }
interface ShippingOptionsResult { options: CheckoutShippingQuote[]; outcome: "QUOTE_READY" | "QUOTE_NO_MATCHING_ZONE" | "QUOTE_RATE_NOT_CONFIGURED" | "QUOTE_MISSING_LOGISTICS" | "QUOTE_UNAVAILABLE_POLICY" | "QUOTE_FAILED"; reason?: string; }

const checkoutDraftKey = "tekcentral-checkout-draft-v1";
const steps: { id: CheckoutStep; label: string }[] = [
  { id: "customer", label: "Customer" },
  { id: "delivery", label: "Delivery" },
  { id: "payment", label: "Payment" },
  { id: "review", label: "Review" },
];

const emptyDraft: CheckoutDraft = {
  customer: {
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    companyName: "",
    vatNumber: "",
  },
  deliveryAddress: {
    streetAddress: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    country: "South Africa",
  },
  deliveryMethodId: "standard",
  paymentMethodId: "payfast",
};

function readDraft(): CheckoutDraft {
  try {
    const stored = window.localStorage.getItem(checkoutDraftKey);
    if (!stored) return emptyDraft;
    const parsed = JSON.parse(stored) as Partial<CheckoutDraft>;
    return {
      ...emptyDraft,
      ...parsed,
      customer: { ...emptyDraft.customer, ...parsed.customer },
      deliveryAddress: { ...emptyDraft.deliveryAddress, ...parsed.deliveryAddress },
    };
  } catch {
    return emptyDraft;
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateCustomer(customer: CheckoutCustomer) {
  const errors: CheckoutErrors = {};
  if (!customer.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!customer.lastName.trim()) errors.lastName = "Enter your last name.";
  if (!isEmail(customer.email.trim())) errors.email = "Enter a valid email address.";
  if (!/^[0-9+\s()-]{7,20}$/.test(customer.mobile.trim())) {
    errors.mobile = "Enter a valid mobile number.";
  }
  return errors;
}

function validateDelivery(draft: CheckoutDraft) {
  const errors: CheckoutErrors = {};
  const address = draft.deliveryAddress;
  if (!address.streetAddress.trim()) errors.streetAddress = "Enter your street address.";
  if (!address.suburb.trim()) errors.suburb = "Enter your suburb.";
  if (!address.city.trim()) errors.city = "Enter your city or town.";
  if (!address.province) errors.province = "Choose a province.";
  if (!/^\d{4}$/.test(address.postalCode.trim())) {
    errors.postalCode = "Enter a four-digit postal code.";
  }
  if (!deliveryMethods.some((method) => method.id === draft.deliveryMethodId && method.enabled)) {
    errors.deliveryMethodId = "Choose a delivery method.";
  }
  return errors;
}

function isCompleteDeliveryAddress(address: DeliveryAddress) {
  return Boolean(address.streetAddress.trim() && address.suburb.trim() && address.city.trim() && address.province.trim() && /^\d{4}$/.test(address.postalCode.trim()) && address.country.trim());
}

function validatePayment(draft: CheckoutDraft) {
  const errors: CheckoutErrors = {};
  if (!paymentMethods.some((method) => method.id === draft.paymentMethodId && method.enabled)) {
    errors.paymentMethodId = "Choose a payment method.";
  }
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm font-semibold text-red-700">
      {message}
    </p>
  );
}

export function CheckoutPage() {
  const { products } = useStorefrontCatalogue();
  usePageTitle("Checkout | TekCentral");
  const { lines } = useCart();
  const { saveOrderMirror } = useOrders();
  const [draft, setDraft] = useState<CheckoutDraft>(readDraft);
  const [step, setStep] = useState<CheckoutStep>("customer");
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [formMessage, setFormMessage] = useState("");
  const [paymentState, setPaymentState] = useState<CheckoutPaymentState>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isPayfastSubmitting, setIsPayfastSubmitting] = useState(false);
  const [checkoutOrderNumber, setCheckoutOrderNumber] = useState("");
  const [shippingQuote, setShippingQuote] = useState<CheckoutShippingQuote>();
  const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<CheckoutShippingQuote[]>([]);
  const [deliveryQuoteState, setDeliveryQuoteState] = useState<DeliveryQuoteState>("ADDRESS_REQUIRED");
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult>();
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const paymentNoticeRef = useRef<HTMLDivElement | null>(null);
  const quoteRequestRef = useRef(0);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
    window.localStorage.setItem(checkoutDraftKey, JSON.stringify(draft));
  }, [draft]);

  const cartItems = useMemo(
    () =>
      lines
        .map((line) => {
          const product = products.find((item) => item.id === line.productId);
          return product ? { line, product } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [lines, products],
  );

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.line.quantity,
    0,
  );
  const deliveryMethod =
    deliveryMethods.find((method) => method.id === draft.deliveryMethodId) ??
    deliveryMethods[0];
  const paymentMethod = paymentMethods.find((method) => method.id === draft.paymentMethodId);
  const quotedDelivery = shippingQuote?.status === "READY" ? shippingQuote.customerShippingCharge : undefined;
  const quoteExpired = Boolean(shippingQuote && Date.parse(shippingQuote.expiresAt) <= currentTime);
  const effectiveDeliveryState: DeliveryQuoteState = quoteExpired ? "QUOTE_EXPIRED" : deliveryQuoteState;
  const deliverySummary = effectiveDeliveryState === "QUOTE_CALCULATING" ? "Calculating delivery..." : effectiveDeliveryState === "QUOTE_EXPIRED" ? "Quote expired" : ["QUOTE_UNAVAILABLE_POLICY", "QUOTE_NO_MATCHING_ZONE", "QUOTE_RATE_NOT_CONFIGURED", "QUOTE_MISSING_LOGISTICS"].includes(effectiveDeliveryState) ? "Delivery price unavailable" : effectiveDeliveryState === "QUOTE_FAILED" ? "Calculation failed" : quotedDelivery === undefined ? (draft.deliveryAddress.streetAddress ? "Awaiting complete address" : "Enter delivery address") : formatCurrency(quotedDelivery, "ZAR");
  const totals = calculateOrderTotals(subtotal, quotedDelivery ?? 0);
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  useEffect(() => { if (!shippingQuote) return; const delay = Math.max(0, Date.parse(shippingQuote.expiresAt) - Date.now()); const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay + 50); return () => window.clearTimeout(timer); }, [shippingQuote]);

  const setCustomer = (field: keyof CheckoutCustomer, value: string) => {
    setDraft((current) => ({
      ...current,
      customer: { ...current.customer, [field]: value },
    }));
  };

  const setAddress = (field: keyof DeliveryAddress, value: string) => {
    quoteRequestRef.current += 1;
    setShippingQuote(undefined);
    setShippingOptions([]);
    setDeliveryQuoteState("ADDRESS_REQUIRED");
    setAddressValidation(undefined);
    setCheckoutOrderNumber("");
    setDraft((current) => ({
      ...current,
      deliveryAddress: { ...current.deliveryAddress, [field]: value },
    }));
  };
  const placesUnavailableHandler = useCallback(() => setPlacesUnavailable(true), []);
  const placesAvailableHandler = useCallback(() => setPlacesUnavailable(false), []);
  const applySelectedAddress = (address: Partial<DeliveryAddress>) => { quoteRequestRef.current += 1; setShippingQuote(undefined); setShippingOptions([]); setDeliveryQuoteState("ADDRESS_REQUIRED"); setAddressValidation(undefined); setDraft((current) => ({ ...current, deliveryAddress: { ...current.deliveryAddress, ...address } })); };

  const validateStep = (targetStep: CheckoutStep) => {
    const nextErrors =
      targetStep === "customer"
        ? validateCustomer(draft.customer)
        : targetStep === "delivery"
          ? validateDelivery(draft)
          : targetStep === "payment"
            ? validatePayment(draft)
            : {
                ...validateCustomer(draft.customer),
                ...validateDelivery(draft),
                ...validatePayment(draft),
              };

    setErrors(nextErrors);
    const valid = Object.keys(nextErrors).length === 0;
    setFormMessage(valid ? "" : "Please complete the highlighted fields.");
    return valid;
  };

  const goToStep = (targetStep: CheckoutStep) => {
    const targetIndex = steps.findIndex((item) => item.id === targetStep);
    if (targetIndex <= currentStepIndex) {
      setStep(targetStep);
      setErrors({});
      return;
    }
    if (validateStep(step)) setStep(targetStep);
  };

  const requestShippingQuote = useCallback(async (addressInput: DeliveryAddress, items: { productId: string; quantity: number }[], preferredMethodId: DeliveryMethod["id"]) => {
    const requestId = ++quoteRequestRef.current;
    setShippingQuoteLoading(true);
    setDeliveryQuoteState("QUOTE_CALCULATING");
    setFormMessage("");
    try {
      const validation = await apiRequest<AddressValidationResult>("/api/addresses/validate", { method: "POST", body: JSON.stringify(addressInput) });
      if (requestId !== quoteRequestRef.current) return undefined;
      setAddressValidation(validation);
      if (validation.status === "INVALID") { setDeliveryQuoteState("ADDRESS_REQUIRED"); setFormMessage("Please check your delivery address."); return undefined; }
      if (validation.status === "NEEDS_CONFIRMATION") { setDeliveryQuoteState("ADDRESS_REQUIRED"); setFormMessage("Please review and confirm the suggested address."); return undefined; }
      const address = validation.normalizedAddress ?? addressInput;
      const response = await apiRequest<ShippingOptionsResult>("/api/shipping/options", {
        method: "POST",
        body: JSON.stringify({
          items,
          destination: { country: address.country, province: address.province, city: address.city, suburb: address.suburb, postalCode: address.postalCode.trim() },
        }),
      });
      if (requestId !== quoteRequestRef.current) return undefined;
      setShippingOptions(response.options);
      const preferred = response.options.find((option) => option.deliveryMethodId === preferredMethodId) ?? response.options[0];
      setShippingQuote(preferred);
      if (!preferred) {
        if (response.outcome === "QUOTE_NO_MATCHING_ZONE") { setDeliveryQuoteState("QUOTE_NO_MATCHING_ZONE"); setFormMessage("Delivery pricing is not available for this destination yet."); }
        else if (response.outcome === "QUOTE_RATE_NOT_CONFIGURED") { setDeliveryQuoteState("QUOTE_RATE_NOT_CONFIGURED"); setFormMessage("Delivery pricing is not currently configured for this destination."); }
        else if (response.outcome === "QUOTE_MISSING_LOGISTICS") { setDeliveryQuoteState("QUOTE_MISSING_LOGISTICS"); setFormMessage("Delivery pricing is not available for this item yet."); }
        else if (response.outcome === "QUOTE_UNAVAILABLE_POLICY") { setDeliveryQuoteState("QUOTE_UNAVAILABLE_POLICY"); setFormMessage("Delivery pricing is not currently available for this item."); }
        else { setDeliveryQuoteState("QUOTE_FAILED"); setFormMessage("We couldn't calculate delivery right now. Please try again."); }
        return undefined;
      }
      setDeliveryQuoteState("QUOTE_READY");
      setDraft((current) => ({ ...current, deliveryMethodId: preferred.deliveryMethodId as DeliveryMethod["id"], deliveryAddress: { ...current.deliveryAddress, ...address, validationStatus: validation.status } }));
      return preferred;
    } catch (error) {
      if (requestId !== quoteRequestRef.current) return undefined;
      setShippingQuote(undefined); setShippingOptions([]);
      if (error instanceof ApiError && error.code === "INVALID_ADDRESS") {
        setDeliveryQuoteState("ADDRESS_REQUIRED"); setFormMessage("Please check your delivery address.");
      } else {
        setDeliveryQuoteState("QUOTE_FAILED");
        setFormMessage("We couldn't calculate delivery right now. Please try again.");
      }
      return undefined;
    } finally { if (requestId === quoteRequestRef.current) setShippingQuoteLoading(false); }
  }, []);

  const automaticQuoteKey = JSON.stringify({ address: { streetAddress: draft.deliveryAddress.streetAddress, suburb: draft.deliveryAddress.suburb, city: draft.deliveryAddress.city, province: draft.deliveryAddress.province, postalCode: draft.deliveryAddress.postalCode, country: draft.deliveryAddress.country }, items: cartItems.map(({ product, line }) => [product.id, line.quantity]) });
  useEffect(() => {
    quoteRequestRef.current += 1;
    if (step !== "delivery" || !isCompleteDeliveryAddress(draftRef.current.deliveryAddress) || cartItems.length === 0) return;
    const timer = window.setTimeout(() => {
      const current = draftRef.current;
      void requestShippingQuote({ ...current.deliveryAddress }, cartItems.map(({ product, line }) => ({ productId: product.id, quantity: line.quantity })), current.deliveryMethodId);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [automaticQuoteKey, cartItems, quoteExpired, requestShippingQuote, step]);

  const goNext = async () => {
    if (!validateStep(step)) return;
    if (step === "delivery" && (!shippingQuote || shippingQuote.status !== "READY" || Date.parse(shippingQuote.expiresAt) <= Date.now()) && !(await requestShippingQuote({ ...draft.deliveryAddress }, cartItems.map(({ product, line }) => ({ productId: product.id, quantity: line.quantity })), draft.deliveryMethodId))) return;
    const next = steps[currentStepIndex + 1];
    if (next) setStep(next.id);
  };

  const redirectToPayfast = (actionUrl: string, fields: Record<string, string>) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPayfastSubmitting) return;
    if (cartItems.length === 0 || !paymentMethod || !validateStep("review")) return;
    setIsPayfastSubmitting(true);
    setPaymentError("");
    setPaymentState("redirecting");
    setFormMessage("");

    const delayTimer = window.setTimeout(() => {
      setPaymentState((current) => (current === "redirecting" ? "delayed" : current));
    }, 8000);

    try {
      if (!shippingQuote || shippingQuote.status !== "READY") {
        setFormMessage("Please confirm delivery before continuing to payment.");
        setStep("delivery");
        return;
      }
      const revalidation = await apiRequest<{ quote: CheckoutShippingQuote; changed: boolean }>(`/api/shipping/quotes/${encodeURIComponent(shippingQuote.quoteId)}/revalidate`, { method: "POST" });
      setShippingQuote(revalidation.quote);
      if (revalidation.changed) {
        setCheckoutOrderNumber("");
        setPaymentState(null);
        setFormMessage("Delivery cost changed. Please review the updated delivery quote before payment.");
        setStep("delivery");
        setIsPayfastSubmitting(false);
        window.clearTimeout(delayTimer);
        return;
      }
      let orderNumber = checkoutOrderNumber;
      if (!orderNumber) {
        const { order } = await apiRequest<{ order: Order }>("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            customer: {
              ...draft.customer,
              firstName: draft.customer.firstName.trim(),
              lastName: draft.customer.lastName.trim(),
              email: draft.customer.email.trim(),
              mobile: draft.customer.mobile.trim(),
            },
            deliveryAddress: {
              ...draft.deliveryAddress,
              streetAddress: draft.deliveryAddress.streetAddress.trim(),
              suburb: draft.deliveryAddress.suburb.trim(),
              city: draft.deliveryAddress.city.trim(),
              postalCode: draft.deliveryAddress.postalCode.trim(),
            },
            deliveryMethodId: deliveryMethod.id,
            shippingQuoteId: revalidation.quote.quoteId,
            items: cartItems.map(({ product, line }) => ({
              productId: product.id,
              quantity: line.quantity,
            })),
          }),
        });
        orderNumber = order.orderNumber;
        setCheckoutOrderNumber(orderNumber);
        saveOrderMirror({ ...order, returns: [], refunds: [] });
        savePayfastCartSnapshot(order.orderNumber, lines);
      }
      const paymentRequest = await apiRequest<{
        actionUrl: string;
        fields: Record<string, string>;
      }>("/api/payments/payfast/create", {
        method: "POST",
        body: JSON.stringify({ orderNumber }),
      });
      redirectToPayfast(paymentRequest.actionUrl, paymentRequest.fields);
    } catch (error) {
      console.error(error);
      window.clearTimeout(delayTimer);
      if (error instanceof ApiError && error.code === "SHIPPING_QUOTE_CHANGED") {
        setShippingQuote(undefined);
        setCheckoutOrderNumber("");
        setStep("delivery");
        setFormMessage("Delivery cost changed. Please review a new delivery quote before payment.");
        setPaymentState(null);
        setIsPayfastSubmitting(false);
        return;
      }
      setPaymentError(getCustomerPaymentError(error));
      setPaymentState("error");
      setIsPayfastSubmitting(false);
      window.setTimeout(() => paymentNoticeRef.current?.focus(), 0);
    }
  };

  if (cartItems.length === 0) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-dashed border-[#BFC7D4] bg-[#F6F7F9] p-8 text-center">
          <FiShoppingBag className="mx-auto text-3xl text-[var(--tek-accent)]" />
          <h1 className="mt-4 text-3xl font-black text-[#0A0A0A]">
            Your cart is empty.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3F4652]">
            Add products to your cart before starting checkout.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
          >
            Shop Technology
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#F6F7F9] px-4 py-10 sm:px-6 lg:px-8">
      <form onSubmit={placeOrder} className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Checkout
            </p>
            <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">
              Complete your order.
            </h1>
          </div>
          <Link
            to="/cart"
            className="inline-flex items-center gap-2 text-sm font-black text-[#3F4652] transition hover:text-[#0A0A0A]"
          >
            <FiChevronLeft aria-hidden="true" />
            Back to cart
          </Link>
        </div>

        <ol className="mt-8 grid gap-2 rounded-lg border border-[#E4E7EC] bg-white p-2 sm:grid-cols-4">
          {steps.map((item, index) => {
            const active = item.id === step;
            const complete = index < currentStepIndex;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goToStep(item.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-black transition ${
                    active
                      ? "bg-[#EFFFFB] text-[#0A0A0A]"
                      : "text-[#727986] hover:bg-[#F6F7F9]"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full ${
                      active || complete
                        ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
                        : "bg-[#F6F7F9] text-[#727986]"
                    }`}
                  >
                    {complete ? <FiCheck aria-hidden="true" /> : index + 1}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>

        {formMessage && (
          <p aria-live="polite" className="mt-4 text-sm font-semibold text-red-700">
            {formMessage}
          </p>
        )}

        {paymentState && (
          <div ref={paymentNoticeRef} tabIndex={-1} className="mt-4 outline-none">
            <PaymentStatusNotice
              variant={paymentState === "error" ? "error" : "pending"}
              loading={paymentState !== "error"}
              title={
                paymentState === "delayed"
                  ? "Taking a little longer than expected"
                  : paymentState === "error"
                    ? "Unable to start PayFast checkout"
                    : "Redirecting to PayFast"
              }
              message={
                paymentState === "delayed"
                  ? "We're still preparing your secure PayFast session."
                  : paymentState === "error"
                    ? paymentError
                    : "We're securely transferring you to PayFast to complete your payment."
              }
              helper={
                paymentState === "delayed"
                  ? "Please wait a moment."
                  : paymentState === "error"
                    ? "Please try again."
                    : "Please wait a moment and do not close this window. This usually takes a few seconds."
              }
              actions={
                paymentState === "error" ? (
                  <>
                    <button
                      type="submit"
                      className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                    >
                      Try Again
                    </button>
                    <Link
                      to="/cart"
                      className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                    >
                      Back to Checkout
                    </Link>
                  </>
                ) : undefined
              }
            />
          </div>
        )}

        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:p-6">
            {step === "customer" && (
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">Customer details</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="First name"
                    value={draft.customer.firstName}
                    onChange={(value) => setCustomer("firstName", value)}
                    error={errors.firstName}
                    errorId="firstName-error"
                  />
                  <InputField
                    label="Last name"
                    value={draft.customer.lastName}
                    onChange={(value) => setCustomer("lastName", value)}
                    error={errors.lastName}
                    errorId="lastName-error"
                  />
                  <InputField
                    label="Email"
                    type="email"
                    value={draft.customer.email}
                    onChange={(value) => setCustomer("email", value)}
                    error={errors.email}
                    errorId="email-error"
                  />
                  <InputField
                    label="Mobile number"
                    value={draft.customer.mobile}
                    onChange={(value) => setCustomer("mobile", value)}
                    error={errors.mobile}
                    errorId="mobile-error"
                  />
                  <InputField
                    label="Company name"
                    value={draft.customer.companyName ?? ""}
                    onChange={(value) => setCustomer("companyName", value)}
                  />
                  <InputField
                    label="South African VAT number"
                    value={draft.customer.vatNumber ?? ""}
                    onChange={(value) => setCustomer("vatNumber", value)}
                  />
                </div>
              </div>
            )}

            {step === "delivery" && (
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">Delivery</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <GooglePlacesAddressInput value={draft.deliveryAddress.streetAddress} onChange={(value) => setAddress("streetAddress", value)} onSelect={applySelectedAddress} onUnavailable={placesUnavailableHandler} onAvailable={placesAvailableHandler} error={errors.streetAddress} errorId="streetAddress-error" />
                  {placesUnavailable && <p className="sm:col-span-2 -mt-2 text-xs font-semibold text-[#727986]">Address suggestions are unavailable. You can still enter the address manually.</p>}
                  <InputField
                    label="Suburb"
                    value={draft.deliveryAddress.suburb}
                    onChange={(value) => setAddress("suburb", value)}
                    error={errors.suburb}
                    errorId="suburb-error"
                  />
                  <InputField
                    label="City / Town"
                    value={draft.deliveryAddress.city}
                    onChange={(value) => setAddress("city", value)}
                    error={errors.city}
                    errorId="city-error"
                  />
                  <label className="block text-sm font-black text-[#0A0A0A]">
                    Province
                    <select
                      value={draft.deliveryAddress.province}
                      onChange={(event) => setAddress("province", event.target.value)}
                      aria-describedby="province-error"
                      className="mt-2 h-12 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                    >
                      <option value="">Choose province</option>
                      {southAfricanProvinces.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
                    <FieldError id="province-error" message={errors.province} />
                  </label>
                  <InputField
                    label="Postal code"
                    value={draft.deliveryAddress.postalCode}
                    onChange={(value) => setAddress("postalCode", value)}
                    error={errors.postalCode}
                    errorId="postalCode-error"
                  />
                  <InputField
                    label="Country"
                    value={draft.deliveryAddress.country}
                    onChange={(value) => setAddress("country", value)}
                    className="sm:col-span-2"
                  />
                </div>
                {addressValidation?.status === "NEEDS_CONFIRMATION" && addressValidation.normalizedAddress && <div className="mt-5 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-4"><p className="text-sm font-black text-[#93370D]">Confirm the suggested address</p><p className="mt-2 text-sm font-semibold text-[#3F4652]">{[addressValidation.normalizedAddress.streetAddress, addressValidation.normalizedAddress.suburb, addressValidation.normalizedAddress.city, addressValidation.normalizedAddress.province, addressValidation.normalizedAddress.postalCode].filter(Boolean).join(", ")}</p><button type="button" onClick={() => { applySelectedAddress({ ...addressValidation.normalizedAddress, validationStatus: "VALIDATED" }); setAddressValidation({ ...addressValidation, status: "VALIDATED" }); }} className="mt-3 rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black">Use suggested address</button></div>}
                {addressValidation?.status === "VALIDATION_UNAVAILABLE" && <p className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-sm font-semibold text-[#3F4652]">{addressValidation.unresolvedConcerns.includes("ADDRESS_VALIDATION_REGION_UNSUPPORTED") ? "Address validation is not available for South African addresses. Delivery will be calculated from the address you entered." : "Address validation is temporarily unavailable. Delivery will be calculated from the address you entered."}</p>}

                <fieldset className="mt-8">
                  <legend className="text-sm font-black text-[#0A0A0A]">
                    Delivery method
                  </legend>
                  <div className="mt-3 grid gap-3">
                    {shippingOptions.map((option) => {
                      const method = deliveryMethods.find((item) => item.id === option.deliveryMethodId);
                      if (!method || option.customerShippingCharge === undefined) return null;
                      return (
                        <label
                          key={method.id}
                          className={`flex cursor-pointer items-start justify-between gap-4 rounded-md border p-4 ${
                            draft.deliveryMethodId === method.id
                              ? "border-[var(--tek-accent)] bg-[#EFFFFB]"
                              : "border-[#E4E7EC]"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-black text-[#0A0A0A]">
                              {method.name}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-[#3F4652]">
                              {option.fulfilmentGroups[0]?.customerDescription ?? method.description} {option.fulfilmentGroups[0]?.estimate ?? method.estimatedRange}.
                            </span>
                          </span>
                          <span className="text-sm font-black text-[#0A0A0A]">
                            {formatCurrency(option.customerShippingCharge, "ZAR")}
                          </span>
                          <input
                            type="radio"
                            name="deliveryMethod"
                            checked={draft.deliveryMethodId === method.id}
                            onChange={() => {
                              setShippingQuote(option);
                              setDeliveryQuoteState("QUOTE_READY");
                              setCheckoutOrderNumber("");
                              setDraft((current) => ({
                                ...current,
                                deliveryMethodId: method.id,
                              }));
                            }}
                            className="sr-only"
                          />
                        </label>
                      );})}
                  </div>
                  {shippingOptions.length === 0 && <div className="mt-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4"><p className="text-sm font-black">{effectiveDeliveryState === "QUOTE_CALCULATING" || shippingQuoteLoading ? "Calculating delivery..." : effectiveDeliveryState === "QUOTE_NO_MATCHING_ZONE" ? "Delivery pricing is not available for this destination yet." : effectiveDeliveryState === "QUOTE_RATE_NOT_CONFIGURED" ? "Delivery pricing is not currently configured for this destination." : effectiveDeliveryState === "QUOTE_MISSING_LOGISTICS" ? "Delivery pricing is not available for this item yet." : effectiveDeliveryState === "QUOTE_UNAVAILABLE_POLICY" ? "Delivery pricing is not currently available for this item." : effectiveDeliveryState === "QUOTE_FAILED" ? "We couldn't calculate delivery right now. Please try again." : effectiveDeliveryState === "QUOTE_EXPIRED" ? "Delivery quote expired. Recalculating..." : isCompleteDeliveryAddress(draft.deliveryAddress) ? "Delivery will calculate automatically." : "Enter your complete delivery address to calculate delivery."}</p></div>}
                  <FieldError id="deliveryMethod-error" message={errors.deliveryMethodId} />
                  {shippingQuote?.status === "READY" && (
                    <div className="mt-4 rounded-md border border-[#B9E2DB] bg-[#EFFFFB] p-4 text-sm">
                      <p className="font-black">Delivery confirmed: {formatCurrency(shippingQuote.customerShippingCharge ?? 0, "ZAR")}</p>
                      {shippingQuote.fulfilmentGroups.map((group) => <p key={group.groupId} className="mt-1 font-semibold text-[#3F4652]">{group.customerLabel}{group.estimate ? ` · ${group.estimate}` : ""}</p>)}
                      {shippingQuote.fulfilmentGroups.length > 1 && <p className="mt-2 font-semibold text-[#3F4652]">Your order may arrive in separate deliveries.</p>}
                      <p className="mt-2 text-xs font-semibold text-[#727986]">Quote valid until {new Date(shippingQuote.expiresAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}.</p>
                    </div>
                  )}
                  {quoteExpired && <p className="mt-4 text-sm font-semibold text-[#B54708]">Delivery quote expired. Recalculate.</p>}
                </fieldset>
              </div>
            )}

            {step === "payment" && (
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">Payment method</h2>
                <p className="mt-3 text-sm leading-6 text-[#3F4652]">
                  PayFast will handle the secure payment step after order review.
                </p>
                <fieldset className="mt-6">
                  <legend className="sr-only">Choose payment method</legend>
                  <div className="grid gap-3">
                    {paymentMethods
                      .filter((method) => method.enabled)
                      .map((method) => (
                        <label
                          key={method.id}
                          className={`cursor-pointer rounded-md border p-4 ${
                            draft.paymentMethodId === method.id
                              ? "border-[var(--tek-accent)] bg-[#EFFFFB]"
                              : "border-[#E4E7EC]"
                          }`}
                        >
                          <span className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="paymentMethod"
                              checked={draft.paymentMethodId === method.id}
                              onChange={() =>
                                setDraft((current) => ({
                                  ...current,
                                  paymentMethodId: method.id,
                                }))
                              }
                              className="mt-1"
                            />
                            <span>
                              <span className="block text-sm font-black text-[#0A0A0A]">
                                {method.id === "payfast"
                                  ? "Pay securely with PayFast"
                                  : method.name}
                              </span>
                              <span className="mt-1 block text-sm leading-6 text-[#3F4652]">
                                {method.description}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-[#727986]">
                                {method.settlementNote}
                              </span>
                            </span>
                          </span>
                        </label>
                      ))}
                  </div>
                  <FieldError id="paymentMethod-error" message={errors.paymentMethodId} />
                </fieldset>
              </div>
            )}

            {step === "review" && (
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">Review order</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <ReviewPanel title="Customer" onEdit={() => setStep("customer")}>
                    <p>
                      {draft.customer.firstName} {draft.customer.lastName}
                    </p>
                    <p>{draft.customer.email}</p>
                    <p>{draft.customer.mobile}</p>
                    {draft.customer.companyName && <p>{draft.customer.companyName}</p>}
                  </ReviewPanel>
                  <ReviewPanel title="Delivery" onEdit={() => setStep("delivery")}>
                    <p>{draft.deliveryAddress.streetAddress}</p>
                    <p>
                      {draft.deliveryAddress.suburb}, {draft.deliveryAddress.city}
                    </p>
                    <p>
                      {draft.deliveryAddress.province}, {draft.deliveryAddress.postalCode}
                    </p>
                    <p>{deliveryMethod.name}</p>
                  </ReviewPanel>
                  <ReviewPanel title="Payment" onEdit={() => setStep("payment")}>
                    <p>{paymentMethod?.name}</p>
                    <p>{paymentMethod?.description}</p>
                  </ReviewPanel>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-[#E4E7EC] pt-5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep(steps[Math.max(0, currentStepIndex - 1)].id)}
                disabled={currentStepIndex === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiChevronLeft aria-hidden="true" />
                Back
              </button>
              {step === "review" ? (
                <button
                  type="submit"
                  disabled={isPayfastSubmitting || shippingQuote?.status !== "READY"}
                  className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] disabled:cursor-wait disabled:opacity-70"
                >
                  {isPayfastSubmitting
                    ? "Redirecting to PayFast..."
                    : `Pay ${formatCurrency(totals.total, "ZAR")} with PayFast`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={shippingQuoteLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                >
                  {shippingQuoteLoading ? "Confirming delivery..." : "Continue"}
                  <FiChevronRight aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-[#0A0A0A]">Order summary</h2>
            <div className="mt-5 space-y-4">
              {cartItems.map(({ product, line }) => (
                <div key={product.id} className="flex justify-between gap-4 text-sm">
                  <div>
                    <p className="font-black text-[#0A0A0A]">{product.name}</p>
                    <p className="mt-1 text-[#727986]">Qty {line.quantity}</p>
                  </div>
                  <p className="font-black text-[#0A0A0A]">
                    {formatCurrency(product.price * line.quantity, product.currency)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3 border-t border-[#E4E7EC] pt-5 text-sm">
              <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal, "ZAR")} />
              <SummaryRow
                label="Delivery"
                value={deliverySummary}
              />
              <div className="flex justify-between border-t border-[#E4E7EC] pt-3">
                <span className="font-black text-[#0A0A0A]">Total</span>
                <span className="text-xl font-black text-[#0A0A0A]">
                  {formatCurrency(totals.total, "ZAR")}
                </span>
              </div>
              <SummaryRow
                label={demoTaxConfig.label}
                value={formatCurrency(totals.taxAmount, "ZAR")}
              />
            </div>
          </aside>
        </div>
      </form>
    </section>
  );
}

function InputField({
  label,
  type = "text",
  value,
  onChange,
  error,
  errorId,
  className = "",
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  errorId?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-black text-[#0A0A0A] ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={errorId}
        className="mt-2 h-12 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
      />
      {errorId && <FieldError id={errorId} message={error} />}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-semibold text-[#3F4652]">{label}</span>
      <span className="font-black text-[#0A0A0A]">{value}</span>
    </div>
  );
}

function ReviewPanel({
  title,
  children,
  onEdit,
}: {
  title: string;
  children: ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-md bg-[#F6F7F9] p-4 text-sm leading-6 text-[#3F4652]">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-black text-[#0A0A0A]">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-black uppercase tracking-[0.12em] text-[var(--tek-accent-ink)] underline decoration-[var(--tek-accent)] decoration-2 underline-offset-4"
        >
          Edit
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
