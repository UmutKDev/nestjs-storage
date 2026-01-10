
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

COPY --from=development /usr/src/app/ ./

ENTRYPOINT ["node", "dist/main"]