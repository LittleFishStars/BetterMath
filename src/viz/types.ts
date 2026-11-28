/**
 * 可视化的统一契约
 *
 * 新增一个可视化 = 实现这个接口 + 在 registry.ts 注册一行。
 * 外壳（VizShell）负责舞台、进度条、播放控件、导入语、说明文字，
 * 具体实现只管「画什么」和「这一刻说什么」。
 */
import type { VizSegment } from './timeline';

/**
 * 外壳提供给实现的上下文。
 *
 * 实现偶尔需要反向驱动进度 —— 比如用户拖了滑动条，
 * 但当前停在还没画出分割的那一幕，就得先把进度推过去。
 */
export interface VizContext {
  /** 当前进度 0..1 */
  readonly progress: number;
  /** 请求跳到某个进度（会触发一次完整重绘） */
  setProgress(t: number): void;
}

/**
 * 「深入」入口：指到同章节下的另一个内容条目。
 *
 * 只有 definition 写了这个字段，外壳才会在进度走到末尾时
 * 于进度条上方居中淡入按钮；不写就完全没有这个按钮。
 */
export interface DeeperEntry {
  /** 目标内容条目的 id（必须在同一个章节里） */
  contentId: string;
  /** 按钮文字，缺省「深入」 */
  label?: string;
}

export interface VizDefinition {
  /** 分段：决定进度条各段宽度与播放节奏 */
  segments: readonly VizSegment[];
  /** 关键帧的内部进度（0..1），决定圆点位置与「下一节」的跳点 */
  keyframes: readonly number[];

  /** 开场那句导入语；不写就不显示 */
  intro?: string;

  /**
   * 挂载绘图区。host 是一个空的容器，实现自己往里放 SVG / canvas。
   * 返回的函数会在销毁时调用，用来停 rAF、断监听。
   */
  mountFigure(host: HTMLElement, ctx: VizContext): (() => void) | void;

  /** 挂载右侧面板（滑动条、数值、图例等）。不写就是没有面板 */
  mountPanel?(host: HTMLElement, ctx: VizContext): void;

  /** 每帧更新。t 是 0..1 的内部进度 */
  update(t: number): void;

  /** 当前这一幕的说明文字 */
  caption(t: number): string;

  /**
   * 进度走到末尾后，在进度条**上方居中**淡入的「深入」入口。
   *
   * 它是这条内容讲完之后的去处：换到同章节下的另一个可视化。
   * 不写就没有这个按钮。
   */
  deeper?: DeeperEntry;

  /** 进入可视化页时是否把焦点放到播放键（默认 true） */
  autofocus?: boolean;
}
