FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY server.js app.js index.html styles.css ./
COPY CounterStrikeSource.webp 33l1td94wedh1.png ./
COPY data ./data
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN apk add --no-cache su-exec \
  && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
