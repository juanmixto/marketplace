FROM node:20-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

# Prisma and Next need a few native build tools during install/build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build

# Build-time NEXT_PUBLIC_* vars. Next.js inlines these at `npm run build`,
# so any client component that branches on them needs them set HERE, not
# at runtime via .env.production (which only the Node server reads).
#
# Defaults keep local `docker build` working without args; the deploy
# script (scripts/deploy-local-env.sh) passes real values from the env
# file via docker-compose build.args.
ARG NEXT_PUBLIC_COMMIT_SHA=unknown
ARG NEXT_PUBLIC_GIT_BRANCH=unknown
ARG NEXT_PUBLIC_BUILD_TIME
ARG NEXT_PUBLIC_APP_ENV=development
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_GIT_BRANCH=$NEXT_PUBLIC_GIT_BRANCH
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY . .
RUN npm run build

FROM base AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 10001 --create-home appuser
WORKDIR /app

COPY --chown=appuser:appuser --from=build /app/package.json ./package.json
COPY --chown=appuser:appuser --from=build /app/package-lock.json ./package-lock.json
COPY --chown=appuser:appuser --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser --from=build /app/.next ./.next
COPY --chown=appuser:appuser --from=build /app/public ./public
COPY --chown=appuser:appuser --from=build /app/prisma ./prisma
COPY --chown=appuser:appuser --from=build /app/src/generated ./src/generated
COPY --chown=appuser:appuser --from=build /app/src/lib/security-headers.ts ./src/lib/security-headers.ts
COPY --chown=appuser:appuser --from=build /app/tsconfig.json ./tsconfig.json
COPY --chown=appuser:appuser --from=build /app/next.config.ts ./next.config.ts
COPY --chown=appuser:appuser --from=build /app/proxy.ts ./proxy.ts
COPY --chown=appuser:appuser --from=build /app/scripts ./scripts
COPY --chown=appuser:appuser --from=build /app/package.json ./package.json

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER appuser

CMD ["npm", "start"]
