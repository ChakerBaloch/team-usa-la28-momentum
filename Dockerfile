FROM node:20-slim AS client-build
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:20-slim AS server-runtime
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
