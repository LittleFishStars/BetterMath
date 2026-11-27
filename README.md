# BetterMath

数学可视化站点。目前只有首页。

## 首屏加载页

样式表是在 JS 里 `import` 的（开发模式下 Vite 注入 `<style>`，生产构建才提取成
`<link>`）。在它到位之前浏览器会先画出裸 HTML —— 标题变成默认字体、按钮露出
边框、布局全乱，也就是 FOUC。

处理办法：`index.html` 里放一段**内联**关键样式 + 一个纯 CSS 圆环加载页
（`#boot`），盖住还没样式的正文。`dismissBoot()` 在 `bootstrap()` 结束后
淡出并移除它。

三个细节：

1. **等两帧再淡出**。样式是 JS 注入的，`bootstrap()` 跑完只说明 CSS 已在 DOM 里，
   必须再等两帧确保浏览器用新样式重绘过，否则淡出时会露出旧样式。
2. **字体最多等 250ms**。等太久加载页显得拖沓；`font-display: swap` 保证字体
   迟到也只是平滑替换，不会缺字。
3. **至少显示 200ms + 8 秒兜底**。前者避免缓存命中时一帧就撤掉、看着像闪屏；
   后者是内联脚本，万一是 JS 加载失败也不会永远白屏。

实测（生产构建）：加载页在 DOMContentLoaded 后约 400ms 消失，
比开发模式（2s 左右，模块多）快得多。

## 页面

- 主页 `/`：标题、按钮、页脚
- 章节页 `/chapters`：17 个章节分「代数 / 分析 / 几何 / 其他」四类

## 首页

- **按钮**：标题下方那行字默认是「数学可视化」，外观与原副标题完全一致，
  外面笼着一圈**呼吸光晕**（4 秒一轮，明暗与模糊半径同步起伏）暗示可点击；
  悬停（或键盘聚焦）时从**下边缘中点**扩散一个圆，扫过之处把文字换成「开始探索」。
- **标题**：`BetterMath`，居中，使用与博客 [MyHomeWeb](../MyHomeWeb) 英文标题同一款手写花体
  **Send Flowers**（`public/fonts/send-flowers-latin.woff2`，自托管，latin 子集 32KB）。
- **背景**：Canvas 上的动态数学元素场，混排两类内容——
  - 单字符符号 129 个，分四档（结构符 / 希腊字母 / 关系符 / 记号）
  - 短公式 59 条（`E = mc²`、`cos²θ + sin²θ = 1`、`∮ F·dr` 等）
  
  按深度分层做视差、正弦浮动与小角度倾斜，鼠标靠近时轻微排斥。
  两者合计 188 项。铺屏时从洗好的池子里**无放回抽样**，一屏之内不会出现两个相同的元素。

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

## 章节页

转场只做淡入淡出，**不做跨元素的位移动画**：主页整体淡出（340ms）、
液态玻璃 header 从顶部滑下（560ms）、章节内容淡入并轻微上浮（420ms）。
状态全靠 class 切换（`.is-shown` / `.is-revealed` / `.is-leaving`），
由 CSS transition 驱动，不用 WAAPI。

> 早先做过「标题克隆出来缩小飞进 header」的动画，调了五六轮：
> 时长太短、缓动太陡、落点飞出视口、克隆被提前移除。每处都是新的
> 出错机会，而收益只是一秒多的效果。这层不确定性得不偿失，已移除。
>
> 如果以后要恢复类似的跨元素动画，记住两个坑：
> 1. 别依赖 `animation.finished` —— 动画被取消时它会提前 resolve，
>    紧随其后的 `clone.remove()` 会把还在半路的元素抹掉。
> 2. 量目标位置时目标必须处于**最终位置**。header 收起在 `translateY(-100%)`
>    时去量标题落点，拿到的是屏幕外的负坐标。
>
> 还有个 CSS 陷阱：元素从 `display:none` 变可见的同一帧里加过渡 class，
> 浏览器不会执行过渡（没有起始状态可插值）。必须先等一帧再加 class。

**header 是液态玻璃**：`backdrop-filter: blur(12px) saturate(180%)` 加内侧
高光与一条缓慢横扫的镜面反光。滚动后玻璃变实（`is-scrolled`），压得住下面的卡片。

**章节**：代数 2（高等代数、抽象代数）· 分析 8（数学分析、实变函数、复变函数、
泛函分析、常微分方程、偏微分方程、概率论、数理统计）· 几何 3（解析几何、
高等几何、微分几何）· 其他 4（数值分析、离散数学、高中数学、大学物理）。

