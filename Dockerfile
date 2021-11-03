FROM node:17 AS base
WORKDIR /app

FROM base AS dev
RUN chown -R mira:mira /app
USER mira
COPY package.json /app/package.json
COPY yarn.lock /app/yarn.lock
RUN yarn
ADD . /app

FROM dev AS prod
RUN npm run build