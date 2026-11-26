/**
 * 背景数学元素场
 *
 * 一个 Canvas 上漂着两类东西：单字符数学符号，和一截截短公式。
 * 都分深度层次（越近越大越快越清楚），缓慢倾斜并做正弦式浮动，
 * 鼠标靠近时轻微排斥，形成柔和的视差感。
 *
 * 不重复：铺屏时从洗好的池子里按顺序发牌（见 ItemBag），
 * 一屏之内不会出现两个相同的符号或公式。
 *
 * 设计约束：
 *   · 纯装饰 —— 容器 aria-hidden，且不接收指针事件，不干扰正文交互
 *   · 尊重 prefers-reduced-motion —— 该偏好下只画一帧静态画面，不挂 rAF
 *   · 页面不可见时停帧，避免后台白烧 CPU
 *   · DPR 上限 2 —— 3K 屏上按 3 倍画只会拖慢帧率，肉眼看不出差别
 */
import { ItemBag } from './ItemBag';
import { ALL_GROUPS, FORMULA_GROUP, between, type FieldGroup } from './symbols';

/** 单个元素的状态 */
interface Glyph {
  /** 归一化坐标（0..1），与画布尺寸解耦，改窗口不用重排 */
  x: number;
  y: number;
  /** 深度 0..1：越大越近，尺寸/速度/清晰度同步放大 */
  depth: number;
  /** 要画的文字：单个符号，或一截公式 */
  text: string;
  /** 多字符的公式要整体压缩，不跟着深度放大，否则会盖住标题 */
  isFormula: boolean;
  /** 相对基准字号的倍率 */
  size: number;
  /** 基础不透明度（还会被深度与中心遮罩再乘一次） */
  alpha: number;
  /** 当前倾角（弧度），限制在小范围内摆动 */
  rotation: number;
  /** 倾角变化速度（弧度/秒） */
  spin: number;
  /** 倾角摆动的中心值：每个元素围绕它左右摇，方向各不相同 */
  rotationHome: number;
  /** 漂移速度（归一化单位/秒） */
  vx: number;
  vy: number;
  /** 浮动相位，让每个元素的正弦节奏错开，避免整片一起律动 */
  phase: number;
  /** 浮动频率（Hz） */
  freq: number;
  /** 浮动幅度（归一化单位） */
  amp: number;
  /** 归一化的横向/纵向边距：中心点不能越过它，否则元素会探出画布 */
  marginX: number;
  marginY: number;
}

/** 字体栈：优先数学衬线字体，让 ∑ ∫ ∂ 这些符号有正确的古典字形 */
const FONT_STACK =
  '"Latin Modern Math", "Cambria Math", "STIX Two Math", "TeX Gyre Pagella", "Noto Serif", "Times New Roman", serif';

/** 符号颜色：深蓝墨，配低不透明度叠在冷白底上 */
const INK = '27, 95, 168';

/**
 * 一屏最多放多少元素。上限同时受两条约束：
 *   · 池子容量 188 —— 超过必然出现重复
 *   · 覆盖率 COVERAGE —— 见 seed 里的说明
 */
const MAX_ITEMS = 188;

/**
 * 涂墨总面积占画布的比例上限。
 *
 * 30% 在桌面宽屏上刚好；窄屏上元素相对更大（基准字号有 20px 下限），
 * 同样的覆盖率会挤得多，所以按画布宽度再乘一个系数。
 */
function coverageLimit(width: number): number {
  // 宽度 ≥ 1000 用 0.3；窄到 400 用 0.14，中间线性过渡。
  // 窄屏上元素相对更大，同样的覆盖率会挤得多。
  const t = Math.min(Math.max((width - 400) / 600, 0), 1);
  return 0.14 + t * 0.16;
}

/** 元素池：符号组按顺序排，公式接在后面 */
const POOL: readonly { group: FieldGroup; text: string }[] = ALL_GROUPS.flatMap(
  (group) => group.items.map((text) => ({ group, text })),
);

/**
 * 把归一化中心坐标夹进 [margin, 1-margin]。
 * 元素比画布还大时区间会反向，这时直接放到正中。
 */
