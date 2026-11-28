/**
 * 定积分与黎曼和
 *
 * 只实现这个可视化特有的部分：绘图、面板、每帧状态。
 * 进度条、播放控件、导入语、说明文字的显隐都由 VizShell 负责。
 *
 * 叙事按「问题 → 笨办法 → 改进 → 严格化 → 结论」推进，五幕：
 *   0  问题    曲线下这块不规则区域，没法用公式直接算
 *   1  笨办法  只画一个矩形去填，差的那块用琥珀色标出来（误差 55%）
 *   2  切细    把区间切成更多小段，琥珀色的缝跟着变窄
 *   3  夹逼    这时才引入上和：真实值被夹在「上和」与「下和」之间
 *   4  结论    n 推到 128，缝几乎消失，这就是定积分
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
import { el, h, scale, smoothstep } from '../svg';
import type { VizContext, VizDefinition } from '../types';
import type { VizSegment } from '../timeline';

/** 绘图区在 viewBox 里的边界 */
const PLOT = { left: 74, right: 700, top: 58, bottom: 348 } as const;
const VIEW_W = 720;
const VIEW_H = 420;

const xToPx = scale([0, A], [PLOT.left, PLOT.right]);
const yToPx = scale([0, Y_MAX], [PLOT.bottom, PLOT.top]);

const SEGMENTS: readonly VizSegment[] = [
  { tFrom: 0, tTo: 0.2, seconds: 2.2 },
  { tFrom: 0.2, tTo: 0.62, seconds: 4.2 },
  { tFrom: 0.62, tTo: 0.8, seconds: 2.2 },
  { tFrom: 0.8, tTo: 1, seconds: 3.2 },
];

const KEYFRAMES = [0, 0.2, 0.62, 0.8, 1] as const;

// ── 阶段边界 ──
const T_CURVE_IN_START = 0.06;
const T_CURVE_IN_END = 0.2;
const T_RECT_IN_START = 0.13;
const T_RECT_IN_END = 0.2;
const T_KF_FINE = 0.62;
const T_BOUNDS_IN_START = 0.64;
const T_BOUNDS_IN_END = 0.76;
const T_KF_BOUNDS = 0.8;
const T_CONVERGE_END = 0.94;
const T_SHIFT_START = 0.82;
const T_SHIFT_END = 0.96;

/** 第二幕切细到头时的分割数 */
const N_FINE = 16;

const INTRO =
  '曲线与 x 轴之间那块不规则的区域，没有现成的面积公式。' +
  '但我们可以用一排矩形去「填」它 —— 填得越细，就越接近。';

