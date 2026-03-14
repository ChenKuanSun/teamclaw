FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 sidecar && adduser -u 1001 -G sidecar -s /bin/sh -D sidecar
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER sidecar
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
