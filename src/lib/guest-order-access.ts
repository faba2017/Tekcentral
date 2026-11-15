import { useEffect } from "react";

const keyPrefix = "tekcentral-guest-order-access:";

function storageKey(orderNumber: string) {
  return `${keyPrefix}${orderNumber}`;
}

export function storeGuestOrderAccess(orderNumber: string, token?: string) {
  if (!orderNumber || !token) return;
  window.sessionStorage.setItem(storageKey(orderNumber), token);
}

export function readGuestOrderAccess(orderNumber: string) {
  if (!orderNumber) return undefined;
  return window.sessionStorage.getItem(storageKey(orderNumber)) ?? undefined;
}

export function guestOrderAccessHeaders(orderNumber: string): Record<string, string> {
  const token = readGuestOrderAccess(orderNumber);
  return token ? { "X-Guest-Order-Access": token } : {};
}

export function captureGuestOrderAccess(orderNumber: string) {
  if (!orderNumber) return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("access") ?? undefined;
  if (!token) return;
  storeGuestOrderAccess(orderNumber, token);
  url.searchParams.delete("access");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function usePrivateOrderPage(orderNumber: string) {
  useEffect(() => {
    captureGuestOrderAccess(orderNumber);

    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const referrer = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const originalRobots = robots?.content;
    const originalReferrer = referrer?.content;
    const robotsMeta = robots ?? document.head.appendChild(document.createElement("meta"));
    const referrerMeta = referrer ?? document.head.appendChild(document.createElement("meta"));
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow";
    referrerMeta.name = "referrer";
    referrerMeta.content = "no-referrer";

    return () => {
      if (robots) robots.content = originalRobots ?? "";
      else robotsMeta.remove();
      if (referrer) referrer.content = originalReferrer ?? "";
      else referrerMeta.remove();
    };
  }, [orderNumber]);
}
