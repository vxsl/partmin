#!/bin/bash

print_usage() {
    echo "Usage: $0 <server|server-dev> [overrides]"
    echo "  [overrides] : Config parameters to override (ex. --development.headed=true)"
}

prog="$1"
shift
if [ "$prog" != "server" ] && [ "$prog" != "server-dev"]; then
    print_usage
    exit 1
fi

if [ ! -f "config.json" ]; then
    echo "config.json not found, please create one from config.json.example and place it in the project root"
    exit 1
fi

# ====================================================================

if [ "$prog" = "server-dev" ]; then
    echo "Typechecking, linting, and starting bot"
    cd packages/server && yarn dev "$@"
    exit 0
fi
if [ "$prog" = "server" ]; then
    echo "Starting bot"
    cd packages/server && yarn start "$@"
    exit 0
fi