**「敬请期待」标签**：详情页还没做的章节，卡片左下角挂一枚标签。
由 `Chapter.ready` 驱动 —— 缺省（不写）就是「还没做」，做完某章回来加一行
`ready: true` 即可，标签、`role="article"`、`cursor: default`、
`aria-label` 上的「（敬请期待）」四处会一起跟着变。目前 17 章都还没做详情页，
所以全都带标签。

**卡片**：毛玻璃底 + 右下角内联 SVG 代表图形 + 悬停 3D 倾斜。
倾斜由 `pointermove` 写 CSS 变量（`--tilt-x/--tilt-y/--glare-x/--glare-y`）驱动，
一帧只写一次（`requestAnimationFrame` 合帧），transform 与反光全交给 CSS 消费。
倾斜方向与鼠标位置相反，视觉上才是「往鼠标那侧倒」而不是翘起来。

### 一个真实的性能坑

卡片最初每张都挂 `backdrop-filter: blur(14px)`。13 张卡各带一个模糊，
**帧率从 40 掉到 11** —— 每个 `backdrop-filter` 都要独立采样背景再算模糊，
而且每张卡背后的内容不同，没法共享。把模糊半径从 14 降到 6 也没用
（开销在采样次数，不在半径）。

改法是卡片不再用 `backdrop-filter`，改用高不透明度白 + 内层渐变模拟同样的观感；
玻璃感主要靠内侧高光与反光层撑。header 只保留**一个** `backdrop-filter`（它是视觉焦点），
半径从 20 降到 12。另外切到章节页时背景符号场降到半密度。

结果：章节页 11 → 31 fps（headless 环境，基线 61）。

## 圆形擦除的实现

按钮里叠了**两层文字**，各自被互补的圆形遮罩裁切：

```css
/* 「数学可视化」：圆外可见 */
mask-image: radial-gradient(circle at 50% 100%,
  #0000 var(--reveal), #000 calc(var(--reveal) + 1px));

/* 「开始探索」：圆内可见（与上面互补，交界处留 1px 压锯齿） */
mask-image: radial-gradient(circle at 50% 100%,
  #000 var(--reveal), #0000 calc(var(--reveal) + 1px));
```

`--reveal` 是半径，0% → 105%，圆的圆心固定在下边缘中点（`at 50% 100%`）。
任何时刻只有一层可见，所以不会出现两层文字叠着、笔画打架。

有两处不显眼但必须这么做：

1. **`@property` 要 `inherits: true`**。自定义属性默认不能过渡，得注册成
   `<percentage>` 才能动画；而遮罩写在子元素上、变量定义在按钮上，
   若声明成 `inherits: false`，子元素读到的永远是初始值 0%，圆根本不长。
