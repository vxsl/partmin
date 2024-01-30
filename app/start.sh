#!/bin/bash

print_usage() {
    echo "Usage: $0 <bot|bot-dev> [overrides]"
    echo "  [overrides] : Config parameters to override (ex. --development.headed=true)"
}

prog="$1"
shift
if [ "$prog" != "bot" ] && [ "$prog" != "bot-dev"]; then
    print_usage
    exit 1
fi

if [ ! -f "../config/config.json" ]; then
    echo "config/config.json not found, please create one from config/config.example.json and place it in the same directory"
    exit 1
fi

# ====================================================================

if [ "$prog" = "bot-dev" ]; then
    echo "Typechecking, linting, and starting bot"
    cd packages/bot && yarn dev "$@"
    exit 0
fi
if [ "$prog" = "bot" ]; then
    echo "Starting bot"
    cd packages/bot && yarn start "$@"
    exit 0
fi
