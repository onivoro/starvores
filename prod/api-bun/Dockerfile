FROM --platform=linux/amd64 oven/bun:1.2.2

ARG APP_DIST=""

ENV NODE_ENV production
ENV BUN_ENV production

WORKDIR /home/bun

COPY ./${APP_DIST} /home/bun
RUN chmod -R u=rwx /home/bun && \
    chown -R bun:bun /home/bun

USER bun

RUN bun install

CMD bun run main.js