
FROM node:22.11-alpine AS development

WORKDIR /usr/src/app

COPY yarn.lock package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

FROM node:22.11-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY yarn.lock package*.json ./

COPY --from=development /usr/src/app/ ./

ENTRYPOINT ["node", "dist/main"]