# BetterMath

数学可视化站点。目前只有首页。

## 首页

- **按钮**：标题下方那行字默认是「数学可视化」，外观与原副标题完全一致；
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

按钮还有几条行为约束：`:hover` 只在 `(hover: hover) and (pointer: fine)`
的设备启用（触屏上 `:hover` 会粘住不还原）；`:focus-visible` 触发同样的效果，
否则键盘用户看不到任何状态；`prefers-reduced-motion` 下不做过渡、直接切换。

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

线上地址 **[math.ylxc.top](https://math.ylxc.top/)**，跑在 YlxcServer（与博客同一台机器、同一套
Cloudflare → nginx 回源），方式是「本地构建 + rsync 镜像」：

```bash
bash scripts/deploy.sh          # 构建 → 产物闸门 → rsync --delete → 源站健康检查
```

服务器侧布局：

| 项 | 位置 |
| --- | --- |
| docroot | `/var/www/bettermath`（`root:www-data`，脚本里 `--chmod=D755,F644`） |
| nginx 站点 | `/etc/nginx/sites-available/math.ylxc.top`，仓库内副本见 [deploy/math.ylxc.top](deploy/math.ylxc.top) |
| 证书 | `/etc/nginx/ssl/math.{fullchain.crt,key}`，acme.sh DNS-01（`dns_cf`, EC-256），自动续期 |

几条约定：

- **独立 docroot，不塞进博客目录**。博客由 CI 用 `rsync --delete` 发布，`/root/Web/MyHomeWeb/`
  里放任何额外文件都会在下次博客部署时被删掉。
- `index.html` 一律 `Cache-Control: no-cache`；`/assets/`（Vite 内容哈希文件名）与 `/fonts/`
  走 `immutable` 长缓存。改字体文件必须换文件名，否则浏览器会一直用旧的。
- 站点没有 SPA 路由，未知路径 `=404`，不要改成回落到 `index.html`。
- 改 nginx 配置：先改 `deploy/math.ylxc.top`，拷到服务器 `sites-available` 后 `nginx -t && systemctl reload nginx`；
  **备份文件不要留在 `sites-available`**（nginx-ui 会当成站点导入），挪到 `/root/nginx-backups/`。
  新增站点后需 `systemctl restart nginx-ui` 才会出现在面板里。
- 验证要看源站：`curl --resolve math.ylxc.top:443:47.106.212.155`，`openssl s_client -servername`
  期望 `CN=math.ylxc.top`（直连 Cloudflare 看到的是边缘证书 `CN=ylxc.top`，不算数）。
