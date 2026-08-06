#!/bin/bash

ln -sf /etc/localtime-real /etc/localtime

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || (echo "Failed to change directory to $script_dir" && exit 1)

print_usage() {
    echo "Usage: $0 <bot|fb-login> [overrides]"
    echo "  [overrides] : Config parameters to override (ex. --development.headed=true)"
}

DISPLAY_NUM=99
VNC_PORT=5900
NOVNC_PORT=6080

# Serve a headed browser over noVNC so a human can complete an interactive
# login (captcha, 2FA) on a headless server.
start_novnc() {
    export DISPLAY=":$DISPLAY_NUM"
    Xvfb "$DISPLAY" -screen 0 1600x900x24 -nolisten tcp &
    for _ in $(seq 1 20); do
        xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
        sleep 0.5
    done
    if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
        echo "Failed to start Xvfb on $DISPLAY"
        exit 1
    fi

    novnc_root=""
    for d in /usr/share/novnc /usr/share/webapps/novnc /usr/local/share/novnc; do
        if [ -f "$d/vnc.html" ]; then
            novnc_root="$d"
            break
        fi
    done
    if [ -z "$novnc_root" ]; then
        echo "Couldn't find noVNC's web root (looked for vnc.html)."
        exit 1
    fi

    # -localhost keeps the raw VNC port inside the container; noVNC is the only
    # way in, and compose binds it to the host's loopback only.
    x11vnc -display "$DISPLAY" -rfbport "$VNC_PORT" -forever -shared -nopw \
        -localhost -quiet -bg
    websockify --web="$novnc_root" "$NOVNC_PORT" "localhost:$VNC_PORT" &

    echo ""
    echo "noVNC is listening on port $NOVNC_PORT."
    echo "From your own machine:"
    echo "  ssh -L $NOVNC_PORT:localhost:$NOVNC_PORT <this-server>"
    echo "  open http://localhost:$NOVNC_PORT/vnc.html?autoconnect=1&resize=scale"
    echo ""
}

prog="$1"
shift

case "$prog" in
    bot)
        msg="Starting bot"
        cmd="yarn bot $@"
    ;;
    fb-login)
        start_novnc
        echo "Starting Facebook login helper"
        yarn fb-login "$@"
        exit $?
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