function clampCenter(value: number, margin: number): number {
  if (margin >= 0.5) return 0.5;
  return Math.min(Math.max(value, margin), 1 - margin);
}

export interface SymbolFieldOptions {
  /** 画布元素 */
  canvas: HTMLCanvasElement;
}

export class SymbolField {
  /**
   * 画布四周留白。
   * 取 28 而不是 10：元素还会按 amp 浮动、按 ±16° 倾斜，
   * 留白太小的话墨迹仍然会蹭到视口边缘，被裁掉一半。
   */
  private static readonly PAD = 28;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private glyphs: Glyph[] = [];
  /** 发牌器：整个实例共用，重铺时继续从上一轮的位置往下发，跨轮也不重样 */
  private readonly bag = new ItemBag(POOL);

  private width = 0;
  private height = 0;
  private baseSize = 24;

  /** 指针在归一化坐标里的位置，理想状态由 lerp 逼近，形成拖尾感 */
  private pointer = { x: 0.5, y: 0.5 };
  private pointerSmooth = { x: 0.5, y: 0.5 };
  private hasPointer = false;

  private rafId = 0;
  private lastTime = 0;
  private running = false;

  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;

  constructor({ canvas }: SymbolFieldOptions) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('无法获取 2D 绘图上下文');
    this.canvas = canvas;
    this.ctx = ctx;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resizeObserver = new ResizeObserver(() => this.measure());

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.tick = this.tick.bind(this);
  }

  /** 启动：测量尺寸、铺元素、按偏好决定画画还是静止 */
  start(): void {
    this.measure();
    this.resizeObserver.observe(this.canvas);
    document.addEventListener('visibilitychange', this.handleVisibility);

    if (this.reducedMotion) {
      // 静态版本：不监听指针也不跑 rAF，只留一帧画面
      this.drawFrame(0);
      return;
    }

    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** 停止并清理所有副作用 */
  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  /* ── 尺寸与重新铺元素 ─────────────────────────────── */

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // 之后所有绘制都用 CSS 像素坐标，DPR 缩放交给变换矩阵
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 基准字号跟短边走：窄屏上元素变小变多，宽屏上少而大。
    // 下限 20px：手机上短边 390 * 0.042 只有 16px，符号会小到看不清。
    // 上限按短边比例收紧：大符号组最大 2.5 倍，52 * 2.5 = 130px，
    // 在 390 宽的手机上就占去三分之一屏，看着像糊了个大 Π 上去。
    const shortSide = Math.min(width, height);
    this.baseSize = Math.min(Math.max(shortSide * 0.042, 20), shortSide * 0.075, 52);

    this.seed(this.glyphs);

    if (this.reducedMotion) this.drawFrame(0);
  }

  /**
   * 铺元素。上一批尽量复用（保住已经漂到的位置与速度），
   * 这样拖动窗口不会让画面全部重掷一遍、出现闪烁；
   * 需要多出来的时候才从发牌器里取新的，且新取的必然与现有不重样。
   */
  private seed(previous: Glyph[]): void {
    const next: Glyph[] = [];
    // 已占用的涂墨面积（CSS 像素²），用来控制整屏密度
    let covered = 0;

    // 目标个数：面积靠小元素填，所以个数和覆盖率一起用
    const area = this.width * this.height;
    const targetCount = Math.round(Math.min(Math.max(area / 7500, 72), MAX_ITEMS));

    for (let i = 0; i < targetCount; i += 1) {
      const old = previous[i];
      if (old) {
        const ext = this.halfExtent(old);
        covered += ext.x * 2 * ext.y * 2;
        next.push(old);
        continue;
      }

      // 连续 6 次都找不到空地才认为这一屏真的满了
      let glyph: Glyph | null = null;
      for (let retry = 0; retry < 6 && !glyph; retry += 1) {
        glyph = this.placeGlyph(next);
      }
      if (!glyph) break;

      // 按实际占位面积决定还要不要加。
      //
      // 早先按「画布面积 / 固定值」算个数，结果公式一多就糊 —— 一条
      // `ρ = Cov(X,Y)/(σₓσᵧ)` 的包围盒顶得上二十个 `λ`，同样的个数，
      // 覆盖率能差出两倍。这里再补一道覆盖率上限，超过就停手，
      // 保证不管公式占多大比例，整屏的「墨量」都是稳的。
      const ext = this.halfExtent(glyph);
      if (covered + ext.x * 2 * ext.y * 2 > area * coverageLimit(this.width)) break;

      covered += ext.x * 2 * ext.y * 2;
      next.push(glyph);
    }

    this.glyphs = next;
  }

  /** 字号：深度越大越靠近镜头，画得越大 */
  private fontSizeOf(g: Glyph): number {
    // 公式的深度缩放比符号缓：符号靠尺寸差异拉出景深，
    // 公式本来就窄，再按深度压小会有一半彻底糊掉。
    const depthFactor = g.isFormula ? 0.72 + g.depth * 0.42 : 0.55 + g.depth * 0.9;
    return this.baseSize * g.size * depthFactor;
  }

  /**
   * 元素的半宽与半高（CSS 像素）。直接问 canvas 要实际宽度，不做字符数估算 ——
   * 公式里 `i` 和 `W` 的宽度差一倍，估算会让碰撞盒和真实墨迹差出半行。
   *
   * 调用前要先设好 ctx.font，因为测宽依赖字体。
   */
  private halfExtent(g: Glyph): { x: number; y: number } {
    const fontSize = this.fontSizeOf(g);
    // 显式把 letterSpacing 归零再测量。
    //
    // 这个坑很隐蔽：CanvasRenderingContext2D.letterSpacing 是**上下文状态**，
    // 一旦被设过就跟着 ctx 走。渲染时若残留一个非零值，实测宽度会比
    // measureText 量出来的大一截 —— 一条 Cov(X,Y) 公式能量出 637 和 1226
    // 两个值，碰撞盒只有真实宽度的一半，元素自然叠在一起。
    this.ctx.letterSpacing = '0px';
    this.ctx.font = `${fontSize.toFixed(1)}px ${FONT_STACK}`;
    const w = this.ctx.measureText(g.text).width;
    const h = fontSize * 1.1;

    // 旋转后的轴对齐包围盒：w' = |w·cosθ| + |h·sinθ|，h' = |w·sinθ| + |h·cosθ|。
    // θ 取 rotationHome —— 它本身就是「元素会倾斜到的最大角度」（±0.28），
    // 摆动只是在这个中心附近小幅晃，不需要再加裕量。
    const theta = Math.min(Math.abs(g.rotationHome), Math.PI / 2);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return {
      x: (w * cos + h * sin) / 2,
      y: (w * sin + h * cos) / 2,
    };
  }

  /**
   * 摆一个元素：随机位置试到不挤为止，试不出来就缩字号再来一轮。
   *
   * 顺序是：先定尺寸 → 再在合法区间里随机 → 判拥挤。
   * 区间由 marginX/marginY 决定，保证取到的位置不需要再夹紧 ——
   * 先夹后判的话，夹紧会把坐标推到边缘、推到别人身上，
   * 判定通过了但最终位置是错的。
   */
  private placeGlyph(placed: Glyph[]): Glyph | null {
    const candidate = this.createGlyph();

    // 先定尺寸：装不下的要缩，尺寸定了边距和可落点区间才成立
    this.fitSize(candidate);

    for (let round = 0; round < 5; round += 1) {
      const spanX = Math.max(1 - candidate.marginX * 2, 0);
      const spanY = Math.max(1 - candidate.marginY * 2, 0);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        candidate.x = candidate.marginX + Math.random() * spanX;
        candidate.y = candidate.marginY + Math.random() * spanY;

        // 别落在正文中央：标题与副标题占了中间一大块，
        // 元素飘到那里虽然会被中心遮罩压淡，但遮罩只按半径算，
        // 长公式的两端仍会露在标题左右，看着像压在字上。
        if (this.inTextZone(candidate)) continue;

        if (!placed.some((other) => this.isCrowded(candidate, other))) return candidate;
      }

      // 缩字号重来：尺寸变了，边距与可落点区间都要重算
      candidate.size *= 0.82;
      this.fitSize(candidate);
    }

    // 挤不下就返回 null，让调用方换一个条目再试，
    // 而不是把重叠的元素硬塞进去
    return null;
  }

  /**
   * 是否落在正文区（标题 + 副标题）里。
   *
   * 正文区是屏幕中部一块椭圆形的安全区：标题的花体字向左右伸得很开，
   * 元素哪怕只露个边，也会在视觉上「贴着标题」。
   * 判定用归一化坐标，包含元素自身的半宽半高，所以长公式更容易被挡在外面。
   */
  private inTextZone(g: Glyph): boolean {
    const ext = this.halfExtent(g);
    // 标题区中心在屏幕中央略偏上（hero 有 translateY(-2.5vh)）
    const cx = 0.5;
    const cy = 0.46;
    // 安全区半径：横向要盖住标题的宽度（花体 BetterMath 约占 78% 屏宽）
    const rx = 0.5;
    const ry = 0.2;

    // 用元素边缘到中心的归一化距离判：元素越大，允许的中心点离得越远
    const halfX = ext.x / this.width;
    const halfY = ext.y / this.height;
    const dx = Math.abs(g.x - cx) / (rx + halfX);
    const dy = Math.abs(g.y - cy) / (ry + halfY);
    if (dx * dx + dy * dy < 1) return true;

    // 页脚区也要让开：底部那行小字是页面的一部分，
    // 元素压上去会盖住它，而且页脚本身没有任何遮罩保护。
    const footerTop = 1 - 0.12;
    return g.y + halfY > footerTop;
  }

  /**
   * 两个元素是否「太挤」。
   *
   * 判据按**渲染时能到达的最坏位置**算，而不是按当前静态位置：
   * 元素每帧在 ±amp 内浮动、还绕 rotationHome 倾斜，只按静态位置判的话，
   * 铺排时算好不重叠，动起来就撞上。
   *
   * 判定线是「包围盒相切」，不留重叠容忍 —— 早先给过 8% 的容忍，
   * 自检仍报几十对重叠：那点搭接在屏幕上就是两个公式的首尾压在一起。
   *
   * 这个函数同时被摆放（placeGlyph）与开发期自检（selfCheck）使用，
   * 两边共用一套判据，不会出现「摆放认为没问题、自检认为有问题」。
   */
  private isCrowded(a: Glyph, b: Glyph): boolean {
    const ea = this.halfExtent(a);
    const eb = this.halfExtent(b);

    // 浮动余量（归一化 → 像素）。
    //
    // 注意 x 用 width、y 用 height 换算：amp 是归一化单位，
    // 同一个 amp 在 1440 宽和 390 宽上对应的像素差近 4 倍，
    // 只按一方换算会让窄屏上的余量严重不足。
    const swingA = a.amp * (a.isFormula ? 0.6 : 1);
    const swingB = b.amp * (b.isFormula ? 0.6 : 1);
    const swingX = (swingA + swingB) * this.width;
    const swingY = (swingA + swingB) * this.height;

    // 视觉留白：按两个元素中较小者的字高取一定比例，并设下限。
    // 纯几何相切在屏幕上仍然像「贴在一起」，倾斜后笔画还会探出包围盒。
    // 公式留得更多：它是一条长文字，横向压上去必然叠字。
    const anyFormula = a.isFormula || b.isFormula;
    const clear = Math.max(Math.min(ea.y, eb.y) * (anyFormula ? 0.34 : 0.22), 6);

    const spaceX = Math.abs(a.x - b.x) * this.width - (ea.x + eb.x) - swingX - clear;
    const spaceY = Math.abs(a.y - b.y) * this.height - (ea.y + eb.y) - swingY - clear;

    // 任一轴留出空隙就不算挤
    return spaceX < 0 && spaceY < 0;
  }

  /**
   * 只负责尺寸：装不下就把字号缩到装得下，并算出归一化边距存回元素。
   *
   * 拆成独立一步是为了顺序正确 —— 位置必须在尺寸定下来之后再夹，
   * 否则「先缩字号、后按旧边距夹位置」会失效。
   */
  private fitSize(g: Glyph): void {
    const pad = SymbolField.PAD;

    // 左右、上下两个方向都要判：横屏手机上高度比宽度更紧，
    // 只判宽度会漏掉竖向溢出。
    for (let i = 0; i < 4; i += 1) {
      const ext = this.halfExtent(g);
      const overX = ext.x * 2 + pad * 2 > this.width;
      const overY = ext.y * 2 + pad * 2 > this.height;
      if (!overX && !overY) break;

      const fitX = this.width / (ext.x * 2 + pad * 2);
      const fitY = this.height / (ext.y * 2 + pad * 2);
      g.size *= Math.max(Math.min(fitX, fitY) * 0.98, 0.35);
    }

    // 存下归一化边距：update 里每帧都要用它夹边界，
    // 比每帧重新 measureText 便宜得多（测量会触发排版）。
    //
    // 边距里要把浮动幅度算进去：元素每帧在 ±amp 内上下摆，
    // 只按静态尺寸留边的话，贴边的元素会被 clamp 一遍遍压回同一条线，
    // 一排元素全挤到 y = marginY 上叠成一团。
    const ext = this.halfExtent(g);
    const swing = g.amp * (g.isFormula ? 0.6 : 1);
    g.marginX = Math.min((ext.x + pad) / this.width + swing, 0.5);
    g.marginY = Math.min((ext.y + pad) / this.height + swing, 0.5);
  }

  private createGlyph(): Glyph {
    const { group, text } = this.bag.draw();
    const depth = 0.18 + Math.random() * 0.82;
    const rotationHome = (Math.random() - 0.5) * 0.56;

    // 深度越大速度越快：近处物体在视差里移动更明显
    const speed = 0.004 + depth * 0.012;

    const glyph: Glyph = {
      x: Math.random(),
      y: Math.random(),
      depth,
      text,
      isFormula: group === FORMULA_GROUP,
      size: between(group.scale, Math.random()),
      alpha: between(group.alpha, Math.random()),
      // 倾角只在 ±0.28 弧度（约 ±16°）内摆动。
      // 早先是 360° 随机旋转，结果 ∏、Σ 这些符号经常倒着朝上，
      // 在背景里反而像乱码；小角度倾斜既保留了「浮动感」又保证认得出。
      // 公式用更小的角度：整行文字一歪就很明显，也影响阅读。
      rotation: group === FORMULA_GROUP ? rotationHome * 0.4 : rotationHome,
      rotationHome: group === FORMULA_GROUP ? rotationHome * 0.4 : rotationHome,
      spin: (Math.random() - 0.52) * 0.1,
      vx: (Math.random() - 0.5) * speed,
      vy: -speed * (0.35 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      freq: 0.06 + Math.random() * 0.16,
      amp: 0.004 + Math.random() * 0.012,
      marginX: 0,
      marginY: 0,
    };

    return glyph;
  }

  /* ── 动画循环 ─────────────────────────────────────── */

  private tick(now: number): void {
    if (!this.running) return;
    // 后台回来时 dt 可能是几秒，夹一下防止元素瞬移
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt, now / 1000);
    this.drawFrame(now / 1000);

    this.rafId = requestAnimationFrame(this.tick);
  }

  private update(dt: number, time: number): void {
    // 指针平滑：0.06 的系数在 60fps 下约 0.27s 跟上，够软但不迟钝
    this.pointerSmooth.x += (this.pointer.x - this.pointerSmooth.x) * 0.06;
    this.pointerSmooth.y += (this.pointer.y - this.pointerSmooth.y) * 0.06;

    const px = this.pointerSmooth.x;
    const py = this.pointerSmooth.y;

    for (const g of this.glyphs) {
      // 位置只做正弦浮动，不做匀速漂移。
      //
      // 这一条是踩过坑的：一开始每个元素有自己的速度，会一路漂过屏幕。
      // 拒绝采样只保证**初始**位置不重叠，元素漂几十秒后必然相交 ——
      // 实测 152 个元素里有 45 对叠在一起，长的公式会压住别的符号。
      // 改成纯浮动后，位置只在初始点附近小幅摆动（最多约 14px），
      // 初始不重叠就基本一直不重叠。动感由浮动 + 倾斜 + 视差 + 指针排斥提供，
      // 视觉上并没有变呆板，反而更像「安静的背景」而不是「漂走的碎片」。
      const bob = Math.sin(time * g.freq * Math.PI * 2 + g.phase);
      const side = Math.cos(time * g.freq * Math.PI * 1.3 + g.phase * 1.7);

      // 浮动幅度按元素自身尺寸打折：公式面积大，同样的 12px 位移在它身上
      // 更容易蹭到邻居，所以按尺寸压一下。
      const swingScale = g.isFormula ? 0.6 : 1;
      let x = g.x + side * g.amp * swingScale;
      let y = g.y + bob * g.amp * swingScale;

      // 指针排斥：距离小于 0.22 时向外推，越深层的推得越明显。
      // 这是位移不是速度，松开指针后会自然回到原位。
      //
      // 必须判 hasPointer：指针一次都没动过时 pointer 停在初始值 (0.5, 0.5)，
      // 不判的话屏幕正中会有一个「幽灵指针」，把中心附近的元素推开
      // 最多 force*width ≈ 37px —— 铺排时算好不重叠，动起来就叠上了。
      let pushX = 0;
      let pushY = 0;
      if (this.hasPointer) {
        const dx = x - px;
        const dy = y - py;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.22 && dist > 0.0001) {
          const force = (1 - dist / 0.22) ** 2 * 0.026 * (0.3 + g.depth);
          pushX = (dx / dist) * force;
          pushY = (dy / dist) * force;
        }
      }

      // 夹到画布内：浮动的偏移量也要算进去，否则贴边的元素会探出去
      g.x = clampCenter(x + pushX, g.marginX);
      g.y = clampCenter(y + pushY, g.marginY);

      // 绕 home 摆动而不是无界累加：累加迟早会转成倒立
      g.rotation += g.spin * dt * 3;
      g.rotation += (g.rotationHome - g.rotation) * Math.min(dt * 1.6, 1);
    }
  }

  private drawFrame(time: number): void {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    // 视差偏移：整层按指针位置反向轻移，深度越大移得越多
    // 指针没出现过时保持正中，避免某些环境把 (0,0) 当成角落指针
    const anchorX = this.hasPointer ? this.pointerSmooth.x : 0.5;
    const anchorY = this.hasPointer ? this.pointerSmooth.y : 0.5;
    const parallaxX = (anchorX - 0.5) * -26;
    const parallaxY = (anchorY - 0.5) * -26;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const g of this.glyphs) {
      const fontSize = this.fontSizeOf(g);
      // 位置已由 update 算好（含浮动与指针排斥），这里只叠加视差
      const x = g.x * width + parallaxX * g.depth;
      const y = g.y * height + parallaxY * g.depth;

      // 中心遮罩：屏幕正中（标题所在）让元素退到几乎看不见，保证标题可读
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;
      const radial = Math.hypot(nx, ny * 1.15);
      const mask = Math.min(Math.max((radial - 0.12) / 0.72, 0), 1);
      if (mask <= 0.02) continue;

      // 呼吸：极慢的正弦微调，避免画面完全静止
      const breathe = 0.82 + 0.18 * Math.sin(time * 0.5 + g.phase);
      // 1.25 是整体亮度增益：原始 alpha 落在 0.05 一档，压在浅底上几乎看不见，
      // 提升后才有「背景元素」的存在感，又不至于抢标题
      const alpha = Math.min(g.alpha * mask * breathe * (0.4 + g.depth * 0.6) * 1.25, 1);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g.rotation);
      // 与 halfExtent 保持同一套度量：letterSpacing 归零，字距交给字体本身
      ctx.letterSpacing = '0px';
      ctx.font = `${fontSize.toFixed(1)}px ${FONT_STACK}`;
      ctx.fillStyle = `rgba(${INK}, ${alpha.toFixed(3)})`;
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    }
  }

  /* ── 事件 ─────────────────────────────────────────── */

  private handlePointerMove(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.pointer.x = (event.clientX - rect.left) / rect.width;
    this.pointer.y = (event.clientY - rect.top) / rect.height;
    this.hasPointer = true;
  }

  private handleVisibility(): void {
    if (this.reducedMotion) return;

    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.rafId);
      return;
    }

    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }
}
