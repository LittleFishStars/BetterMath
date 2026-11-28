/**
 * 可积性：这是「定积分与黎曼和」的**第二部分**，不是独立页面。
 *
 * riemann/definition.ts 直接复用这里的 mountFigure / update / caption，
 * 把它接在黎曼和后面共用一条进度条；segments 与 keyframes 由外层统一管理，
 * 本文件里的那两份只是让返回值满足 VizDefinition 的形状，运行时不参与排程。
 *
 * 承接第一部分：那边把面积逼近出来了，这里追问
 * ——「黎曼和收敛」到底是什么意思？是不是所有函数都行？
 *
 * 五幕：
 *   0  问题    黎曼和逼近出一个数，但「收敛」需要一个可检验的判据
 *   1  判据    达布判据：上和与下和的夹层能压到任意小 → 可积
 *   2  反例一  狄利克雷函数：任何区间里都有有理点和无理点，
 *              夹层恒等于区间长度，怎么分都不变小
 *   3  反例二  1/√x 在 0 附近无界：上和根本不是有限数，
 *              黎曼和的定义要求 f 有界
 *   4  结论    有界 + 间断点集零测 ⟺ 黎曼可积；
 *              Thomae 函数间断点无穷多却可积，说明关键在「测度」而非「个数」
 *
 * 渲染用四个独立的 <g> 场景，按进度交叉淡化 —— 三个例子的函数不同，
 * 没法挤在同一套坐标里连续变形，分开画反而更清楚。
 */
import { el, h, scale, smoothstep } from '../svg';
import type { VizContext, VizDefinition } from '../types';
import type { VizSegment } from '../timeline';
import {
  DIRICHLET_GAP,
  DIRICHLET_LOWER,
  DIRICHLET_UPPER,
  GOOD_SPAN,
  GOOD_Y_MAX,
  fmt,
  fmtBound,
  good,
  goodBounds,
  goodLower,
  goodUpper,
  unbounded,
} from './math';

/** 绘图区在 viewBox 里的边界（与黎曼和保持一致，换页时图形位置不跳） */
const PLOT = { left: 74, right: 700, top: 58, bottom: 348 } as const;
const VIEW_W = 720;
const VIEW_H = 420;

/** 场景一：好函数的坐标映射 */
const aX = scale([0, GOOD_SPAN], [PLOT.left, PLOT.right]);
const aY = scale([0, GOOD_Y_MAX], [PLOT.bottom, PLOT.top]);

/** 场景二：狄利克雷在 [0, 1] 上，y 只有 0 和 1 两个值 */
const bX = scale([0, 1], [PLOT.left, PLOT.right]);
const bY = scale([0, 1.35], [PLOT.bottom, PLOT.top]);

/** 场景三：1/√x 在 (0, 1] 上，y 画到 3 为止，再往上用箭头示意 */
const cX = scale([0, 1], [PLOT.left, PLOT.right]);
const cY = scale([0, 3], [PLOT.bottom, PLOT.top]);

// ── 分段与关键帧 ──

const SEGMENTS: readonly VizSegment[] = [
  { tFrom: 0, tTo: 0.18, seconds: 3.2 }, // 0 问题
  { tFrom: 0.18, tTo: 0.45, seconds: 5.4 }, // 1 判据
  { tFrom: 0.45, tTo: 0.68, seconds: 5.0 }, // 2 反例一
  { tFrom: 0.68, tTo: 0.86, seconds: 4.2 }, // 3 反例二
  { tFrom: 0.86, tTo: 1, seconds: 4.6 }, // 4 结论
];

const KEYFRAMES = [0, 0.18, 0.45, 0.68, 0.86, 1] as const;

// ── 场景切换的时间边界 ──
//
// 关键帧（0 / 0.18 / 0.45 / 0.68 / 0.86 / 1）既是段边界，也是场景切换点。
// 交叉淡化安排在「边界前 CROSSFADE 处开始、到边界正好完成」：
// 点关键帧看到的一定是干净的单场景画面，而不是两张图各半透明叠在一起。
const CROSSFADE = 0.06;

const T_KF_JUDGE = 0.18;
const T_KF_DIRICHLET = 0.45;
const T_KF_UNBOUNDED = 0.68;
const T_KF_CONCLUDE = 0.86;

