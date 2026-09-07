#!/bin/sh
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$root/scripts/macos.sh" install
status=$?
if [ "$status" -ne 0 ]; then printf '\n按回车关闭窗口。'; read answer; fi
exit "$status"

