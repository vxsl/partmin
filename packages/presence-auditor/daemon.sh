#!/bin/bash

interval=30

printf partmin-presence-auditor > /proc/$$/comm

plog() {
    echo "[presence-auditor] $1"
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || (plog "Failed to change directory to $script_dir" && exit 1)

on_proc_dead() {
    plog "Detected that partmin has stopped running."
    
    config_path="$script_dir/../../config/config.json"
    plog "Reading config file at $config_path"
    if [ -e "$config_path" ]; then
        is_test=$(jq -r '.development.testing' "$config_path")
        signal_path="$script_dir/../bot/."
        if [ "$is_test" = "true" ]; then
            signal_path="${signal_path}test-"
        fi
        signal_path="${signal_path}data/discord-bot-status-for-auditor"
    else
        plog "Failed to read config file at $config_path"
        exit 1
    fi
    
    if [ -e "$signal_path" ]; then
        bot_status=$(cat "$signal_path")
        if [ "$bot_status" = "logged-out" ]; then
            plog "noop: graceful shutdown detected"
            status=0
            elif [ "$bot_status" = "logged-in" ]; then
            cd $script_dir && yarn workspace presence-auditor cleanup "$signal_path"
            status=0
        else
            plog "Unknown status: $bot_status"
            status=1
        fi
    else
        plog "noop: no bot status file found at $signal_path"
        status=0
    fi
    
    if ps -p "$poll_sleep_pid" > /dev/null; then
        plog "Killing poll_sleep_pid: $poll_sleep_pid"
        kill $poll_sleep_pid
    fi
    
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
