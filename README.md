# BetterMath

一个数学可视化静态站。零后端、纯静态产物，部署在 [math.ylxc.top](https://math.ylxc.top/)。

目前有一个可视化：**定积分与黎曼和**——五幕演示「矩形怎么一步步逼近曲线下的面积」。

## 页面

| 路径 | 内容 |
| --- | --- |
| `/` | 首页：手写花体标题 + Canvas 数学符号场 |
| `/chapters` | 17 个章节，分代数 / 分析 / 几何 / 其他 |
| `/chapters/<id>` | 章节内容列表 |
| `/chapters/<id>/<slug>` | 可视化页 |

## 技术栈

| 项 | 值 |
| --- | --- |
| 构建 | Vite 7 |
| 语言 | TypeScript 5（`strict`） |
| 框架 | **无**（不引 React/Vue，手写 DOM） |
| 运行时依赖 | **1**（只有 KaTeX，按需加载） |
| 样式 | 原生 CSS + 设计令牌 |
| 路由 | 手写 History API |

## 运行

```bash
npm install --cache ./.tmp/npm-cache   # 缓存目录需指到工作区内
npm run dev                            # http://127.0.0.1:5178
npm run build                          # tsc --noEmit && vite build
```

## 部署

```bash
bash scripts/deploy.sh    # 构建 → 产物闸门 → rsync --delete → 源站健康检查
```

服务器侧布局与配置约定见 [deploy/41-math.caddy](deploy/41-math.caddy)。

## 想加一个可视化？

读 [AGENTS.md](./AGENTS.md)。它写了框架用法、配色与动效规范、五幕叙事结构，
以及一批实际踩过的坑——比这里的简介重要得多。

## 结构

```
src/main.ts               入口：路由接线、视图切换
src/chapters/             章节数据、渲染、路由、转场
src/viz/                  可视化框架（外壳、进度条、SVG 工具、注册表）
src/viz/riemann/          参考实现：定积分与黎曼和
src/viz/integrability/    函数可积的定义，以及两种不可积的反例
src/field/                首页背景的符号场（Canvas）
src/styles/               设计令牌、字体、页面样式
public/fonts/             Send Flowers 手写花体（自托管，latin 子集 32KB）
```
