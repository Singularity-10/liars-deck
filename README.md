# 骗子牌酒馆 · Liar's Deck

一款**撒谎与读心**的卡牌酒馆游戏——出牌可以撒谎，质疑可以吹牌，吹爆的谎言交给命运轮盘审判。全离线零依赖，双击即玩。

> 🎮 **想直接玩？** [骗子酒馆网页版在线玩（免费·免安装）](https://singularity-10.github.io/liars-deck/) —— 经典骗子酒馆（Liar's Bar）玩法中文复刻：AI 老千单机可玩、好友远程联机、手机浏览器打开即玩，无需下载安装。

```
真话保命，谎话上膛。
```

## 玩法速览

- **出牌必须匹配目标花色**——手上没有？那就撒谎（打出杂牌并宣称是目标牌）
- **质疑吹牌**——怀疑对手在撒谎就发起质疑：谎言被拆穿 → 撒谎者上轮盘；诬告 → 质疑者上轮盘
- **命运轮盘**——每轮转一次的俄罗斯轮盘，活下来继续吹，死了出局
- **两条胜利路线**——先吹满吹牌计数，或活到最后一个人
- **64 张牌**：4 花色数字牌 + 天使牌（净化）+ 恶魔牌（污染），特殊牌随轮数递减
- **8 个角色**（每局随机分配、技能各异）：老千（变牌）/ 酒保（提升出牌上限）/ 赏金猎人（质疑加速）/ 枪手（布防免死）/ 读心者（偷看手牌）/ 恶魔信徒（天使变恶魔）/ 守护天使（免死护体）/ 变色龙（换目标花色）
- **18 张事件牌**：3 轮一事件的密度搅局，含 6 张多抉择事件
- **联机对战**：PeerJS 点对点局域/公网对战（自建房间码互连，无需服务器中转）

## 快速开始

**方式一（最简，零构建）**

```
git clone 本仓库 → 打开 index.html → 开玩
```

全离线运行，不需要安装任何依赖、不需要联网（联机对战除外）。

**方式二（单文件版）**

```bash
python3 build-single.py   # 产出 dist/ 下的单文件版，可直接发人
```

## 目录结构

```
index.html          入口（开发版，引用本地相对路径）
game.html           单文件构建产物（gh-pages 部署源，可直接发人）
js/
  00-constants.js   常量与版本号（GAME_VERSION）
  01-analytics.js   访问统计与行为埋点（多 provider，默认零配置）
  05-i18n.js        文案词典（t() 机制）
  08-lobby-beacon.js  联机房间广播
  10-utils.js       工具函数
  20-engine.js      核心引擎（牌堆/出牌/质疑/轮盘/终局）
  25-roles.js       8 角色系统
  28-llm.js         云端 AI 接入（GLM，可选）
  30-ai.js          本地 AI 对手决策
  35-achievements.js  成就系统
  35-ftue.js        新手引导
  40-*.js           组件层（icons/audio/menu/lobby/components）
  45-replay.js      回放系统
  45-stats-charts.js 战绩图表
  50-game.js        游戏流程编排
  60-main.js        启动入口
  vendor/           第三方（React 18 + ReactDOM + PeerJS 1.5.4，已内置无需安装）
types/game.d.ts     TypeScript 类型基座（渐进点亮中）
assets/fonts/       本地字体
tests/              白盒测试套件（21 个 test-*.js，零依赖）
sim-*.js            蒙特卡洛模拟器（平衡性验证）
web/                站点资产（落地页源码 + favicon / 分享卡 / PWA 图标 / robots / sitemap）
build-og-image.py   生成 og-image.png 与各尺寸图标（Chromium 渲染，产物为二进制）
build-single.py     单文件版构建脚本
build-pages.py      gh-pages 整站构建脚本（落地页 + 单文件版 + 统计模块）
ci.sh               本地/CI 三合一检查（白盒 + 蒙特卡洛 + 构建冒烟）
publish.sh          一键发布（重建产物 + 推 main 与 gh-pages 两个分支）
diag-persona.js     人格诊断脚本（开发调试用）
.github/workflows/  CI（白盒测试 + 蒙特卡洛 + 单文件构建冒烟）
tsconfig.json
```

## 测试

```bash
node tests/test-roles.js     # 角色系统
node tests/test-events.js    # 事件系统
node tests/test-replay.js    # 回放
# ...共 21 件套，node tests/test-<模块名>.js 逐个运行（在仓库根目录执行）
node sim-roles.js      # 角色平衡性蒙特卡洛（SIM_STRICT 3600 局零卡死）
```

测试零依赖：直接用 Node 读源码文件进沙盒执行断言，不需要 npm install。

## 访问统计与埋点

统计模块是 `js/01-analytics.js`，**默认零配置 = 一个请求都不发**（不加载任何第三方脚本）。
启用只需改这一个文件顶部的 `ANALYTICS_CONFIG`：

```js
const ANALYTICS_CONFIG = {
  baidu:      { siteId: '' },   // 百度统计 hm.baidu.com 站点 ID
  ga4:        { id: '' },       // GA4 Measurement ID（G-XXXXXXX）
  umami:      { websiteId: '', scriptUrl: 'https://cloud.umami.is/script.js' },
  plausible:  { domain: '', scriptUrl: 'https://plausible.io/js/script.js' },
  beacon:     { token: '' },    // Cloudflare Web Analytics token
  custom:     { endpoint: '' }, // 自建端点：POST JSON（text/plain，无预检）
};
```

填哪个就启用哪个，多个可并存。改完记得重新构建并部署：

```bash
python3 build-single.py --title "酒馆 {version} - 骗子牌酒馆网页版在线玩" --out game.html
python3 build-pages.py          # 生成 dist-pages/，推到 gh-pages 分支根目录
```

**自动上报的事件**（无需额外配置）：

| 事件 | 触发时机 | 附带参数 |
|---|---|---|
| `pageview` | 页面打开（落地页 / 游戏页各算一次） | `app` `v`(版本) `path` `lang` |
| `game_start` | 单机开局 / 联机开局 | `mode` `playMode` `difficulty` `aiCount` / `players` `isHost` |
| `game_end` | 每局终局（引擎唯一出口，只发一次） | `won` `winReason` `winner` |

**隐私**：遵守浏览器的 Do Not Track；`LDAnalytics.optOut(true)` 可让玩家本地永久关闭上报；
只上报路径与游戏行为，不含任何身份信息。

## CI

检查逻辑全在仓库内的 `ci.sh`，本地和 CI 跑的是同一套：

```bash
bash ci.sh         # 全跑（白盒 + 蒙特卡洛 + 构建冒烟）
bash ci.sh unit    # 只跑白盒测试
bash ci.sh sim     # 只跑蒙特卡洛
bash ci.sh build   # 只跑构建检查
```

- **白盒测试**：逐个执行 21 件套 `tests/test-*.js`（零依赖，不需要 npm install）
- **蒙特卡洛**：`SIM_STRICT=1 node sim-roles.js 2000` + `sim-persona.js` + `sim-discard.js`
- **单文件构建冒烟**：构建 `build-single.py`，校验产物**无任何外链**（script/字体必须内联），
  并校验仓库里的 `game.html` 与源码一致——改完源码忘了重新构建，CI 会直接报错

`.github/workflows/tests.yml` 在 push / PR / 每周定时自动跑 `ci.sh`（需 `uglifyjs` 在 PATH：
`npm i -g uglify-js@3.19.3`）。CI 挂了先在本地跑一遍 `bash ci.sh` 复现。

## 站点与分享

线上站点（gh-pages）的内容全部由仓库生成，**不要手改 HTML**：

| 文件 | 作用 |
|---|---|
| `web/index.html` | 落地页（营销页，gh-pages 首页的源码） |
| `web/favicon.svg` | 站点图标（SVG，矢量，浏览器标签页） |
| `web/og-image.png` | 社交分享卡（1200×630）——微信/微博/X 分享时的缩略图 |
| `web/apple-touch-icon.png` | iOS「添加到主屏幕」图标（180×180） |
| `web/icon-192.png` / `web/icon-512.png` | PWA 图标 |
| `web/manifest.webmanifest` | PWA 清单（可全屏、可加桌面） |
| `web/robots.txt` / `web/sitemap.xml` | 爬虫策略与站点地图 |

图片类产物是二进制，由 `build-og-image.py` 用 Chromium 渲染模板 `web/og-image.html` 生成：

```bash
python3 build-og-image.py    # 需要 playwright + chromium
```

改完站点资产后跑 `bash publish.sh` 才会真正上线（产物随 dist-pages/ 一起推）。

> 注意：`robots.txt` 在 GitHub Pages **项目页**上不生效（爬虫只读域名根的 robots.txt），
> 它是给将来绑定自有域名（CNAME）准备的，届时该文件即位于域名根，规则自动生效。
> `sitemap.xml` 不受此限制，可直接提交到百度收录平台 / Search Console。

## 发布

```bash
bash publish.sh              # 重建产物 + 推 main 与 gh-pages
bash publish.sh --build-only # 只构建，不动 git
```

`publish.sh` 做三件事：用 `build-single.py` 重建根目录 `game.html`、用 `build-pages.py`
生成 `dist-pages/`（落地页 + 单文件版 + 统计模块）、再把两者分别推到 `main` 与
`gh-pages` 分支。线上站点的内容 100% 由仓库生成，不手工改 HTML。

> 注：单文件版 `game.html` 约 690KB，超过 GitHub App 写文件接口的单请求上限
> （约 500KB），只能用本地 `git push` 上线——这就是 `publish.sh` 存在的原因。
> CI 会校验仓库里的 `game.html` 与源码是否一致，防止产物漂移。

## 云端 AI 对手（可选）

游戏内置本地 AI，也可接 [GLM](https://open.bigmodel.cn/) 提升对手"演技"：游戏内设置 → 粘贴你自己的 API Key。Key 只存浏览器 localStorage，不进代码、不上传。

## 版本

当前 **v133**（v133 新增访问统计与埋点模块 `js/01-analytics.js`——多 provider 适配、默认零配置；补 GitHub Actions CI：白盒 21 件套 + 蒙特卡洛 + 单文件构建冒烟；修 `build-single.py` 漏内联 `title-extra.woff2` 导致单文件版丢字的问题，并把落地页源码 `web/index.html` 收回仓库）。版本号由 `GAME_VERSION`（`js/00-constants.js`）与发版脚本统一维护，单调递增。

## 许可

[MIT](LICENSE)。基于 React 18 与 PeerJS 1.5.4（均 MIT，见 `js/vendor/`）。
