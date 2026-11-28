/**
 * 可视化的统一契约
 *
 * 一个可视化由一到多个「部分」组成。每个部分有自己的进度条、图形、
 * 面板和说明文字 —— 它们互不相干，不共用时间轴。
 *
 *   单部分  → 直接实现 VizPart 的那几个字段
 *   多部分  → { parts: [...] }，外壳为每个部分各建一条进度条，
 *             默认只显示第一个，靠 VizPart.next 声明的按钮往后切
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
 * 一个部分：自己一套进度、图形、面板与说明文字。
 */
export interface VizPart {
  /** 分段：决定本部分进度条各段宽度与播放节奏 */
  segments: readonly VizSegment[];
  /** 关键帧的内部进度（0..1），决定圆点位置与「下一节」的跳点 */
  keyframes: readonly number[];

  /** 本部分的开场导入语；不写就不显示 */
  intro?: string;

  /**
   * 挂载绘图区。host 是一个空的容器，实现自己往里放 SVG / canvas。
   * 返回的函数会在销毁时调用，用来停 rAF、断监听。
   */
  mountFigure(host: HTMLElement, ctx: VizContext): (() => void) | void;

  /** 挂载右侧面板（滑动条、数值、图例等）。不写就是没有面板 */
  mountPanel?(host: HTMLElement, ctx: VizContext): void;

  /** 每帧更新。t 是本部分内部的进度 0..1 */
  update(t: number): void;

  /** 当前这一幕的说明文字 */
  caption(t: number): string;

  /**
   * 播放到这里自动停下，等用户手动继续。
   *
   * 用在「这一幕要你自己动手调一调」的地方：进度走到该幕起点就暂停，
   * 控制权交回用户。拖动进度条、点关键帧不受影响，只有自动播放会被拦。
   */
  pauseAt?: readonly number[];

  /**
   * 本部分讲完后，在进度条上方居中出现的按钮 —— 点了切到下一部分。
   *
   * 只有确实还有下一部分时才画得出来；最后一部分写了也不显示。
   */
  next?: {
    /** 按钮文字，缺省「深入」 */
    label?: string;
  };

  /** 进入本部分时是否把焦点放到播放键（默认 true） */
  autofocus?: boolean;
}

/**
 * 多部分可视化：几个互不相干的部分放在同一条内容条目下。
 *
 * 「定积分与黎曼和」就是这种：前半段讲矩形逼近，后半段讲可积性。
 * 两者共用一条路由，但各有各的进度条 —— 看完前半段点「深入」才进入后半段。
 */
export interface MultiPartViz {
  parts: readonly VizPart[];
  autofocus?: boolean;
}

/** 单部分就直接写那几个字段；多部分用 { parts: [...] } */
export type VizDefinition = VizPart | MultiPartViz;

/** 类型收窄：判断是不是多部分 */
export function isMultiPart(def: VizDefinition): def is MultiPartViz {
  return 'parts' in def;
}

/** 统一取出部分数组 */
export function partsOf(def: VizDefinition): readonly VizPart[] {
  return isMultiPart(def) ? def.parts : [def];
}
