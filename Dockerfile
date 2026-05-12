# ─── Stage 1: Build Frontend ───
FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --silent 2>/dev/null || npm install --silent
COPY frontend/ .
RUN npm run build

# ─── Stage 2: Production Runtime ───
FROM alpine:3.21 AS runtime

ARG POCKETBASE_VERSION=0.36.9
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates wget unzip \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_${TARGETARCH}.zip" \
       -O /tmp/pocketbase.zip \
    && unzip -q /tmp/pocketbase.zip -d /usr/local/bin/ \
    && rm /tmp/pocketbase.zip \
    && chmod +x /usr/local/bin/pocketbase \
    && apk del wget unzip

WORKDIR /app

# Copy migrations and hooks
COPY backend/pb_migrations/ ./pb_migrations/
COPY backend/pb_hooks/ ./pb_hooks/

# Copy built frontend assets
COPY --from=frontend-build /app/backend/pb_public/ ./pb_public/

# PocketBase data volume
VOLUME /app/pb_data

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8090/api/health || exit 1

ENTRYPOINT ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/app/pb_data", "--migrationsDir=/app/pb_migrations", "--hooksDir=/app/pb_hooks", "--publicDir=/app/pb_public"]
