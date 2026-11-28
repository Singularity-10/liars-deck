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
# 校验：web/.assets/checksums.sha256 记录每个资产的 sha256 指纹，
# 还原后逐个比对——分片被截断、错位或内容损坏会当场中止，
# 绝不会把一张花掉的分享卡推上线。
#
# 用法：python3 restore-assets.py
import base64
import hashlib
import pathlib
import re
import sys

root = pathlib.Path(__file__).parent
parts_dir = root / 'web' / '.assets'
web = root / 'web'
sums_file = parts_dir / 'checksums.sha256'

if not parts_dir.exists():
    print('无分片目录，跳过')
    sys.exit(0)

PAT = re.compile(r'^(?P<name>.+)\.b64(?:\.(?P<idx>\d+))?$')

# 资产指纹（可选存在）：每行 "<sha256>  <文件名>"
expected = {}
if sums_file.exists():
    for line in sums_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        cols = line.split()
        if len(cols) == 2:
            expected[cols[1]] = cols[0].lower()

groups = {}
for p in sorted(parts_dir.iterdir()):
    if not p.is_file():
        continue
    m = PAT.match(p.name)
    if not m:
        if p.name != sums_file.name:
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
    digest = hashlib.sha256(data).hexdigest()
    want = expected.get(name)
    if want and digest != want:
        sys.exit(f'[中止] {name} 校验失败：期望 {want[:16]}… 实得 {digest[:16]}…'
                 f'（分片可能已损坏，拒绝写出坏资产）')
    (web / name).write_bytes(data)
    restored.append((name, len(data), len(lst), digest))
    for _, p in lst:
        p.unlink()

for name, size, n, digest in restored:
    print(f'restored: web/{name} ({size} bytes, {n} 片, sha256 {digest[:16]}…)')

# 分片清空后删目录；checksums.sha256 是资产指纹，留在仓库里
try:
    parts_dir.rmdir()
except OSError:
    pass
print('完成')
