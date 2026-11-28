#!/usr/bin/env bash
# ci.sh —— 本地 / CI 通用的三合一检查
#
#   1) 白盒测试：逐个跑 tests/test-*.js（零依赖，不需要 npm install）
#   2) 蒙特卡洛：sim-roles（严格模式）/ sim-persona / sim-discard
#   3) 单文件构建：构建 + 校验产物自包含 + 校验 game.html 与源码同步
#
# 用法：
#   ./ci.sh              # 全跑
#   ./ci.sh unit         # 只跑白盒测试
#   ./ci.sh sim          # 只跑蒙特卡洛
#   ./ci.sh build        # 只跑构建检查
#
# 依赖：node（测试与构建）、python3（构建脚本）、uglifyjs（仅构建期，见 ci-build 段）
set -uo pipefail

cd "$(dirname "$0")"
ROOT=$(pwd)
MODE=${1:-all}
FAILED=0

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '   \033[31m✗\033[0m %s\n' "$*"; FAILED=1; }
warn() { printf '   \033[33m!\033[0m %s\n' "$*"; }
# 提取 GAME_VERSION：源码是 'v145'，minify 后的产物是 "v145"（双引号、无空格），两种都要认
extract_ver() { grep -oE "GAME_VERSION *= *[\"'][A-Za-z0-9._-]+[\"']" "$1" | head -1 | awk -F"[\"']" '{print $2}'; }

# ── 1) 白盒测试 ─────────────────────────────────────────────────────
run_unit() {
  step '白盒测试（tests/test-*.js）'
  local total=0 pass=0
  for f in tests/test-*.js; do
    total=$((total + 1))
    if node "$f" > /tmp/ci-test.log 2>&1; then
      pass=$((pass + 1))
      printf '   \033[32m✓\033[0m %s\n' "$f"
    else
      bad "$f"
      tail -n 15 /tmp/ci-test.log | sed 's/^/       /'
    fi
  done
  echo "   共 $total 件套，通过 $pass"
  # 件数下限：防止有人误删测试文件
  if [ "$total" -lt 22 ]; then
    bad "测试件数异常（$total < 22），可能有测试文件被误删"
  fi
}

# ── 2) 蒙特卡洛 ─────────────────────────────────────────────────────
run_sim() {
  step '蒙特卡洛平衡性'
  if SIM_STRICT=1 node sim-roles.js 2000 > /tmp/ci-sim.log 2>&1; then
    ok "sim-roles（SIM_STRICT，2000 局）"
  else
    bad "sim-roles"; tail -n 15 /tmp/ci-sim.log | sed 's/^/       /'
  fi
  for s in sim-persona.js sim-discard.js; do
    if node "$s" > /tmp/ci-sim.log 2>&1; then ok "$s"; else bad "$s"; tail -n 10 /tmp/ci-sim.log | sed 's/^/       /'; fi
  done
}

# ── 3) 单文件构建 ───────────────────────────────────────────────────
run_build() {
  step '单文件构建冒烟'
  if ! command -v uglifyjs > /dev/null 2>&1; then
    bad '缺少 uglifyjs（构建期依赖）：npm i -g uglify-js@3.19.3'
    return
  fi
  python3 build-single.py > /tmp/ci-build.log 2>&1 || { bad '构建失败'; tail -n 10 /tmp/ci-build.log | sed 's/^/       /'; return; }
  ok "构建成功"

  local out="dist/骗子牌酒馆.html"
  # 单文件挪走/双击打开时不能有外链（script 与字体都必须内联）
  if grep -qE '<script src="js/|assets/fonts/[a-z-]*\.woff2' "$out"; then
    bad '单文件产物仍有外链（script/字体未内联）'
    grep -oE '<script src="js/[^"]*"|assets/fonts/[a-z-]*\.woff2' "$out" | sort -u | sed 's/^/       /'
  else
    ok "产物自包含（$(wc -c < "$out") bytes）"
  fi

  # 仓库里的 game.html 必须与源码一致（网页版标题）
  python3 build-single.py --title "酒馆 {version} - 骗子牌酒馆网页版在线玩" --out /tmp/ci-game.check.html > /dev/null 2>&1
  if cmp -s /tmp/ci-game.check.html game.html; then
    ok 'game.html 与源码一致'
  else
    # v145：单文件产物约 700KB，超过 GitHub 连接器写文件接口的单请求上限（约 480KB），
    # 推不动，只能由本地 publish.sh 或 Actions 的 publish job 上线。
    # 因此「产物版本落后于源码版本」是发布前的正常中间态——只警告不阻断；
    # 但「同版本内容却不一致」说明产物被改坏了，仍然判失败。
    src_ver=$(extract_ver js/00-constants.js)
    art_ver=$(extract_ver game.html)
    if [ -n "$art_ver" ] && [ "$art_ver" != "$src_ver" ]; then
      warn "game.html 产物版本 $art_ver 落后于源码 $src_ver —— 待发布状态，跑 bash publish.sh 重建并推送即可"
    else
      bad 'game.html 与源码不一致——请执行：'
      echo '       python3 build-single.py --title "酒馆 {version} - 骗子牌酒馆网页版在线玩" --out game.html'
    fi
  fi
}

case "$MODE" in
  unit)  run_unit ;;
  sim)   run_sim ;;
  build) run_build ;;
  all)   run_unit; run_sim; run_build ;;
  *) echo "用法: ./ci.sh [unit|sim|build|all]"; exit 2 ;;
esac

printf '\n'
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32m全部检查通过\033[0m\n'
else
  printf '\033[31m存在失败项\033[0m\n'
fi
exit $FAILED
