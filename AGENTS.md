# BetterMath 可视化制作指南

> 这份文档写给**用 AI 创作可视化页面的人**——无论是贡献者还是维护者。
> 目标：让任何人产出的可视化页，和现有的「定积分与黎曼和」看起来是同一个网站。
>
> 如果你是要改首页、章节列表、路由这些基础设施，这份文档只覆盖了一部分，请直接读源码。

---

## 0. 先分清你是哪一种

**这决定了你能做什么、该怎么提交。**

| | 贡献者 | 维护者 |
| --- | --- | --- |
| 是谁 | 想加可视化页的外部开发者 | 仓库所有者 |
| 权限 | **只能提 PR**，不推 `main` | 可直接推 `main`、可部署 |
| 流程 | 拉分支 → 开发 → 提 PR | 审 PR → 合并 → 部署 |
| 部署 | **不做**（维护者合并后代跑） | 负责 |
| 必读 | 全文；第 12.1 节是提交方式 | 全文；第 12.2 节是审阅与部署 |

> **贡献者注意**：即使你在 GitHub 上有 `main` 的写权限，也**不要直接推**。
> 走分支 + PR，维护者才能在你合并前跑一遍验收。

---

## 1. 这是什么

一个数学可视化静态站。零后端、零运行时依赖、纯静态产物，部署在一台 Caddy 上。

| 项 | 值 |
| --- | --- |
| 构建 | Vite 7 |
| 语言 | TypeScript 5（`strict`） |
| 框架 | **无**（不引 React/Vue，手写 DOM） |
| 运行时依赖 | **0**（`package.json` 的 dependencies 是空的） |
| 样式 | 原生 CSS + 设计令牌，无预处理器 |
| 路由 | 手写 History API |
| 产物 | ≈ 51 KB JS（gzip 17 KB）+ 23 KB CSS（gzip 6 KB） |

**为什么不用框架**：这个站的交互集中在少数几个可视化里，页面结构简单。引框架带来的抽象成本和体积，大于它省下的代码。请保持这个判断——**不要为了写一个可视化就引入 React**。

---

## 2. 一分钟上手

### 取代码

```bash
# 贡献者：fork 之后 clone 你自己的 fork（或直接 clone 上游，见下）
git clone https://github.com/<你的账号>/BetterMath.git
cd BetterMath
git switch -c viz/<slug>        # 从最新的 main 拉分支，见第 12.1 节

# 维护者
git clone https://github.com/LittleFishStars/BetterMath.git
cd BetterMath
```

> 只 clone 上游、不 fork 也可以开发；但提 PR 时需要你的改动在一个能推的分支上，
> 所以实际做法是 fork 一份、clone fork、在那里拉分支。

### 跑起来

```bash
npm install --cache ./.tmp/npm-cache   # 本机 npm 默认缓存路径有问题，必须指定
npm run dev                            # http://127.0.0.1:5173
npm run build                          # tsc --noEmit && vite build
```

> `npm install` 一定要带 `--cache ./.tmp/npm-cache`，否则会因为 `~/.cache/npm` 权限问题失败。

---

## 3. 目录结构

```
src/
├── main.ts                 入口：路由接线、视图切换。**一般不用改**
├── chapters/
│   ├── data.ts             章节与内容条目的数据源
│   ├── render.ts           章节卡片、内容行的渲染
│   ├── router.ts           History API 路由
│   ├── transitions.ts      首页 ⇄ 章节页的转场
│   └── figures.ts          章节卡片上的小装饰图
├── viz/                    ← 可视化框架
│   ├── types.ts            VizDefinition 契约
│   ├── shell.ts            外壳：舞台、导入语、说明文字
│   ├── timeline.ts         分段进度条 + 播放控件
│   ├── svg.ts              建节点、坐标映射、插值
│   ├── registry.ts         注册表
│   └── riemann/            ← 唯一的参考实现
│       ├── definition.ts   可视化本体
│       └── math.ts         纯数学（无 DOM）
├── field/                  首页背景的符号场（Canvas）
└── styles/
    ├── tokens.css          设计令牌（颜色/字体/缓动）
    ├── fonts.css           自托管字体
    ├── home.css
    └── chapters.css        章节页 + 可视化页的样式
```

---

## 4. 可视化的运行机制

理解这三层，你就不用重复造轮子：

