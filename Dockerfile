FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000"]
