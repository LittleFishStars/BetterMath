/**
 * 函数可积性：数学部分
 *
 * 这里只放纯计算，不出现 DOM、SVG、颜色 —— 和渲染完全分开。
 *
 * 三组函数对应三幕：
 *   · good()       有界连续，用来演示达布判据（上下和的夹层能压到 0）
 *   · 狄利克雷     处处不连续，上下和恒差一个区间长度，怎么分都不收敛
 *   · unbounded()  在 0 附近无界，上和根本不存在 —— 黎曼和的定义要求有界
 *
 * 结论幕用 Thomae 函数作对照：间断点无穷多，却仍然可积。
 * 它说明「间断点多不多」不是判据，要看间断点集的**测度**。
 * （缩略图在 definition.ts 里按最简分数逐根画，这里不需要数值实现。）
 */

// ── 场景一：一个好函数 ──

/** 演示区间的右端点 */
export const GOOD_SPAN = 2.4;

/** y 轴上限（曲线值域约 [0.35, 1.45]，留出上方空间画标注） */
export const GOOD_Y_MAX = 2;

/**
 * 有界连续的函数。
 *
 * 不单调，所以每段极值要采样求，不能只看端点 —— 与黎曼和那边同一个理由。
 */
export function good(x: number): number {
  return 0.9 + 0.55 * Math.sin(2.2 * x + 0.6);
}

/** 均匀分割点：0 = x₀ < x₁ < … < xₙ = GOOD_SPAN */
export function uniformPartition(n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const points: number[] = [];
  for (let i = 0; i <= count; i += 1) points.push((i / count) * GOOD_SPAN);
  return points;
}

export interface GoodInterval {
  x0: number;
  x1: number;
  /** 这一段上的最小值，下和用它 */
  min: number;
  /** 这一段上的最大值，上和用它 */
  max: number;
}

/**
 * 每个小区间上的最小 / 最大值（采样 16 点，够用）。
 *
 * 带缓存：用户拖 ε 时 minNForGap 会反复查同一个 n，
 * 每次重算 16n 个点纯属浪费。
 */
const boundsCache = new Map<number, GoodInterval[]>();

export function goodBounds(n: number): GoodInterval[] {
  const hit = boundsCache.get(n);
  if (hit) return hit;
  const points = uniformPartition(n);
  const out: GoodInterval[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const x0 = points[i];
    const x1 = points[i + 1];
    let min = Infinity;
    let max = -Infinity;
    for (let k = 0; k <= 16; k += 1) {
      const y = good(x0 + ((x1 - x0) * k) / 16);
      if (y < min) min = y;
      if (y > max) max = y;
    }
    out.push({ x0, x1, min, max });
  }
  boundsCache.set(n, out);
  return out;
}

/** 达布下和 */
export function goodLower(n: number): number {
  return goodBounds(n).reduce((sum, s) => sum + s.min * (s.x1 - s.x0), 0);
}

/** 达布上和 */
export function goodUpper(n: number): number {
  return goodBounds(n).reduce((sum, s) => sum + s.max * (s.x1 - s.x0), 0);
}

/**
 * 上和与下和的差 —— 这一节的主角。
 *
 * 可积的达布判据就是「这个差能任意小」。
 */
const gapCache = new Map<number, number>();

export function goodGap(n: number): number {
  const hit = gapCache.get(n);
  if (hit !== undefined) return hit;
  const value = goodUpper(n) - goodLower(n);
  gapCache.set(n, value);
  return value;
}

/**
 * 找到最小的分割数 n，使上和与下和的差小于 ε。
 *
 * 这就是「可积」那句话的操作版：给定任意小的 ε，总能报出一个 n。
 * 先倍增定出上界，再在 [n/2, n] 里二分 —— 倍增保证不会线性扫过几千个 n，
 * 二分让报出来的 n 是真正的最小值，而不是 2 的幂里最接近的那个。
 *
 * 找不到（n 到 nMax 还不够）返回 null —— 对狄利克雷这类函数
 * 无论 n 多大都返回 null，那正是它不可积的表现。
 */
export function minNForGap(eps: number, nMax = 1024): number | null {
  let hi = 1;
  while (hi <= nMax && goodGap(hi) >= eps) hi *= 2;
  if (hi > nMax) return null;

  let lo = Math.max(1, Math.floor(hi / 2));
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (goodGap(mid) < eps) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** 分割数上限 */
export const GOOD_N_MAX = 64;

// ── 场景二：狄利克雷函数 ──

/**
 * 狄利克雷函数 D(x)：有理数取 1，无理数取 0。
 *
 * 关键性质：有理数与无理数在**任何**区间里都稠密。
 * 于是任意小区间上 sup D = 1、inf D = 0，与区间多小无关。
 *
 * 在 [0, 1] 上：
 *   下和 L(P) = Σ 0·Δxᵢ = 0
 *   上和 U(P) = Σ 1·Δxᵢ = 1
 *   差 U − L ≡ 1，**与分割无关**，永远不会变小。
 */
export const DIRICHLET_LOWER = 0;
export const DIRICHLET_UPPER = 1;
export const DIRICHLET_GAP = DIRICHLET_UPPER - DIRICHLET_LOWER;

// ── 场景三：无界函数 ──

/**
 * g(x) = 1/√x，在 (0, 1] 上。
 *
 * x → 0⁺ 时 g → +∞，所以它在这个区间上**无界**。
 * 黎曼和的定义要求 f 有界（每段的上确界得是有限数），
 * 因此任何包含 0 的分割，其上的上和都不存在。
 */
export function unbounded(x: number): number {
  return x <= 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(x);
}

/**
 * 在 [ε, 1] 上的上确界。
 *
 * 只要区间包含 0 附近的一小段，这个值就随 ε → 0 无限增大 ——
 * 可视化里用它说明「上和没有有限上界」。
 */
export function boundOnTail(epsilon: number): number {
  return unbounded(Math.max(epsilon, 1e-6));
}

// ── 格式化 ──

/** 面积与差值统一保留三位小数 */
export function fmt(value: number): string {
  return value.toFixed(3);
}

/** 无穷大要单独处理，toFixed 会给出 "Infinity" 而不是符号 */
export function fmtBound(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '∞';
}
