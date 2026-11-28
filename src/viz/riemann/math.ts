/**
 * 黎曼和的数学部分
 *
 * 被积函数用一条**有起伏**的正弦曲线：
 *
 *   f(x) = 1.6 + 0.85·sin(1.9x + 0.35)   在 [0, 2.6] 上
 *
 * 早先用的是一条单调递增的曲线，上和/下和分别取右端点与左端点就够了。
 * 换成不单调之后这个简化不成立了：同一小区间里函数先升后降，
 * 两端点都不一定是这段上的最高或最低点。所以每个小区间要采样取极值 ——
 * 上和取区间最大值、下和取最小值，才能保证上和恒不低于曲线、下和恒不高于曲线。
 *
 * 值域约 [0.75, 2.45]，恒正，阴影面积有意义。
 */

/** 积分上限 a */
export const A = 2.6;

/** 被积函数 */
export function f(x: number): number {
  return 1.6 + 0.85 * Math.sin(1.9 * x + 0.35);
}

/** 原函数：1.6x − (0.85/1.9)·cos(1.9x + 0.35) */
function antiderivative(x: number): number {
  return 1.6 * x - (0.85 / 1.9) * Math.cos(1.9 * x + 0.35);
}

/** 精确值 ∫₀ᵃ f(x) dx */
export const EXACT = antiderivative(A) - antiderivative(0);

/** 函数在 [0, A] 上的取值范围，用来定 y 轴刻度 */
export const Y_MAX = 3;

/**
 * 确定性伪随机。
 *
 * 分割点必须「随机但可复现」：拖动进度条时每帧都会重算，若真用 Math.random()，
 * 矩形会不停抖动；而固定种子能让同一个 n 每次得到同一组分割点。
 * 用的是线性同余，够用且没有依赖。
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * 生成一个**不均匀**的分割：0 = x₀ < x₁ < … < xₙ = A。
 *
 * 每段的权重在 0.55..1.45 倍平均值之间 —— 太均匀看不出「任意分割」，
 * 太极端会出现又细又长的矩形，反而读不出它在逼近什么。
 */
export function randomPartition(n: number): number[] {
  if (n <= 1) return [0, A];

  // 种子掺进 n：不同 n 得到不同分割，同一个 n 永远一致
  const random = makeRandom(0x9e3779b9 + n * 2654435761);

  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const w = 0.55 + random() * 0.9;
    weights.push(w);
    total += w;
  }

  const points: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += (weights[i] / total) * A;
    // 最后一段直接收在 A 上，避免浮点误差让末点差一点点
    points.push(i === n - 1 ? A : acc);
  }
  return points;
}

/** 分割点缓存：同一个 n 只算一次，update 每帧调用不至于重复生成 */
const partitionCache = new Map<number, number[]>();

/** 取 n 段分割（带缓存） */
export function partitionFor(n: number): number[] {
  let points = partitionCache.get(n);
  if (!points) {
    points = randomPartition(n);
    partitionCache.set(n, points);
  }
  return points;
}

/**
 * 一个小区间上的最小 / 最大值。
 *
 * 采样 16 个点而不是解析求导：小区间足够短，16 个点足以把极值卡在
 * 千分之一以内；解析法要为每个区间解 sin 的相位，代码复杂度不值当。
 */
function extremes(x0: number, x1: number): { min: number; max: number } {
  const steps = 16;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= steps; i += 1) {
    const y = f(x0 + ((x1 - x0) * i) / steps);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

export interface Interval {
  x0: number;
  x1: number;
  /** 这一段上的最小值（下和用它） */
  min: number;
  /** 这一段上的最大值（上和用它） */
  max: number;
}

/**
 * 各小区间的上下界。
 *
 * 分割是**不均匀**的：每段长度由 randomPartition 给定，
 * 所以这里的 x0/x1 不能再用 i*h 算，必须按分割点取。
 */
export function intervalBounds(n: number): Interval[] {
  const points = partitionFor(n);
  const out: Interval[] = [];
  for (let i = 0; i < n; i += 1) {
    const x0 = points[i];
    const x1 = points[i + 1];
    const { min, max } = extremes(x0, x1);
    out.push({ x0, x1, min, max });
  }
  return out;
}

/** 下和：每段取最小值，矩形全部落在曲线下方（按每段各自的宽度加权） */
export function lowerSum(n: number): number {
  let sum = 0;
  for (const { x0, x1, min } of intervalBounds(n)) sum += min * (x1 - x0);
  return sum;
}

/** 上和：每段取最大值，矩形全部盖住曲线 */
export function upperSum(n: number): number {
  let sum = 0;
  for (const { x0, x1, max } of intervalBounds(n)) sum += max * (x1 - x0);
  return sum;
}

/** n 的上限 —— 到这个量级上和/下和已与精确值肉眼无差 */
export const N_MAX = 128;

/**
 * 滑动条用连续的 1..N_MAX。
 *
 * 早先是离散档位（1,2,3,4,6,8,12…），想着「越往右一格越多」手感更好；
 * 但收敛阶段 n 会从用户选的值一路涨到 128，滑块若停在档位上，
 * 就会出现「数字已经是 62、滑块还在 48」这种对不上的情况。
 * 连续之后滑块位置与标签永远是同一个数。
 */
export const N_MIN = 1;

/** 数字格式化：面积值统一保留三位小数 */
export function fmt(value: number): string {
  return value.toFixed(3);
}
