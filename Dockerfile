FROM node:20 AS build

RUN corepack enable
RUN corepack prepare yarn@3.x --activate

RUN apt-get update 
RUN apt-get install -yq libgbm1 jq \
gconf-service libasound2 libatk1.0-0 libc6 libcairo2 \
libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 \
libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 \
libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
libxss1 libxtst6 ca-certificates fonts-liberation libnss3 \
lsb-release xdg-utils wget && \
apt-get clean && \
rm -rf /var/lib/apt/lists/*


WORKDIR /usr/src/app

RUN mkdir -p packages/bot 
RUN mkdir -p packages/presence-auditor 

COPY .yarn ./.yarn
COPY .yarnrc.yml package.json yarn.lock* ./
RUN yarn install

ENV NODE_ENV production

COPY packages/bot/package.json ./packages/bot/
COPY packages/presence-auditor/package.json ./packages/presence-auditor/

RUN yarn install 

COPY . .
