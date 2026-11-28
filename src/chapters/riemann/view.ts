/**
 * 定积分与黎曼和 —— 可交互可视化
 *
 * 叙事按「问题 → 笨办法 → 改进 → 严格化 → 结论」推进，五幕：
 *
 *   0  问题    曲线下这块不规则区域，没法用公式直接算
 *   1  笨办法  只画一个矩形去填，差得很远 —— 差的那块用琥珀色标出来
 *   2  切细    把区间切成更多小段，琥珀色的缝跟着变窄
 *   3  夹逼    这时才引入上和：真实值被夹在「上和」与「下和」之间
 *   4  结论    n 推到 128，缝几乎消失，这就是定积分
 *
 * 三个刻意的设计：
 *
 * 1. **误差当主角**。图上那道琥珀色的缝 = 矩形没盖住的面积，
 *    它比任何数字都直观。右侧还有一条误差条，随 n 增大而缩短。
 * 2. **先单边后双边**。前三幕只用下和（一套矩形），到第四幕才加上和。
 *    一上来就两套矩形叠着，读者还没建立「矩形能近似面积」就要分辨两组颜色。
 * 3. **上和用描边不用填充**，这样它不会盖住下面的误差区。
 *
 * 进度条按真实时长分段，每段宽度与播放秒数成正比；关键帧圆点落在断口正中。
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

/** 进度条上的四段：宽度按 seconds 分配 */
const SEGMENTS = [
  { tFrom: 0, tTo: 0.2, seconds: 2.2 },
  { tFrom: 0.2, tTo: 0.62, seconds: 4.2 },
  { tFrom: 0.62, tTo: 0.8, seconds: 2.2 },
  { tFrom: 0.8, tTo: 1, seconds: 3.2 },
] as const;

/** 五个关键帧：每段起点 + 末段终点 */
const KEYFRAMES = [0, 0.2, 0.62, 0.8, 1] as const;

/** 倍速档位 */
const SPEEDS = [0.5, 1, 1.5, 2] as const;

const TOTAL_SECONDS = SEGMENTS.reduce((sum, s) => sum + s.seconds, 0);

/** 内部进度 t → 时间轴秒数 */
function tToTime(t: number): number {
  let acc = 0;
  for (const s of SEGMENTS) {
    if (t <= s.tTo) return acc + ((t - s.tFrom) / (s.tTo - s.tFrom)) * s.seconds;
    acc += s.seconds;
  }
  return TOTAL_SECONDS;
}

/** 时间轴秒数 → 内部进度 t */
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

// ── 阶段边界 ──
const T_INTRO_OUT_START = 0.04;
const T_INTRO_OUT_END = 0.16;
const T_CURVE_IN_START = 0.06;
const T_CURVE_IN_END = 0.2;
const T_RECT_IN_START = 0.13; // 第一个矩形出现
const T_RECT_IN_END = 0.2; // 到关键帧 1 时已完整就位
const T_KF_FINE = 0.62; // 切细到头（n=16）
const T_BOUNDS_IN_START = 0.64; // 上和淡入
const T_BOUNDS_IN_END = 0.76;
const T_KF_BOUNDS = 0.8; // 夹逼关键帧
const T_CONVERGE_END = 0.94;
const T_SHIFT_START = 0.82;
const T_SHIFT_END = 0.96;

/** 第二幕的目标分割数（切细到头时的 n） */
const N_FINE = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

function px(x: number): number {
  return PLOT.left + (x / A) * (PLOT.right - PLOT.left);
}

