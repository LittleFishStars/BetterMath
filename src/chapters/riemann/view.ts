/**
 * 定积分与黎曼和 —— 可交互可视化
 *
 * 三个关键帧，一条进度条把它们串起来：
 *
 *   0  ── 坐标系里画出 f(x)，0 到 a 之间铺一层阴影（这就是要求的面积）
 *   1  ── 右侧浮出滑动条 n，x 轴被切成 n 段，画出上和与下和的矩形，
 *          旁边给出三个数：下和 / 上和 / 精确值
 *   2  ── n 推到足够大，三个数肉眼难分；图形左移，滑动条与数字让位给说明文字
 *
 * 进度条本身是连续的 0..1，关键帧只是上面的三个锚点。中间状态全部由 t
 * 插值出来 —— 这样拖动时每一帧都是合法状态，不需要为「拖到一半」写特例。
 *
 * 绘图用 SVG 而不是 canvas：矩形是真实 DOM，可以用 CSS 做透明度与描边过渡，
 * 也天然支持高 DPI（viewBox 缩放）。n 上限 128，DOM 数量完全撑得住。
 */
import {
  A,
  EXACT,
  N_MAX,
  N_STEPS,
  f,
  fmt,
  lowerSum,
  upperSum,
} from './math';

/** 绘图区在 viewBox 里的边界 */
const PLOT = { left: 74, right: 700, top: 58, bottom: 348 } as const;
/** y 轴最大值 */
const Y_MAX = 4;

/** 三个关键帧在进度条上的位置 */
const KEYFRAMES = [0, 0.5, 1] as const;

