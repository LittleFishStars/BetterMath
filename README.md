# BetterMath

数学可视化站点。目前只有首页。

## 首页

- **标题**：`BetterMath`，居中，使用与博客 [MyHomeWeb](../MyHomeWeb) 英文标题同一款手写花体
  **Send Flowers**（`public/fonts/send-flowers-latin.woff2`，自托管，latin 子集 32KB）。
- **背景**：Canvas 上的动态数学符号场 —— 97 个符号分四档（结构符 / 希腊字母 / 关系符 /
  记号），按深度分层做视差、正弦浮动与缓慢漂移，鼠标靠近时轻微排斥。
  屏幕正中做了径向遮罩，符号在那里退到几乎不可见，保证标题可读。

## 运行

```bash
npm install        # 首次
npm run dev        # http://127.0.0.1:5178
npm run build      # tsc --noEmit + vite build
```

> npm 的全局缓存目录在沙箱里是只读的，首次安装若报 `EROFS`，
> 加 `--cache ./.tmp/npm-cache` 把缓存指到工作区内。

## 结构

```
index.html              页面骨架（画布 / 标题 / 页脚）
src/main.ts             入口：挂载符号场、页面隐藏时停帧
src/field/symbols.ts    符号表（按视觉重量分四档）与加权抽样
src/field/SymbolField.ts 符号场渲染器
src/styles/tokens.css   设计令牌（颜色 / 字体 / 动效时长）
src/styles/fonts.css    @font-face
src/styles/home.css     首页布局与动画
public/fonts/           Send Flowers woff2
```

## 设计约定

- 配色为蓝色系：冷白底 `#F7FAFF`，标题渐变「亮蓝 → 靛蓝 → 深海军蓝」，
  背景符号用深蓝墨 `#1B5FA8`。
- 所有用于文字的颜色在底色上对比度 ≥ 4.5:1；标题渐变三段端点分别为
  5.42 / 7.60 / 11.05 —— 渐变字要按**最浅**那段核算，否则左半边不达标。
- 标题字号 `clamp(3rem, min(19vw, 28vh), 17rem)`：`19vw` 让窄屏横向铺到约 86%，
  `28vh` 管住矮窗口。字体里 `BetterMath` 约 4.31em 宽，改字串后要重新核这个系数。
- 单屏不滚动，尺寸一律用 `dvh` 不用 `vh`（移动端地址栏收起时 `vh` 会跳）。

## 降级

- `prefers-reduced-motion: reduce`：只画一帧静态画面，不挂 rAF、不监听指针，入场动画瞬时完成。
- 页面切到后台：停止 rAF，回到前台再续。
- DPR 上限 2（3K 屏按 3 倍画只掉帧，肉眼看不出差别）。
