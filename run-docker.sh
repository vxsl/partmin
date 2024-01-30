#!/bin/bash

docker pull vxsl/partmin:latest

docker run \
    --env-file ./.env \
    -v $(pwd)/config:/usr/src/app/config \
    -v /dev/shm:/dev/shm \
    --name partmin \
    vxsl/partmin:latest \
    bash -c "cd app && yarn server --development.noSandbox=true"
