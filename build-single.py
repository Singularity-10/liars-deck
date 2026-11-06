#!/usr/bin/env python3
# 用法：python3 build-single.py
# 产物：dist/骗子牌酒馆.html（单文件、双击即玩、可直接发人）
# 2026-10-31 形态定版（TA 拍板）：单文件版=最小化分发物——业务 js 经 uglify 压缩
#（-m -c，顶层名不动，兼容全局符号串联架构）后内联；要看可读源码请用拆分版。
import base64 as b64
import pathlib
import re
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).parent
# vendor 显式序内联（react-dom 依赖 react，字典序会把它排前面导致空 ReactDOM）
VENDOR_ORDER = ['react.production.min.js', 'react-dom.production.min.js', 'peerjs.min.js']
html = (root / 'index.html').read_text(encoding='utf-8')

# v91 修复：业务模块序改从 index.html 的 SPLIT 段按 script 标签顺序提取——
# 此前 sorted(glob) 按文件名字典序，与标签序脱钩（40-* 拆分后已实际错序）；
# 标签序=浏览器执行序=依赖序，index.html 是唯一事实源
m = re.search(r'<!-- SPLIT:BEGIN[^>]*-->([\s\S]*?)<!-- SPLIT:END[^>]*-->', html)
assert m, 'SPLIT 标记缺失'
biz = re.findall(r'<script src="(js/[^"]+\.js)"></script>', m.group(1))
missing = [b for b in biz if not (root / b).exists()]
assert not missing, f'SPLIT 段引用了不存在的模块: {missing}'
vend_parts = [str(root / 'js' / 'vendor' / v) for v in VENDOR_ORDER]
assert all(pathlib.Path(p).exists() for p in vend_parts), 'js/vendor/ 三件套缺失'

# ── 业务模块：按标签序拼接（带模块标记，与发版.py 的 game.js 同构）→ uglify 压缩 ──
# 参数与 v59 发版链一致：-m -c 且不加 toplevel——顶层全局符号名不动，
# 各模块间全局引用（函数/常量互相调用）保持原样，只压函数体局部变量与死代码
biz_src = '\n'.join(f'// ==== {b} ====\n' + pathlib.Path(str(root / b)).read_text(encoding='utf-8')
                    for b in biz)
UGLIFY = shutil.which('uglifyjs') or '/home/z/.npm-global/lib/node_modules/uglify-js/bin/uglifyjs'
st = subprocess.run(['node', UGLIFY, '-b', 'beautify=false,comments=false', '-m', '-c'],
                    input=biz_src, capture_output=True, text=True)
if st.returncode != 0:
    sys.exit(f'[中止] 业务模块压缩失败: {st.stderr[:300]}')
biz_min = st.stdout
assert biz_min.strip(), '压缩产物为空'
# 内联安全：script 块内出现 </script 或 <!-- 会提前终止标签、破坏单文件 HTML
assert '</script' not in biz_min and '<!--' not in biz_min, '压缩产物含 </script 或 <!--'
vend_src = '\n'.join(pathlib.Path(p).read_text(encoding='utf-8') for p in vend_parts)
assert '</script' not in vend_src and '<!--' not in vend_src, 'vendor 含 </script 或 <!--'

# 两个 script 块：vendor（原样，本就是上游 min 产物）+ 业务（压缩产物）
inline = ('<script>\n' + vend_src + '\n</script>\n'
          '<script>\n' + biz_min + '\n</script>')
out, n = re.subn(
    r'(<!-- SPLIT:BEGIN[^>]*-->).*(<!-- SPLIT:END[^>]*-->)',
    lambda m: m.group(1) + '\n' + inline + '\n  ' + m.group(2),
    html,
    flags=re.S
)
assert n == 1, 'SPLIT 标记缺失或重复'

# 单文件版把标题字体回填内联（保证 dist 双击即玩不丢字体）
font = root / 'assets' / 'fonts' / 'title.woff2'
if font.exists():
    data_uri = 'data:font/woff2;base64,' + b64.b64encode(font.read_bytes()).decode()
    out, fn = re.subn(r"url\('assets/fonts/title\.woff2'\)", 'url(' + data_uri + ')', out)
    assert fn == 1, '字体引用回填失败'
    # head 里的字体 preload 外链一并移除：字体已 data-URI 内联，preload 反而指向
    # 不存在的相对文件，file:// 下报 CORS/ERR_FAILED（存量问题，随本次压缩内联根治）
    out, fn = re.subn(r'\s*<link rel="preload" href="assets/fonts/title\.woff2"[^>]*>', '', out)
    assert fn == 1, f'字体 preload 清理异常: {fn}'

# 移除 head 里 vendor 外链（已随 SPLIT 内联），否则单文件挪走后 404
out, fn = re.subn(r'\s*<script src="js/vendor/[^"]*"></script>', '', out)
assert fn == 3, f'vendor 外链清理异常: {fn}'

dist = root / 'dist' / '骗子牌酒馆.html'
dist.parent.mkdir(exist_ok=True)
dist.write_text(out, encoding='utf-8')
print(f'built: {dist} ({len(out)} bytes, {len(biz)} modules, '
      f'biz {len(biz_min)}/src {len(biz_src)} + vendor {len(vend_src)})')
