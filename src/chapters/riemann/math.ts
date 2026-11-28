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

/** 下和：每个小区间取最小值（矩形全部落在曲线下方） */
export function lowerSum(n: number): number {
  const h = A / n;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += extremes(i * h, (i + 1) * h).min;
  }
  return sum * h;
}

/** 上和：每个小区间取最大值（矩形全部盖住曲线） */
export function upperSum(n: number): number {
  const h = A / n;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += extremes(i * h, (i + 1) * h).max;
  }
  return sum * h;
}

/** 每个小区间的上下界，绘图时画矩形用 */
export function intervalBounds(n: number): Array<{ x0: number; x1: number; min: number; max: number }> {
  const h = A / n;
  const out: Array<{ x0: number; x1: number; min: number; max: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const x0 = i * h;
    const x1 = (i + 1) * h;
    const { min, max } = extremes(x0, x1);
    out.push({ x0, x1, min, max });
  }
  return out;
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
