#!/usr/bin/env bash
# BetterMath 部署脚本：本地构建 → rsync 镜像到 YlxcServer 的 docroot → 健康检查
#
#   bash scripts/deploy.sh
#
# 与博客（MyHomeWeb）同一套落地方式：两者都走「本地构建 + rsync」。
# 服务器上的 self-hosted runner 已于 2026-11-27 撤除（省约 100 MB 常驻内存）。
# 服务器侧只有两个静态要素，改它们不用跑本脚本：
#   /etc/caddy/sites/41-math.caddy             （Caddy 站点配置，改完要手动
#                                                caddy validate + systemctl reload caddy）
#   /etc/nginx/ssl/math.{fullchain.crt,key}    （acme.sh DNS-01 签发，路径沿用旧目录名）
#
# 环境变量可覆盖：
#   DEPLOY_HOST    默认 172.24.0.1（easytier 内网；公网 22 端口在 kex 阶段就被关）
#   DEPLOY_DOCROOT 默认 /var/www/bettermath
#   DEPLOY_ORIGIN  默认 47.106.212.155（源站 IP，用于绕过 Cloudflare 的健康检查）

set -euo pipefail

HOST="${DEPLOY_HOST:-172.24.0.1}"
DOCROOT="${DEPLOY_DOCROOT:-/var/www/bettermath}"
ORIGIN="${DEPLOY_ORIGIN:-47.106.212.155}"
DOMAIN="math.ylxc.top"
SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes)

cd "$(dirname "$0")/.."

echo "== 1/5 构建 =="
npm run build

# 产物闸门：宁可这次不部署，也不要让 rsync --delete 把线上目录清成空壳
echo "== 2/5 校验产物 =="
count=$(find dist -type f | wc -l | tr -d ' ')
echo "产物文件数：$count"
[ -f dist/index.html ] || { echo "缺少 dist/index.html，终止"; exit 1; }
[ -d dist/assets ] || { echo "缺少 dist/assets，终止"; exit 1; }
[ "$count" -ge 4 ] || { echo "产物只有 $count 个文件，明显不完整，终止"; find dist -maxdepth 2; exit 1; }

echo "== 3/5 镜像到 $HOST:$DOCROOT =="
ssh "${SSH_OPTS[@]}" "root@$HOST" "mkdir -p '$DOCROOT'"
rsync -az --delete --chmod=D755,F644 -e "ssh ${SSH_OPTS[*]}" dist/ "root@$HOST:$DOCROOT/"

echo "== 4/5 修正属主 =="
ssh "${SSH_OPTS[@]}" "root@$HOST" "chown -R root:www-data '$DOCROOT'"

echo "== 5/5 健康检查（源站，绕过 Cloudflare）=="
code=$(curl -sS --max-time 15 --resolve "$DOMAIN:443:$ORIGIN" -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || true)
echo "https://$DOMAIN/ → HTTP $code"
[ "$code" = "200" ] || { echo "源站返回 $code，部署失败"; exit 1; }

# SPA 路由自检：/chapters 是前端路由，文件系统里没有这个文件，
# 靠 Caddy 回落到 index.html 才能打开。配置一旦退回「未知路径就 404」，
# 站内导航仍然正常、只有直接访问和刷新会坏 —— 很容易漏掉，所以放进部署闸门。
for route in /chapters /chapters/mathematical-analysis /chapters/mathematical-analysis/riemann-integral; do
  code=$(curl -sS --max-time 15 --resolve "$DOMAIN:443:$ORIGIN" -o /dev/null -w '%{http_code}' "https://$DOMAIN$route" || true)
  echo "  $route → HTTP $code"
  [ "$code" = "200" ] || { echo "SPA 路由回落失效（$route 返回 $code），检查 Caddy 的 try_files/handle"; exit 1; }
done

css=$(grep -oE '/assets/[^"]+\.css' dist/index.html | head -1)
js=$(grep -oE '/assets/[^"]+\.js' dist/index.html | head -1)
for asset in "${css}" "${js}"; do
  [ -n "$asset" ] || { echo "index.html 里没找到资产引用，终止"; exit 1; }
  c=$(curl -sS --max-time 15 --resolve "$DOMAIN:443:$ORIGIN" -o /dev/null -w '%{http_code}' "https://$DOMAIN$asset" || true)
  echo "  $asset → HTTP $c"
  [ "$c" = "200" ] || { echo "静态资源缺失，部署失败"; exit 1; }
done

echo "部署完成：https://$DOMAIN/"