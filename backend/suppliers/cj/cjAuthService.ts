import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CJ_API_BASE_URL, type CjApiEnvelope, type CjAuthMetadata, type CjTokenData } from "./cjTypes.js";
import { CjApiError } from "./cjErrors.js";

interface CjAuthStore {
  version: 1;
  token?: CjTokenData;
  lastSuccessfulRequestAt?: string;
  lastError?: string | null;
}

type FetchLike = typeof fetch;

const refreshWindowMs = 5 * 60 * 1000;

function getStorePath() {
  return resolve(process.cwd(), ".data", "cj-auth.json");
}

async function readStore(): Promise<CjAuthStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CjAuthStore>;
    return {
      version: 1,
      token: parsed.token,
      lastSuccessfulRequestAt: parsed.lastSuccessfulRequestAt,
      lastError: parsed.lastError ?? null,
    };
  } catch {
    return { version: 1, lastError: null };
  }
}

async function writeStore(store: CjAuthStore) {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

function isUsable(date?: string) {
  return Boolean(date && new Date(date).getTime() - Date.now() > refreshWindowMs);
}

async function safeJson<T>(response: Response): Promise<CjApiEnvelope<T>> {
  return (await response.json().catch(() => ({}))) as CjApiEnvelope<T>;
}

export class CjAuthService {
  private inFlight?: Promise<CjTokenData>;

  constructor(private fetcher: FetchLike = fetch) {}

  async getStatus(): Promise<CjAuthMetadata> {
    const store = await readStore();
    return {
      supplier: "CJ",
      configured: Boolean(process.env.CJ_API_KEY?.trim()),
      authenticated: Boolean(store.token?.accessToken && isUsable(store.token.accessTokenExpiryDate)),
      accessTokenExpiresAt: store.token?.accessTokenExpiryDate,
      refreshTokenExpiresAt: store.token?.refreshTokenExpiryDate,
      lastSuccessfulRequestAt: store.lastSuccessfulRequestAt,
      lastError: store.lastError ?? null,
    };
  }

  async getAccessToken() {
    const store = await readStore();
    if (store.token?.accessToken && isUsable(store.token.accessTokenExpiryDate)) {
      return store.token.accessToken;
    }
    if (!this.inFlight) {
      this.inFlight = this.refreshOrAuthenticate(store).finally(() => {
        this.inFlight = undefined;
      });
    }
    return (await this.inFlight).accessToken;
  }

  async markSuccessfulRequest() {
    const store = await readStore();
    await writeStore({ ...store, lastSuccessfulRequestAt: new Date().toISOString(), lastError: null });
  }

  async markError(message: string) {
    const store = await readStore();
    await writeStore({ ...store, lastError: message });
  }

  private async refreshOrAuthenticate(store: CjAuthStore): Promise<CjTokenData> {
    if (store.token?.refreshToken && isUsable(store.token.refreshTokenExpiryDate)) {
      try {
        return await this.refresh(store.token.refreshToken);
      } catch (error) {
        if (!(error instanceof CjApiError)) throw error;
      }
    }
    return this.authenticate();
  }

  private async authenticate() {
    const apiKey = process.env.CJ_API_KEY?.trim();
    if (!apiKey) throw new CjApiError("CJ_NOT_CONFIGURED", "CJ API key is not configured.");
    const response = await this.fetcher(`${CJ_API_BASE_URL}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const payload = await safeJson<CjTokenData>(response);
    if (!response.ok || payload.result === false || !payload.data?.accessToken) {
      const message = payload.message || "CJ authentication failed.";
      await this.markError(message);
      throw new CjApiError("CJ_AUTH_FAILED", message, payload.requestId);
    }
    await writeStore({ version: 1, token: payload.data, lastSuccessfulRequestAt: new Date().toISOString(), lastError: null });
    return payload.data;
  }

  private async refresh(refreshToken: string) {
    const response = await this.fetcher(`${CJ_API_BASE_URL}/authentication/refreshAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await safeJson<CjTokenData>(response);
    if (!response.ok || payload.result === false || !payload.data?.accessToken) {
      const message = payload.message || "CJ token refresh failed.";
      await this.markError(message);
      throw new CjApiError("CJ_TOKEN_REFRESH_FAILED", message, payload.requestId);
    }
    await writeStore({ version: 1, token: payload.data, lastSuccessfulRequestAt: new Date().toISOString(), lastError: null });
    return payload.data;
  }
}
