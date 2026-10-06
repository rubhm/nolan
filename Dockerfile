FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY server.js app.js index.html styles.css ./
COPY CounterStrikeSource.webp 33l1td94wedh1.png ./
COPY data ./data

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "server.js"]
