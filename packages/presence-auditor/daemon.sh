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
    plog "Detected that partmin has stopped running."
    if [ -e "$signal_path" ]; then
        status=$(cat "$signal_path")
        if [ "$status" = "logged-out" ]; then
            plog "noop: graceful shutdown detected"
            status=0
            elif [ "$status" = "logged-in" ]; then
            yarn kill "$signal_path"
        else
            plog "Unknown status: $status"
            status=1
        fi
    else
        plog "noop: graceful shutdown detected"
        status=0
    fi
    kill $poll_sleep_pid
    plog "Killing process group..."
    pkill -P $$
    plog "Exiting"
    exit $status
}

trap "plog \"Received SIGINT\"; interval=0.5" SIGINT
trap "plog \"Received SIGTERM\"; interval=0.5" SIGTERM

while true; do
    sleep $interval &
    poll_sleep_pid=$!
    wait $!
    if ! pgrep -x "partmin-bot" > /dev/null; then
        on_proc_dead
    fi
done
