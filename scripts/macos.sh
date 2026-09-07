#!/bin/sh
set -eu

action="${1:-start}"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
runtime_dir="$project_dir/.runtime"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "未完成：这个入口只用于macOS。" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64|aarch64)
    node_name="node-v24.13.0-darwin-arm64"
    node_sha="d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8"
    ;;
  x86_64|amd64)
    node_name="node-v24.13.0-darwin-x64"
    node_sha="6f03c1b48ddbe1b129a6f8038be08e0899f05f17185b4d3e4350180ab669a7f3"
    ;;
  *)
    echo "未完成：当前macOS安装入口不支持这个CPU架构：$(uname -m)。" >&2
    exit 1
    ;;
esac

mkdir -p "$runtime_dir"
node_bin="$runtime_dir/$node_name/bin/node"
if [ "$action" = "install" ] && [ ! -x "$node_bin" ]; then
  command -v curl >/dev/null 2>&1 || { echo "未完成：系统缺少curl。" >&2; exit 1; }
  command -v shasum >/dev/null 2>&1 || { echo "未完成：系统缺少shasum。" >&2; exit 1; }
  archive="$runtime_dir/$node_name.tar.gz"
  echo "正在下载Node.js 24.13.0（只安装在项目内）..."
  curl --proto '=https' --tlsv1.2 -fL "https://nodejs.org/dist/v24.13.0/$node_name.tar.gz" -o "$archive"
  actual_sha=$(shasum -a 256 "$archive" | awk '{print $1}')
  if [ "$actual_sha" != "$node_sha" ]; then
    echo "未完成：Node下载校验失败，请重试。" >&2
    exit 1
  fi
  tar -xzf "$archive" -C "$runtime_dir"
fi

if [ ! -x "$node_bin" ]; then
  echo "未完成：尚未安装运行环境，请先打开「首次安装.command」。" >&2
  exit 1
fi

cd "$project_dir"
exec "$node_bin" scripts/runtime.mjs "$action"