```
VizShell（外壳）        ← 你不用写
  ├─ 返回链接
  ├─ 舞台布局（左图 / 右面板）
  ├─ 导入语
  ├─ 说明文字（每幕一句话）
  ├─ Timeline（分段进度条 + 播放/重置/下一节/倍速 + 拖动 + 键盘）
  └─ 调你的 definition
        ├─ mountFigure(host, ctx)   你往 host 里放 SVG / canvas
        ├─ mountPanel(host, ctx)    你往 host 里放滑动条、数值
        ├─ update(t)                每帧：t ∈ [0, 1]
        └─ caption(t)               这一刻该说什么
```

**你只写 definition。** 进度条、播放、键盘、导入语淡出、说明文字淡入，外壳都包了。

### 时间模型

`t` 是内部进度 `0..1`。你把它切成若干段，每段给一个**真实秒数**：

```ts
const SEGMENTS = [
  { tFrom: 0,    tTo: 0.2,  seconds: 2.2 },   // 第 1 段
  { tFrom: 0.2,  tTo: 0.62, seconds: 4.2 },   // 第 2 段
  { tFrom: 0.62, tTo: 0.8,  seconds: 2.2 },
  { tFrom: 0.8,  tTo: 1,    seconds: 3.2 },
];
```

进度条上每段的**物理宽度与秒数成正比**——拖到哪儿，看到的就是那一刻，不需要换算。

`keyframes` 是段边界（外加 0 和 1），决定进度条上的圆点和「下一节」按钮的跳点：

```ts
const KEYFRAMES = [0, 0.2, 0.62, 0.8, 1];
```

> **要点**：每一帧都必须是合法状态。不要写「拖到一半时特殊处理」——`update(t)` 被连续调用，中间态要能插值出来。这是这个站能拖动的根本原因。

---

## 5. 新建一个可视化：完整步骤

假设要做一个叫 `taylor`（泰勒展开）的可视化。

### 步骤 1：建目录

```
src/viz/taylor/
├── math.ts          纯数学，不碰 DOM
└── definition.ts    可视化本体
```

**数学和渲染必须分开**。`math.ts` 里不出现 `document`、`SVG`、颜色。这样数学能被单独测试和复用。

### 步骤 2：写 `definition.ts`

```ts
import { el, scale, smoothstep } from '../svg';
import type { VizContext, VizDefinition } from '../types';
import type { VizSegment } from '../timeline';

const SEGMENTS: readonly VizSegment[] = [
  { tFrom: 0,   tTo: 0.3, seconds: 2.4 },
  { tFrom: 0.3, tTo: 1,   seconds: 5.6 },
];
const KEYFRAMES = [0, 0.3, 1] as const;

// 坐标映射：数学坐标 → 屏幕坐标。一次定义，处处可用。
const xToPx = scale([-2, 2], [74, 700]);
const yToPx = scale([-2, 2], [348, 58]);   // 注意 y 是反的

export function createTaylorViz(): VizDefinition {
  let curveLayer: SVGGElement;
  let panelEl: HTMLElement;

  const captionFor = (t: number): string => {
    if (t < 0.3) return '用多项式去逼近一条曲线。';
    return '项数越多，贴合的范围越宽。';
  };

  return {
    segments: SEGMENTS,
    keyframes: KEYFRAMES,
    intro: '这条曲线没有初等表达式，但可以用多项式一点点逼近它。',

    mountFigure(host, ctx) {
      const svg = el('svg', {
        class: 'viz__plot',
        viewBox: '0 0 720 420',
        role: 'img',
        'aria-label': '泰勒展开逼近示意图',
      });
      curveLayer = el('g', { class: 'viz__curve-layer' });
      svg.append(curveLayer);
      host.append(svg);
    },

    mountPanel(host, ctx: VizContext) {
      panelEl = document.createElement('div');
      panelEl.className = 'viz__panel-a';
      panelEl.innerHTML = `
        <label class="viz__n-label" for="viz-terms">项数 n</label>
        <div class="viz__n-row">
          <input class="viz__n-range" id="viz-terms" type="range"
                 min="1" max="12" step="1" value="3">
          <output class="viz__n-value" for="viz-terms">3</output>
        </div>
      `;
      host.append(panelEl);
      // 面板交互 → 反向驱动进度（见第 8 节）
    },

    update(t) {
      const opacity = smoothstep(0, 0.15, t);
      curveLayer.style.opacity = String(opacity);
      // 重画你的图形
    },

    caption: captionFor,
  };
}
```

