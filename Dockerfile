# Build stage: install all deps and compile server + client.
# better-sqlite3 13 ships prebuilt binaries (linux-x64/glibc among them) inside
# the npm package, so a compiler toolchain is not required. python3/make/g++
# are installed as a fallback if a platform ever has to compile from source.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: production deps only, plus compiled output.
# `npm ci --omit=dev` must produce a usable better-sqlite3 for linux x64
# (prebuilt linux-x64.node is bundled). Build tools are present as a fallback
# and removed after install so the runtime image stays slim.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y --purge \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
