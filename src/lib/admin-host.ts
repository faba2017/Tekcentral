const normalizedHost = (value?: string) => value?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

export const configuredAdminHost = normalizedHost(import.meta.env.VITE_ADMIN_HOST);
export const isLocalAdminRouting = () => import.meta.env.DEV || ["localhost", "127.0.0.1"].includes(window.location.hostname);
export const isAdminHost = () => Boolean(configuredAdminHost && window.location.host === configuredAdminHost);
export const adminPath = (path = "") => {
  const suffix = path ? `/${path.replace(/^\//, "")}` : "";
  return isAdminHost() && !isLocalAdminRouting() ? suffix || "/" : `/admin${suffix}`;
};

