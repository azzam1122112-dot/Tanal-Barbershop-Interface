# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Next.js needs the production configuration while compiling. BuildKit mounts
# it for this command only, so no credential is copied into an image layer.
RUN --mount=type=secret,id=tanal_env_build \
    sh -ceu 'set -a; . /run/secrets/tanal_env_build; set +a; npm run prisma:generate; npm run build'

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000"]
