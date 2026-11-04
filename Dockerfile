FROM node:26-slim AS base
LABEL org.opencontainers.image.source="https://github.com/Daniel-Hale/docmost"

RUN npm install -g pnpm@11.28.2

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm*.yaml ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY packages/editor-ext/package.json ./packages/editor-ext/package.json
COPY packages/base-formula/package.json ./packages/base-formula/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN test ! -f apps/server/src/ee/ee.module.ts
# Build sequentially to bound memory on an existing shared Docker host.
RUN pnpm --filter @docmost/editor-ext build \
 && pnpm --filter @docmost/base-formula build \
 && pnpm --filter server build \
 && pnpm --filter client build
RUN test ! -d apps/server/dist/ee

FROM builder AS validation
RUN pnpm --filter server exec jest --runInBand --runTestsByPath \
    src/core/community-ai/community-ai.service.spec.ts \
    src/core/community-ai/community-ai.controller.spec.ts \
    src/core/community-ai/community-ai.retrieval.spec.ts \
    src/core/community-ai/community-embeddings.spec.ts \
    src/core/community-ai/community-ai-index.service.spec.ts \
    src/core/search/search.controller.spec.ts \
    src/integrations/encryption/encryption.service.spec.ts \
    src/integrations/encryption/a256cbc-hs512.spec.ts \
 && pnpm --filter client exec vitest run src/features/community-ai/editor-assist.test.tsx src/features/home/components/community-ai-prompt.test.tsx

FROM base AS installer
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

# drop npm and corepack
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -rf /usr/local/lib/node_modules/corepack \
  && rm -rf /usr/local/bin/npm \
  && rm -rf /usr/local/bin/npx \
  && rm -rf /usr/local/bin/corepack \
  && rm -rf /root/.npm \
  && rm -rf /root/.node-gyp

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/client/package.json /app/apps/client/package.json
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json
# Compile-only workspace metadata is needed for the frozen lockfile check.
# Its commercially licensed implementation is never copied into this stage.
COPY --from=builder /app/packages/base-formula/package.json /app/packages/base-formula/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN chown -R node:node /app

USER node

# client package.json is only copied for the lockfile check; its deps are bundled in dist
RUN pnpm install --frozen-lockfile --prod --filter '!./apps/client' --filter '!./packages/base-formula' \
 && rm -rf /app/packages/base-formula /home/node/.cache/pnpm \
 && test ! -d /app/apps/server/dist/ee

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

ENV NODE_ENV=production
WORKDIR /app/apps/server
CMD ["node", "dist/main"]
