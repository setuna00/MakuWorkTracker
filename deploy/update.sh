#!/bin/sh
# Maku 更新脚本（NAS 用）
#
# 流程：拉取镜像 → 没有新版本就退出 → 有新版本先备份数据库 → 重建容器 → 健康检查
# 放在 docker-compose.yml 同一目录下，可以手动运行，也可以加进 crontab 定时运行。
# 第一次部署时直接运行它也行（没有旧容器时会跳过备份）。
set -eu

SERVICE=works-tracker
CONTAINER=works-tracker
REPO_URL=https://github.com/setuna00/MakuWorkTracker

cd "$(dirname "$0")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 容器内自带 python，用它请求接口：不依赖宿主机端口映射，也不需要 curl
container_http() {
    docker exec "$CONTAINER" python -c "import sys, urllib.request as u; r = u.urlopen(u.Request('http://127.0.0.1:8000' + sys.argv[1], method=sys.argv[2]), timeout=60); print(r.read().decode())" "$1" "$2"
}

# QNAP 的 cron 环境 PATH 里通常没有 Container Station 的 docker，这里补上
if ! command -v docker >/dev/null 2>&1 && [ -x /sbin/getcfg ]; then
    cs_dir=$(/sbin/getcfg container-station Install_Path -f /etc/config/qpkg.conf)
    PATH="$PATH:$cs_dir/bin:$cs_dir/usr/bin"
fi
if ! command -v docker >/dev/null 2>&1; then
    log "找不到 docker 命令"
    exit 1
fi

if docker compose version >/dev/null 2>&1; then
    compose() { docker compose "$@"; }
else
    compose() { docker-compose "$@"; }
fi

image=$(compose config --images 2>/dev/null | head -n 1)
if [ -z "$image" ]; then
    image=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' docker-compose.yml | head -n 1 | tr -d "\"' ")
fi
if [ -z "$image" ]; then
    log "没能从 docker-compose.yml 读到 image"
    exit 1
fi

current=$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null || true)

log "拉取镜像 $image"
compose pull -q "$SERVICE"
latest=$(docker image inspect -f '{{.Id}}' "$image")

if [ "$current" = "$latest" ]; then
    log "已是最新版本"
    exit 0
fi

running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)
if [ "$running" = "true" ]; then
    log "发现新版本，先备份数据库"
    if ! container_http /api/admin/backup POST; then
        log "备份失败，已取消更新"
        exit 1
    fi
else
    log "发现新版本；旧容器没有在运行，跳过备份"
fi

log "启动新版本"
compose up -d "$SERVICE"

i=0
while [ "$i" -lt 30 ]; do
    if container_http /api/health GET >/dev/null 2>&1; then
        version=$(docker exec "$CONTAINER" printenv WT_APP_VERSION 2>/dev/null || echo unknown)
        log "更新完成，当前版本 $version"
        # 只清理本项目被替换下来的旧镜像
        docker image prune -f --filter "label=org.opencontainers.image.source=$REPO_URL" >/dev/null || true
        exit 0
    fi
    i=$((i + 1))
    sleep 2
done

log "新版本启动后健康检查没通过，请查看日志：docker logs $CONTAINER"
exit 1
