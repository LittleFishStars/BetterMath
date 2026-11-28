/**
 * 定积分与黎曼和 —— 可交互可视化
 *
 * 四个关键帧，一条分段的进度条把它们串起来：
 *
 *   0  ── 导入语：说明要解决什么问题（曲边梯形的面积）
 *   1  ── 坐标系里画出 f(x)，0 到 a 之间铺一层阴影
 *   2  ── 右侧浮出滑动条 n，x 轴被切成 n 段，画出上和与下和的矩形，
 *          旁边给出三个数：下和 / 上和 / 精确值
 *   3  ── n 推到足够大，三个数肉眼难分；图形左移，数字让位给说明文字
 *
 * 进度条按**真实时长**分段：每段的物理宽度与它播放所需的秒数成正比，
 * 段与段之间断开成独立的胶囊。这样进度条的位置就等于时间轴上的位置 ——
 * 拖到某个位置，看到的就是那一刻的画面，不需要额外换算。
 *
 * 中间状态全部由 t 插值出来，拖动时每一帧都是合法状态。
 *
 * 绘图用 SVG 而不是 canvas：矩形是真实 DOM，可以用 CSS 做透明度过渡，
 * 也天然支持高 DPI。n 上限 128，DOM 数量撑得住。
 */
import {
  A,
  EXACT,
  N_MAX,
  N_MIN,
  Y_MAX,
  f,
  fmt,
  intervalBounds,
  lowerSum,
  upperSum,
} from './math';

/** 绘图区在 viewBox 里的边界 */
const PLOT = { left: 74, right: 700, top: 58, bottom: 348 } as const;

/**
 * 进度条上的四段。
 *
 * tFrom/tTo 是内部进度，seconds 是这段播放要花的秒数。
 * 进度条的物理宽度按 seconds 分配 —— 导入和画曲线很快，收敛要慢慢看，
 * 所以第三段明显更长。
 */
const SEGMENTS = [
  { tFrom: 0, tTo: 0.3, seconds: 2.4 },
  { tFrom: 0.3, tTo: 0.58, seconds: 3.2 },
  { tFrom: 0.58, tTo: 1, seconds: 5.4 },
] as const;

/** 关键帧：每段的起点 + 最后一个终点 */
const KEYFRAMES = [0, 0.3, 0.58, 1] as const;

const TOTAL_SECONDS = SEGMENTS.reduce((sum, s) => sum + s.seconds, 0);

/** 内部进度 t → 时间轴上的秒数 */
function tToTime(t: number): number {
  let acc = 0;
  for (const s of SEGMENTS) {
    if (t <= s.tTo) return acc + ((t - s.tFrom) / (s.tTo - s.tFrom)) * s.seconds;
    acc += s.seconds;
  }
  return TOTAL_SECONDS;
}

/** 时间轴上的秒数 → 内部进度 t */
function timeToT(time: number): number {
  let acc = 0;
  for (const s of SEGMENTS) {
    if (time <= acc + s.seconds) {
      return s.tFrom + ((time - acc) / s.seconds) * (s.tTo - s.tFrom);
    }
    acc += s.seconds;
  }
  return 1;
}

/** 阶段边界（内部进度） */
const T_INTRO_OUT_START = 0.06;
const T_INTRO_OUT_END = 0.22;
const T_CURVE_IN_START = 0.1;
const T_CURVE_IN_END = 0.28;
const T_PANEL_IN = 0.34;
const T_PANEL_FULL = 0.5;
const T_N_START = 0.4;
const T_KF_PANEL = 0.58;
const T_CONVERGE_END = 0.84;
const T_SHIFT_START = 0.76;
const T_SHIFT_END = 0.94;
const T_PANEL_OUT_START = 0.84;
const T_PANEL_OUT_END = 0.96;
const T_TEXT_IN_START = 0.88;
const T_TEXT_IN_END = 1;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 播放倍速档位 */
const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** 把 x ∈ [0, A] 映射到 viewBox 的横坐标 */
function px(x: number): number {
  return PLOT.left + (x / A) * (PLOT.right - PLOT.left);
}

/** 把 y ∈ [0, Y_MAX] 映射到 viewBox 的纵坐标（y 轴朝上） */
function py(y: number): number {
  return PLOT.bottom - (y / Y_MAX) * (PLOT.bottom - PLOT.top);
}