### 步骤 3：注册

`src/viz/registry.ts`：

```ts
import { createTaylorViz } from './taylor/definition';

export const VISUALS: Record<string, VizEntry> = {
  riemann: { load: () => createRiemannViz() },
  taylor:  { load: () => createTaylorViz() },   // ← 加这一行
};
```

### 步骤 4：挂到内容条目上

`src/chapters/data.ts`：

```ts
export const CHAPTER_CONTENTS = {
  'mathematical-analysis': [
    { id: 'riemann-integral', title: '定积分与黎曼和', ..., visual: 'riemann' },
    // 加一条，visual 的值就是 registry 里的键
    { id: 'taylor-series', title: '泰勒展开', description: '用多项式逼近曲线', visual: 'taylor' },
  ],
};
```

**搞定。** 路由 `/chapters/mathematical-analysis/taylor-series` 自动可用，返回、Esc、转场都继承。

---

## 6. 设计规范

### 6.1 配色：只有蓝

**这是硬约束。** 全站是蓝色系，不要引入红/绿/紫作为主色。

令牌分三层（`src/styles/tokens.css`）：

```
1. 原始色板    --bm-blue-500          只在这里出现十六进制
2. 透明度阶梯  --bm-brand-a18         品牌色的常用透明度档
3. 语义别名    --bm-accent            写样式时只用这一层
```

**语义色**（写样式用这些）：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bm-bg-canvas` | `#f7faff` | 页面底色（冷白） |
| `--bm-bg-tint` | `#eef4fc` | 次级底色 |
| `--bm-bg-surface` | 品牌蓝 5% | 卡片 / 面板 |
| `--bm-fg-strong` | `#1b2739` | 标题 |
| `--bm-fg-default` | `#3b4a61` | 正文 |
| `--bm-fg-muted` | `#5a6b82` | 辅助文字、轴标签 |
| `--bm-accent` | `#1c6fc4` | 强调色 |
| `--bm-stroke-soft` | 品牌蓝 12% | inset 高光 |
| `--bm-gradient-title` | 亮蓝→靛蓝→海军蓝 | 大标题渐变 |

**透明度阶梯**（`--bm-brand-a05` … `--bm-brand-a55`）：
数字就是透明度百分比。`--bm-brand-a18` = `rgb(28 111 196 / 0.18)`。
另有 `--bm-ink-a*`（深海军蓝，做阴影）与 `--bm-fg-a*`（文字色，做轴与刻度）。

**图表专用**（可视化页一律用这些，不要写裸 rgba）：

| 令牌 | 用途 |
| --- | --- |
| `--bm-chart-line` | 曲线 |
| `--bm-chart-dot` | 曲线端点 |
| `--bm-chart-area` | 曲线下的底纹 |
| `--bm-chart-fill` | 主数据（实心矩形） |
| `--bm-chart-outline` | 次级数据（虚线描边） |
| `--bm-chart-axis` | 坐标轴 |
| `--bm-chart-tick` | 刻度 |
| `--bm-chart-divider` | 分割点 |
| `--bm-chart-gap` | 误差区（暖色） |

**图表内的层次用「蓝色的深浅」表达，不要用不同色相。**

### 6.2 唯一的例外：暖色 = 「误差 / 问题」

当你要表达「这里不对 / 还差多少」时，用琥珀色：

| 令牌 | 用途 |
| --- | --- |
| `--bm-chart-gap` | 误差区填充 |
| `--bm-status-warning-surface` | 误差条轨道 |
| `--bm-status-warning` | 误差数字（`#b96c22`） |
| `--bm-meter-warn` | 误差条渐变（暖） |
| `--bm-meter-ok` | 收敛后的渐变（蓝） |

**只在这种情况下用暖色**。它不是装饰色，是状态色。黎曼和里「矩形没盖住的那道缝」就是它。

### 6.3 字体

| 用途 | 字体 | 说明 |
| --- | --- | --- |
| 品牌字 / 首页大标题 | `--bm-font-display`（Send Flowers） | **只用于英文**。中文没有这个字形，会掉回系统字体，很丑 |
| 正文 / 标签 | `--bm-font-sans`（Inter + 系统中文字体） | 数字用 `font-variant-numeric: tabular-nums`，避免跳动 |

