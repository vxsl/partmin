#!/bin/bash

print_usage() {
    echo "Usage: $0 [--local]"
}

if [ "$1" = "--local" ]; then
    img="partmin:latest"
    docker build -t partmin .
else
    img="vxsl/partmin:latest"
    docker pull vxsl/partmin:latest
fi

docker run \
    --env-file ./.env \
    -v $(pwd)/config:/usr/src/app/config \
    -v /dev/shm:/dev/shm \
    --name partmin \
    $img \
    bash -c "cd app && yarn bot --development.noSandbox=true"
