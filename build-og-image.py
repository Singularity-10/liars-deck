#!/usr/bin/env python3
# 生成站点图像资产：
#   web/og-image.png          社交分享卡片（1200×630）
#   web/apple-touch-icon.png  iOS 添加到主屏幕图标（180×180）
#   web/icon-192.png          PWA 图标（192×192）
#   web/icon-512.png          PWA 图标（512×512）
#
#   python3 build-og-image.py
#
# 做法：用 Playwright + Chromium 渲染 HTML 后截图。
# 为什么不用 PIL 直接画：分享卡要跟游戏标题字体（霞鹜文楷子集）一致，
# 而 woff2 只有浏览器能可靠加载；直接用系统字体则会与站内观感脱节。
#
# 依赖：playwright + chromium（pip install playwright && playwright install chromium）
# 产物是二进制 PNG，需随 web/ 一起提交（build-pages.py 会自动带上）。
import base64 as b64
import datetime
import pathlib
import sys

root = pathlib.Path(__file__).parent
web = root / 'web'
tpl_path = web / 'og-image.html'
out_path = web / 'og-image.png'
favicon_svg = web / 'favicon.svg'

if not tpl_path.exists():
    sys.exit(f'[中止] 找不到模板: {tpl_path}')


def font_face(name: str, filename: str, unicode_range: str = '') -> str:
    """把 woff2 内联成 data URI 的 @font-face（file:// 下相对路径会被同源策略挡掉）"""
    f = root / 'assets' / 'fonts' / filename
    if not f.exists():
        print(f'[警告] 缺少字体 {f}，该字族将回退到系统字体')
        return ''
    uri = 'data:font/woff2;base64,' + b64.b64encode(f.read_bytes()).decode()
    ur = f'\n      unicode-range: {unicode_range};' if unicode_range else ''
    return (
        f"    @font-face {{\n"
        f"      font-family: '{name}';\n"
        f"      src: url({uri}) format('woff2');{ur}\n"
        f"      font-weight: 500; font-style: normal; font-display: block;\n"
        f"    }}"
    )


def find_chromium():
    """优先用 playwright 自带的 chromium；找不到就扫 ms-playwright 缓存目录"""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        try:
            exe = p.chromium.executable_path
            if exe and pathlib.Path(exe).exists():
                return None  # None = 用 playwright 默认
        except Exception:
            pass
    roots = [pathlib.Path.home() / '.cache' / 'ms-playwright',
             pathlib.Path('/ms-playwright'), pathlib.Path('/root/.cache/ms-playwright')]
    cands = []
    for r in roots:
        if r.exists():
            cands += sorted(r.glob('chromium-*/chrome-linux/chrome'))
            cands += sorted(r.glob('chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium'))
            cands += sorted(r.glob('chromium-*/chrome-win/chrome.exe'))
    return str(cands[-1]) if cands else None


def optimize_png(path: pathlib.Path) -> None:
    """Chromium 出的 PNG 没做 optimize，用 PIL 重新编码可省 ~10%"""
    try:
        from PIL import Image
        im = Image.open(path).convert('RGB')
        tmp = path.with_suffix(path.suffix + '.tmp')
        im.save(tmp, format='PNG', optimize=True)
        tmp.replace(path)
    except Exception as e:
        print(f'[提示] {path.name} 二次压缩跳过: {e}')


try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit('[中止] 缺少 playwright：pip install playwright && playwright install chromium')

font_face_css = '\n'.join([
    font_face('LXGWTITLE', 'title.woff2'),
    font_face('LXGWTITLE', 'title-extra.woff2', 'U+95E8, U+6237, U+683C'),
])
html = tpl_path.read_text(encoding='utf-8').replace('{{FONT_FACE}}', font_face_css)

tmp_html = web / '.og-image.render.html'
tmp_html.write_text(html, encoding='utf-8')

# favicon.svg → 各种尺寸的 PNG（图标类必须位图，SVG 不被 iOS/PWA 接受）
svg_b64 = b64.b64encode(favicon_svg.read_bytes()).decode() if favicon_svg.exists() else ''
icon_html = (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    'html,body{margin:0;padding:0;background:transparent}'
    f'img{{width:100vw;height:100vh;display:block}}'
    '</style></head><body>'
    f'<img src="data:image/svg+xml;base64,{svg_b64}">'
    '</body></html>'
)
tmp_icon_html = web / '.icon.render.html'
tmp_icon_html.write_text(icon_html, encoding='utf-8')

try:
    exe = find_chromium()
    with sync_playwright() as p:
        launch_args = {'args': ['--no-sandbox']}
        if exe:
            launch_args['executable_path'] = exe
            print(f'[信息] 使用 chromium: {exe}')
        browser = p.chromium.launch(**launch_args)

        # 1) 分享卡片
        page = browser.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        page.goto(tmp_html.as_uri())
        page.wait_for_timeout(900)  # 等 webfont 加载完成
        page.screenshot(path=str(out_path), type='png')
        page.close()
        optimize_png(out_path)
        print(f'built: {out_path} ({out_path.stat().st_size} bytes, 1200x630)')

        # 2) 图标（从 favicon.svg 渲染）
        for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
            if not svg_b64:
                print(f'[跳过] {name}：缺少 {favicon_svg}')
                break
            ip = browser.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
            ip.goto(tmp_icon_html.as_uri())
            ip.wait_for_timeout(250)
            dst = web / name
            ip.screenshot(path=str(dst), type='png', omit_background=True)
            ip.close()
            optimize_png(dst)
            print(f'built: {dst} ({dst.stat().st_size} bytes, {size}x{size})')
        browser.close()
finally:
    tmp_html.unlink(missing_ok=True)
    tmp_icon_html.unlink(missing_ok=True)

# 站点地图的 lastmod 用今天
sm = web / 'sitemap.xml'
if sm.exists():
    today = datetime.date.today().isoformat()
    sm.write_text(sm.read_text(encoding='utf-8').replace('{DATE}', today), encoding='utf-8')
    print(f'updated: {sm} (lastmod={today})')
