#!/bin/bash

ln -sf /etc/localtime-real /etc/localtime

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || (echo "Failed to change directory to $script_dir" && exit 1)

print_usage() {
    echo "Usage: $0 <bot> [overrides]"
    echo "  [overrides] : Config parameters to override (ex. --development.headed=true)"
}

prog="$1"
shift

case "$prog" in
    bot)
        msg="Starting bot"
        cmd="yarn bot $@"
    ;;
    *)
        print_usage
        exit 1
    ;;
esac

function cleanup {
    echo "Sending SIGINT to child process: $child_pid"
    kill -s INT -$$
    echo "Waiting for child process to exit: $child_pid"
    wait $child_pid
    echo "Child process exited: $child_pid"
    exit 0
}

trap cleanup TERM INT
echo "$msg"
eval $cmd &
child_pid=$!

sleep infinity &
wait $!
