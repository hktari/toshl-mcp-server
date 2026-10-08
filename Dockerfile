# Toshl MCP server over Streamable HTTP.
#
# The token is never baked in: pass TOSHL_API_TOKEN (and MCP_AUTH_TOKEN) at run time,
# e.g. `docker run --env-file`. Publish the port on loopback only and put a TLS
# reverse proxy in front; see "Remote use (Streamable HTTP)" in README.md.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json yarn.lock ./
# --ignore-scripts: no dependency lifecycle hook runs during the image build.
RUN yarn install --frozen-lockfile --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY lib ./lib
RUN yarn build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000 \
    MCP_OAUTH_STATE_DIR=/app/state

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-scripts --production && yarn cache clean

COPY --from=build /app/dist ./dist

# Refresh-token hashes when the built-in OAuth server is on. Mount a volume here so
# sign-ins survive redeploys; it must be writable by uid 1000.
RUN mkdir -p /app/state && chown node:node /app/state && chmod 700 /app/state

# The image's built-in unprivileged user.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${MCP_HTTP_PORT}/healthz" > /dev/null || exit 1

CMD ["node", "dist/src/index.js"]
