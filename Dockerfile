FROM node:20 AS build

WORKDIR /usr/src/app

RUN mkdir -p app/packages/server 

RUN apt-get update && \
    apt-get install -yq libgbm1 \
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

COPY app/package.json ./app
COPY app/yarn.lock ./app
COPY app/packages/server/package.json ./app/packages/server/

WORKDIR /usr/src/app/app

RUN yarn install 

WORKDIR /usr/src/app

COPY . .

Run service dbus start
