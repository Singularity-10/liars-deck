# 骗子牌酒馆 · Liar's Deck

一款**撒谎与读心**的卡牌酒馆游戏——出牌可以撒谎，质疑可以吹牌，吹爆的谎言交给命运轮盘审判。全离线零依赖，双击即玩。

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
js/
  00-constants.js   常量与版本号（GAME_VERSION）
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
test-*.js           白盒测试套件（node 直接跑，零依赖）
sim-*.js            蒙特卡洛模拟器（平衡性验证）
build-single.py     单文件版构建脚本
tsconfig.json
```

## 测试

```bash
node test-roles.js     # 角色系统
node test-events.js    # 事件系统
node test-replay.js    # 回放
# ...共 15 件套，node test-<模块名>.js 逐个运行
node sim-roles.js      # 角色平衡性蒙特卡洛（SIM_STRICT 3600 局零卡死）
```

测试零依赖：直接用 Node 读源码文件进沙盒执行断言，不需要 npm install。

## 云端 AI 对手（可选）

游戏内置本地 AI，也可接 [GLM](https://open.bigmodel.cn/) 提升对手"演技"：游戏内设置 → 粘贴你自己的 API Key。Key 只存浏览器 localStorage，不进代码、不上传。

## 版本

当前 **v105**。版本号由 `GAME_VERSION`（`js/00-constants.js`）与发版脚本统一维护，单调递增。

## 许可

[MIT](LICENSE)。基于 React 18 与 PeerJS 1.5.4（均 MIT，见 `js/vendor/`）。
