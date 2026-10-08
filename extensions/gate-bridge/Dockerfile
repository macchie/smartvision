# SmartVision gate bridge — real-time folder/TCP watcher that forwards plate
# detections to PocketBase /api/gate-event.
FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching. Prefer the lockfile (npm ci),
# falling back to npm install if it is absent.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --silent 2>/dev/null || npm install --omit=dev --silent

COPY index.js ./

# Run as the built-in unprivileged user.
USER node

# Config is provided via environment variables (see .env.example / compose).
CMD ["node", "index.js"]
