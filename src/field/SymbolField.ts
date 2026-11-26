/**
 * 背景数学符号场
 *
 * 一个 Canvas 上漂着一群数学符号：分深度层次（越近越大越快越清楚），
 * 缓慢自转并做正弦式浮动，鼠标靠近时轻微排斥，形成柔和的视差感。
 *
 * 设计约束：
 *   · 纯装饰 —— 容器 aria-hidden，且不接收指针事件，不干扰正文交互
 *   · 尊重 prefers-reduced-motion —— 该偏好下只画一帧静态画面，不挂 rAF
 *   · 页面不可见时停帧，避免后台白烧 CPU
 *   · DPR 上限 2 —— 3K 屏上按 3 倍画只会拖慢帧率，肉眼看不出差别
 */
import { between, pickGroup } from './symbols';

/** 单个符号的全部状态 */
interface Glyph {
  /** 归一化坐标（0..1），与画布尺寸解耦，改窗口不用重排 */
  x: number;
  y: number;
  /** 深度 0..1：越大越近，尺寸/速度/清晰度同步放大 */
  depth: number;
  glyph: string;
  /** 相对基准字号的倍率 */
  size: number;
  /** 基础不透明度（还会被深度与中心遮罩再乘一次） */
  alpha: number;
  /** 当前倾角（弧度），限制在小范围内摆动 */
  rotation: number;
  /** 倾角变化速度（弧度/秒） */
  spin: number;
  /** 倾角摆动的中心值：每个符号围绕它左右摇，方向各不相同 */
  rotationHome: number;
  /** 漂移速度（归一化单位/秒） */
  vx: number;
  vy: number;
  /** 浮动相位，让每个符号的正弦节奏错开，避免整片一起律动 */
  phase: number;
  /** 浮动频率（Hz） */
  freq: number;
  /** 浮动幅度（归一化单位） */
  amp: number;
}

/** 字体栈：优先数学衬线字体，让 ∑ ∫ ∂ 这些符号有正确的古典字形 */
const FONT_STACK =
  '"Latin Modern Math", "Cambria Math", "STIX Two Math", "TeX Gyre Pagella", "Noto Serif", "Times New Roman", serif';

/** 符号颜色：博客主色系的深紫，配低不透明度叠在浅紫白底上 */
const INK = '111, 53, 176';

export interface SymbolFieldOptions {
  /** 画布元素 */
  canvas: HTMLCanvasElement;
}

export class SymbolField {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private glyphs: Glyph[] = [];
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

  /** 启动：测量尺寸、铺符号、按偏好决定画画还是静止 */
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

  /* ── 尺寸与重新铺符号 ─────────────────────────────── */

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

    // 基准字号跟短边走：窄屏上符号变小变多，宽屏上少而大。
    // 下限 20px：手机上短边 390 * 0.042 只有 16px，符号会小到看不清。
    this.baseSize = Math.min(Math.max(Math.min(width, height) * 0.042, 20), 52);

    const previous = this.glyphs;
    this.seed(previous);

