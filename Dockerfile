FROM node:12-alpine

WORKDIR /usr/src/app

COPY package.json yarn.lock tsconfig.json ./
RUN yarn install
COPY lib ./lib
COPY types ./types
COPY index.ts ./index.ts
RUN yarn build
RUN rm -rf node_modules
ENV NODE_ENV=production
RUN yarn install --production

CMD ["npm", "start"]
