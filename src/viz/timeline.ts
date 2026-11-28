/**
 * 分段进度条 + 播放控制
 *
 * 每个可视化都要有这套东西，所以单独成一个组件：
 *   · 进度条按「这段要播多少秒」分配物理宽度，段与段断开成独立胶囊
 *   · 关键帧圆点落在断口正中
 *   · 播放 / 暂停 / 回到开头 / 下一节 / 倍速
 *   · 拖动、键盘（方向键微调、Home/End 跳首尾、空格播放暂停）
 *
 * 组件只负责「时间」，不知道画面是什么 —— 每次进度变化通过 onProgress 通知外面。
 */

import { h } from './svg';

export interface VizSegment {
  /** 内部进度的起止（0..1） */
  tFrom: number;
  tTo: number;
  /** 这一段播放要花的秒数，决定它在进度条上的宽度 */
  seconds: number;
}

export interface TimelineOptions {
  segments: readonly VizSegment[];
  /** 关键帧的内部进度，决定圆点位置 */
  keyframes: readonly number[];
  /** 进度变化（拖动 / 播放 / 跳转都会触发） */
  onProgress: (t: number) => void;
}

/** 倍速档位 */
const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** 段与段之间的间隙，与 CSS 的 gap 保持一致（用于圆点定位） */
const SEGMENT_GAP = 7;

export class Timeline {
  readonly root: HTMLElement;

  private readonly segments: readonly VizSegment[];
  private readonly keyframes: readonly number[];
  private readonly onProgress: (t: number) => void;

  private t = 0;
  private playing = false;
  private speedIndex = 1;
  private raf = 0;
  private lastFrame = 0;

  private readonly track: HTMLElement;
  private readonly fills: HTMLElement[] = [];
  private readonly marks: HTMLElement[] = [];
  private markPositions: number[] = [];
  private readonly resizeObserver: ResizeObserver | null;

  private readonly playBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;

  private readonly totalSeconds: number;

