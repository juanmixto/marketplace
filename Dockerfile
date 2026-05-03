FROM node:20-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

# Prisma and Next need a few native build tools during install/build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

# Build-time identity for BuildBadge + /api/version. Defaults keep local
# `docker build` working without args; CI/deploy passes real values.
ARG NEXT_PUBLIC_COMMIT_SHA=unknown
ARG NEXT_PUBLIC_GIT_BRANCH=unknown
ARG NEXT_PUBLIC_BUILD_TIME
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_GIT_BRANCH=$NEXT_PUBLIC_GIT_BRANCH
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME

COPY . .
RUN npm run build

FROM base AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 10001 --create-home appuser
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/proxy.ts ./proxy.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER appuser

CMD ["npm", "start"]