**图表里的字号阶梯**：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bm-font-size-caption2` | 11px | 轴标题 |
| `--bm-font-size-caption1` | 12px | 轴刻度、小标签 |
| `--bm-font-size-body1` | 14px | 正文、说明文字 |
| `--bm-font-size-body2` | 16px | 强调正文 |
| `--bm-font-size-subtitle1` | 20px | 小标题 |
| `--bm-font-size-title2` | 28px | 区块标题 |
| `--bm-font-size-display` | 40px | 首页大标题 |

字重 `--bm-font-weight-{regular,medium,semibold}`（400/500/600），
行高 `--bm-line-height-{tight,normal,relaxed}`（1.25/1.55/1.72）。

数字统一加 `font-variant-numeric: tabular-nums`，避免跳动。

### 6.4 形状：不要画框

**这是用户明确的审美偏好，违反会被打回。**

- ❌ 不要给卡片/面板/图表元素加 `border`
- ✅ 要区分层次，用**填充色阶**：`--bm-bg-surface`（5%）→ `--bm-brand-a12` → `--bm-brand-a18`
- ✅ 需要边界感时，用 `box-shadow: inset 0 0 0 1px var(--bm-stroke-soft)` 或者干脆不用
- ✅ 圆角统一偏大：卡片用 `--bm-radius-xl`（20px），小控件用 `--bm-radius-circular`
- ✅ 阴影**只给浮层**（下拉、弹层），静态元素不加阴影

### 6.5 动效：克制

| 场景 | 时长令牌 | 曲线令牌 |
| --- | --- | --- |
| 视图切换 | `--bm-duration-slower`（400ms） | `--bm-ease-out` |
| 元素进场 | `--bm-duration-slow`（300ms） | `--bm-ease-decelerate` |
| 元素退场 | `--bm-duration-fast`（150ms） | `--bm-ease-accelerate` |
| 数值变化 | `--bm-duration-faster`（100ms） | `linear` |
| 悬停反馈 | `--bm-duration-normal`（200ms） | `--bm-ease-standard` |

- 位移幅度小：`translateY(10px)` 级别，不要飞入飞出
- **不要做**：视差、弹跳、旋转入场、文字逐字动画
- 必须响应 `prefers-reduced-motion`（`tokens.css` 已把时长压到 0.01s，但你自己写的 `requestAnimationFrame` 循环要自己判断）

### 6.6 图标

**多用图标代替文字**（用户偏好）。

- 优先用 **SVG 内联**，`stroke-width: 2`、`stroke-linecap: round`、`viewBox="0 0 24 24"`
- 尺寸档：16 / 17 / 20 / 24
- 不要混用填充型和线型图标
- 不引图标库（会加体积），手写 path 即可

### 6.7 尺寸令牌

**间距**（4px 基准，不要写 13px 这种值）：

| 令牌 | 值 | 常见用途 |
| --- | --- | --- |
| `--bm-space-1` | 4px | 图标与文字之间 |
| `--bm-space-2` | 8px | 紧凑间距 |
| `--bm-space-3` | 12px | 列表项内 |
| `--bm-space-4` | 16px | 卡片内边距 |
| `--bm-space-5` | 24px | 区块之间 |
| `--bm-space-6` | 32px | 大区块 |
| `--bm-space-8` | 48px | 页面级留白 |

**圆角**：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bm-radius-sm` | 4px | 小标签 |
| `--bm-radius-md` | 8px | 输入框 |
| `--bm-radius-lg` | 12px | 中等面板 |
| `--bm-radius-xl` | 20px | 卡片（默认） |
| `--bm-radius-circular` | 999px | 胶囊、圆形按钮 |

**阴影**（数字是「离页面的高度」，越大越浮）：

| 令牌 | 用途 |
| --- | --- |
| `--bm-shadow-2` | 轻微抬起 |
| `--bm-shadow-4` | 卡片悬停 |
| `--bm-shadow-8` | 下拉菜单 |
| `--bm-shadow-16` | 弹层 |
| `--bm-shadow-28` | 模态框 |

**只在浮层上用阴影**，静态元素不加。

**描边**：`--bm-stroke-thin`（1px）、`--bm-stroke-thick`（2px）。
项目不用 `border` 画框，这两个只给 inset 高光与图表线条。

---

## 7. 叙事设计：五幕结构

**这是这个站的灵魂，比代码风格更重要。**

一个数学可视化不该是「一张可拖动的图」，而应该是一条**因果链**。现有黎曼和用的是：