  constructor(options: TimelineOptions) {
    this.segments = options.segments;
    this.keyframes = options.keyframes;
    this.onProgress = options.onProgress;
    this.totalSeconds = options.segments.reduce((sum, s) => sum + s.seconds, 0);

    this.root = h('div', { class: 'viz__timeline' });
    this.root.innerHTML = `
      <div class="viz__controls">
        <button class="viz__play" type="button" aria-label="播放动画">
          <span class="viz__play-icon" aria-hidden="true"></span>
        </button>
        <button class="viz__reset" type="button" aria-label="回到开头">
          <svg class="viz__reset-icon" viewBox="0 0 24 24" aria-hidden="true"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      <div class="viz__track" role="slider" tabindex="0"
           aria-label="动画进度" aria-valuemin="0" aria-valuemax="${this.totalSeconds}"
           aria-valuenow="0">
        <div class="viz__segments"></div>
        <div class="viz__marks"></div>
      </div>

      <div class="viz__controls viz__controls--end">
        <button class="viz__next" type="button" aria-label="下一节">
          <svg class="viz__next-icon" viewBox="0 0 24 24" aria-hidden="true"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>
        <button class="viz__speed" type="button" aria-label="播放倍速">1×</button>
      </div>
    `;

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.track = q<HTMLElement>('.viz__track');
    this.playBtn = q<HTMLButtonElement>('.viz__play');
    this.resetBtn = q<HTMLButtonElement>('.viz__reset');
    this.nextBtn = q<HTMLButtonElement>('.viz__next');
    this.speedBtn = q<HTMLButtonElement>('.viz__speed');

    this.buildSegments();
    this.bindEvents();

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.measureMarks();
          this.paintTrack();
        });
    this.resizeObserver?.observe(this.track);
  }

  // ── 时间换算 ──

  /** 内部进度 → 时间轴秒数 */
  tToTime(t: number): number {
    let acc = 0;
    for (const s of this.segments) {
      if (t <= s.tTo) return acc + ((t - s.tFrom) / (s.tTo - s.tFrom)) * s.seconds;
      acc += s.seconds;
    }
    return this.totalSeconds;
  }

  /** 时间轴秒数 → 内部进度 */
  timeToT(time: number): number {
    let acc = 0;
    for (const s of this.segments) {
      if (time <= acc + s.seconds) {
        return s.tFrom + ((time - acc) / s.seconds) * (s.tTo - s.tFrom);
      }
      acc += s.seconds;
    }
    return 1;
  }

  // ── 构建 ──

  private buildSegments(): void {
    const host = this.root.querySelector('.viz__segments') as HTMLElement;
    const marksHost = this.root.querySelector('.viz__marks') as HTMLElement;

    for (const segment of this.segments) {
      const seg = h('div', { class: 'viz__segment' });
      // flex 按秒数分配宽度 —— 这就是「长度与时长成正比」
      seg.style.flexGrow = String(segment.seconds);
      const fill = h('div', { class: 'viz__fill' });
      seg.append(fill);
      host.append(seg);
      this.fills.push(fill);
    }

    this.keyframes.forEach((_, index) => {
      const dot = h('button', {
        class: 'viz__mark',
        type: 'button',
        'aria-label': `关键帧 ${index + 1}`,
      }) as HTMLButtonElement;
      dot.addEventListener('click', (event) => {
        event.stopPropagation();
        this.stop();
        this.setT(this.keyframes[index]);
      });
      marksHost.append(dot);
      this.marks.push(dot);
    });
  }

  private bindEvents(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stop();
      else this.play();
    });

    this.resetBtn.addEventListener('click', () => {
      this.stop();
      this.setT(0);
    });

    this.nextBtn.addEventListener('click', () => {
      this.stop();
      const next = this.keyframes.find((k) => k > this.t + 0.005);
      this.setT(next ?? 1);
    });

    this.speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
      this.speedBtn.textContent = `${SPEEDS[this.speedIndex]}×`;
      this.speedBtn.setAttribute('aria-label', `播放倍速 ${SPEEDS[this.speedIndex]} 倍`);
    });

    let dragging = false;
    const seek = (clientX: number): void => {
      const rect = this.track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      this.setT(this.timeToT(ratio * this.totalSeconds));
    };

    this.track.addEventListener('pointerdown', (event) => {
      dragging = true;
      this.stop();
      this.track.setPointerCapture(event.pointerId);
      seek(event.clientX);
    });
    this.track.addEventListener('pointermove', (event) => {
      if (dragging) seek(event.clientX);
    });
    const endDrag = (): void => {
      dragging = false;
    };
    this.track.addEventListener('pointerup', endDrag);
    this.track.addEventListener('pointercancel', endDrag);

    this.track.addEventListener('keydown', (event) => {
      const step = 0.02;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.stop();
        this.setT(this.t + step);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.stop();
        this.setT(this.t - step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.stop();
        this.setT(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.stop();
        this.setT(1);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (this.playing) this.stop();
        else this.play();
      }
    });
  }

  // ── 播放 ──

  get progress(): number {
    return this.t;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setT(t: number): void {
    this.t = Math.min(1, Math.max(0, t));
    this.paintTrack();
    this.onProgress(this.t);
  }

  play(): void {
    if (this.playing) return;
    if (this.t >= 0.999) this.t = 0;
    this.playing = true;
    this.playBtn.classList.add('is-playing');
    this.playBtn.setAttribute('aria-label', '暂停动画');
    this.lastFrame = performance.now();

    const step = (now: number): void => {
      if (!this.playing) return;
      const dt = Math.min(64, now - this.lastFrame); // 切后台回来别一下跳完
      this.lastFrame = now;
      const seconds = this.tToTime(this.t) + (dt / 1000) * SPEEDS[this.speedIndex];
      this.t = seconds >= this.totalSeconds ? 1 : this.timeToT(seconds);
      this.paintTrack();
      this.onProgress(this.t);
      if (this.t >= 1) {
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    this.playing = false;
    this.playBtn.classList.remove('is-playing');
    this.playBtn.setAttribute('aria-label', '播放动画');
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  destroy(): void {
    this.stop();
    this.resizeObserver?.disconnect();
  }

  // ── 绘制进度条 ──

  /** 量出每个关键帧圆点该落在哪一像素（落在断口正中） */
  private measureMarks(): void {
    const segments = [...this.root.querySelectorAll<HTMLElement>('.viz__segment')];
    if (segments.length === 0) return;

    const positions: number[] = [segments[0].offsetLeft];
    for (let i = 1; i < segments.length; i += 1) {
      const prev = segments[i - 1];
      const prevRight = prev.offsetLeft + prev.offsetWidth;
      const nextLeft = segments[i].offsetLeft;
      positions.push(prevRight + (nextLeft - prevRight) / 2);
    }
    const last = segments[segments.length - 1];
    positions.push(last.offsetLeft + last.offsetWidth);
    this.markPositions = positions;
  }

  private paintTrack(): void {
    this.segments.forEach((segment, index) => {
      const local = (this.t - segment.tFrom) / (segment.tTo - segment.tFrom);
      this.fills[index].style.width = `${Math.min(1, Math.max(0, local)) * 100}%`;
    });

    this.marks.forEach((dot, index) => {
      const pos = this.markPositions[index];
      if (pos !== undefined) dot.style.left = `${pos}px`;
      dot.classList.toggle('is-active', Math.abs(this.t - this.keyframes[index]) < 0.05);
    });

    this.track.setAttribute('aria-valuenow', this.tToTime(this.t).toFixed(1));
  }
}

export { SEGMENT_GAP };
