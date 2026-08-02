# Fuer Railway, Fly.io, Render und aehnliche Anbieter.
# Sie erkennen diese Datei automatisch, ohne weitere Einstellungen.

FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY game ./game
COPY public ./public

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
