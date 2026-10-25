#!/usr/bin/env python3
# 用法：python3 build-single.py
# 产物：dist/骗子牌酒馆_v14.html（单文件、双击即玩、可直接发人）
import glob
import re
import pathlib

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
parts = [str(root / 'js' / 'vendor' / v) for v in VENDOR_ORDER
         if (root / 'js' / 'vendor' / v).exists()] + \
        [str(root / b) for b in biz]
assert parts, 'js/ 目录为空'
inline = '\n'.join(
    '<script>\n' + pathlib.Path(p).read_text(encoding='utf-8') + '\n</script>'
    for p in parts
)

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
    import base64 as b64
    data_uri = 'data:font/woff2;base64,' + b64.b64encode(font.read_bytes()).decode()
    out, fn = re.subn(r"url\('assets/fonts/title\.woff2'\)", 'url(' + data_uri + ')', out)
    assert fn == 1, '字体引用回填失败'

# 移除 head 里 vendor 外链（已随 SPLIT 内联），否则单文件挪走后 404
out, fn = re.subn(r'\s*<script src="js/vendor/[^"]*"></script>', '', out)
assert fn == 3, f'vendor 外链清理异常: {fn}'

dist = root / 'dist' / '骗子牌酒馆.html'
dist.parent.mkdir(exist_ok=True)
dist.write_text(out, encoding='utf-8')
print(f'built: {dist} ({len(out)} bytes, {len(parts)} modules)')
