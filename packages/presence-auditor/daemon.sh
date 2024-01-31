#!/bin/bash

exec -a "partmin-presence-auditor" bash -c '
while true; do
    sleep 10
    processes=$(ps -A -o pid,comm)
    proc=$(echo "$processes" | grep "partmin-bot")
    if [ -z "$proc" ]; then
        echo "[presence-auditor] Process named \"partmin-bot\" is no longer running. Setting discord bot presence to \"invisible\""
        yarn kill
        exit
    fi
done
'
