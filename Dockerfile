FROM mhart/alpine-node:14
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn set version berry
RUN yarn install
COPY tsconfig.json tsconfig.production.json ./
COPY src ./src
RUN yarn build
RUN yarn workspaces focus --all --production

FROM mhart/alpine-node:slim-14
WORKDIR /app
ENV NODE_ENV=production
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/node_modules ./node_modules
COPY --from=0 /app/src/legit-servers.json ./dist/legit-servers.json
CMD ["node", "dist/main.js"]
