FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server.mjs ./

ENV NODE_ENV=production
EXPOSE 8080

USER node

CMD ["node", "server.mjs"]
