#!/bin/bash

exec -a "partmin-presence-auditor" bash -c '
while true; do
    sleep 10
    processes=$(ps -A -o pid,comm)
    proc=$(echo "$processes" | grep "partmin-bot")
    if [ -z "$proc" ]; then
        echo "Process named \"partmin-bot\" is no longer running. Setting presence to \"offline\""
        yarn kill
        exit
    fi
done
'
