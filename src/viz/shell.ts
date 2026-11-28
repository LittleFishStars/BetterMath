/**
 * 可视化外壳
 *
 * 负责所有可视化共有的部分：
 *   · 返回链接、舞台布局（绘图区 + 右侧面板）
 *   · 每个部分各自的导入语、进度条与说明文字
 *   · 部分之间的切换（「深入」按钮）
 *
 * 一个可视化可以只有一个部分，也可以有多个。多部分时**每个部分各有
 * 一条进度条**，默认只显示第一个 —— 看完点按钮才切到下一个，时间轴
 * 不共享。这样「前半段讲完了」这件事在进度条上是看得见的：
 * 它走到底了，而不是走到某个分割点。
 *
 * 关于渲染后端：外壳**不假设**用什么画。绘图区就是一个空 div，
 * 实现可以往里放 SVG（当前两个可视化的做法）、Canvas 2D（元素极多时）、
 * 甚至 WebGL 画布（三维曲面、向量场）。外壳只提供尺寸与挂载时机。
 */
import { h } from './svg';
import { preloadMath, renderMathText } from './math-text';
import { Timeline } from './timeline';
import { partsOf, type VizContext, type VizDefinition, type VizPart } from './types';

/** 导入语淡出、说明文字淡入的统一时序（各部分共用，保证节奏一致） */
const T_INTRO_OUT_START = 0.04;
const T_INTRO_OUT_END = 0.16;
const T_CAPTION_IN_START = 0.1;
const T_CAPTION_IN_END = 0.22;

/**
 * 进度到这里才算「这一部分讲完了」，「深入」按钮开始淡入。
 *
 * 取 0.985 而不是 1：播放到最后几帧时按钮已在淡入，视觉上与「播完」同步；
 * 拖动条停在末尾附近也该出现，不必精确到小数点后三位。
 */
