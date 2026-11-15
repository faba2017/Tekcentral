import { query } from "./postgres.js";

export interface SharedRateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number; }
export async function consumeSharedRateLimit(input: { keyHash: string; limit: number; windowSeconds: number; now?: Date }): Promise<SharedRateLimitResult> {
  const now = input.now ?? new Date(); const windowStart = new Date(Math.floor(now.getTime() / (input.windowSeconds * 1_000)) * input.windowSeconds * 1_000);
  const result = await query<{ count: number }>(`INSERT INTO rate_limit_buckets(key_hash, window_start, window_seconds, count, expires_at)
    VALUES ($1,$2,$3::integer,1,$2::timestamptz + make_interval(secs => $3::integer))
    ON CONFLICT (key_hash, window_start, window_seconds) DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count`, [input.keyHash, windowStart.toISOString(), input.windowSeconds]);
  const count = Number(result.rows[0]?.count ?? input.limit + 1); const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + input.windowSeconds * 1_000 - now.getTime()) / 1_000));
  return { allowed: count <= input.limit, remaining: Math.max(0, input.limit - count), retryAfterSeconds };
}
