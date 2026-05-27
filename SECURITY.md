# Security

## Reporting vulnerabilities

Please report security issues privately to the maintainers (do not open public GitHub issues for exploitable bugs).

## Production checklist

1. Set `ADMIN_IDENTIFIERS` and `PRIMARY_ADMIN_IDENTIFIER` (no hardcoded fallbacks in production).
2. Set the same `INTERNAL_PROXY_SECRET` on **auth-worker** and **web** (SSR trusted proxy for `X-Client-IP` / `X-Client-UA`).
3. Store payment and OAuth secrets via Cloudflare secrets / Secrets Store (never commit values).
4. Keep `ENVIRONMENT=production` and `DEBUG=false` on auth-worker.
5. Do not enable `DEV_MODE` on moltbot-sandbox in production.

## Trusted proxy headers

Browsers must not send `X-Trusted-Proxy-Key`. Only server-side Next.js calls (e.g. `getUserFromToken`) should attach it together with real client IP/UA.