/** 平滑插值：在 [a, b] 区间里把 x 映射到 0..1，两端各有一段缓入缓出 */
function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 生成曲线路径 */
function curvePath(): string {
  const points: string[] = [];
  const steps = 260;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`${i === 0 ? 'M' : 'L'}${px(x).toFixed(2)},${py(f(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 阴影区域路径（曲线下方、0 到 a 之间） */
function areaPath(): string {
  const points: string[] = [`M${px(0).toFixed(2)},${py(0).toFixed(2)}`];
  const steps = 260;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`L${px(x).toFixed(2)},${py(f(x)).toFixed(2)}`);
  }
  points.push(`L${px(A).toFixed(2)},${py(0).toFixed(2)}`, 'Z');
  return points.join(' ');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export interface RiemannViewOptions {
  /** 返回内容页 */
  onBack: () => void;
}

export class RiemannView {
  readonly root: HTMLElement;

  private readonly onBack: () => void;

  // ── 状态 ──
  /** 内部进度 0..1 */
  private t = 0;
  /** 用户在滑动条上选的 n */
  private userN = 8;
  /** 上一帧实际画出的 n，用来判断要不要重建矩形 */
  private drawnN = -1;
  private playing = false;
  private raf = 0;
  private lastFrame = 0;

  // ── DOM ──
  private readonly gridLayer: SVGGElement;
  private readonly curveLayer: SVGGElement;
  private readonly areaPath: SVGPathElement;
  private readonly rectLayer: SVGGElement;
  private readonly tickLayer: SVGGElement;
  private readonly shiftWrap: SVGGElement;
  private readonly intro: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly explain: HTMLElement;
  private readonly nRange: HTMLInputElement;
  private readonly nLabel: HTMLElement;
  private readonly sumLower: HTMLElement;
  private readonly sumUpper: HTMLElement;
  private readonly sumExact: HTMLElement;
  private readonly track: HTMLElement;
  private readonly fills: HTMLElement[] = [];
  private readonly playBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  /** 倍速档位索引 */
  private speedIndex = 1;
  private readonly marks: HTMLElement[] = [];
  /** 各关键帧在轨道上的像素位置（相对 track 左边缘），由实测得到 */
  private markPositions: number[] = [];
  private readonly resizeObserver: ResizeObserver | null;

  constructor(options: RiemannViewOptions) {
    this.onBack = options.onBack;

    this.root = document.createElement('div');
    this.root.className = 'viz';
    this.root.innerHTML = `
      <div class="viz__head">
        <button class="viz__back" type="button">
          <span aria-hidden="true">←</span> 定积分与黎曼和
        </button>
      </div>

      <div class="viz__stage">
        <div class="viz__figure">
          <svg class="viz__plot" viewBox="0 0 720 420" role="img"
               aria-label="函数曲线与黎曼和示意图">
            <g class="viz__grid"></g>
            <g class="viz__shift"></g>
          </svg>
          <div class="viz__intro">
            <p class="viz__intro-text">
              为了求解曲边梯形的面积 —— 曲线与 x 轴之间那块不规则的区域，
              我们把区间切成许多小段，用一排矩形去填它。
            </p>
          </div>
        </div>

        <aside class="viz__panel" aria-live="polite">
          <div class="viz__panel-a">
            <label class="viz__n-label" for="viz-n">分割数 n</label>
            <div class="viz__n-row">
              <input class="viz__n-range" id="viz-n" type="range"
                     min="${N_MIN}" max="${N_MAX}" step="1" value="${this.userN}">
              <output class="viz__n-value" for="viz-n">${this.userN}</output>
            </div>
            <dl class="viz__sums">
              <div class="viz__sum viz__sum--lower">
                <dt>下和</dt><dd class="viz__sum-value" data-sum="lower">0.000</dd>
              </div>
              <div class="viz__sum viz__sum--upper">
                <dt>上和</dt><dd class="viz__sum-value" data-sum="upper">0.000</dd>
              </div>
              <div class="viz__sum viz__sum--exact">
                <dt>精确值</dt><dd class="viz__sum-value" data-sum="exact">0.000</dd>
              </div>
            </dl>
          </div>
          <div class="viz__panel-b">
            <h3 class="viz__explain-title">当 n 趋于无穷</h3>
            <p class="viz__explain-body">
              上和与下和从两侧夹住真实面积。n 越大，每一小段上的起伏越平，
              两个和就越贴近同一条曲线下的面积 —— 它们的公共极限，就是定积分
              <span class="viz__formula">∫₀ᵃ f(x) dx</span>。
            </p>
          </div>
        </aside>
      </div>

      <div class="viz__timeline">
        <div class="viz__controls">
          <button class="viz__play" type="button" aria-label="播放动画">
            <span class="viz__play-icon" aria-hidden="true"></span>
          </button>
          <button class="viz__reset" type="button" aria-label="回到开头">
            <svg class="viz__reset-icon" viewBox="0 0 24 24" aria-hidden="true"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        <div class="viz__track" role="slider" tabindex="0"
             aria-label="动画进度" aria-valuemin="0" aria-valuemax="${TOTAL_SECONDS}"
             aria-valuenow="0">
          <div class="viz__segments"></div>
          <div class="viz__marks"></div>
        </div>

        <div class="viz__controls viz__controls--end">
          <button class="viz__next" type="button" aria-label="下一节">
            <svg class="viz__next-icon" viewBox="0 0 24 24" aria-hidden="true"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
          <button class="viz__speed" type="button" aria-label="播放倍速">1×</button>
        </div>
      </div>
    `;

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;

    this.shiftWrap = q<SVGGElement>('.viz__shift');
    this.gridLayer = q<SVGGElement>('.viz__grid');
    this.intro = q<HTMLElement>('.viz__intro');
    this.panel = q<HTMLElement>('.viz__panel');
    this.explain = q<HTMLElement>('.viz__panel-b');
    this.nRange = q<HTMLInputElement>('.viz__n-range');
    this.nLabel = q<HTMLElement>('.viz__n-value');
    this.sumLower = q<HTMLElement>('[data-sum="lower"]');
    this.sumUpper = q<HTMLElement>('[data-sum="upper"]');
    this.sumExact = q<HTMLElement>('[data-sum="exact"]');
    this.track = q<HTMLElement>('.viz__track');
    this.playBtn = q<HTMLButtonElement>('.viz__play');
    this.resetBtn = q<HTMLButtonElement>('.viz__reset');
    this.nextBtn = q<HTMLButtonElement>('.viz__next');
    this.speedBtn = q<HTMLButtonElement>('.viz__speed');

    this.curveLayer = el('g', { class: 'viz__curve-layer' });
    this.areaPath = el('path', { d: areaPath(), class: 'viz__area' });
    this.rectLayer = el('g', { class: 'viz__rects' });
    this.tickLayer = el('g', { class: 'viz__ticks' });

    this.buildStatic();
    this.buildSegments();
    this.bindEvents();

    // 圆点位置要靠实测：段与段之间有间隙，用比例算出来的位置会偏。
    // 刚构造时元素还没进文档、宽度是 0，所以用 ResizeObserver 等它落地再量。
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.measureMarks();
          this.updateTrack(this.t);
        });
    this.resizeObserver?.observe(this.track);

    this.update(0);
  }

  // ── 静态图形：网格、坐标轴、曲线、阴影 ──
  private buildStatic(): void {
    const grid = this.root.querySelector('.viz__grid') as SVGGElement;

    grid.append(
      el('line', {
        x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom,
        class: 'viz__axis',
      }),
      el('line', {
        x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom,
        class: 'viz__axis',
      }),
    );

    for (let v = 1; v < Y_MAX; v += 1) {
      grid.append(
        el('line', {
          x1: PLOT.left - 6, y1: py(v), x2: PLOT.left, y2: py(v),
          class: 'viz__tick',
        }),
        el('text', {
          x: PLOT.left - 12, y: py(v) + 4, class: 'viz__tick-label',
          'text-anchor': 'end',
        }),
      );
      const label = grid.lastElementChild as SVGTextElement;
      label.textContent = String(v);
    }

    this.curveLayer.append(
      this.areaPath,
      el('path', { d: curvePath(), class: 'viz__curve' }),
      el('circle', { cx: px(A), cy: py(f(A)), r: 4, class: 'viz__curve-dot' }),
      el('circle', { cx: px(0), cy: py(f(0)), r: 4, class: 'viz__curve-dot' }),
    );

    const curveLabel = el('text', {
      x: px(A) + 16, y: py(f(A)) + 4, class: 'viz__curve-label',
    });
    curveLabel.textContent = 'f(x)';
    this.curveLayer.append(curveLabel);

    const zero = el('text', {
      x: px(0), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle',
    });
    zero.textContent = '0';
    const aa = el('text', {
      x: px(A), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle',
    });
    aa.textContent = 'a';

    // 0 和 a 直接挂在 grid 上：它们属于坐标系，要跟着 grid 一起淡入，
    // 否则开场时轴还没出现、这两个字先冒出来，很怪。
    grid.append(zero, aa);

    // 所有绘图元素都进位移容器：第二关键帧要整体左移，
    // 少放一个（矩形、刻度）就会留在原地与坐标轴错位。
    this.shiftWrap.append(grid, this.curveLayer, this.rectLayer, this.tickLayer);
  }

  /** 进度条：每段一个胶囊，宽度按时长分配 */
  private buildSegments(): void {
    const host = this.root.querySelector('.viz__segments') as HTMLElement;
    const marksHost = this.root.querySelector('.viz__marks') as HTMLElement;

    for (const segment of SEGMENTS) {
      const seg = document.createElement('div');
      seg.className = 'viz__segment';
      // flex 按秒数分配宽度 —— 这就是「长度与时长成正比」
      seg.style.flexGrow = String(segment.seconds);
      const fill = document.createElement('div');
      fill.className = 'viz__fill';
      seg.append(fill);
      host.append(seg);
      this.fills.push(fill);
    }

    // 关键帧圆点放在每段的起点，最后一个放在末端
    KEYFRAMES.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'viz__mark';
      dot.dataset.index = String(index);
      dot.setAttribute('aria-label', `关键帧 ${index + 1}`);
      dot.addEventListener('click', (event) => {
        event.stopPropagation();
        this.stop();
        this.setT(KEYFRAMES[index]);
      });
      marksHost.append(dot);
      this.marks.push(dot);
    });
  }

  private bindEvents(): void {
    this.root.querySelector('.viz__back')?.addEventListener('click', () => this.onBack());

    this.nRange.addEventListener('input', () => {
      this.userN = Number(this.nRange.value);
      // 拖滑动条却没到关键帧 2 时，图上还看不出分割 —— 直接把进度推过去，
      // 否则「改了 n 却没反应」。正在播放时不打断，让它自然推进。
      if (!this.playing && this.t < T_KF_PANEL) {
        this.setT(T_KF_PANEL);
      } else {
        this.update(this.t);
      }
    });

    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stop();
      else this.play();
    });

    this.resetBtn.addEventListener('click', () => {
      this.stop();
      this.setT(0);
    });

    // 下一节：跳到当前之后的下一个关键帧，到底了就停在末帧
    this.nextBtn.addEventListener('click', () => {
      this.stop();
      const next = KEYFRAMES.find((k) => k > this.t + 0.005);
      this.setT(next ?? 1);
    });

    // 倍速：循环切换 0.5× / 1× / 1.5× / 2×
    this.speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
      this.speedBtn.textContent = `${SPEEDS[this.speedIndex]}×`;
      this.speedBtn.setAttribute('aria-label', `播放倍速 ${SPEEDS[this.speedIndex]} 倍`);
    });

    // 拖动进度条：自己实现，因为分段之间有间隙，
    // 用原生 range 的话滑块位置会和视觉上的胶囊对不上。
    let dragging = false;
    const seek = (clientX: number): void => {
      const rect = this.track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      this.setT(timeToT(ratio * TOTAL_SECONDS));
    };

    this.track.addEventListener('pointerdown', (event) => {
      dragging = true;
      this.stop();
      this.track.setPointerCapture(event.pointerId);
      seek(event.clientX);
    });
    this.track.addEventListener('pointermove', (event) => {
      if (dragging) seek(event.clientX);
    });
    const endDrag = (): void => {
      dragging = false;
    };
    this.track.addEventListener('pointerup', endDrag);
    this.track.addEventListener('pointercancel', endDrag);

    // 键盘：左右箭头微调，Home/End 跳到首尾
    this.track.addEventListener('keydown', (event) => {
      const step = 0.02;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.stop();
        this.setT(this.t + step);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.stop();
        this.setT(this.t - step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.stop();
        this.setT(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.stop();
        this.setT(1);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (this.playing) this.stop();
        else this.play();
      }
    });
  }

  /** 设置内部进度并刷新 */
  setT(t: number): void {
    this.t = Math.min(1, Math.max(0, t));
    this.update(this.t);
  }

  play(): void {
    if (this.playing) return;
    if (this.t >= 0.999) this.t = 0;
    this.playing = true;
    this.playBtn.classList.add('is-playing');
    this.playBtn.setAttribute('aria-label', '暂停动画');
    this.lastFrame = performance.now();

    const step = (now: number): void => {
      if (!this.playing) return;
      const dt = Math.min(64, now - this.lastFrame); // 切后台回来别一下跳完
      this.lastFrame = now;
      // 按秒推进，与进度条的分段宽度一致
      const seconds = tToTime(this.t) + (dt / 1000) * SPEEDS[this.speedIndex];
      this.t = seconds >= TOTAL_SECONDS ? 1 : timeToT(seconds);
      this.update(this.t);
      if (this.t >= 1) {
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    this.playing = false;
    this.playBtn.classList.remove('is-playing');
    this.playBtn.setAttribute('aria-label', '播放动画');
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  destroy(): void {
    this.stop();
    this.resizeObserver?.disconnect();
  }

  /** 当前应显示的 n */
  private currentN(): number {
    const target = this.userN;
    if (this.t <= T_KF_PANEL) {
      const p = smoothstep(T_N_START, T_KF_PANEL, this.t);
      return Math.max(1, Math.round(1 + (target - 1) * p));
    }
    const p = smoothstep(T_KF_PANEL, T_CONVERGE_END, this.t);
    return Math.max(1, Math.round(target + (N_MAX - target) * p));
  }

  /** 重画矩形与刻度（n 变化时才调用） */
  private redrawRects(n: number): void {
    this.drawnN = n;
    const bounds = intervalBounds(n);
    const h = A / n;

    const rects = document.createDocumentFragment();
    for (const { x0, x1, min, max } of bounds) {
      const left = px(x0);
      const width = Math.max(0, px(x1) - left - 0.6);

      // 下和：区间最小值，矩形整个落在曲线下方
      rects.append(
        el('rect', {
          x: left.toFixed(2), y: py(min).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, py(0) - py(min)).toFixed(2),
          class: 'viz__rect viz__rect--lower',
        }),
      );

      // 上和：区间最大值，矩形整个盖住曲线
      rects.append(
        el('rect', {
          x: left.toFixed(2), y: py(max).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, py(0) - py(max)).toFixed(2),
          class: 'viz__rect viz__rect--upper',
        }),
      );
    }
    this.rectLayer.replaceChildren(rects);

    // 分点刻度。首尾的「0」「a」由静态层画，这里只画中间的。
    const ticks = document.createDocumentFragment();
    const labelAll = n <= 10;
    const mid = Math.floor(n / 2);

    for (let i = 1; i < n; i += 1) {
      const x = px(i * h);
      ticks.append(
        el('line', {
          x1: x, y1: PLOT.bottom, x2: x, y2: PLOT.bottom + 7, class: 'viz__divider',
        }),
      );
      if (labelAll || i === mid) {
        const label = el('text', {
          x, y: PLOT.bottom + 24, class: 'viz__divider-label', 'text-anchor': 'middle',
        });
        label.textContent = `x${i}`;
        ticks.append(label);
      }
    }
    this.tickLayer.replaceChildren(ticks);
  }

  /**
   * 量出每个关键帧圆点应该落在轨道的哪一像素。
   *
   * 中间的圆点放在**断口正中**（前一段右边缘与后一段左边缘的中点）——
   * 直接对齐某一段的边缘会整个压在那一小截胶囊上，看起来像没对齐；
   * 落在 7px 的缝里，才读得出「这里是两段的分界」。
   */
  private measureMarks(): void {
    const segments = [...this.root.querySelectorAll<HTMLElement>('.viz__segment')];
    if (segments.length === 0) return;

    // offsetParent 是 .viz__track（position: relative），offsetLeft 即相对轨道左缘
    const positions: number[] = [segments[0].offsetLeft];

    for (let i = 1; i < segments.length; i += 1) {
      const prev = segments[i - 1];
      const prevRight = prev.offsetLeft + prev.offsetWidth;
      const nextLeft = segments[i].offsetLeft;
      positions.push(prevRight + (nextLeft - prevRight) / 2);
    }

    const last = segments[segments.length - 1];
    positions.push(last.offsetLeft + last.offsetWidth);
    this.markPositions = positions;
  }

  /** 进度条填充与关键帧圆点的位置 */
  private updateTrack(t: number): void {
    // 每段填充：该段已走过的比例
    SEGMENTS.forEach((segment, index) => {
      const local = (t - segment.tFrom) / (segment.tTo - segment.tFrom);
      this.fills[index].style.width = `${Math.min(1, Math.max(0, local)) * 100}%`;
    });

    this.marks.forEach((dot, index) => {
      const pos = this.markPositions[index];
      if (pos !== undefined) dot.style.left = `${pos}px`;
      dot.classList.toggle('is-active', Math.abs(t - KEYFRAMES[index]) < 0.05);
    });

    this.track.setAttribute('aria-valuenow', tToTime(t).toFixed(1));
  }

  /** 主刷新：所有随 t 连续变化的量都在这里 */
  private update(t: number): void {
    const n = this.currentN();
    if (n !== this.drawnN) this.redrawRects(n);

    this.updateTrack(t);

    // 导入语：开场一句话，随后让位给图像
    const introOpacity = 1 - smoothstep(T_INTRO_OUT_START, T_INTRO_OUT_END, t);
    this.intro.style.opacity = String(introOpacity);
    this.intro.style.pointerEvents = 'none';

    // 坐标系与曲线随导入语退场一起淡入。
    // 轴单独控制：开场只留一句话，空坐标系先冒出来会显得画面是「半成品」。
    const curveOpacity = smoothstep(T_CURVE_IN_START, T_CURVE_IN_END, t);
    this.gridLayer.style.opacity = String(curveOpacity);
    this.curveLayer.style.opacity = String(curveOpacity);

    // 矩形随 n 增大而变淡
    const rectAlpha = 1 - smoothstep(0.35, 0.9, t) * 0.45;
    this.rectLayer.style.opacity = String(
      smoothstep(T_N_START, T_N_START + 0.08, t) * rectAlpha,
    );
    this.tickLayer.style.opacity = String(smoothstep(T_N_START, T_N_START + 0.08, t));

    // 第二关键帧：图形整体左移，给右侧文字让位
    const shift = smoothstep(T_SHIFT_START, T_SHIFT_END, t);
    this.shiftWrap.setAttribute('transform', `translate(${(-70 * shift).toFixed(1)}, 0)`);

    // 面板 A（滑动条 + 面积值）
    const panelA = smoothstep(T_PANEL_IN, T_PANEL_FULL, t) *
      (1 - smoothstep(T_PANEL_OUT_START, T_PANEL_OUT_END, t));
    const panelAEl = this.panel.querySelector('.viz__panel-a') as HTMLElement;
    panelAEl.style.opacity = String(panelA);
    panelAEl.style.transform = `translateY(${((1 - panelA) * 10).toFixed(1)}px)`;
    panelAEl.style.pointerEvents = panelA < 0.5 ? 'none' : 'auto';

    // 面板 B（说明文字）
    const panelB = smoothstep(T_TEXT_IN_START, T_TEXT_IN_END, t);
    this.explain.style.opacity = String(panelB);
    this.explain.style.transform = `translateY(${((1 - panelB) * 12).toFixed(1)}px)`;
    this.explain.style.pointerEvents = panelB < 0.5 ? 'none' : 'auto';

    // 标签与滑块都跟着「当前实际画出的 n」走。
    // 只更新标签的话，收敛阶段数字涨到 62、滑块却还停在 48 上，
    // 看起来像两个控件各说各话。
    this.nLabel.textContent = String(n);
    this.nRange.value = String(n);

    // 三个面积值
    const lower = lowerSum(n);
    const upper = upperSum(n);
    this.sumLower.textContent = fmt(lower);
    this.sumUpper.textContent = fmt(upper);
    this.sumExact.textContent = fmt(EXACT);

    // 三者接近时高亮精确值，作为「合流」的视觉落点
    this.sumExact.parentElement?.classList.toggle('is-converged', (upper - lower) / EXACT < 0.01);
  }

  /** 让视图获得焦点，方便键盘操作 */
  focus(): void {
    this.playBtn.focus();
  }
}
