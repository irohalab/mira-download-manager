FROM node:20-bullseye AS base
WORKDIR /app

FROM base AS dev
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci
COPY . /app/

FROM dev AS prod
RUN npm run build

ENV HOME=/app