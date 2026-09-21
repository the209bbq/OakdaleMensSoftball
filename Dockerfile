# Build stage: install all deps and compile server + client.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: production deps only, plus compiled output.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