```
问题 → 笨办法 → 改进 → 严格化 → 结论
```

| 幕 | 职责 | 黎曼和的做法 |
| --- | --- | --- |
| 0 问题 | 说清楚「为什么需要这个东西」 | 曲线下的不规则区域，没有面积公式 |
| 1 笨办法 | 先给一个明显不完美的方案 | 只画 1 个矩形，误差 55% |
| 2 改进 | 让它变好，并让「变好」看得见 | 切细，误差降到 4.6% |
| 3 严格化 | 引入更严谨的表述 | 上和/下和从两侧夹逼 |
| 4 结论 | 收敛，给出定义 | n=128，误差 0.6%，这就是定积分 |

### 三条写作原则

**1. 先给「差得远」，再给「变好」**

不要让用户一上来就看到完美结果。第一幕要有明显的缺陷，而且这个缺陷要**可视化**（黎曼和里是那道琥珀色的缝）。

**2. 核心量必须有视觉对应**

如果你要讲「误差趋于 0」，那误差就必须在图上看得见——不能只有数字。

**3. 一幕一句话**

`caption(t)` 每幕只返回一句。不要写段落。

---

## 8. 交互规范

### 8.1 进度条已经给你了

不要自己写播放按钮、拖动条、关键帧圆点。`VizShell` 全包了。

你只需要保证 `update(t)` 在任意 `t` 下都能正确渲染。

### 8.2 面板交互要「反向驱动进度」

典型场景：用户在某一幕拖滑动条，但当前进度还没到能看见效果的位置。

```ts
mountPanel(host, ctx) {
  range.addEventListener('input', () => {
    userN = Number(range.value);
    if (ctx.progress < T_WHERE_EFFECT_VISIBLE) {
      ctx.setProgress(T_WHERE_EFFECT_VISIBLE);   // 先把进度推过去
    } else {
      ctx.setProgress(ctx.progress);             // 已在后面，原地重绘
    }
  });
}
```

**踩过的坑**：推到「还没画东西」的那一幕，用户会以为坏了。要推到一个**能让新参数生效**的位置。

### 8.3 状态一致性

一个数值如果同时出现在「图形」「标签」「滑块」三处，**必须由同一个函数驱动**。

黎曼和里是 `currentN(t)`：图形画多少段、标签显示几、滑块停在哪，全读它。

```ts
// ✅ 正确
const n = currentN(t);
drawRects(n);
label.textContent = String(n);
range.value = String(n);

// ❌ 错误：标签读用户设定值，图形读当前值
label.textContent = String(userN);   // 用户看到 8，图上只有 5 段
drawRects(currentN(t));
```

### 8.4 无障碍

- 绘图 `<svg>` 必须有 `role="img"` 和 `aria-label`
- 数值面板容器加 `aria-live="polite"`，让屏幕阅读器感知变化
- 可点元素用 `<button>`，不要用 `<div onclick>`
- 键盘：方向键微调、Home/End 跳首尾、空格播放暂停（外壳已实现，你的自定义控件要自己加）

---

## 9. 渲染技术选型

| 场景 | 用什么 | 理由 |
| --- | --- | --- |
| 曲线、矩形、点、标注（≤ 500 个元素） | **SVG** | 真实 DOM，能加 CSS 过渡，天然适配高DPI，可选中 |
| 上千个粒子 / 逐帧重绘 | **Canvas 2D** | SVG 元素多了会卡 |
| 三维曲面、向量场 | **WebGL（Three.js）** | SVG/Canvas 做不了 |

**默认选 SVG。** 现有黎曼和 n=128 时画 256 个矩形，SVG 完全不卡。

### 关于三维

MathBox 试过，**不建议用**（API 有坑、体积 301KB gzip、文档陈旧）。真要做三维，直接用 Three.js，并且：

```ts
// registry.ts
surface: {
  load: () => import('./surface/definition').then((m) => m.createSurfaceViz()),
}
```

**必须动态 import**，否则 300KB 会进主包。外壳的 `mountFigure(host)` 不假设渲染后端，WebGL canvas 直接塞进去就行。

---

## 10. 常见陷阱

这些都是实际踩过的，写在这里省你时间。

### 10.1 图层位移要「全家桶」

如果某一幕要让整幅图左移，**所有图层**（轴、曲线、矩形、刻度、标签）都必须进同一个 `<g transform>`。

