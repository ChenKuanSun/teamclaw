FROM node:20-slim AS base

# Install OpenClaw (pinned version)
ARG OPENCLAW_VERSION=1.2.3
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Remove dangerous binaries
RUN apt-get update && \
    apt-get remove -y curl wget netcat-openbsd && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy entrypoint and config scripts
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/
RUN chmod +x /entrypoint.sh

# Create directories
RUN mkdir -p /workspace /efs

# Non-root user
USER node
WORKDIR /workspace

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