function py(y: number): number {
  return PLOT.bottom - (y / Y_MAX) * (PLOT.bottom - PLOT.top);
}

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 曲线路径 */
function curvePath(): string {
  const points: string[] = [];
  const steps = 260;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`${i === 0 ? 'M' : 'L'}${px(x).toFixed(2)},${py(f(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 曲边梯形（曲线下方整块） */
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

/**
 * 某个区间上「矩形没盖住的那条缝」的路径。
 *
 * 从 (x0, 底边) 沿曲线走到 (x1, 曲线高)，再垂直落到底边，闭合。
 * 这样填出来的就是曲线与矩形顶边之间的面积。
 */
function gapPath(x0: number, x1: number, base: number): string {
  const points: string[] = [`M${px(x0).toFixed(2)},${py(base).toFixed(2)}`];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    points.push(`L${px(x).toFixed(2)},${py(f(x)).toFixed(2)}`);
  }
  points.push(`L${px(x1).toFixed(2)},${py(base).toFixed(2)}`, 'Z');
  return points.join(' ');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export interface RiemannViewOptions {
  onBack: () => void;
}

export class RiemannView {
  readonly root: HTMLElement;

  private readonly onBack: () => void;

  private t = 0;
  private userN = N_FINE;
  private drawnN = -1;
  private playing = false;
  private raf = 0;
  private lastFrame = 0;
  private speedIndex = 1;

  private readonly gridLayer: SVGGElement;
  private readonly curveLayer: SVGGElement;
  private readonly lowerLayer: SVGGElement;
  private readonly upperLayer: SVGGElement;
  private readonly gapLayer: SVGGElement;
  private readonly tickLayer: SVGGElement;
  private readonly shiftWrap: SVGGElement;

  private readonly intro: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly captionText: HTMLElement;
  private readonly nRange: HTMLInputElement;
  private readonly nLabel: HTMLElement;
  private readonly sumLower: HTMLElement;
  private readonly sumUpper: HTMLElement;
  private readonly sumExact: HTMLElement;
  private readonly errValue: HTMLElement;
  private readonly errFill: HTMLElement;

  private readonly track: HTMLElement;
  private readonly fills: HTMLElement[] = [];
  private readonly marks: HTMLElement[] = [];
  private markPositions: number[] = [];
  private readonly resizeObserver: ResizeObserver | null;

  private readonly playBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;

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
               aria-label="函数曲线、矩形逼近与误差示意">
            <g class="viz__grid"></g>
            <g class="viz__shift"></g>
          </svg>
          <div class="viz__intro">
            <p class="viz__intro-text">
              曲线与 x 轴之间那块不规则的区域，没有现成的面积公式。
              但我们可以用一排矩形去「填」它 —— 填得越细，就越接近。
            </p>
          </div>
        </div>

        <aside class="viz__panel" aria-live="polite">
          <p class="viz__caption"><span class="viz__caption-text"></span></p>

          <div class="viz__panel-a">
            <label class="viz__n-label" for="viz-n">分割数 n</label>
            <div class="viz__n-row">
              <input class="viz__n-range" id="viz-n" type="range"
                     min="${N_MIN}" max="${N_MAX}" step="1" value="${this.userN}">
              <output class="viz__n-value" for="viz-n">${this.userN}</output>
            </div>

            <div class="viz__error">
              <div class="viz__error-row">
                <span class="viz__error-label">误差</span>
                <span class="viz__error-value">—</span>
              </div>
              <div class="viz__error-track">
                <div class="viz__error-fill"></div>
              </div>
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
    this.caption = q<HTMLElement>('.viz__caption');
    this.captionText = q<HTMLElement>('.viz__caption-text');
    this.nRange = q<HTMLInputElement>('.viz__n-range');
    this.nLabel = q<HTMLElement>('.viz__n-value');
    this.sumLower = q<HTMLElement>('[data-sum="lower"]');
    this.sumUpper = q<HTMLElement>('[data-sum="upper"]');
    this.sumExact = q<HTMLElement>('[data-sum="exact"]');
    this.errValue = q<HTMLElement>('.viz__error-value');
    this.errFill = q<HTMLElement>('.viz__error-fill');
    this.track = q<HTMLElement>('.viz__track');
    this.playBtn = q<HTMLButtonElement>('.viz__play');
    this.resetBtn = q<HTMLButtonElement>('.viz__reset');
    this.nextBtn = q<HTMLButtonElement>('.viz__next');
    this.speedBtn = q<HTMLButtonElement>('.viz__speed');

    this.curveLayer = el('g', { class: 'viz__curve-layer' });
    this.lowerLayer = el('g', { class: 'viz__lower' });
    this.upperLayer = el('g', { class: 'viz__upper' });
    this.gapLayer = el('g', { class: 'viz__gap' });
    this.tickLayer = el('g', { class: 'viz__ticks' });

    this.buildStatic();
    this.buildSegments();
    this.bindEvents();

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.measureMarks();
          this.updateTrack(this.t);
        });
    this.resizeObserver?.observe(this.track);

    this.update(0);
  }

  private buildStatic(): void {
    const grid = this.gridLayer;

    grid.append(
      el('line', { x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom, class: 'viz__axis' }),
      el('line', { x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom, class: 'viz__axis' }),
    );

    for (let v = 1; v < Y_MAX; v += 1) {
      grid.append(
        el('line', { x1: PLOT.left - 6, y1: py(v), x2: PLOT.left, y2: py(v), class: 'viz__tick' }),
        el('text', { x: PLOT.left - 12, y: py(v) + 4, class: 'viz__tick-label', 'text-anchor': 'end' }),
      );
      (grid.lastElementChild as SVGTextElement).textContent = String(v);
    }

    // 曲边梯形底纹：整块要算的面积
    grid.append(el('path', { d: areaPath(), class: 'viz__area' }));

    this.curveLayer.append(
      el('path', { d: curvePath(), class: 'viz__curve' }),
      el('circle', { cx: px(A), cy: py(f(A)), r: 4, class: 'viz__curve-dot' }),
      el('circle', { cx: px(0), cy: py(f(0)), r: 4, class: 'viz__curve-dot' }),
    );

    const label = el('text', { x: px(A) + 16, y: py(f(A)) + 4, class: 'viz__curve-label' });
    label.textContent = 'f(x)';
    this.curveLayer.append(label);

    const zero = el('text', { x: px(0), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle' });
    zero.textContent = '0';
    const aa = el('text', { x: px(A), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle' });
    aa.textContent = 'a';
    grid.append(zero, aa);

    // 顺序即层级：误差缝在矩形之上、曲线之下
    this.shiftWrap.append(grid, this.curveLayer, this.lowerLayer, this.gapLayer, this.upperLayer, this.tickLayer);
  }

  private buildSegments(): void {
    const host = this.root.querySelector('.viz__segments') as HTMLElement;
    const marksHost = this.root.querySelector('.viz__marks') as HTMLElement;

    for (const segment of SEGMENTS) {
      const seg = document.createElement('div');
      seg.className = 'viz__segment';
      seg.style.flexGrow = String(segment.seconds);
      const fill = document.createElement('div');
      fill.className = 'viz__fill';
      seg.append(fill);
      host.append(seg);
      this.fills.push(fill);
    }

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
      // 拖滑动条却没到「切细」段时，图上还看不出分割 —— 直接把进度推过去
      if (!this.playing && this.t < T_RECT_IN_END) this.setT(T_RECT_IN_END);
      else this.update(this.t);
    });

    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stop();
      else this.play();
    });

    this.resetBtn.addEventListener('click', () => {
      this.stop();
      this.setT(0);
    });

    this.nextBtn.addEventListener('click', () => {
      this.stop();
      const next = KEYFRAMES.find((k) => k > this.t + 0.005);
      this.setT(next ?? 1);
    });

    this.speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
      this.speedBtn.textContent = `${SPEEDS[this.speedIndex]}×`;
      this.speedBtn.setAttribute('aria-label', `播放倍速 ${SPEEDS[this.speedIndex]} 倍`);
    });

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
      const dt = Math.min(64, now - this.lastFrame);
      this.lastFrame = now;
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

  /** 当前分割数：先长到用户选的 n，第四幕再推到上限 */
  private currentN(): number {
    // 关键帧 1 就是「一个矩形」，所以在它之前和它身上都固定为 1；
    // 从这里之后才开始切细，否则点到那一帧会看到两个矩形。
    if (this.t <= T_RECT_IN_END) return 1;

    const target = Math.max(N_FINE, this.userN);
    if (this.t < T_KF_FINE) {
      const p = smoothstep(T_RECT_IN_END, T_KF_FINE, this.t);
      return Math.max(2, Math.round(1 + (target - 1) * p));
    }
    if (this.t < T_KF_BOUNDS) return target;

    const p = smoothstep(T_KF_BOUNDS, T_CONVERGE_END, this.t);
    return Math.max(target, Math.round(target + (N_MAX - target) * p));
  }

  /** 重画矩形、误差缝与刻度 */
  private redraw(n: number): void {
    this.drawnN = n;
    const bounds = intervalBounds(n);

    const lower = document.createDocumentFragment();
    const upper = document.createDocumentFragment();
    const gaps = document.createDocumentFragment();

    // n 很大时矩形之间不再留缝：128 个 0.6px 的缝会连成一片竖条纹，
    // 整块面积看起来像噪点，反而看不清形状。
    const seam = n > 48 ? 0 : 0.6;

    for (const { x0, x1, min, max } of bounds) {
      const left = px(x0);
      const width = Math.max(0, px(x1) - left - seam);

      // 下和：实心
      lower.append(
        el('rect', {
          x: left.toFixed(2), y: py(min).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, py(0) - py(min)).toFixed(2),
          class: 'viz__rect viz__rect--lower',
        }),
      );

      // 误差缝：矩形顶边到曲线之间的那块
      gaps.append(
        el('path', { d: gapPath(x0, x1, min), class: 'viz__gap-area' }),
      );

      // 上和：只描边不填充，否则会盖住下面的缝
      upper.append(
        el('rect', {
          x: left.toFixed(2), y: py(max).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, py(0) - py(max)).toFixed(2),
          class: 'viz__rect viz__rect--upper',
        }),
      );
    }

    this.lowerLayer.replaceChildren(lower);
    this.gapLayer.replaceChildren(gaps);
    this.upperLayer.replaceChildren(upper);

    // 分点刻度（位置取自随机分割点）
    const ticks = document.createDocumentFragment();
    const labelAll = n <= 10;
    const mid = Math.floor(n / 2);
    for (let i = 1; i < bounds.length; i += 1) {
      const x = px(bounds[i].x0);
      ticks.append(
        el('line', { x1: x, y1: PLOT.bottom, x2: x, y2: PLOT.bottom + 7, class: 'viz__divider' }),
      );
      if (labelAll || i === mid) {
        const t = el('text', { x, y: PLOT.bottom + 24, class: 'viz__divider-label', 'text-anchor': 'middle' });
        t.textContent = `x${i}`;
        ticks.append(t);
      }
    }
    this.tickLayer.replaceChildren(ticks);
  }

  private measureMarks(): void {
    const segments = [...this.root.querySelectorAll<HTMLElement>('.viz__segment')];
    if (segments.length === 0) return;

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

  private updateTrack(t: number): void {
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

  /** 当前这一幕该说的话 */
  private captionFor(t: number): string {
    if (t < T_RECT_IN_START) return '曲线下这块不规则的区域，没有现成的面积公式。';
    if (t <= T_KF_FINE) return '用矩形去填。填得越细，露出来的那道缝就越窄。';
    if (t <= T_KF_BOUNDS) return '缝窄到一定程度，真实值就被夹在「上和」与「下和」之间。';
    return 'n 继续增大，两条边界合拢 —— 这个极限就是定积分。';
  }

  private update(t: number): void {
    const n = this.currentN();
    if (n !== this.drawnN) this.redraw(n);

    this.updateTrack(t);

    // 导入语
    const introOpacity = 1 - smoothstep(T_INTRO_OUT_START, T_INTRO_OUT_END, t);
    this.intro.style.opacity = String(introOpacity);

    // 坐标系与曲线。
    // 开场就给 0.5 的可见度：只留一句导入语、图完全空着，点第一帧会以为没加载。
    const curveOpacity = 0.5 + 0.5 * smoothstep(T_CURVE_IN_START, T_CURVE_IN_END, t);
    this.gridLayer.style.opacity = String(curveOpacity);
    this.curveLayer.style.opacity = String(curveOpacity);

    // 下和矩形：第一幕之后淡入
    const lowerOpacity = smoothstep(T_RECT_IN_START, T_RECT_IN_END, t) *
      (1 - smoothstep(0.9, 1, t) * 0.35);
    this.lowerLayer.style.opacity = String(lowerOpacity);

    // 误差缝：跟着矩形一起出现，最后几乎消失（缝本身就没了）
    this.gapLayer.style.opacity = String(lowerOpacity);

    // 上和：第三幕起淡入，收敛后淡一些 —— n=128 时 128 个虚线框会糊成一片纹理
    const upperOpacity = smoothstep(T_BOUNDS_IN_START, T_BOUNDS_IN_END, t) *
      (1 - smoothstep(0.9, 1, t) * 0.45);
    this.upperLayer.style.opacity = String(upperOpacity);
    this.tickLayer.style.opacity = String(lowerOpacity);

    // 图形左移给文字让位
    const shift = smoothstep(T_SHIFT_START, T_SHIFT_END, t);
    this.shiftWrap.setAttribute('transform', `translate(${(-60 * shift).toFixed(1)}, 0)`);

    // 面板
    const panelOpacity = smoothstep(0.14, 0.28, t);
    this.panel.style.opacity = String(panelOpacity);
    this.panel.style.pointerEvents = panelOpacity < 0.5 ? 'none' : 'auto';

    // 数值
    const lower = lowerSum(n);
    const upper = upperSum(n);
    this.nLabel.textContent = String(n);
    this.nRange.value = String(n);
    this.sumLower.textContent = fmt(lower);
    this.sumUpper.textContent = fmt(upper);
    this.sumExact.textContent = fmt(EXACT);

    // 误差：始终是「下和离真实值还差多少」。
    // 不要在看上和时切成「上和-下和」—— 那会让数字在第三幕从 4.6% 跳到 9.1%，
    // 明明是在变准，读数却变差了。上和的作用是给出上界，不改变这条读数。
    const err = (EXACT - lower) / EXACT;
    const pct = Math.max(0, Math.min(1, err));
    this.errValue.textContent = `${(pct * 100).toFixed(1)}%`;
    this.errFill.style.width = `${pct * 100}%`;
    this.errFill.classList.toggle('is-tight', pct < 0.05);

    this.sumExact.parentElement?.classList.toggle('is-converged', pct < 0.02);

    // 说明文字
    this.captionText.textContent = this.captionFor(t);
    const captionOpacity = smoothstep(0.1, 0.22, t);
    this.caption.style.opacity = String(captionOpacity);
  }

  focus(): void {
    this.playBtn.focus();
  }
}
