FROM --platform=linux/arm64 node:22.18

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV NODE_OPTIONS=--enable-source-maps
ENV TZ=America/New_York
ENV AWS_PAGER=""

# CI-only image for @onivoro/onix executors:
# - nx/npm/node execution
# - docker build/push (Docker CLI)
# - aws ecr login + ecs update-service (AWS CLI v2)
RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  curl \
  git \
  jq \
  unzip \
  docker.io \
  && rm -rf /var/lib/apt/lists/*

# Some base/package variants may not place the docker client on PATH.
# Ensure a docker CLI binary is present for CodeBuild runtime.
RUN if ! command -v docker >/dev/null 2>&1; then \
    curl -fsSL "https://download.docker.com/linux/static/stable/aarch64/docker-27.5.1.tgz" -o "/tmp/docker.tgz" && \
    tar -xzf /tmp/docker.tgz -C /tmp && \
    mv /tmp/docker/docker /usr/local/bin/docker && \
    chmod +x /usr/local/bin/docker && \
    rm -rf /tmp/docker /tmp/docker.tgz; \
  fi

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "/tmp/awscliv2.zip" \
  && unzip -q /tmp/awscliv2.zip -d /tmp \
  && /tmp/aws/install \
  && rm -rf /tmp/aws /tmp/awscliv2.zip

WORKDIR /workspace

CMD ["bash"]
