# Build from dashboard/ root: docker build -f packages/client/Dockerfile .
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build shared + client
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
COPY turbo.json ./
RUN pnpm turbo run build --filter=@health-dashboard/client

FROM nginx:alpine
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
