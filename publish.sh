#!/usr/bin/env bash
# publish.sh —— 重建单文件版与整站产物，并推送到 main / gh-pages
#
#   bash publish.sh                # 构建 + 提交推送（需要本地 git 凭据）
#   bash publish.sh --build-only   # 只构建，不碰 git
#
# 前置：
#   · 本地已 clone 本仓库，且有推送凭据
#   · 构建期依赖 uglifyjs：npm i -g uglify-js@3.19.3
#
# 为什么需要它：单文件版 game.html 有 ~690KB，超过 GitHub App 写文件接口的
# 单请求上限（~500KB），只能由本地 git push 上线；本脚本把「重建 + 双分支
# 推送」收敛成一条命令，避免手改产物导致仓库与线上不一致（CI 会校验这点）。
set -euo pipefail
cd "$(dirname "$0")"

WEB_TITLE='酒馆 {version} - 骗子牌酒馆网页版在线玩'

if ! command -v uglifyjs > /dev/null 2>&1; then
  echo '[中止] 缺少 uglifyjs（构建期依赖）：npm i -g uglify-js@3.19.3' >&2
  exit 1
fi

echo '── 重建单文件版 game.html'
python3 build-single.py --title "$WEB_TITLE" --out game.html

echo '── 生成 gh-pages 产物'
python3 build-pages.py

if [ "${1:-}" = '--build-only' ]; then
  echo '（仅构建，未推送）产物：game.html 与 dist-pages/'
  exit 0
fi

if [ ! -d .git ]; then
  echo '（当前目录不是 git 仓库，未推送）产物：game.html 与 dist-pages/'
  exit 0
fi

echo '── 提交 game.html → main'
# CI 里 actions/checkout 可能是 detached HEAD，先确保在 main 上，否则 commit 会落空
if ! git rev-parse --abbrev-ref HEAD | grep -q '^main$'; then
  git checkout main 2> /dev/null || git checkout -b main origin/main
fi
git add game.html
if git diff --cached --quiet; then
  echo '   game.html 无变化，跳过'
else
  git commit -m "build: 重建单文件版 game.html（$(python3 - <<'PY'
import re, pathlib
m = re.search(r"const GAME_VERSION\s*=\s*'([^']+)'", pathlib.Path('js/00-constants.js').read_text(encoding='utf-8'))
print(m.group(1) if m else '')
PY
)）"
  git push origin main
fi

echo '── 提交整站产物 → gh-pages'
git fetch origin gh-pages
git checkout gh-pages 2> /dev/null || git checkout -b gh-pages origin/gh-pages
cp -r dist-pages/. .
git add -A
if git diff --cached --quiet; then
  echo '   gh-pages 无变化，跳过'
else
  git commit -m 'build: 更新 gh-pages（落地页 + 单文件版 + 统计模块）'
  git push origin gh-pages
fi
git checkout main

echo '完成：main 与 gh-pages 已同步。'
