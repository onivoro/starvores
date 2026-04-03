FROM node:22.18

ARG APP_DIST=""

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps

# Set timezone to US/Eastern for consistent cron scheduling
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && \
  apt-get install -y --no-install-recommends zip unzip && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install -y --no-install-recommends google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /home/node

COPY --chown=node:node ./${APP_DIST} /home/node
RUN chmod -R u=rwx /home/node
RUN NODE_ENV=production npm --omit=dev --force install

CMD ["node", "main.js"]