#!/bin/sh
set -eu

cd "$(dirname "$0")"
tag=${1:-$(date +%Y%m%d)}
case "$tag" in
  ????????) case "$tag" in *[!0-9]*) echo 'tag 必须是 YYYYMMDD' >&2; exit 1;; esac ;;
  *) echo 'tag 必须是 YYYYMMDD' >&2; exit 1 ;;
esac

image="e-hentai-fetcher:$tag"
container=e-hentai-fetcher
volume=e-hentai-fetcher-data
port=${PORT:-8765}

docker build -t "$image" .
docker volume create "$volume" >/dev/null
docker rm -f "$container" >/dev/null 2>&1 || true
docker run -d --name "$container" --restart unless-stopped \
  -p "127.0.0.1:$port:8765" -v "$volume:/data" "$image"
echo "已部署 $image: http://127.0.0.1:$port/"
echo "快捷链接数据卷: $volume"
