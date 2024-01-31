#!/bin/bash

exec -a "partmin-presence-auditor" bash -c '
sleep 1
while true; do
    processes=$(ps -A -o pid,comm)
    proc=$(echo "$processes" | grep "partmin-bot")
    if [ -z "$proc" ]; then
        yarn kill
        exit
    fi
    sleep 10
done
'
