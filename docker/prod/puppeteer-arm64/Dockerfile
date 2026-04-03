FROM --platform=linux/arm64 node:22.18

ARG APP_DIST=""

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps

# Set timezone to US/Eastern for consistent cron scheduling
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && \
  apt-get install -y --no-install-recommends zip unzip chromium && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

USER node
WORKDIR /home/node

COPY --chown=node:node ./${APP_DIST} /home/node
RUN chmod -R u=rwx /home/node
RUN NODE_ENV=production npm --omit=dev --force install

CMD ["node", "main.js"]