/** 曲线路径 */
function curvePath(): string {
  const points: string[] = [];
  const steps = 260;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`${i === 0 ? 'M' : 'L'}${xToPx(x).toFixed(2)},${yToPx(f(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 曲边梯形（曲线下方整块） */
function areaPath(): string {
  const points: string[] = [`M${xToPx(0).toFixed(2)},${yToPx(0).toFixed(2)}`];
  const steps = 260;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * A;
    points.push(`L${xToPx(x).toFixed(2)},${yToPx(f(x)).toFixed(2)}`);
  }
  points.push(`L${xToPx(A).toFixed(2)},${yToPx(0).toFixed(2)}`, 'Z');
  return points.join(' ');
}

/** 某个区间上「矩形没盖住的那条缝」 */
function gapPath(x0: number, x1: number, base: number): string {
  const points: string[] = [`M${xToPx(x0).toFixed(2)},${yToPx(base).toFixed(2)}`];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    points.push(`L${xToPx(x).toFixed(2)},${yToPx(f(x)).toFixed(2)}`);
  }
  points.push(`L${xToPx(x1).toFixed(2)},${yToPx(base).toFixed(2)}`, 'Z');
  return points.join(' ');
}

export function createRiemannViz(): VizDefinition {
  // ── 绘图层 ──
  let gridLayer: SVGGElement;
  let curveLayer: SVGGElement;
  let lowerLayer: SVGGElement;
  let upperLayer: SVGGElement;
  let gapLayer: SVGGElement;
  let tickLayer: SVGGElement;
  let shiftWrap: SVGGElement;

  // ── 面板 ──
  let nRange: HTMLInputElement;
  let nLabel: HTMLElement;
  let sumLower: HTMLElement;
  let sumUpper: HTMLElement;
  let sumExact: HTMLElement;
  let errValue: HTMLElement;
  let errFill: HTMLElement;

  let userN = N_FINE;
  let drawnN = -1;
  let panelEl: HTMLElement;

  /** 当前分割数：先长到用户选的 n，第四幕再推到上限 */
  const currentN = (t: number): number => {
    if (t <= T_RECT_IN_END) return 1;

    const target = Math.max(N_FINE, userN);
    if (t < T_KF_FINE) {
      const p = smoothstep(T_RECT_IN_END, T_KF_FINE, t);
      return Math.max(2, Math.round(1 + (target - 1) * p));
    }
    if (t < T_KF_BOUNDS) return target;

    const p = smoothstep(T_KF_BOUNDS, T_CONVERGE_END, t);
    return Math.max(target, Math.round(target + (N_MAX - target) * p));
  };

  /** 重画矩形、误差缝与刻度 */
  const redraw = (n: number): void => {
    drawnN = n;
    const bounds = intervalBounds(n);
    const seam = n > 48 ? 0 : 0.6;

    const lower = document.createDocumentFragment();
    const upper = document.createDocumentFragment();
    const gaps = document.createDocumentFragment();

    for (const { x0, x1, min, max } of bounds) {
      const left = xToPx(x0);
      const width = Math.max(0, xToPx(x1) - left - seam);

      lower.append(
        el('rect', {
          x: left.toFixed(2), y: yToPx(min).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, yToPx(0) - yToPx(min)).toFixed(2),
          class: 'viz__rect viz__rect--lower',
        }),
      );

      gaps.append(el('path', { d: gapPath(x0, x1, min), class: 'viz__gap-area' }));

      upper.append(
        el('rect', {
          x: left.toFixed(2), y: yToPx(max).toFixed(2),
          width: width.toFixed(2), height: Math.max(0, yToPx(0) - yToPx(max)).toFixed(2),
          class: 'viz__rect viz__rect--upper',
        }),
      );
    }

    lowerLayer.replaceChildren(lower);
    gapLayer.replaceChildren(gaps);
    upperLayer.replaceChildren(upper);

    // 分点刻度。标签按可用宽度决定显不显示；摆不下就整排不显示。
    const plotWidth = PLOT.right - PLOT.left;
    const labelBudget = Math.floor((plotWidth * 0.86) / 20);
    const showLabels = n <= labelBudget;

    const ticks = document.createDocumentFragment();
    for (let i = 1; i < bounds.length; i += 1) {
      const x = xToPx(bounds[i].x0);
      ticks.append(
        el('line', { x1: x, y1: PLOT.bottom, x2: x, y2: PLOT.bottom + 7, class: 'viz__divider' }),
      );
      if (!showLabels) continue;

      const label = el('text', {
        x, y: PLOT.bottom + 24, class: 'viz__divider-label', 'text-anchor': 'middle',
      });
      label.textContent = 'x';
      const sub = el('tspan', { dy: '3.4', 'font-size': '8.5' });
      sub.textContent = String(i);
      label.append(sub);
      ticks.append(label);
    }
    tickLayer.replaceChildren(ticks);
  };

  // 说明文字里的 $...$ 由 KaTeX 渲染（见 math-text.ts）
  const captionFor = (t: number): string => {
    if (t < T_RECT_IN_START) return '曲线下这块不规则的区域，没有现成的面积公式。';
    if (t <= T_KF_FINE) return '用矩形去填。填得越细，露出来的那道缝就越窄。';
    if (t <= T_KF_BOUNDS) {
      return '缝窄到一定程度，真实值就被夹在中间：' +
        '$\\sum m_i\\Delta x_i \\le \\int_0^a f \\le \\sum M_i\\Delta x_i$';
    }
    return '两条边界合拢，这个极限就是 $\\int_0^a f(x)\\,dx$';
  };

  return {
    segments: SEGMENTS,
    keyframes: KEYFRAMES,
    intro: INTRO,

    // 这一节讲完之后往下走：黎曼和「收敛」到底是什么意思，
    // 以及什么样的函数根本收敛不了。
    deeper: {
      contentId: 'integrability',
      label: '深入：可积是什么意思',
    },

    mountFigure(host: HTMLElement): void {
      const svg = el('svg', {
        class: 'viz__plot', viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
        role: 'img', 'aria-label': '函数曲线、矩形逼近与误差示意',
      });

      gridLayer = el('g', { class: 'viz__grid' });
      curveLayer = el('g', { class: 'viz__curve-layer' });
      lowerLayer = el('g', { class: 'viz__lower' });
      gapLayer = el('g', { class: 'viz__gap' });
      upperLayer = el('g', { class: 'viz__upper' });
      tickLayer = el('g', { class: 'viz__ticks' });
      shiftWrap = el('g', { class: 'viz__shift' });

      // 坐标轴与刻度
      gridLayer.append(
        el('line', { x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom, class: 'viz__axis' }),
        el('line', { x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom, class: 'viz__axis' }),
      );
      for (let v = 1; v < Y_MAX; v += 1) {
        gridLayer.append(
          el('line', { x1: PLOT.left - 6, y1: yToPx(v), x2: PLOT.left, y2: yToPx(v), class: 'viz__tick' }),
          el('text', { x: PLOT.left - 12, y: yToPx(v) + 4, class: 'viz__tick-label', 'text-anchor': 'end' }),
        );
        (gridLayer.lastElementChild as SVGTextElement).textContent = String(v);
      }

      // 曲边梯形底纹
      gridLayer.append(el('path', { d: areaPath(), class: 'viz__area' }));

      // 曲线与端点
      curveLayer.append(
        el('path', { d: curvePath(), class: 'viz__curve' }),
        el('circle', { cx: xToPx(A), cy: yToPx(f(A)), r: 4, class: 'viz__curve-dot' }),
        el('circle', { cx: xToPx(0), cy: yToPx(f(0)), r: 4, class: 'viz__curve-dot' }),
      );
      const fLabel = el('text', { x: xToPx(A) + 16, y: yToPx(f(A)) + 4, class: 'viz__curve-label' });
      fLabel.textContent = 'f(x)';
      curveLayer.append(fLabel);

      const zero = el('text', { x: xToPx(0), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle' });
      zero.textContent = '0';
      const aa = el('text', { x: xToPx(A), y: PLOT.bottom + 24, class: 'viz__axis-label', 'text-anchor': 'middle' });
      aa.textContent = 'a';
      gridLayer.append(zero, aa);

      // 层级：底纹 → 曲线 → 下和 → 误差缝 → 上和 → 刻度
      shiftWrap.append(gridLayer, curveLayer, lowerLayer, gapLayer, upperLayer, tickLayer);
      svg.append(shiftWrap);
      host.append(svg);
    },

    mountPanel(host: HTMLElement, ctx: VizContext): void {
      panelEl = h('div', { class: 'viz__panel-a' });
      panelEl.innerHTML = `
        <label class="viz__n-label" for="viz-n">分割数 n</label>
        <div class="viz__n-row">
          <input class="viz__n-range" id="viz-n" type="range"
                 min="${N_MIN}" max="${N_MAX}" step="1" value="${N_FINE}">
          <output class="viz__n-value" for="viz-n">${N_FINE}</output>
        </div>

        <div class="viz__error">
          <div class="viz__error-row">
            <span class="viz__error-label">误差</span>
            <span class="viz__error-value">—</span>
          </div>
          <div class="viz__error-track"><div class="viz__error-fill"></div></div>
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
      `;
      host.append(panelEl);

      nRange = panelEl.querySelector('.viz__n-range') as HTMLInputElement;
      nLabel = panelEl.querySelector('.viz__n-value') as HTMLElement;
      sumLower = panelEl.querySelector('[data-sum="lower"]') as HTMLElement;
      sumUpper = panelEl.querySelector('[data-sum="upper"]') as HTMLElement;
      sumExact = panelEl.querySelector('[data-sum="exact"]') as HTMLElement;
      errValue = panelEl.querySelector('.viz__error-value') as HTMLElement;
      errFill = panelEl.querySelector('.viz__error-fill') as HTMLElement;

      nRange.addEventListener('input', () => {
        userN = Number(nRange.value);
        // 拖滑动条却没到能看见分割的那一幕，先把进度推过去 ——
        // 否则改了 n 图上没反应。
        // 推到 T_KF_FINE 而不是 T_RECT_IN_END：后者是「一个矩形」那一幕，
        // 在那儿 currentN 恒为 1，拖到 40 也只会显示 1 个矩形。
        if (ctx.progress < T_KF_FINE) ctx.setProgress(T_KF_FINE);
        else ctx.setProgress(ctx.progress);
      });
    },

    update(t: number): void {
      const n = currentN(t);
      if (n !== drawnN) redraw(n);

      // 坐标系与曲线。开场就给 0.5 的可见度：只留一句导入语、图完全空着，
      // 点第一帧会以为没加载。
      const curveOpacity = 0.5 + 0.5 * smoothstep(T_CURVE_IN_START, T_CURVE_IN_END, t);
      gridLayer.style.opacity = String(curveOpacity);
      curveLayer.style.opacity = String(curveOpacity);

      // 下和与误差缝
      const lowerOpacity = smoothstep(T_RECT_IN_START, T_RECT_IN_END, t) *
        (1 - smoothstep(0.9, 1, t) * 0.35);
      lowerLayer.style.opacity = String(lowerOpacity);
      gapLayer.style.opacity = String(lowerOpacity);
      tickLayer.style.opacity = String(lowerOpacity);

      // 上和：第三幕起淡入，收敛后淡一些（128 个虚线框会糊成一片纹理）
      const upperOpacity = smoothstep(T_BOUNDS_IN_START, T_BOUNDS_IN_END, t) *
        (1 - smoothstep(0.9, 1, t) * 0.45);
      upperLayer.style.opacity = String(upperOpacity);

      // 图形左移给文字让位
      const shift = smoothstep(T_SHIFT_START, T_SHIFT_END, t);
      shiftWrap.setAttribute('transform', `translate(${(-60 * shift).toFixed(1)}, 0)`);

      // 面板
      const panelOpacity = smoothstep(0.14, 0.28, t);
      panelEl.style.opacity = String(panelOpacity);
      panelEl.style.pointerEvents = panelOpacity < 0.5 ? 'none' : 'auto';

      // 数值
      const lower = lowerSum(n);
      const upper = upperSum(n);
      nLabel.textContent = String(n);
      nRange.value = String(n);
      sumLower.textContent = fmt(lower);
      sumUpper.textContent = fmt(upper);
      sumExact.textContent = fmt(EXACT);

      // 误差始终是「下和离真实值还差多少」。
      // 不要在看上和时切成「上和 − 下和」—— 那会让数字从 4.6% 跳到 9.1%，
      // 明明是在变准，读数却变差了。
      const err = Math.max(0, Math.min(1, (EXACT - lower) / EXACT));
      errValue.textContent = `${(err * 100).toFixed(1)}%`;
      errFill.style.width = `${err * 100}%`;
      errFill.classList.toggle('is-tight', err < 0.05);
      sumExact.parentElement?.classList.toggle('is-converged', err < 0.02);
    },

    caption: captionFor,
  };
}
