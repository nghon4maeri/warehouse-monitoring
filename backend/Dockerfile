FROM node:20-alpine

# dumb-init ensures proper PID 1 signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package*.json ./

# Install native build deps for bcrypt / pg, compile, then remove
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm install --production && \
    apk del .build-deps

COPY . .

RUN addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app

USER app

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