/** 阶段边界 */
const T_PANEL_IN = 0.06; // 面板开始浮现
const T_PANEL_FULL = 0.26; // 面板完全显示
const T_N_START = 0.16; // n 开始从 1 增长
const T_KF1 = 0.5; // 关键帧 1
const T_CONVERGE_END = 0.78; // n 增长到最大
const T_SHIFT_START = 0.7; // 图形开始左移
const T_SHIFT_END = 0.9;
const T_PANEL_OUT_START = 0.78; // 面板开始退场
const T_PANEL_OUT_END = 0.92;
const T_TEXT_IN_START = 0.84; // 说明文字浮现
const T_TEXT_IN_END = 0.98;

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  const steps = 220;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`${i === 0 ? 'M' : 'L'}${px(x).toFixed(2)},${py(f(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 阴影区域路径（曲线下方、0 到 a 之间） */
function areaPath(): string {
  const points: string[] = [`M${px(0).toFixed(2)},${py(0).toFixed(2)}`];
  const steps = 220;
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
  /** 总进度 0..1 */
  private t = 0;
  /** 用户在滑动条上选的 n（索引 N_STEPS） */
  private nIndex = 5; // 默认 8 段
  /** 上一帧实际画出的 n，用来判断要不要重建矩形 */
  private drawnN = -1;
  private playing = false;
  private raf = 0;
  private lastFrame = 0;

  // ── DOM ──
  private readonly curveLayer: SVGGElement;
  private readonly rectLayer: SVGGElement;
  private readonly tickLayer: SVGGElement;
  private readonly shiftWrap: SVGGElement;
  private readonly panel: HTMLElement;
  private readonly explain: HTMLElement;
  private readonly nRange: HTMLInputElement;
  private readonly nLabel: HTMLElement;
  private readonly sumLower: HTMLElement;
  private readonly sumUpper: HTMLElement;
  private readonly sumExact: HTMLElement;
  private readonly scrub: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly marks: HTMLElement[] = [];

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
            <g class="viz__rects"></g>
            <g class="viz__ticks"></g>
          </svg>
        </div>
        <aside class="viz__panel" aria-live="polite">
          <div class="viz__panel-a">
            <label class="viz__n-label" for="viz-n">分割数 n</label>
            <div class="viz__n-row">
              <input class="viz__n-range" id="viz-n" type="range"
                     min="0" max="${N_STEPS.length - 1}" step="1" value="${this.nIndex}">
              <output class="viz__n-value" for="viz-n">8</output>
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
        <button class="viz__play" type="button" aria-label="播放动画">
          <span class="viz__play-icon" aria-hidden="true"></span>
        </button>
        <div class="viz__scrub-wrap">
          <input class="viz__scrub" type="range" min="0" max="1000" step="1" value="0"
                 aria-label="动画进度">
          <div class="viz__marks" aria-hidden="true"></div>
        </div>
      </div>
    `;

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;

    this.shiftWrap = q<SVGGElement>('.viz__shift');
    this.rectLayer = q<SVGGElement>('.viz__rects');
    this.tickLayer = q<SVGGElement>('.viz__ticks');
    this.panel = q<HTMLElement>('.viz__panel');
    this.explain = q<HTMLElement>('.viz__panel-b');
    this.nRange = q<HTMLInputElement>('.viz__n-range');
    this.nLabel = q<HTMLElement>('.viz__n-value');
    this.sumLower = q<HTMLElement>('[data-sum="lower"]');
    this.sumUpper = q<HTMLElement>('[data-sum="upper"]');
    this.sumExact = q<HTMLElement>('[data-sum="exact"]');
    this.scrub = q<HTMLInputElement>('.viz__scrub');
    this.playBtn = q<HTMLButtonElement>('.viz__play');

    this.curveLayer = el('g', { class: 'viz__curve-layer' });
    this.buildStatic();

    q<HTMLButtonElement>('.viz__back').addEventListener('click', () => this.onBack());

    this.buildMarks();
    this.bindEvents();
    this.update(0);
  }

  // ── 静态图形：网格、坐标轴、曲线、阴影 ──
  private buildStatic(): void {
    const grid = this.root.querySelector('.viz__grid') as SVGGElement;

    // x / y 轴
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

    // 轴上的刻度（y 轴 1..3，x 轴 0 与 a）
    for (let v = 1; v <= 3; v += 1) {
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

    // 阴影区（真实面积）
    grid.append(el('path', { d: areaPath(), class: 'viz__area' }));

    // 曲线 + 端点
    this.curveLayer.append(
      el('path', { d: curvePath(), class: 'viz__curve' }),
      el('circle', { cx: px(A), cy: py(f(A)), r: 4, class: 'viz__curve-dot' }),
      el('circle', { cx: px(0), cy: py(f(0)), r: 4, class: 'viz__curve-dot' }),
    );

    // f(x) 标注
    const label = el('text', {
      x: px(A) + 18, y: py(f(A)) - 6, class: 'viz__curve-label',
    });
    label.textContent = 'f(x)';
    this.curveLayer.append(label);

    // 0 与 a 的横轴标签
    const zero = el('text', {
      x: px(0), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle',
    });
    zero.textContent = '0';
    const aa = el('text', {
      x: px(A), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle',
    });
    aa.textContent = 'a';

    // 第二关键帧要整体左移，所以**所有**绘图元素都得进这个容器 ——
    // 只放轴和曲线的话，矩形与分点刻度会留在原地，左移后整幅图就错位了
    // （表现为矩形比坐标轴偏右一大截）。
    const fixed = el('g', { class: 'viz__fixed' });
    fixed.append(zero, aa);
    this.shiftWrap.append(grid, this.curveLayer, this.rectLayer, this.tickLayer, fixed);
  }

  /** 三个关键帧的标记点 */
  private buildMarks(): void {
    const host = this.root.querySelector('.viz__marks') as HTMLElement;
    KEYFRAMES.forEach((pos, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'viz__mark';
      dot.style.left = `${pos * 100}%`;
      dot.dataset.index = String(index);
      dot.setAttribute('aria-label', `关键帧 ${index}`);
      dot.addEventListener('click', () => {
        this.stop();
        this.setProgress(pos);
      });
      host.append(dot);
      this.marks.push(dot);
    });
  }

  private bindEvents(): void {
    this.nRange.addEventListener('input', () => {
      this.nIndex = Number(this.nRange.value);
      this.nLabel.textContent = String(N_STEPS[this.nIndex]);
      this.update(this.t);
    });

    this.scrub.addEventListener('input', () => {
      this.stop();
      this.setProgress(Number(this.scrub.value) / 1000);
    });

    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stop();
      else this.play();
    });

    // 空格播放/暂停（不劫持输入框里的空格）
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      const target = event.target as HTMLElement;
      if (target.closest('input, button, textarea')) return;
      event.preventDefault();
      if (this.playing) this.stop();
      else this.play();
    });
  }

  /** 设置进度并刷新画面（同时同步进度条与关键帧高亮） */
  setProgress(t: number): void {
    this.t = Math.min(1, Math.max(0, t));
    this.scrub.value = String(Math.round(this.t * 1000));
    this.update(this.t);
  }

  play(): void {
    if (this.playing) return;
    // 播完一遍再按播放：从头开始
    if (this.t >= 0.999) this.t = 0;
    this.playing = true;
    this.playBtn.classList.add('is-playing');
    this.playBtn.setAttribute('aria-label', '暂停动画');
    this.lastFrame = performance.now();
    const step = (now: number): void => {
      if (!this.playing) return;
      const dt = Math.min(64, now - this.lastFrame); // 切后台回来别一下跳完
      this.lastFrame = now;
      this.t = Math.min(1, this.t + dt / 9000); // 全片 9 秒
      this.scrub.value = String(Math.round(this.t * 1000));
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
  }

  /** 当前应显示的 n */
  private currentN(): number {
    const userN = N_STEPS[this.nIndex];
    if (this.t <= T_KF1) {
      // 关键帧 0 → 1：n 从 1 长到用户选的数
      const p = smoothstep(T_N_START, T_KF1, this.t);
      return Math.max(1, Math.round(1 + (userN - 1) * p));
    }
    // 关键帧 1 → 2：n 从用户选的数长到最大
    const p = smoothstep(T_KF1, T_CONVERGE_END, this.t);
    return Math.max(1, Math.round(userN + (N_MAX - userN) * p));
  }

  /** 重画矩形与刻度（n 变化时才调用） */
  private redrawRects(n: number): void {
    this.drawnN = n;
    const h = A / n;

    const rects = document.createDocumentFragment();
    for (let i = 0; i < n; i += 1) {
      const x0 = i * h;
      const x1 = (i + 1) * h;
      const left = px(x0);
      const width = px(x1) - left;

      // 下和：以左端点高度为准（单调递增时低于曲线）
      const lowerH = py(0) - py(f(x0));
      rects.append(
        el('rect', {
          x: left.toFixed(2), y: py(f(x0)).toFixed(2),
          width: Math.max(0, width - 0.6).toFixed(2), height: Math.max(0, lowerH).toFixed(2),
          class: 'viz__rect viz__rect--lower',
        }),
      );

      // 上和：以右端点高度为准（高于曲线）
      const upperH = py(0) - py(f(x1));
      rects.append(
        el('rect', {
          x: left.toFixed(2), y: py(f(x1)).toFixed(2),
          width: Math.max(0, width - 0.6).toFixed(2), height: Math.max(0, upperH).toFixed(2),
          class: 'viz__rect viz__rect--upper',
        }),
      );
    }
    this.rectLayer.replaceChildren(rects);

    // 分点刻度。
    //
    // 首尾的「0」「a」由静态层画（它们不随 n 变），这里只画中间那些，
    // 否则两套标签会叠在一起 —— 之前就重叠出一个「00」。
    //
    // n 小的时候每个分点都标上 x1..x(n-1)，这是让读者数得清有几个小区间；
    // n 一多标签就会挤成一团，退化成只标中点。
    const ticks = document.createDocumentFragment();
    const labelAll = n <= 10;
    const mid = Math.floor(n / 2);

    for (let i = 1; i < n; i += 1) {
      const x = px(i * h);
      const showLabel = labelAll || i === mid;

      ticks.append(
        el('line', {
          x1: x, y1: PLOT.bottom, x2: x, y2: PLOT.bottom + 7, class: 'viz__divider',
        }),
      );

      if (showLabel) {
        const label = el('text', {
          x, y: PLOT.bottom + 24, class: 'viz__divider-label', 'text-anchor': 'middle',
        });
        label.textContent = `x${i}`;
        ticks.append(label);
      }
    }
    this.tickLayer.replaceChildren(ticks);
  }

  /** 主刷新：所有随 t 连续变化的量都在这里 */
  private update(t: number): void {
    const n = this.currentN();
    if (n !== this.drawnN) this.redrawRects(n);

    // 矩形随 n 增大而变淡：单个矩形越来越细，颜色压淡才不至于糊成一块
    const rectAlpha = 1 - smoothstep(0.3, 0.85, t) * 0.45;
    this.rectLayer.style.opacity = String(
      smoothstep(T_N_START, T_N_START + 0.08, t) * rectAlpha,
    );

    // 第二关键帧：图形整体左移，给右侧文字让位
    const shift = smoothstep(T_SHIFT_START, T_SHIFT_END, t);
    this.shiftWrap.setAttribute('transform', `translate(${(-70 * shift).toFixed(1)}, 0)`);

    // 面板 A（滑动条 + 面积值）进退场
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

    // 三个面积值
    this.sumLower.textContent = fmt(lowerSum(n));
    this.sumUpper.textContent = fmt(upperSum(n));
    this.sumExact.textContent = fmt(EXACT);

    // 数值越接近，越高亮「精确值」那一栏，暗示三者正在合流
    const gap = (upperSum(n) - lowerSum(n)) / EXACT;
    this.sumExact.parentElement?.classList.toggle('is-converged', gap < 0.01);

    // 关键帧高亮
    this.marks.forEach((dot, index) => {
      const distance = Math.abs(t - KEYFRAMES[index]);
      dot.classList.toggle('is-active', distance < 0.06);
    });
  }

  /** 让视图获得焦点，方便键盘操作 */
  focus(): void {
    this.root.querySelector<HTMLElement>('.viz__play')?.focus();
  }
}
