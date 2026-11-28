/**
 * 可视化通用工具
 *
 * 这里只放「和具体数学内容无关」的东西：SVG 建节点、坐标映射、插值。
 * 任何新的可视化都能直接用，不必重写一遍。
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** 建一个 SVG 节点并批量设属性 */
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 建一个 HTML 节点并批量设属性 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = String(value);
    else node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * 线性映射器：把 [domain0, domain1] 映射到 [range0, range1]。
 *
 * 每个可视化都要做这件事（数学坐标 ↔ 屏幕坐标），
 * 单独抽出来免得每处都写一遍除法。
 */
export function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number): number => r0 + ((value - d0) / span) * (r1 - r0);
}

/** 平滑插值：把 x 从 [a, b] 映射到 0..1，两端缓入缓出 */
export function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 按比例插值 */
export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 等一帧（用于「先让样式落地再触发过渡」这类场景） */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