```ts
// ❌ 只移了轴和曲线，矩形留在原地 → 错位
shiftWrap.append(grid, curveLayer);

// ✅ 全部进容器
shiftWrap.append(grid, curveLayer, rectLayer, tickLayer, labels);
```

### 10.2 轴标签要跟着轴一起淡入

`0` 和 `a` 这类标签，如果和坐标轴分属两个图层，会出现在「轴还没出现、字先冒出来」的情况。**把它们挂在轴那一层上**。

### 10.3 一个量只用一个定义

黎曼和的误差，一度在看上和时切换成「上和−下和」，结果数字从 4.6% 跳到 9.1%——明明在变准，读数却变差了。

**一个指标从头到尾用同一个公式**。

### 10.4 密集元素要去缝 / 减线

n=128 时，每个矩形留 0.6px 缝，128 条缝会连成竖条纹，整块面积看起来像噪点。

```ts
const seam = n > 48 ? 0 : 0.6;   // 密集时不留缝
```

同理，128 个虚线框会糊成纹理，要么淡化，要么改用轮廓线。

### 10.5 标签放不下就整排不显示

不要「只标中间一个」——中间孤零零一个 `x8` 更奇怪。

```ts
const budget = Math.floor((plotWidth * 0.86) / 20);   // 一个标签约 20px
const showLabels = n <= budget;
```

刻度线始终保留（它标的是位置，和文字是两回事）。

### 10.6 随机要确定性

如果要随机分割/随机采样，**不能用 `Math.random()`**——拖动进度条时每帧重算，图形会不停抖动。

用固定种子的伪随机：

```ts
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
```

### 10.7 关键帧的状态要固定

`keyframes` 里的每个 `t`，渲染结果必须是确定的。黎曼和的关键帧 1 是「一个矩形」，那 `currentN(0.2)` 就必须返回 1，不能返回 2。

### 10.8 数学公式不要硬编码 Unicode

`∫₀ᵃ` 这种写法只在小范围能用。分式、矩阵、上下标一多就会崩。目前全站只有 3 处公式，还能忍；**超过 10 处就该引 KaTeX**（约 110KB gzip，按需加载）。

---

## 11. 验收清单

**贡献者在提 PR 前逐项过一遍**，维护者审 PR 时也会照着核对。

### 功能

- [ ] 五个关键帧逐一点击，状态都对
- [ ] 播放到底，动画连贯、不跳帧
- [ ] 拖动进度条，任意位置都渲染正常（不会白屏/报错）
- [ ] 暂停后进度真的停住
- [ ] 「下一节」逐段跳转正常
- [ ] 倍速切换生效
- [ ] 键盘：方向键 / Home / End / 空格
- [ ] 面板上的控件改了，图形**立刻**响应

### 视觉

- [ ] 只用了蓝色系（暖色仅限「误差」语义）
- [ ] 没有 `border`（层次用填充色阶）
- [ ] 圆角统一（卡片 18–22px，控件 999px）
- [ ] 没有多余的阴影
- [ ] 图表内字号符合阶梯（11/12/14）

### 适配

- [ ] 390px 宽（手机）：单列，无横向滚动
- [ ] 768px / 1440px / 1920px：布局正常
- [ ] 进度条在窄屏折成两行（外壳已处理，验证一下）
- [ ] 系统开启「减少动态效果」时，动画不刺眼

### 代码

- [ ] `math.ts` 里没有 DOM 相关代码
- [ ] 没有引入运行时依赖
- [ ] `npm run build` 通过（含 `tsc --noEmit`）
- [ ] 主包体积没有明显增长（基线：JS 51KB / gzip 17KB）
- [ ] Console 无报错

### 收尾

- [ ] `README.md` 补上这个可视化的说明
- [ ] 删掉 `.tmp/` 下的临时脚本
- [ ] `git status` 干净

---

## 12. 提交：贡献者走 PR，维护者走部署

### 12.1 贡献者：分支 + PR

**不要直接推 `main`。** 即使你在 GitHub 上有写权限——走 PR，维护者才能在合并前跑一遍验收。

```bash
# 1. 同步最新的 main，拉一个分支
git switch main && git pull
git switch -c viz/<slug>

# 2. 开发，然后自检（第 11 节的清单）
npm run build                  # 必须通过，含 tsc --noEmit

# 3. 提交
git add -A
git commit -m "feat: 新增 <主题> 可视化"
git push origin viz/<slug>

# 4. 到 GitHub 开 PR，目标分支 main
```

