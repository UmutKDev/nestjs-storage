
FROM node:24.12-alpine AS development

WORKDIR /usr/src/app

COPY yarn.lock package*.json ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

FROM node:24.12-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY yarn.lock package*.json ./

RUN yarn install --production=false

COPY . .

RUN yarn run build && rm -rf node_modules && yarn install --production --frozen-lockfile && yarn run sentry:sourcemaps

ENTRYPOINT ["node", "dist/main"]