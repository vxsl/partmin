FROM node:20 AS build

WORKDIR /usr/src/app

# RUN mkdir -p packages/server

RUN apt-get update && \
    apt-get install -yq jq libgbm1 \
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


COPY package.json ./
COPY yarn.lock ./
COPY packages/server/package.json ./packages/server/
RUN yarn install 

COPY . .

# add .development.noSandbox property with value true to config.json using jq:
RUN jq '.development.noSandbox = true' ./config.json > tmp.$$.json && mv tmp.$$.json config.json

CMD ["service", "dbus", "start"]

CMD ["yarn", "server"]
