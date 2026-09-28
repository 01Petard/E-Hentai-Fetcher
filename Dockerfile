FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html development-log.html debug.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
ENV VITE_SERVER_QUICK_LINKS=1
RUN pnpm build

FROM node:22-alpine AS runtime-deps
WORKDIR /app
RUN npm install --no-save --omit=dev --ignore-scripts https-proxy-agent@9.1.0

FROM node:22-alpine
ENV NODE_ENV=production QUICK_LINKS_FILE=/data/quick-links.json
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
COPY --from=runtime-deps /app/node_modules ./node_modules
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8765
CMD ["node", "server/docker.js"]
