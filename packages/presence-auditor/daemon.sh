#!/bin/bash

interval=30

printf partmin-presence-auditor > /proc/$$/comm

plog() {
    echo "[presence-auditor] $1"
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || (plog "Failed to change directory to $script_dir" && exit 1)

signal_path="$script_dir/packages/bot/.data/discord-bot-status-for-auditor"

on_proc_dead() {
    plog "Detected that the bot has stopped running."
    if [ -e "$signal_path" ]; then
        status=$(cat "$signal_path")
        if [ "$status" = "logged-out" ]; then
            plog "noop: graceful shutdown detected"
            exit 0
            elif [ "$status" = "logged-in" ]; then
            yarn kill "$signal_path"
        else
            plog "Unknown status: $status"
            exit 1
        fi
    else
        plog "noop: graceful shutdown detected"
        exit 0
    fi
}

trap "plog \"Received SIGINT\"; interval=0.5" SIGINT
trap "plog \"Received SIGTERM\"; interval=0.5" SIGTERM

while true; do
    sleep $interval
    if ! pgrep -x "partmin-bot" > /dev/null; then
        on_proc_dead
    fi
done
