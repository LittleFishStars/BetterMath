/**
 * 黎曼和的数学部分
 *
 * 被积函数选了一条**单调递增**的曲线。这是有意的：
 * 单调时「上和」（取每个小区间右端点的值）处处不低于曲线、
 * 「下和」（取左端点）处处不高于曲线，两者的差一眼就能看出来。
 * 换成有起伏的函数，矩形会时而高出时而低于曲线，反而看不清在逼近什么。
 *
 * f(x) = 0.9 + 0.55x + 0.18x²  在 [0, 2.6] 上从 0.9 增到 3.55，
 * 精确积分 5.2536 —— 数字不规整，正合适：读者看到上/下和从两侧夹过来，
 * 而不是"一开始就差不多"。
 */

/** 积分上限 a */
export const A = 2.6;

/** 被积函数 */
export function f(x: number): number {
  return 0.9 + 0.55 * x + 0.18 * x * x;
}

/** 原函数：0.9x + 0.275x² + 0.06x³ */
function antiderivative(x: number): number {
  return 0.9 * x + 0.275 * x * x + 0.06 * x * x * x;
}

/** 精确值 ∫₀ᵃ f(x) dx */
export const EXACT = antiderivative(A) - antiderivative(0);

/** 下和（每个小区间取左端点的函数值） */
export function lowerSum(n: number): number {
  const h = A / n;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += f(i * h);
  return sum * h;
}

/** 上和（每个小区间取右端点的函数值） */
export function upperSum(n: number): number {
  const h = A / n;
  let sum = 0;
  for (let i = 1; i <= n; i += 1) sum += f(i * h);
  return sum * h;
}

/**
 * 滑动条可选的 n。
 *
 * 不是连续的 1..128：滑动条上一格对应一个值，「越往右一格越多」才有手感。
 * 前段密、后段疏 —— 1 到 8 之间每格都看得出变化，64 以后每格加几十个矩形，
 * 反正肉眼已经分辨不出单个矩形了。
 */
export const N_STEPS: readonly number[] = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128,
];

/** 第三阶段演示收敛时用的 n —— 到这个量级上和/下和已与精确值肉眼无差 */
export const N_MAX = N_STEPS[N_STEPS.length - 1];

/** 把 0..1 的进度换算成 n：1 → N_MAX，按对数分布，前段变化慢、后段快 */
export function nFromProgress(p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  // 对数插值：进度 0 时 n=1，进度 1 时 n=N_MAX
  const value = Math.exp(Math.log(1) + (Math.log(N_MAX) - Math.log(1)) * clamped);
  return Math.max(1, Math.round(value));
}

/** 数字格式化：面积值统一保留三位小数 */
export function fmt(value: number): string {
  return value.toFixed(3);
}
