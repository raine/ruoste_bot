FROM mhart/alpine-node:12
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY tsconfig.json ./
COPY lib ./lib
COPY types ./types
COPY index.ts ./index.ts
RUN yarn build
RUN npm prune --production

FROM mhart/alpine-node:slim-12
WORKDIR /app
ENV NODE_ENV=production
COPY --from=0 /app .
CMD ["node", "index.js"]
