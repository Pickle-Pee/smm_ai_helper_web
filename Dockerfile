# syntax=docker/dockerfile:1.7
# Brenvio web — production image (Next.js standalone output).
# Build:  docker build --build-arg SITE_URL=https://app.example.com --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t brenvio-web:local .

ARG NODE_IMAGE=node:22-alpine

# ---------- 1. Dependencies (reproducible: package-lock.json + npm ci) ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2. Build ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time only. Not secrets; never use NEXT_PUBLIC_* for anything sensitive.
ARG SITE_URL=http://localhost:3000
ARG APP_VERSION=dev
ARG ALLOW_INDEXING=false
ENV SITE_URL=${SITE_URL} APP_VERSION=${APP_VERSION} ALLOW_INDEXING=${ALLOW_INDEXING}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. Runtime ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}

RUN addgroup -S -g 1001 brenvio && adduser -S -u 1001 -G brenvio -H brenvio

COPY --from=build --chown=brenvio:brenvio /app/.next/standalone ./
COPY --from=build --chown=brenvio:brenvio /app/.next/static ./.next/static

LABEL org.opencontainers.image.title="brenvio-web" \
      org.opencontainers.image.source="https://github.com/Pickle-Pee/smm_ai_helper_web" \
      org.opencontainers.image.version="${APP_VERSION}"

USER brenvio
EXPOSE 3000
STOPSIGNAL SIGTERM

# No curl/wget needed: Node's fetch hits the liveness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
