# Oracle proxy

Runs `oracledb` thin mode on Node.js (same as local OCI sample). Point the auth-worker at this service from Cloudflare Workers.

```bash
export ORACLE_PROXY_SECRET=your-secret
npm run start --workspace=@aiagents-hub/oracle-proxy
```

Set on auth-worker:

- `ORACLE_PROXY_URL` — hostname on port 80/443 (Workers cannot `fetch` a raw IP or custom ports). Map public :80 → proxy :8788, e.g. `http://proxy.example.com` or `http://<ip>.nip.io`
- `ORACLE_PROXY_SECRET` — same bearer secret (use `wrangler secret put ORACLE_PROXY_SECRET`)

Allowlist the proxy egress IP in ADB ACL (static VM IP on OCI).
