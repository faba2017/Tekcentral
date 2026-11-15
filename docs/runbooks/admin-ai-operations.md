# Admin AI operations runbook

Open **Settings → Admin AI Operations** with a staff account holding `settings.zeus`.

## Health interpretation

- `HEALTHY`: configured with recent successful observations below failure, fallback and latency thresholds.
- `DEGRADED`: elevated terminal failures/fallbacks, high p95 latency, stale leases, or a worker-cycle failure.
- `UNAVAILABLE`: configuration is unavailable or a critical provider authentication incident is active.
- `UNKNOWN`: configured but no recent evidence is available.

Do not run a live provider probe merely to change `UNKNOWN`. Review normal traffic and provider status first.

## Incident response

1. Open the linked H.1 alert and note its sanitized diagnostic code.
2. For authentication/configuration failures, verify server-managed environment configuration. Never copy credentials into tickets, browser fields or chat.
3. For transient failures, inspect bounded retries, fallback use, latency and provider status before retrying.
4. For automation failures, inspect due retries, stale leases and the process-local worker heartbeat. A restart resets heartbeat timestamps but not durable runs.
5. Keep governance denials separate from provider failures. Policy, RBAC, operating hours and limits are intentional controls.

## Cost and retention

Cost is unavailable until an authoritative billing/rate source is integrated. Do not infer currency cost from token counts. Chat, action and automation history follows existing explicit deletion/retirement behavior; H.1 retention remains governed by the operational-alert service.
