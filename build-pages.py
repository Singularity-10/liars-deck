#!/usr/bin/env python3
# 生成 gh-pages 分支内容（可直接推送部署）
#
#   dist-pages/index.html          落地页（营销页 + 统计埋点）
#   dist-pages/game.html           单文件版游戏（自包含，无外链）
#   dist-pages/js/01-analytics.js  统计模块（与游戏共用同一份配置）
#
# 用法：
#   python3 build-pages.py
#
# 为什么需要它：落地页源码此前只存在于 gh-pages 分支上，仓库里没有，
# 改了就没法追溯、也没法在本地预览。把它收回 web/ 后，这里负责把
# 仓库布局（web/index.html + js/）翻译成 gh-pages 布局（站点根），
# 唯一的差异是统计模块的相对路径深浅，脚本里改这一处即可。
import pathlib
import re
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).parent
out_dir = root / 'dist-pages'

# ── 1. 单文件版游戏 ──────────────────────────────────────────────────
# 网页版标题与开发版不同（SEO 落地页用），{version} 会替换成 GAME_VERSION
title = '酒馆 {version} - 骗子牌酒馆网页版在线玩'
game_out = out_dir / 'game.html'
st = subprocess.run(
    [sys.executable, str(root / 'build-single.py'), '--title', title, '--out', str(game_out)],
    capture_output=True, text=True)
if st.returncode != 0:
    sys.exit(f'[中止] 单文件构建失败: {st.stderr[:400]}')
print(st.stdout.strip())

# ── 2. 落地页 ────────────────────────────────────────────────────────
landing = (root / 'web' / 'index.html').read_text(encoding='utf-8')
# 仓库里落地页在 web/ 下，模块在上一层的 js/；部署到站点根后变成同层 js/
landing, n = re.subn(r'src="\.\./js/01-analytics\.js"', 'src="./js/01-analytics.js"', landing)
assert n == 1, f'落地页统计模块引用改写异常: {n}'
(out_dir / 'index.html').write_text(landing, encoding='utf-8')

# ── 3. 统计模块 ──────────────────────────────────────────────────────
(out_dir / 'js').mkdir(parents=True, exist_ok=True)
shutil.copyfile(root / 'js' / '01-analytics.js', out_dir / 'js' / '01-analytics.js')

print(f'built: {out_dir}/')
for f in ['index.html', 'game.html', 'js/01-analytics.js']:
    p = out_dir / f
    print(f'  {f:22} {p.stat().st_size:>8} bytes')
print('提示：把 dist-pages/ 下的内容推到 gh-pages 分支根目录即可生效。')
