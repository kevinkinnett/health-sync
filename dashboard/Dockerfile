FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Build identity, supplied by CI (see .github/workflows/docker.yml).
#
# This image contains no .git — only packages/ and the lockfiles are
# copied — so `git rev-parse` cannot work here and these args are the ONLY
# way the build can know what it is. Without them the client bundle and
# the API both report commit "unknown" in production, which makes the
# whole version stamp inert exactly where it is needed.
#
# ARGs are per-stage in a multi-stage build and have to be redeclared in
# the runtime stage below.
ARG GIT_COMMIT=""
ARG BUILD_TIME=""
ARG BUILD_NUMBER=""
ENV GIT_COMMIT=$GIT_COMMIT \
    BUILD_TIME=$BUILD_TIME \
    BUILD_NUMBER=$BUILD_NUMBER

# Install dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build everything
COPY packages/ packages/
COPY turbo.json ./
RUN pnpm turbo run build

# Production image
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Redeclared: ARGs do not cross stages. The client's identity is already
# compiled into its bundle, but the SERVER reads these at process start,
# so they have to survive into the runtime image as ENV.
ARG GIT_COMMIT=""
ARG BUILD_TIME=""
ARG BUILD_NUMBER=""
ENV GIT_COMMIT=$GIT_COMMIT \
    BUILD_TIME=$BUILD_TIME \
    BUILD_NUMBER=$BUILD_NUMBER

COPY --from=build /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/src/ packages/shared/src/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
RUN pnpm install --frozen-lockfile --prod

# Copy built client into server's public dir
COPY --from=build /app/packages/client/dist/ packages/server/dist/public/

WORKDIR /app/packages/server
EXPOSE 3001
CMD ["node", "dist/index.js"]