/** 场景一 → 二、二 → 三、三 → 四的交叉起点 */
const T_AB_START = T_KF_DIRICHLET - CROSSFADE;
const T_BC_START = T_KF_UNBOUNDED - CROSSFADE;
const T_CD_START = T_KF_CONCLUDE - CROSSFADE;

// ── 场景一内部：分割加细 ──
const T_A_SPLIT_START = 0.2;
const T_A_SPLIT_END = 0.4;

/** 场景一最终分割数：再大就看不清矩形边界了 */
const A_N_MAX = 24;

/** 场景二固定用 6 段 —— 要能看清每段里「上下两排点都在」 */
const B_N = 6;

const INTRO =
  '黎曼和逼近出一个数，但「收敛」需要一条能动手检验的判据。' +
  '这一节看这条判据，以及两种让它彻底失效的函数。';

// ── 路径构造 ──

/** 场景一的曲线 */
function goodCurvePath(): string {
  const points: string[] = [];
  const steps = 220;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * GOOD_SPAN;
    points.push(`${i === 0 ? 'M' : 'L'}${aX(x).toFixed(2)},${aY(good(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 场景一某个小区间上「上和与下和之间的夹层」 */
function gapPath(x0: number, x1: number, min: number, max: number): string {
  return [
    `M${aX(x0).toFixed(2)},${aY(min).toFixed(2)}`,
    `L${aX(x1).toFixed(2)},${aY(min).toFixed(2)}`,
    `L${aX(x1).toFixed(2)},${aY(max).toFixed(2)}`,
    `L${aX(x0).toFixed(2)},${aY(max).toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** 场景三的曲线：只画 y ≤ 3 的部分，超出视口的那截交给箭头 */
function unboundedCurvePath(): string {
  const points: string[] = [];
  const yTop = 3;
  const xStart = 1 / (yTop * yTop); // y = 1/√x = 3 时 x = 1/9
  const steps = 160;
  for (let i = 0; i <= steps; i += 1) {
    const x = xStart + ((1 - xStart) * i) / steps;
    points.push(`${i === 0 ? 'M' : 'L'}${cX(x).toFixed(2)},${cY(unbounded(x)).toFixed(2)}`);
  }
  return points.join(' ');
}

export function createIntegrabilityViz(): VizDefinition {
  // ── 场景容器 ──
  let sceneA: SVGGElement;
  let sceneB: SVGGElement;
  let sceneC: SVGGElement;
  let sceneD: SVGGElement;

  // ── 共用坐标轴 ──
  let axesLayer: SVGGElement;

  // ── 场景一子层 ──
  let aCurve: SVGGElement;
  let aLower: SVGGElement;
  let aUpper: SVGGElement;
  let aGap: SVGGElement;

  // ── 面板 ──
  let panelEl: HTMLElement;
  let upperValue: HTMLElement;
  let lowerValue: HTMLElement;
  let gapValue: HTMLElement;
  let gapFill: HTMLElement;
  let metricLabel: HTMLElement;
  let metricNote: HTMLElement;

  let drawnN = -1;

  /** 场景一当前分割数：从 1 长到 A_N_MAX */
  const aN = (t: number): number => {
    const p = smoothstep(T_A_SPLIT_START, T_A_SPLIT_END, t);
    return Math.max(1, Math.round(1 + (A_N_MAX - 1) * p));
  };

  /** 重画场景一的矩形与夹层 */
  const redrawA = (n: number): void => {
    drawnN = n;
    const bounds = goodBounds(n);
    const lower = document.createDocumentFragment();
    const upper = document.createDocumentFragment();
    const gaps = document.createDocumentFragment();

    for (const { x0, x1, min, max } of bounds) {
      const left = aX(x0);
      const width = Math.max(0, aX(x1) - left);

      lower.append(
        el('rect', {
          x: left.toFixed(2),
          y: aY(min).toFixed(2),
          width: width.toFixed(2),
          height: Math.max(0, aY(0) - aY(min)).toFixed(2),
          class: 'viz__rect viz__rect--lower',
        }),
      );

      gaps.append(el('path', { d: gapPath(x0, x1, min, max), class: 'viz__gap-area' }));

      upper.append(
        el('rect', {
          x: left.toFixed(2),
          y: aY(max).toFixed(2),
          width: width.toFixed(2),
          height: Math.max(0, aY(0) - aY(max)).toFixed(2),
          class: 'viz__rect viz__rect--upper',
        }),
      );
    }

    aLower.replaceChildren(lower);
    aGap.replaceChildren(gaps);
    aUpper.replaceChildren(upper);
  };

  // 说明文字里的 $...$ 由 KaTeX 渲染（见 math-text.ts）
  const captionFor = (t: number): string => {
    if (t < T_KF_JUDGE) return '黎曼和给了一个数。但要称它「积分」，得先说明什么时候它真的收敛。';
    if (t < T_KF_DIRICHLET) {
      return (
        '判据是达布条件：把区间切细，上和的夹层能压到任意小，' +
        '即 $\\overline{\\int} f=\\underline{\\int} f$。'
      );
    }
    if (t < T_KF_UNBOUNDED) {
      return (
        '狄利克雷函数：有理点取 1、无理点取 0。' +
        '任何区间里两种点都稠密，所以 $U-L\\equiv 1$。'
      );
    }
    if (t < T_KF_CONCLUDE) {
      return '换成 $1/\\sqrt{x}$：它在 0 附近无界，上和 $M_i$ 根本没有有限值。';
    }
    return '有界 + 间断点集零测，才是可积。间断点「多」不等于「测度大」。';
  };

  return {
    segments: SEGMENTS,
    keyframes: KEYFRAMES,
    intro: INTRO,

    // 这里先不挂 deeper：下一节「牛顿-莱布尼茨公式」还没做，
    // 挂上去只会得到一个点了没反应的按钮。等那一节写好了再加一行。

    mountFigure(host: HTMLElement): void {
      const svg = el('svg', {
        class: 'viz__plot',
        viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
        role: 'img',
        'aria-label': '可积判据、狄利克雷函数与无界函数的对比示意',
      });

      // ── 共用坐标轴（只有场景一、三用得上，画一次就够）──
      const axes = el('g', { class: 'viz__grid' });
      axesLayer = axes;
      axes.append(
        el('line', {
          x1: PLOT.left,
          y1: PLOT.bottom,
          x2: PLOT.right,
          y2: PLOT.bottom,
          class: 'viz__axis',
        }),
        el('line', {
          x1: PLOT.left,
          y1: PLOT.top,
          x2: PLOT.left,
          y2: PLOT.bottom,
          class: 'viz__axis',
        }),
      );

      // ── 场景一：好函数 ──
      sceneA = el('g', { class: 'viz__scene viz__scene--a' });
      aLower = el('g', { class: 'viz__lower' });
      aGap = el('g', { class: 'viz__gap' });
      aUpper = el('g', { class: 'viz__upper' });
      aCurve = el('g', { class: 'viz__curve-layer' });
      aCurve.append(
        el('path', { d: goodCurvePath(), class: 'viz__curve' }),
        (() => {
          const label = el('text', {
            // 挂在曲线右端的内侧上方：摆到外侧（x > PLOT.right）会被 viewBox 裁掉
            x: aX(GOOD_SPAN) - 6,
            y: aY(good(GOOD_SPAN)) - 12,
            'text-anchor': 'end',
            class: 'viz__curve-label',
          });
          label.textContent = 'f(x)';
          return label;
        })(),
      );
      sceneA.append(aLower, aGap, aUpper, aCurve);

      // ── 场景二：狄利克雷 ──
      sceneB = el('g', { class: 'viz__scene viz__scene--b' });
      sceneB.append(buildDirichlet(B_N));

      // ── 场景三：无界函数 ──
      sceneC = el('g', { class: 'viz__scene viz__scene--c' });
      sceneC.append(buildUnbounded());

      // ── 场景四：三例对比 ──
      sceneD = el('g', { class: 'viz__scene viz__scene--d' });
      sceneD.append(buildSummary());

      svg.append(axes, sceneA, sceneB, sceneC, sceneD);
      host.append(svg);
    },

    mountPanel(host: HTMLElement, _ctx: VizContext): void {
      panelEl = h('div', { class: 'viz__panel-a' });
      panelEl.innerHTML = `
        <p class="viz__metric-label">上和 − 下和</p>
        <p class="viz__metric-value" data-metric="gap">—</p>
        <div class="viz__error-track"><div class="viz__error-fill" data-metric="fill"></div></div>
        <p class="viz__metric-note" data-metric="note"></p>

        <dl class="viz__sums">
          <div class="viz__sum viz__sum--upper">
            <dt>上和</dt><dd class="viz__sum-value" data-sum="upper">—</dd>
          </div>
          <div class="viz__sum viz__sum--lower">
            <dt>下和</dt><dd class="viz__sum-value" data-sum="lower">—</dd>
          </div>
        </dl>
      `;
      host.append(panelEl);

      upperValue = panelEl.querySelector('[data-sum="upper"]') as HTMLElement;
      lowerValue = panelEl.querySelector('[data-sum="lower"]') as HTMLElement;
      gapValue = panelEl.querySelector('[data-metric="gap"]') as HTMLElement;
      gapFill = panelEl.querySelector('[data-metric="fill"]') as HTMLElement;
      metricLabel = panelEl.querySelector('.viz__metric-label') as HTMLElement;
      metricNote = panelEl.querySelector('[data-metric="note"]') as HTMLElement;
    },

    update(t: number): void {
      // ── 场景一 ──
      const n = aN(t);
      if (n !== drawnN) redrawA(n);

      // 不从 0 淡入：这一部分是被「深入」按钮切过来的，
      // 进来就该看到完整画面（淡入只会让第一屏又空着）。
      const aOpacity = 1 - smoothstep(T_AB_START, T_KF_DIRICHLET, t);
      sceneA.style.opacity = String(aOpacity);

      // 夹层随分割加细而变薄，所以上和的虚线也要一起淡 ——
      // 分段太多时虚线框会糊成一片纹理。
      const denseFade = 1 - smoothstep(0.32, 0.4, t) * 0.55;
      aUpper.style.opacity = String(denseFade);

      // ── 场景二 ──
      const bOpacity =
        smoothstep(T_AB_START, T_KF_DIRICHLET, t) * (1 - smoothstep(T_BC_START, T_KF_UNBOUNDED, t));
      sceneB.style.opacity = String(bOpacity);

      // ── 场景三 ──
      const cOpacity =
        smoothstep(T_BC_START, T_KF_UNBOUNDED, t) * (1 - smoothstep(T_CD_START, T_KF_CONCLUDE, t));
      sceneC.style.opacity = String(cOpacity);

      // ── 场景四 ──
      const dOpacity = smoothstep(T_CD_START, T_KF_CONCLUDE, t);
      sceneD.style.opacity = String(dOpacity);

      // 坐标轴只属于场景一（f 的曲线）和场景三（1/√x）。
      // 狄利克雷那幕没有坐标概念、结论幕是三张卡片 ——
      // 留着那对 L 形轴线和卡片抢视线，所以跟着淡出。
      axesLayer.style.opacity = String(Math.max(aOpacity, cOpacity));

      // ── 面板：跟着当前场景换指标 ──
      // 不做整体淡入 —— 第二部分一进来面板就该有内容
      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'none';

      if (t < T_KF_DIRICHLET) {
        // 场景一：真实的上下和，夹层随 n 收缩
        const lower = goodLower(n);
        const upper = goodUpper(n);
        const gap = upper - lower;
        const ratio = gap / Math.max(upper, 1e-6);
        metricLabel.textContent = '上和 − 下和';
        gapValue.textContent = fmt(gap);
        gapFill.style.width = `${Math.min(100, ratio * 100 * 3).toFixed(1)}%`;
        metricNote.textContent = n <= 1 ? '只有一段，夹层最厚' : `n = ${n}，夹层在缩小`;
        upperValue.textContent = fmt(upper);
        lowerValue.textContent = fmt(lower);
        gapFill.classList.remove('is-tight');
      } else if (t < T_KF_UNBOUNDED) {
        // 场景二：狄利克雷，差值恒为 1，与 n 无关
        metricLabel.textContent = '上和 − 下和';
        gapValue.textContent = fmt(DIRICHLET_GAP);
        gapFill.style.width = '100%';
        metricNote.textContent = '与分割数无关，恒等于区间长度';
        upperValue.textContent = fmt(DIRICHLET_UPPER);
        lowerValue.textContent = fmt(DIRICHLET_LOWER);
        gapFill.classList.remove('is-tight');
      } else if (t < T_KF_CONCLUDE) {
        // 场景三：无界，上和不存在
        metricLabel.textContent = '上确界 M';
        gapValue.textContent = fmtBound(Number.POSITIVE_INFINITY);
        gapFill.style.width = '100%';
        metricNote.textContent = 'x → 0⁺ 时 1/√x → ∞，上和没有有限值';
        upperValue.textContent = '∞';
        lowerValue.textContent = '不存在';
        gapFill.classList.remove('is-tight');
      } else {
        // 场景四：判据
        metricLabel.textContent = '可积的判据';
        gapValue.textContent = '有界 + 零测';
        gapFill.style.width = '0%';
        metricNote.textContent = '间断点集的测度必须为 0';
        upperValue.textContent = '—';
        lowerValue.textContent = '—';
        gapFill.classList.add('is-tight');
      }
    },

    caption: captionFor,
  };
}

/**
 * 场景二：狄利克雷函数的点阵
 *
 * 每个小区间里画两排点：上排代表有理点（值 1）、下排代表无理点（值 0）。
 * 两排点在**每一段**里都出现 —— 这正是它不可积的原因，
 * 不是「画得不够密」，而是任何尺度下两种点都还在。
 */
function buildDirichlet(n: number): SVGGElement {
  const g = el('g', { class: 'viz__dirichlet' });
  const step = 1 / n;

  // 每段之间的竖直分隔线。
  // 早先这里画的是「上和矩形」的虚线框 —— 它的上下边正好和 D=1 / D=0
  // 两排点重合，看上去只是一组竖线，反而让人以为是分隔线。
  // 现在只留真正的分隔线，夹层高度改由右侧的双箭头标注。
  for (let i = 1; i < n; i += 1) {
    const x = bX(i * step);
    g.append(
      el('line', {
        x1: x.toFixed(2),
        y1: bY(1).toFixed(2),
        x2: x.toFixed(2),
        y2: bY(0).toFixed(2),
        class: 'viz__guide',
      }),
    );
  }

  // 每一段里的两排点
  const dotsPerSegment = 9;
  for (let i = 0; i < n; i += 1) {
    const x0 = i * step;
    for (let k = 0; k < dotsPerSegment; k += 1) {
      const x = x0 + (step * (k + 0.5)) / dotsPerSegment;
      g.append(
        el('circle', { cx: bX(x).toFixed(2), cy: bY(1).toFixed(2), r: 2.1, class: 'viz__dot-rational' }),
        el('circle', { cx: bX(x).toFixed(2), cy: bY(0).toFixed(2), r: 2.1, class: 'viz__dot-irrational' }),
      );
    }
  }

  // 两条水平参考线
  g.append(
    el('line', {
      x1: PLOT.left,
      y1: bY(1),
      x2: PLOT.right,
      y2: bY(1),
      class: 'viz__guide',
    }),
    el('line', {
      x1: PLOT.left,
      y1: bY(0),
      x2: PLOT.right,
      y2: bY(0),
      class: 'viz__guide',
    }),
  );

  // 标注挂在 y 轴左侧：右侧只剩 20px，文字会被 viewBox 裁掉半截
  const top = el('text', {
    x: PLOT.left - 12,
    y: bY(1) + 4,
    'text-anchor': 'end',
    class: 'viz__curve-label',
  });
  top.textContent = 'D=1';
  const bottom = el('text', {
    x: PLOT.left - 12,
    y: bY(0) + 4,
    'text-anchor': 'end',
    class: 'viz__curve-label',
  });
  bottom.textContent = 'D=0';
  g.append(top, bottom);

  // 夹层标注：上下两排点之间那段距离永远是 1
  const bracket = el('text', {
    x: PLOT.left + 12,
    y: bY(0.5),
    class: 'viz__scene-tag',
  });
  bracket.textContent = '每一段里上下两排点都在';
  g.append(bracket);

  // 夹层高度：一段竖直双箭头，标「差 = 1」。
  // 这比画矩形更贴切 —— 这里的上下和之差就是这两排点之间的整段距离。
  const arrowX = bX(0.5);
  const topY = bY(1) + 6;
  const bottomY = bY(0) - 6;
  g.append(
    el('line', { x1: arrowX, y1: topY, x2: arrowX, y2: bottomY, class: 'viz__gap-arrow' }),
    el('path', {
      d: `M${arrowX - 4},${topY + 8} L${arrowX},${topY + 1} L${arrowX + 4},${topY + 8}`,
      class: 'viz__gap-arrow',
    }),
    el('path', {
      d: `M${arrowX - 4},${bottomY - 8} L${arrowX},${bottomY - 1} L${arrowX + 4},${bottomY - 8}`,
      class: 'viz__gap-arrow',
    }),
  );
  const gapLabel = el('text', {
    x: arrowX + 12,
    y: bY(0.5) + 4,
    class: 'viz__gap-label',
  });
  gapLabel.textContent = '差 = 1';
  g.append(gapLabel);

  return g;
}

/** 场景三：1/√x 冲向无穷 */
function buildUnbounded(): SVGGElement {
  const g = el('g', { class: 'viz__unbounded' });

  // 上和的示意矩形：第一段（贴 0）画到视口顶端，并用箭头表示还在往上
  const firstLeft = cX(0);
  const firstRight = cX(0.12);
  g.append(
    el('rect', {
      x: firstLeft.toFixed(2),
      y: PLOT.top,
      width: Math.max(0, firstRight - firstLeft).toFixed(2),
      height: (PLOT.bottom - PLOT.top).toFixed(2),
      class: 'viz__rect viz__rect--upper viz__rect--runaway',
    }),
  );

  g.append(el('path', { d: unboundedCurvePath(), class: 'viz__curve' }));

  // 顶部箭头 + ∞ 标注：曲线在视口之外还在继续上升
  const arrowX = cX(1 / 9);
  g.append(
    el('line', {
      x1: arrowX,
      y1: PLOT.top + 26,
      x2: arrowX,
      y2: PLOT.top - 2,
      class: 'viz__runaway-arrow',
    }),
    el('path', {
      d: `M${arrowX - 5},${PLOT.top + 8} L${arrowX},${PLOT.top - 4} L${arrowX + 5},${PLOT.top + 8}`,
      class: 'viz__runaway-arrow',
    }),
  );

  const inf = el('text', { x: arrowX + 12, y: PLOT.top + 12, class: 'viz__runaway-label' });
  inf.textContent = '∞';
  g.append(inf);

  const note = el('text', { x: PLOT.left + 16, y: PLOT.top + 96, class: 'viz__scene-tag' });
  note.textContent = 'M₁ 没有有限值 → 上和不存在';
  g.append(note);

  const axisZero = el('text', {
    x: cX(0),
    y: PLOT.bottom + 24,
    class: 'viz__axis-label',
    'text-anchor': 'middle',
  });
  axisZero.textContent = '0';
  const axisOne = el('text', {
    x: cX(1),
    y: PLOT.bottom + 24,
    class: 'viz__axis-label',
    'text-anchor': 'middle',
  });
  axisOne.textContent = '1';
  g.append(axisZero, axisOne);

  return g;
}

/** 最大公约数：Thomae 缩略图只画最简分数，否则同一个点会被画好几次 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 场景四：三个例子并排对比
 *
 * 每列：标题 → 缩略示意 → 判定。
 * 「不可积」用暖色（这是状态色，不是装饰色），可积用品牌蓝。
 */
function buildSummary(): SVGGElement {
  const g = el('g', { class: 'viz__summary' });

  const colW = 178;
  const gap = 26;
  const totalW = colW * 3 + gap * 2;
  const startX = (VIEW_W - totalW) / 2;
  const top = 92;

  const columns = [
    {
      title: '狄利克雷函数',
      verdict: '不可积',
      tone: 'bad' as const,
      draw: (x: number, y: number, w: number, h: number) => {
        // 密集点阵：上下两排一直并存
        const frag = document.createDocumentFragment();
        const rows = 5;
        const cols = 11;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const cx = x + 8 + ((w - 16) * c) / (cols - 1);
            const cy = y + 8 + ((h - 16) * r) / (rows - 1);
            const isTop = r % 2 === 0;
            frag.append(
              el('circle', {
                cx: cx.toFixed(1),
                cy: cy.toFixed(1),
                r: 1.7,
                class: isTop ? 'viz__dot-rational' : 'viz__dot-irrational',
              }),
            );
          }
        }
        return frag;
      },
      why: '差恒为 1',
    },
    {
      title: '1/√x 在 [0,1]',
      verdict: '不可积',
      tone: 'bad' as const,
      draw: (x: number, y: number, w: number, h: number) => {
        const frag = document.createDocumentFragment();
        // 一小段冲向顶端的曲线 + 箭头
        const points: string[] = [];
        for (let i = 0; i <= 24; i += 1) {
          const t = i / 24;
          const px = x + 10 + t * (w - 24);
          const py = y + h - 12 - Math.min(1, 1 / (0.25 + t * 0.9)) * (h - 20);
          points.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
        }
        frag.append(el('path', { d: points.join(' '), class: 'viz__curve' }));
        frag.append(
          el('line', {
            x1: x + 10,
            y1: y + 20,
            x2: x + 10,
            y2: y + 4,
            class: 'viz__runaway-arrow',
          }),
        );
        const inf = el('text', { x: x + 16, y: y + 12, class: 'viz__runaway-label' });
        inf.textContent = '∞';
        frag.append(inf);
        return frag;
      },
      why: '上和不存在',
    },
    {
      title: 'Thomae 函数',
      verdict: '可积',
      tone: 'good' as const,
      draw: (x: number, y: number, w: number, h: number) => {
        const frag = document.createDocumentFragment();
        // 只画最简分数 p/q（q ≤ 8）处的尖峰。
        // 早先是沿 x 均匀采样 —— 采样点恰好落在一串有理数上，
        // 高低相连就成了一个平滑的「山峰」，看起来像正态分布，完全误导。
        // 改成逐根柱子画，才是 Thomae 函数本来的样子：一堆孤立的尖峰。
        const baseline = y + h - 10;
        frag.append(
          el('line', { x1: x + 6, y1: baseline, x2: x + w - 6, y2: baseline, class: 'viz__guide' }),
        );
        for (let q = 2; q <= 8; q += 1) {
          for (let p = 1; p < q; p += 1) {
            if (gcd(p, q) !== 1) continue;
            const value = 1 / q;
            const px = x + 6 + (p / q) * (w - 12);
            const py = baseline - value * 2.3 * (h - 22);
            frag.append(
              el('line', {
                x1: px.toFixed(1),
                y1: baseline,
                x2: px.toFixed(1),
                y2: py.toFixed(1),
                class: 'viz__spike',
              }),
              el('circle', {
                cx: px.toFixed(1),
                cy: py.toFixed(1),
                r: 1.5,
                class: 'viz__dot-rational',
              }),
            );
          }
        }
        return frag;
      },
      why: '间断点零测',
    },
  ];

  columns.forEach((col, index) => {
    const x = startX + index * (colW + gap);

    // 卡片底（用填充色阶，不画边框）
    g.append(
      el('rect', {
        x,
        y: top,
        width: colW,
        height: 168,
        rx: 16,
        class: col.tone === 'bad' ? 'viz__card viz__card--bad' : 'viz__card',
      }),
    );

    // 标题
    const title = el('text', { x: x + colW / 2, y: top + 26, class: 'viz__card-title' });
    title.textContent = col.title;
    title.setAttribute('text-anchor', 'middle');
    g.append(title);

    // 缩略图
    const plotY = top + 40;
    const plotH = 82;
    g.append(
      el('rect', {
        x: x + 12,
        y: plotY,
        width: colW - 24,
        height: plotH,
        rx: 10,
        class: 'viz__card-plot',
      }),
    );
    g.append(col.draw(x + 12, plotY, colW - 24, plotH));

    // 判定
    const verdict = el('text', {
      x: x + colW / 2,
      y: top + 146,
      class: col.tone === 'bad' ? 'viz__card-verdict viz__card-verdict--bad' : 'viz__card-verdict',
    });
    verdict.textContent = col.verdict;
    verdict.setAttribute('text-anchor', 'middle');
    g.append(verdict);

    // 理由
    const why = el('text', {
      x: x + colW / 2,
      y: top + 164,
      class: 'viz__card-why',
    });
    why.textContent = col.why;
    why.setAttribute('text-anchor', 'middle');
    g.append(why);
  });

  // 顶部判据
  const rule = el('text', { x: VIEW_W / 2, y: 62, class: 'viz__scene-rule' });
  rule.textContent = '有界 + 间断点集测度为 0 ⟺ 黎曼可积';
  rule.setAttribute('text-anchor', 'middle');
  g.append(rule);

  return g;
}
