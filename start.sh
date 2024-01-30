#!/bin/bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || (echo "Failed to change directory to $script_dir" && exit 1)

print_usage() {
    echo "Usage: $0 <bot|presence-auditor|bot-dev|presence-auditor-dev> [overrides]"
    echo "  [overrides] : Config parameters to override (ex. --development.headed=true)"
}

prog="$1"
shift

case "$prog" in
    bot-dev)
        start_message="Typechecking, linting, and starting bot"
        prog_dir="packages/bot"
        cmd="yarn dev $@"
    ;;
    bot)
        start_message="Starting bot"
        prog_dir="packages/bot"
        cmd="yarn start $@"
    ;;
    presence-auditor-dev)
        start_message="Typechecking, linting, and starting presence auditor"
        prog_dir="packages/presence-auditor"
        cmd="yarn typecheck && yarn lint && yarn start"
    ;;
    presence-auditor)
        start_message="Starting presence auditor"
        prog_dir="packages/presence-auditor"
        cmd="yarn start"
    ;;
    *)
        print_usage
        exit 1
    ;;
esac

if [ ! -f "./config/config.json" ]; then
    echo "config/config.json not found, please create one from config/config.example.json and place it in the same directory"
    exit 1
fi


function cleanup {
    kill -- -$$
    exit 0
}

trap cleanup TERM INT

echo "$start_message"
cd "$prog_dir" && eval "$cmd" &
wait $!
