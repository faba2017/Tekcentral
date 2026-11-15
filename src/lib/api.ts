export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (import.meta.env.DEV) console.error("API request could not reach backend", { method: init?.method ?? "GET", path, apiBaseUrl, error });
    throw new ApiError("API request could not reach backend.", undefined, "NETWORK_UNAVAILABLE");
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new ApiError(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Request failed.",
      response.status,
      payload &&
        typeof payload === "object" &&
        "code" in payload &&
        typeof payload.code === "string"
        ? payload.code
        : undefined,
    );
  }

  return payload as T;
}