    if (this.reducedMotion) this.drawFrame(0);
  }

  /**
   * 铺符号。已有符号复用旧状态（只重新限制坐标），
   * 这样拖动窗口大小不会让画面全部重掷一遍、出现闪烁。
   *
   * 新符号走拒绝采样：随机位置若与已有符号挤在一起就重掷，最多试 12 次。
   * 纯随机摆放必然出现两个符号叠成「雪人」的情况，叠在一起既不好看
   * 也认不出是什么符号，所以宁可多花一次性的一点计算。
   */
  private seed(previous: Glyph[]): void {
    const area = this.width * this.height;
    // 面积决定数量：约每 9 千像素一个符号，密度上下限夹住。
    // 下限保住手机竖屏的可看性，上限防止 4K 屏上画到掉帧。
    const target = Math.round(Math.min(Math.max(area / 9000, 72), 190));

    const next: Glyph[] = [];
    for (let i = 0; i < target; i += 1) {
      const old = previous[i];
      next.push(old ?? this.placeGlyph(next));
    }
    this.glyphs = next;
  }

  /** 字号：深度越大越靠近镜头，画得越大 */
  private fontSizeOf(g: Glyph): number {
    return this.baseSize * g.size * (0.55 + g.depth * 0.9);
  }

  /**
   * 拒绝采样出一个不与已有符号重叠的位置。
   *
   * 碰撞判定在归一化空间里做椭圆近似：x 按画布宽归一、y 按画布高归一，
   * 所以两个符号的「半径」要分别除以宽和高，才能还原成正圆。
   * 允许 0.72 的相交（Minkowski 和 × 0.72）：边缘轻微搭着才自然，
   * 完全不许碰会排得太规整，像网格。
   */
  private placeGlyph(placed: Glyph[]): Glyph {
    const candidate = this.createGlyph();
    const gap = 0.72;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const radius = this.fontSizeOf(candidate) * 0.5;
      const rx = radius / this.width;
      const ry = radius / this.height;

      let crowded = false;
      for (const other of placed) {
        const otherRadius = this.fontSizeOf(other) * 0.5;
        const combinedX = (rx + otherRadius / this.width) * gap;
        const combinedY = (ry + otherRadius / this.height) * gap;
        const dx = (candidate.x - other.x) / combinedX;
        const dy = (candidate.y - other.y) / combinedY;
        if (dx * dx + dy * dy < 1) {
          crowded = true;
          break;
        }
      }

      if (!crowded) break;
      candidate.x = Math.random();
      candidate.y = Math.random();
    }

    return candidate;
  }

  private createGlyph(): Glyph {
    const group = pickGroup(Math.random());
    const depth = 0.18 + Math.random() * 0.82;
    const glyph = group.glyphs[Math.floor(Math.random() * group.glyphs.length)]!;
    const rotationHome = (Math.random() - 0.5) * 0.56;

    // 深度越大速度越快：近处物体在视差里移动更明显
    const speed = 0.004 + depth * 0.012;

    return {
      x: Math.random(),
      y: Math.random(),
      depth,
      glyph,
      size: between(group.scale, Math.random()),
      alpha: between(group.alpha, Math.random()),
      // 倾角只在 ±0.28 弧度（约 ±16°）内摆动。
      // 早先是 360° 随机旋转，结果 ∏、Σ 这些符号经常倒着朝上，
      // 在背景里反而像乱码；小角度倾斜既保留了「浮动感」又保证认得出。
      rotation: rotationHome,
      rotationHome,
      spin: (Math.random() - 0.52) * 0.1,
      vx: (Math.random() - 0.5) * speed,
      vy: -speed * (0.35 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      freq: 0.06 + Math.random() * 0.16,
      amp: 0.004 + Math.random() * 0.012,
    };
  }

  /* ── 动画循环 ─────────────────────────────────────── */

  private tick(now: number): void {
    if (!this.running) return;
    // 后台回来时 dt 可能是几秒，夹一下防止符号瞬移
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.drawFrame(now / 1000);

    this.rafId = requestAnimationFrame(this.tick);
  }

  private update(dt: number): void {
    // 指针平滑：0.06 的系数在 60fps 下约 0.27s 跟上，够软但不迟钝
    this.pointerSmooth.x += (this.pointer.x - this.pointerSmooth.x) * 0.06;
    this.pointerSmooth.y += (this.pointer.y - this.pointerSmooth.y) * 0.06;

    const px = this.pointerSmooth.x;
    const py = this.pointerSmooth.y;

    for (const g of this.glyphs) {
      // 匀速漂移
      g.x += g.vx * dt * (0.4 + g.depth);
      g.y += g.vy * dt * (0.4 + g.depth);
      // 绕 home 摆动而不是无界累加：累加迟早会转成倒立
      g.rotation += g.spin * dt * 3;
      g.rotation += (g.rotationHome - g.rotation) * Math.min(dt * 1.6, 1);

      // 越界回卷：留出 0.08 的余量，符号完全出界才从另一侧进来
      if (g.y < -0.08) g.y = 1.08;
      if (g.y > 1.08) g.y = -0.08;
      if (g.x < -0.08) g.x = 1.08;
      if (g.x > 1.08) g.x = -0.08;

      // 指针排斥：距离小于 0.22 时向外推，越深层的推得越明显
      const dx = g.x - px;
      const dy = g.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.22 && dist > 0.0001) {
        const force = (1 - dist / 0.22) ** 2 * 0.026 * (0.3 + g.depth);
        g.x += (dx / dist) * force;
        g.y += (dy / dist) * force;
      }
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
      // 正弦浮动：每个符号相位错开，整片才不会一起上下跳
      const floating = Math.sin(time * g.freq * Math.PI * 2 + g.phase) * g.amp;
      const x = g.x * width + parallaxX * g.depth;
      const y = g.y * height + parallaxY * g.depth + floating * height;

      // 中心遮罩：屏幕正中（标题所在）让符号退到几乎看不见，保证标题可读
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;
      const radial = Math.hypot(nx, ny * 1.15);
      const mask = Math.min(Math.max((radial - 0.12) / 0.72, 0), 1);
      if (mask <= 0.02) continue;

      // 呼吸：极慢的正弦微调，避免画面完全静止
      const breathe = 0.82 + 0.18 * Math.sin(time * 0.5 + g.phase);
      // 1.25 是整体亮度增益：原始 alpha 落在 0.05 一档，压在浅底上几乎看不见，
      // 提升后才有「背景符号」的存在感，又不至于抢标题
      const alpha = Math.min(g.alpha * mask * breathe * (0.4 + g.depth * 0.6) * 1.25, 1);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g.rotation);
      ctx.font = `${fontSize.toFixed(1)}px ${FONT_STACK}`;
      ctx.fillStyle = `rgba(${INK}, ${alpha.toFixed(3)})`;
      ctx.fillText(g.glyph, 0, 0);
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
