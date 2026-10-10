# DDCost PWA - Docker multi-stage, Node 22 / Debian
# Build: tutte le dipendenze, comprese vite ed esbuild.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Necessari se better-sqlite3 (devDependency) richiede compilazione nativa.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Il lockfile contiene URL npm.mirrors.msh.team; Render potrebbe non raggiungerli.
# Convertiamo soltanto gli URL dei pacchetti nel container, senza modificare Git.
RUN sed -i 's#https://npm.mirrors.msh.team/#https://registry.npmjs.org/#g' package-lock.json
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

# Impedisce a NODE_ENV/NPM_CONFIG_OMIT di eliminare gli strumenti di build.
ENV NODE_ENV=development
RUN npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=verbose \
    && test -x node_modules/.bin/vite \
    && test -x node_modules/.bin/esbuild \
    && node_modules/.bin/vite --version

COPY . .

# Solo valori pubblici destinati al browser: NON passare segreti come ARG.
# Su Render, le environment variables diventano build args omonimi.
ARG VITE_APP_ID
ARG VITE_KIMI_AUTH_URL
ENV VITE_APP_ID=${VITE_APP_ID}
ENV VITE_KIMI_AUTH_URL=${VITE_KIMI_AUTH_URL}

RUN test -n "$VITE_APP_ID" \
    && test -n "$VITE_KIMI_AUTH_URL" \
    && npm run build \
    && test -f dist/boot.js \
    && test -f dist/public/index.html

# Dopo il build si eliminano i tool di sviluppo, lasciando solo le dipendenze runtime.
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/boot.js"]
