FROM node:22.10

ARG APP_DIST=""

ENV NODE_ENV production
ENV NODE_OPTIONS --enable-source-maps

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /home/node

RUN python3 -m venv ./python
RUN ./python/bin/pip install parlant

COPY --chown=node:node ./${APP_DIST} /home/node
RUN chmod -R u=rwx /home/node
RUN NODE_ENV=production npm -f i --ignore-scripts --no-audit --no-optional --force

CMD ["node", "main.js"]