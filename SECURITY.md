# Security

## Reporting vulnerabilities

Please report security issues privately to the maintainers (do not open public GitHub issues for exploitable bugs).

## Production checklist

1. Set `ADMIN_IDENTIFIERS` and `PRIMARY_ADMIN_IDENTIFIER` (no hardcoded fallbacks in production).
2. Set the same `INTERNAL_PROXY_SECRET` on **auth-worker** and **web** (SSR trusted proxy for `X-Client-IP` / `X-Client-UA`).
3. Store payment and OAuth secrets via Cloudflare secrets / Secrets Store (never commit values).
4. Keep `ENVIRONMENT=production` and `DEBUG=false` on auth-worker.
5. Do not enable `DEV_MODE` on moltbot-sandbox in production.
6. OTP: 60s TTL, max 5 verify attempts per pre-auth session, cooldown on `/otp/request` (per identifier + IP hourly caps).
7. **Cloudflare Turnstile**: set `TURNSTILE_SITE_KEY` (wrangler var, must start with `0x4…`) and matching `TURNSTILE_SECRET_KEY` (Secrets Store). In the Turnstile widget, add every hostname that loads login: `aiagents-hub.vn`, `www.aiagents-hub.vn`, and `localhost` (with port) for local dev. A 401 on `challenges.cloudflare.com/.../pat/...` almost always means hostname not allowed or site/secret key mismatch — not an app bug. Local dev test keys (always pass): site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`. Optional on web: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (same value as worker var). Turnstile is **risk-based** (not on every OTP): captcha when identifier has many verify failures, high OTP request volume, or backup-code recover; after one successful check, the same browser session skips re-challenge for 30 minutes unless verify fails twice, client IP changes, or user logs out. Backup recover always requires Turnstile when configured.

## Trusted proxy headers

Browsers must not send `X-Trusted-Proxy-Key`. Only server-side Next.js calls (e.g. `getUserFromToken`) should attach it together with real client IP/UA.
