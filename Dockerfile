# BIZTRACK BURUNDI — image Docker (build + runtime Bun)
FROM oven/bun:1 AS build
WORKDIR /app

# Dépendances d'abord (cache Docker)
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Build client (React → client/dist) + bundle serveur (server/dist)
COPY . .
RUN bun run build

# ---- Runtime ----
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/drizzle ./drizzle

# Render injecte PORT (10000). DB_PATH pointe vers le disque persistant
# si configuré (voir render.yaml), sinon ./app.db (éphémère).
ENV PORT=10000
EXPOSE 10000

CMD ["bun", "server/src/server.ts"]
