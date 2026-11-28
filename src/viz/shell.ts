/**
 * 可视化外壳
 *
 * 负责所有可视化共有的部分：
 *   · 返回链接、舞台布局（绘图区 + 右侧面板）
 *   · 开场导入语
 *   · 分段进度条与播放控件（交给 Timeline）
 *   · 每一幕的说明文字
 *
 * 具体实现通过 VizDefinition 提供「画什么」和「说什么」。
 *
 * 关于渲染后端：外壳**不假设**用什么画。绘图区就是一个空 div，
 * 实现可以往里放 SVG（当前黎曼和的做法）、Canvas 2D（元素极多时）、
 * 甚至 WebGL 画布（三维曲面、向量场）。外壳只提供尺寸与挂载时机。
 *
 * 关于按需加载：definition 可以是异步拿到的（见 registry.ts），
 * 三维可视化那种会带进 Three.js 的页面不会把主包撑大。
 */
import { h } from './svg';
import { preloadMath, renderMathText } from './math-text';
import { Timeline } from './timeline';
import type { VizContext, VizDefinition } from './types';

/** 导入语淡出、说明文字淡入的统一时序（各可视化共用，保证节奏一致） */
const T_INTRO_OUT_START = 0.04;
const T_INTRO_OUT_END = 0.16;
const T_CAPTION_IN_START = 0.1;
const T_CAPTION_IN_END = 0.22;

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class VizShell {
  readonly root: HTMLElement;

  private readonly def: VizDefinition;
  private readonly timeline: Timeline;
  private readonly figure: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly cleanup: (() => void) | void;
  /** 上一次渲染的说明文字原文，用来避免每帧重算 KaTeX */
  private lastCaption = '';
  private readonly introSource: string;

  constructor(def: VizDefinition, onBack: () => void) {
    this.def = def;

    this.root = h('div', { class: 'viz' });
    this.root.innerHTML = `
      <div class="viz__head">
        <button class="viz__back" type="button">
          <span aria-hidden="true">←</span> <span class="viz__back-label"></span>
        </button>
      </div>

      <div class="viz__stage">
        <div class="viz__figure"></div>
        <aside class="viz__panel" aria-live="polite">
          <p class="viz__caption"><span class="viz__caption-text"></span></p>
          <div class="viz__panel-slot"></div>
        </aside>
      </div>
    `;

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.figure = q<HTMLElement>('.viz__figure');
    this.panel = q<HTMLElement>('.viz__panel-slot');
    this.caption = q<HTMLElement>('.viz__caption');
    this.intro = h('div', { class: 'viz__intro' });

    q<HTMLButtonElement>('.viz__back').addEventListener('click', onBack);

    // 先建进度条，再建上下文 —— 实现挂载时可能就要反向驱动进度
    this.timeline = new Timeline({
      segments: def.segments,
      keyframes: def.keyframes,
      onProgress: (t) => this.render(t),
    });
    this.root.append(this.timeline.root);

    const ctx: VizContext = {
      get progress() {
        return self.timeline.progress;
      },
      setProgress: (t) => self.timeline.setT(t),
    };
    const self = this;

    // 绘图区挂载：实现自己决定放 SVG 还是 canvas
    this.cleanup = def.mountFigure(this.figure, ctx) ?? undefined;

    // 导入语盖在绘图区上。文本里的 $...$ 由 KaTeX 渲染，
    // 没加载完时先显示等宽的原文（见 math-text.ts）。
    this.introSource = def.intro ?? '';
    if (def.intro) {
      this.intro.innerHTML = `<p class="viz__intro-text">${renderMathText(def.intro)}</p>`;
      this.figure.append(this.intro);
    } else {
      this.intro.style.display = 'none';
    }

    def.mountPanel?.(this.panel, ctx);

    this.render(0);

    // 公式按需加载。到货后把导入语与说明文字重渲染一遍，
    // 把之前兜底的等宽文本换成排版好的公式。
    void preloadMath().then(() => {
      if (this.introSource) {
        this.intro.innerHTML =
          `<p class="viz__intro-text">${renderMathText(this.introSource)}</p>`;
      }
      this.lastCaption = ''; // 强制下一帧重算
      this.render(this.timeline.progress);
    });
  }

  /** 设置返回按钮上的文字（通常是内容条目名） */
  setTitle(text: string): void {
    const label = this.root.querySelector('.viz__back-label');
    if (label) label.textContent = text;
  }

  /** 是否把焦点放到播放键 */
  get autofocus(): boolean {
    return this.def.autofocus !== false;
  }

  /** 一次完整刷新：画面 + 说明文字 + 导入语 */
  private render(t: number): void {
    this.def.update(t);

    // 说明文字可能含 $...$ 公式。只在原文变化时重算 ——
    // 每帧都跑一遍 KaTeX 太浪费。
    const text = this.def.caption(t);
    if (text !== this.lastCaption) {
      this.lastCaption = text;
      const captionText = this.root.querySelector('.viz__caption-text');
      if (captionText) captionText.innerHTML = renderMathText(text);
    }

    const introOpacity = 1 - smoothstep(T_INTRO_OUT_START, T_INTRO_OUT_END, t);
    this.intro.style.opacity = String(introOpacity);
    this.intro.style.pointerEvents = 'none';

    const captionOpacity = smoothstep(T_CAPTION_IN_START, T_CAPTION_IN_END, t);
    this.caption.style.opacity = String(captionOpacity);
  }

  setProgress(t: number): void {
    this.timeline.setT(t);
  }

  play(): void {
    this.timeline.play();
  }

  stop(): void {
    this.timeline.stop();
  }

  focus(): void {
    this.root.querySelector<HTMLElement>('.viz__play')?.focus();
  }

  destroy(): void {
    this.timeline.destroy();
    this.cleanup?.();
  }
}