**分支命名**：

| 类型 | 格式 | 例子 |
| --- | --- | --- |
| 新可视化 | `viz/<slug>` | `viz/taylor` |
| 修 bug | `fix/<简述>` | `fix/label-overlap` |
| 改文档 | `docs/<简述>` | `docs/deploy-notes` |
| 重构 | `refactor/<简述>` | `refactor/split-timeline` |

`<slug>` 用小写字母、数字、连字符，和 `src/viz/<slug>/` 目录名、`registry.ts` 里的键保持一致。

**commit 前缀**沿用现有的：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`。

**PR 描述里必须写**：

1. 这个可视化要讲清楚的道理（一句话）
2. 五幕各是什么
3. 关键帧截图——至少第 1 幕（笨办法）和第 4 幕（结论）
4. 第 11 节验收清单的勾选情况
5. 主包体积有没有变化（`npm run build` 会打印，基线 JS 51 KB / gzip 17 KB）

**贡献者不要做的事**：

- ❌ 不要跑 `scripts/deploy.sh`（会直接改线上）
- ❌ 不要动 `main` 分支
- ❌ 不要改 `scripts/deploy.sh` 里的服务器地址
- ❌ 不要引入运行时依赖（要引先开 issue 讨论）

### 12.2 维护者：审阅与部署

**审 PR 至少做三件事**：

1. **本地跑一遍**：`git switch <分支> && npm run dev`，五个关键帧逐一点过去，拖一遍进度条
2. **看体积**：`npm run build`，对比基线。涨得离谱要问原因（比如有人偷偷引了 Three.js 进主包）
3. **看风格**：对照第 6 节——有没有画框、有没有非蓝色、动效是不是太花

三项都过再合并。

**合并后部署**：

```bash
git switch main && git pull
npm run build                # 构建 + 类型检查
bash scripts/deploy.sh       # 构建 → 产物检查 → rsync 到服务器 → 健康检查
```

`deploy.sh` 会做几件事：
1. `npm run build`
2. 检查产物非空
3. `rsync --delete` 到 `root@172.24.0.1:/var/www/bettermath`
4. 修正属主
5. 用 `--resolve` 绕过 Cloudflare 打源站，检查首页、`/chapters`、各内容页返回 200

**新增了路由就要更新自检列表**（`scripts/deploy.sh` 里的 `for route in ...`），否则线上 404 不会被发现。

> 这一条是维护者的责任：PR 里加了新可视化，`deploy.sh` 的自检数组要跟着加一条
> `/chapters/<章节>/<内容>`，否则部署成功但页面 404，健康检查也发现不了。

---

## 13. 给 AI 的提示词模板

如果你是用 AI 来做，把下面这段连同本文档一起给它：

```
请按 AGENTS.md 的规范，为 BetterMath 制作一个可视化页。

主题：<数学主题>
要讲清楚的道理：<一句话>
五幕规划：
  0 问题  ——
  1 笨办法 ——
  2 改进  ——
  3 严格化 ——
  4 结论  ——

技术要求：
- 新建 src/viz/<slug>/{math.ts, definition.ts}
- 数学与渲染分离，math.ts 里不碰 DOM
- 用 SVG 渲染（除非元素超过 500 个）
- 在 registry.ts 和 data.ts 各加一行注册
- 不引入任何运行时依赖
- 每帧状态由 update(t) 连续插值，不要为中间态写特例

交付要求：
- 在一个新分支上提交，不要推 main（见 AGENTS.md 第 12.1 节）
- 跑完 AGENTS.md 第 11 节的验收清单，逐条如实勾选
```

---

## 附：关键文件速查

| 想改什么 | 改哪里 |
| --- | --- |
| 配色 | `src/styles/tokens.css` |
| 可视化页的通用样式 | `src/styles/chapters.css` 里的 `.viz*` 段 |
| 进度条行为 | `src/viz/timeline.ts` |
| 外壳布局 | `src/viz/shell.ts` |
| 可视化接口 | `src/viz/types.ts` |
| 注册可视化 | `src/viz/registry.ts` |
| 内容条目 | `src/chapters/data.ts` |
| 路由 | `src/chapters/router.ts` |
| 部署 | `scripts/deploy.sh`（**仅维护者**） |

**提 PR 前**：确认你的分支名符合第 12.1 节的规范，PR 描述里带上了关键帧截图和验收清单。
