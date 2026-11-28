/**
 * 可视化注册表
 *
 * 新增一个可视化 = 写一个 definition + 在这里加一行。
 *
 * load 允许返回 Promise：复杂可视化（尤其是带 Three.js 的三维场景）
 * 应该写成 `() => import('./xxx/definition').then(m => m.createXxx())`，
 * 这样它会被 Vite 切成独立 chunk，只在真正打开那个页面时下载，
 * 不会把主包撑大。
 */
import type { VizDefinition } from './types';
import { createRiemannViz } from './riemann/definition';
import { createIntegrabilityViz } from './integrability/definition';

export interface VizEntry {
  /** 加载可视化定义（同步或异步） */
  load: () => VizDefinition | Promise<VizDefinition>;
}

/** 键名对应 data.ts 里 ContentItem.visual */
export const VISUALS: Record<string, VizEntry> = {
  riemann: {
    load: () => createRiemannViz(),
  },

  integrability: {
    load: () => createIntegrabilityViz(),
  },

  // 将来加三维时大约长这样：
  // surface: {
  //   load: () => import('./surface/definition').then((m) => m.createSurfaceViz()),
  // },
};

/** 某个内容条目是否有可用的可视化 */
export function hasVisual(key: string | undefined): boolean {
  return !!key && key in VISUALS;
}
