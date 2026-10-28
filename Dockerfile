# Build the frontend, then run the dependency-free server.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
RUN npx vite build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    CLAUDE_CONFIG_DIR=/claude \
    DATA_DIR=/app/data
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
EXPOSE 4317
CMD ["node", "server/index.js"]
