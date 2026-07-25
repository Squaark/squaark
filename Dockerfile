# ── Build stage: full deps (needs tsc + node-gyp toolchain) ─────────────────
FROM node:22-alpine AS build

# better-sqlite3/argon2/sharp ship N-API prebuilt binaries for musl (Alpine) now,
# but keep the toolchain as a fallback in case a future dep version doesn't.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Fail the image build if tests or types don't pass — nothing broken ships.
RUN npm run typecheck && npm test
RUN npm run build

# Drop devDependencies now that dist/ exists and better-sqlite3 is already
# compiled — avoids a second native build in the runtime stage.
RUN npm prune --omit=dev

# ── Runtime stage: no compiler toolchain, just the app ───────────────────────
FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY admin ./admin
COPY themes ./themes

EXPOSE 3000
CMD ["node", "dist/server.js"]
