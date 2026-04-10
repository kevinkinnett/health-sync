# Build from dashboard/ root: docker build -f packages/server/Dockerfile .
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile

# Build shared + server
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY turbo.json ./
RUN pnpm turbo run build --filter=@health-dashboard/server

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY --from=build /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/src/ packages/shared/src/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/packages/server
EXPOSE 3001
CMD ["node", "dist/index.js"]
