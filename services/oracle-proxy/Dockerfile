FROM node:22-bookworm-slim

WORKDIR /app

# Copy monorepo packages needed for oracle-proxy
COPY package.json package-lock.json ./
COPY packages/oracle-db/package.json ./packages/oracle-db/
COPY services/oracle-proxy/package.json ./services/oracle-proxy/

RUN npm ci --workspace=@aiagents-hub/oracle-proxy --include-workspace-root --legacy-peer-deps 2>/dev/null \
  || npm install --workspace=@aiagents-hub/oracle-proxy --include-workspace-root --legacy-peer-deps

COPY packages/oracle-db ./packages/oracle-db
COPY services/oracle-proxy ./services/oracle-proxy

WORKDIR /app/services/oracle-proxy
ENV PORT=8788
EXPOSE 8788

CMD ["npx", "tsx", "src/index.ts"]