2. **两层文字要等宽**。「开始探索」4 个字比「数学可视化」5 个字窄，
   宽度不一时圆扫过去是新旧字互相穿插（实测看起来像「数[f 始 探 化」）。
   把新文字的字距调到 0.61em，两段总宽都是约 118px，边界才是整齐推开。

### 呼吸光晕

光晕是**独立的一层**（`.hero__cta__halo`），与「数学可视化」同文同位，
文字本身 `color: transparent`，全靠 `text-shadow` 撑出光来。

三点讲究：

1. **用 `text-shadow` 而不是 `outline`/`box-shadow`**。按钮没有边框和背景，
   光要贴着笔画走；描边类方案会画出一个跟文字形状不符的方框。
2. **光晕不参与那对圆形遮罩**。遮罩会把光晕一起切，扫过时边缘变成一条
   硬线而不是柔和的晕 —— 所以它是单独的第三层。
3. **淡出用 `animation` 而不是 `transition`**。呼吸动画已经接管了 `opacity`，
   `transition` 改不动它；悬停时改用一条 `bm-cta-fade-out` 动画才生效。

光晕与文字的宽度差实测为 0px（`letter-spacing`/`text-indent` 显式跟随按钮）。

按钮还有几条行为约束：`:hover` 只在 `(hover: hover) and (pointer: fine)`
的设备启用（触屏上 `:hover` 会粘住不还原）；`:focus-visible` 触发同样的效果，
否则键盘用户看不到任何状态；`prefers-reduced-motion` 下不做过渡、直接切换，
光晕也不呼吸。

## 为什么背景不响应鼠标

早期版本做了指针视差与排斥，问题有两个：

1. 指针一次都没动过时，位置初值是 `(0.5, 0.5)`，屏幕正中就成了一个
   「幽灵排斥源」，把中心附近的元素永久推开几十像素 —— 铺排时算好的
   不重叠，动起来就叠上了。
2. 视差让每层的位移量随指针变化，等于给「不重叠」加了一个随时变动的变量，
   很难静态验证。

现在背景完全静止于鼠标：没有 `pointermove` 监听，位置只由正弦相位决定。

## 空间约束

元素摆放要同时满足四件事，缺一个画面就会「糊」：

1. **不重叠** —— 按渲染时能到达的最坏位置（浮动到最远 + 倾斜到最大角）判定，
   而不是按静态位置。判据是包围盒相切再加一层视觉留白，公式留白比符号多。
2. **不重复** —— `ItemBag` 洗牌后按顺序发牌，抽完一整轮才重洗。
3. **不出界** —— 每个元素的 `marginX/marginY` 存了含浮动幅度的归一化边距，
   采样区间直接由它推导，取到的位置不需要再夹紧（先夹后判会把元素推到别人身上）。

另外位置分两份存：`x/y` 是**基准**，只在铺排时改动；`rx/ry` 是当前帧的
渲染位置（基准 + 浮动偏移）。早先直接往 `x/y` 上累加浮动量，元素会一路
飘到边界才停 —— 看起来像匀速漂移，不是「小幅呼吸」。
4. **不压正文** —— 标题区是椭圆禁区、页脚区是矩形禁区，元素不会摆到那里。

密度按**涂墨总面积**控制而不是个数：一条 `ρ = Cov(X,Y)/(σₓσᵧ)` 的包围盒
顶得上二十个 `λ`，按个数算会让公式一多就糊。上限还随画布宽度变化，
窄屏（元素相对更大）允许的覆盖率更低。

## 降级

- `prefers-reduced-motion: reduce`：只画一帧静态画面，不挂 rAF、不监听指针，入场动画瞬时完成。
- 页面切到后台：停止 rAF，回到前台再续。
- DPR 上限 2（3K 屏按 3 倍画只掉帧，肉眼看不出差别）。

## 部署

线上地址 **[math.ylxc.top](https://math.ylxc.top/)**，跑在 YlxcServer（与博客同一台机器，
Cloudflare → Caddy 回源）。

### 发布

```bash
bash scripts/deploy.sh    # 构建 → 产物闸门 → rsync --delete → 源站健康检查
```

服务器上的 self-hosted runner 已于 2026-11-27 撤除（省约 100 MB 常驻内存），
现在只有本地手动这一条路径。

### 服务器侧布局

| 项 | 位置 |
| --- | --- |
| docroot | `/var/www/bettermath`，属主 `root:www-data`（Caddy 读） |
| Caddy 站点 | `/etc/caddy/sites/41-math.caddy`，仓库内副本见 [deploy/41-math.caddy](deploy/41-math.caddy) |
| 证书 | `/etc/nginx/ssl/math.{fullchain.crt,key}`（路径沿用旧目录名），acme.sh DNS-01 自动续期 |
| 日志 | `/var/log/caddy/access.log` |

### 几条约定

- **独立 docroot，不塞进博客目录**。博客由 CI 用 `rsync --delete` 发布，
  `/root/Web/MyHomeWeb/` 里放任何额外文件都会在下次博客部署时被删掉。
- `index.html` 一律 `Cache-Control: no-cache`；`/assets/`（Vite 内容哈希文件名）与
  `/fonts/` 走 `immutable` 长缓存。改字体文件必须换文件名，否则浏览器会一直用旧的。
- **前端是 SPA，必须回落 `index.html`**。`/` 和 `/chapters` 都是 History API 路由，
  文件系统里没有对应文件。Caddy 里用「带扩展名走 file_server，其余 rewrite 到
  index.html」两段 handle 实现 —— 这样 `/chapters` 能正常打开，而缺失的
  `/assets/xxx.js` 仍然老实返回 404（若一并回落到 HTML，浏览器会拿一份 HTML
  当 JS 解析，报语法错误且极难定位）。
  > 这条是踩过的坑：最初配置写的是「单页站点，不存在的路径就该 404」，
  > 站点只有主页时没问题，加了章节页后直接访问/刷新 `/chapters` 就 404。
- 改 Caddy 配置：先改 `deploy/41-math.caddy`，传到服务器后
  `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`。
  备份文件不要用 `.caddy` 结尾（`import sites/*.caddy` 会把它一起加载）。
- 验证要看源站：`curl --resolve math.ylxc.top:443:47.106.212.155`，
  `openssl s_client -servername` 期望 `CN=math.ylxc.top`
  （直连 Cloudflare 看到的是边缘证书 `CN=ylxc.top`，不算数）。

- 验证要看源站：`curl --resolve math.ylxc.top:443:47.106.212.155`，`openssl s_client -servername`
  期望 `CN=math.ylxc.top`（直连 Cloudflare 看到的是边缘证书 `CN=ylxc.top`，不算数）。
