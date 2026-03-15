FROM node:22-bookworm AS build

# Install upstream OpenClaw (pinned version) — NOT our TeamClaw wrapper
ARG OPENCLAW_VERSION=2026.3.13
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Runtime stage
FROM node:22-bookworm-slim AS runtime

# Copy globally installed openclaw from build stage (preserving package structure)
COPY --from=build /usr/local/lib/node_modules /usr/local/lib/node_modules
# Recreate the symlink (npm install -g links bin to the package entry point)
RUN ln -sf /usr/local/lib/node_modules/openclaw/openclaw.mjs /usr/local/bin/openclaw

# Copy entrypoint and config scripts
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/
RUN chmod +x /entrypoint.sh

# Create directories owned by node user
RUN mkdir -p /workspace /efs && chown -R node:node /workspace /efs

# Non-root user
USER node
WORKDIR /workspace

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
