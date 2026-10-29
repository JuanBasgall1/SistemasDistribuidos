# Imagen única para los cinco servicios NestJS; cada servicio de Compose elige su main.js.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY libs ./libs
COPY apps ./apps
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production KAFKAJS_NO_PARTITIONER_WARNING=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
CMD ["node", "dist/apps/activation-api/src/main.js"]
