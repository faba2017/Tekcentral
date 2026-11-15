export type RecaptchaAction = "contact_submit" | "account_register" | "password_reset_request";

declare global {
  interface Window { grecaptcha?: { ready(callback: () => void): void; execute(siteKey: string, options: { action: string }): Promise<string> } }
}

let loader: Promise<void> | undefined;
function loadRecaptcha(siteKey: string) {
  if (window.grecaptcha) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true; script.defer = true;
    script.onload = () => window.grecaptcha?.ready(resolve);
    script.onerror = () => reject(new Error("Verification could not be loaded. Please try again."));
    document.head.append(script);
  });
  return loader;
}

export async function executeRecaptcha(action: RecaptchaAction) {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey) throw new Error("Verification is temporarily unavailable. Please try again shortly.");
  await loadRecaptcha(siteKey);
  if (!window.grecaptcha) throw new Error("Verification could not be loaded. Please try again.");
  return window.grecaptcha.execute(siteKey, { action });
}
