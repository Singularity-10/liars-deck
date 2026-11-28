#!/usr/bin/env python3
# restore-assets.py —— 从 base64 分片还原站点二进制资产
#
# 为什么需要它：站点分享卡与 PWA 图标是二进制 PNG，
# 而 GitHub 连接器的写文件接口只接受文本、单请求上限约 480KB，
# 因此 PNG 以 base64 分片落到 web/.assets/，由本脚本还原成真正的 PNG。
#
# 分片命名：<资产名>.b64        第 0 片
#           <资产名>.b64.1      第 1 片
#           <资产名>.b64.2      第 2 片 ……
# 还原后分片会被删除，仓库里只留 PNG。
#
# 用法：python3 restore-assets.py
import base64
import pathlib
import re
import sys

root = pathlib.Path(__file__).parent
parts_dir = root / 'web' / '.assets'
web = root / 'web'

if not parts_dir.exists():
    print('无分片目录，跳过')
    sys.exit(0)

PAT = re.compile(r'^(?P<name>.+)\.b64(?:\.(?P<idx>\d+))?$')

groups = {}
for p in sorted(parts_dir.iterdir()):
    m = PAT.match(p.name)
    if not m:
        print(f'[跳过] 无法识别的分片: {p.name}')
        continue
    name = m.group('name')
    idx = int(m.group('idx') or 0)
    groups.setdefault(name, []).append((idx, p))

if not groups:
    print('无有效分片，跳过')
    sys.exit(0)

restored = []
for name, lst in groups.items():
    lst.sort()
    idxs = [i for i, _ in lst]
    if idxs != list(range(len(lst))):
        sys.exit(f'[中止] {name} 分片不连续: {idxs}')
    blob = ''.join(p.read_text(encoding='utf-8').strip() for _, p in lst)
    try:
        data = base64.b64decode(blob)
    except Exception as e:
        sys.exit(f'[中止] 解码失败 {name}: {e}')
    (web / name).write_bytes(data)
    restored.append((name, len(data), len(lst)))
    for _, p in lst:
        p.unlink()

for name, size, n in restored:
    print(f'restored: web/{name} ({size} bytes, {n} 片)')

try:
    parts_dir.rmdir()
except OSError:
    pass
print('完成')