const T_NEXT_SHOW = 0.985;

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class VizShell {
  readonly root: HTMLElement;

  private readonly parts: readonly VizPart[];

  /** 每个部分的绘图容器 */
  private readonly figureHosts: HTMLElement[] = [];
  /** 每个部分的面板容器 */
  private readonly panelHosts: HTMLElement[] = [];
  /** 每个部分各自的进度条 */
  private readonly timelines: Timeline[] = [];
  /** 每个部分的导入语节点 */
  private readonly intros: HTMLElement[] = [];
  /** 各部分的挂载清理函数 */
  private readonly cleanups: (() => void)[] = [];

  private currentPart = 0;

  private readonly figure: HTMLElement;
  private readonly panelSlot: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly captionText: HTMLElement;
  private readonly timelineHost: HTMLElement;

  /** 切到下一部分的按钮；只有一个部分时不建 */
  private readonly nextWrap: HTMLElement | null = null;
  private readonly nextBtn: HTMLButtonElement | null = null;

  /** 上一次渲染的说明文字原文，用来避免每帧重算 KaTeX */
  private lastCaption = '';

  constructor(def: VizDefinition, onBack: () => void) {
    this.parts = partsOf(def);

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

      <div class="viz__timelines"></div>
    `;

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.figure = q<HTMLElement>('.viz__figure');
    this.panelSlot = q<HTMLElement>('.viz__panel-slot');
    this.caption = q<HTMLElement>('.viz__caption');
    this.captionText = q<HTMLElement>('.viz__caption-text');
    this.timelineHost = q<HTMLElement>('.viz__timelines');

    q<HTMLButtonElement>('.viz__back').addEventListener('click', onBack);

    // 「深入」按钮只建一个，位置固定在进度条上方 ——
    // 各部分的进度条会互相切换，按钮不必跟着重建。
    if (this.parts.length > 1) {
      this.nextWrap = h('div', { class: 'viz__deeper' });
      this.nextBtn = h('button', { class: 'viz__deeper-btn', type: 'button' });
      this.nextBtn.addEventListener('click', () => this.switchTo(this.currentPart + 1));
      this.nextWrap.append(this.nextBtn);
      // 插在进度条之前 —— 它要在进度条上方居中，不是下方
      this.timelineHost.before(this.nextWrap);
    }

    // 逐个部分建容器、面板与进度条
    this.parts.forEach((part, index) => {
      const figureHost = h('div', { class: 'viz__part' });
      this.figure.append(figureHost);
      this.figureHosts.push(figureHost);

      const panelHost = h('div', { class: 'viz__part-panel' });
      this.panelSlot.append(panelHost);
      this.panelHosts.push(panelHost);

      const timeline = new Timeline({
        segments: part.segments,
        keyframes: part.keyframes,
        pauseAt: part.pauseAt,
        // 每个部分只更新自己那一份，切走的那个不碰 DOM
        onProgress: (t) => this.render(index, t),
      });
      this.timelineHost.append(timeline.root);
      this.timelines.push(timeline);
    });

    // 先定下当前部分，再挂载 —— 挂载时实现可能就要反向驱动进度
    this.currentPart = 0;

    const self = this;
    this.parts.forEach((part, index) => {
      const ctx: VizContext = {
        get progress() {
          return self.timelines[index].progress;
        },
        setProgress: (t) => self.timelines[index].setT(t),
      };

      const cleanup = part.mountFigure(this.figureHosts[index], ctx);
      if (cleanup) this.cleanups.push(cleanup);

      // 导入语盖在绘图区上。文本里的 $...$ 由 KaTeX 渲染，
      // 没加载完时先显示等宽的原文（见 math-text.ts）。
      if (part.intro) {
        const intro = h('div', { class: 'viz__intro' });
        intro.innerHTML = `<p class="viz__intro-text">${renderMathText(part.intro)}</p>`;
        this.figureHosts[index].append(intro);
        this.intros[index] = intro;
      }

      part.mountPanel?.(this.panelHosts[index], ctx);
    });

    this.applyPartVisibility();
    this.render(0, 0);

    // 公式按需加载。到货后把导入语与说明文字重渲染一遍，
    // 把之前兜底的等宽文本换成排版好的公式。
    void preloadMath().then(() => {
      this.parts.forEach((part, index) => {
        const intro = this.intros[index];
        if (intro && part.intro) {
          intro.innerHTML = `<p class="viz__intro-text">${renderMathText(part.intro)}</p>`;
        }
      });
      this.lastCaption = ''; // 强制下一帧重算
      this.render(this.currentPart, this.timelines[this.currentPart].progress);
    });
  }

  /** 设置返回按钮上的文字（通常是内容条目名） */
  setTitle(text: string): void {
    const label = this.root.querySelector('.viz__back-label');
    if (label) label.textContent = text;
  }

  /** 是否把焦点放到播放键 */
  get autofocus(): boolean {
    return this.parts[this.currentPart]?.autofocus !== false;
  }

  /** 切到第 index 个部分：换容器、换进度条，并回到该部分开头 */
  private switchTo(index: number): void {
    if (index < 0 || index >= this.parts.length || index === this.currentPart) return;

    this.timelines.forEach((timeline) => timeline.stop());
    this.currentPart = index;
    this.applyPartVisibility();

    this.lastCaption = '';
    this.timelines[index].setT(0);
    this.render(index, 0);
    this.focus();
  }

  /** 只让当前部分的容器、面板与进度条可见 */
  private applyPartVisibility(): void {
    this.figureHosts.forEach((el, i) => el.classList.toggle('is-active', i === this.currentPart));
    this.panelHosts.forEach((el, i) => el.classList.toggle('is-active', i === this.currentPart));
    this.timelines.forEach((tl, i) => tl.root.classList.toggle('is-hidden', i !== this.currentPart));
  }

  /** 一次完整刷新：画面 + 说明文字 + 导入语 + 「深入」按钮 */
  private render(index: number, t: number): void {
    // 非当前部分的回调一律丢弃：切走之后它可能还会被播放循环推一帧
    if (index !== this.currentPart) return;

    const part = this.parts[index];
    part.update(t);

    // 说明文字可能含 $...$ 公式。只在原文变化时重算 ——
    // 每帧都跑一遍 KaTeX 太浪费。
    const text = part.caption(t);
    if (text !== this.lastCaption) {
      this.lastCaption = text;
      this.captionText.innerHTML = renderMathText(text);
    }

    const intro = this.intros[index];
    if (intro) {
      const introOpacity = 1 - smoothstep(T_INTRO_OUT_START, T_INTRO_OUT_END, t);
      intro.style.opacity = String(introOpacity);
      intro.style.pointerEvents = 'none';
    }

    const captionOpacity = smoothstep(T_CAPTION_IN_START, T_CAPTION_IN_END, t);
    this.caption.style.opacity = String(captionOpacity);

    // 「深入」按钮：本部分走到底才出现；最后一部分没有下一部分，永远不出现
    if (this.nextWrap && this.nextBtn) {
      const canGo = !!part.next && index + 1 < this.parts.length;
      if (canGo) this.nextBtn.textContent = part.next?.label ?? '深入';
      this.nextWrap.classList.toggle('is-shown', canGo && t >= T_NEXT_SHOW);
    }
  }

  setProgress(t: number): void {
    this.timelines[this.currentPart].setT(t);
  }

  play(): void {
    this.timelines[this.currentPart].play();
  }

  stop(): void {
    this.timelines[this.currentPart].stop();
  }

  focus(): void {
    this.timelines[this.currentPart].root
      .querySelector<HTMLElement>('.viz__play')
      ?.focus();
  }

  destroy(): void {
    this.timelines.forEach((timeline) => timeline.destroy());
    this.cleanups.forEach((cleanup) => cleanup());
  }
}
