/**
 * 视图切换转场
 *
 * 设计上刻意保守：**不做跨元素的位移动画**。
 * （header 自身的滑入是 CSS transition，不涉及坐标计算。）
 *
 * 早先做过「主页标题克隆出来、缩小飞进 header」的动画，为了让它顺眼
 * 调了五六轮（时长、缓动、落点、克隆生命周期），每一处都是新的出错机会
 * —— 落点飞出视口、飞到一半克隆被提前移除。收益是一秒多的漂亮转场，
 * 代价是一堆必须精确到帧的时序假设。这层不确定性得不偿失，所以去掉。
 *
 * 现在切到章节页只有三件事同时/依次发生：
 *   1. 主页整体淡出（340ms）
 *   2. 液态玻璃 header 从顶部滑下（560ms，用 CSS transition）
 *   3. 章节内容淡入并轻微上浮（420ms）
 *
 * 全部用 CSS class + transition 驱动，不用 WAAPI：
 * transition 的结束时机由浏览器管，不存在 finished Promise 提前 resolve、
 * 中途被打断这类隐性约定。状态只看 class 在不在。
 */

export interface TransitionRefs {
  homeView: HTMLElement;
  chaptersView: HTMLElement;
  head: HTMLElement;
  chaptersBody: HTMLElement;
}

/** 主页淡出/淡入的时长，与 chapters.css 里的 transition 对齐 */
const FADE_MS = 340;
/** 章节内容退场时长（比进场快一点，退场不该让人等） */
const LEAVE_MS = 220;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0 || prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 等一帧：让刚改过的布局先落地，过渡才有「起始状态」可插值 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** 切到章节页 */
export async function enterChapters(refs: TransitionRefs): Promise<void> {
  const { homeView, chaptersView, head, chaptersBody } = refs;

  // 1) 章节视图先上台。它此刻还在主页底下（主页是 fixed 全屏），看不见。
  chaptersView.hidden = false;
  chaptersBody.classList.remove('is-revealed');

  // 2) 等一帧再加 class。
  //
  // 这一步不能省：header 在 hidden 的容器里，display 刚从 none 变成 block。
  // 同一帧内既让元素出现、又立刻加 .is-shown，浏览器看不到「从收起态到展开态」
  // 的变化过程，transition 会被直接跳过 —— header 瞬间到位，没有滑入效果。
  await nextFrame();

  // 3) header 滑下 + 主页淡出，两者同时开始
  head.classList.add('is-shown');
  homeView.classList.add('is-leaving');

  // 4) 等主页淡完：让位、内容浮上来
  await wait(FADE_MS);
  homeView.hidden = true;
  homeView.classList.remove('is-leaving');
  chaptersBody.classList.add('is-revealed');
}

/** 切回主页：把上面的顺序倒过来 */
export async function leaveChapters(refs: TransitionRefs): Promise<void> {
  const { homeView, chaptersView, head, chaptersBody } = refs;

  // 1) 章节内容先退场
  chaptersBody.classList.remove('is-revealed');
  await wait(LEAVE_MS);

  // 2) header 收起，主页淡入
  head.classList.remove('is-shown');
  homeView.hidden = false;
  homeView.classList.remove('is-leaving');
  homeView.classList.add('is-entering');
  await wait(FADE_MS);
  homeView.classList.remove('is-entering');

  // 3) 章节视图下台，滚动位置归零
  chaptersView.hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

/** 首次直接落在 /chapters（刷新或分享链接进入）：不做转场，直接摆好 */
export function showChaptersImmediately(refs: TransitionRefs): void {
  refs.homeView.hidden = true;
  refs.chaptersView.hidden = false;
  refs.head.classList.add('is-shown');
  refs.chaptersBody.classList.add('is-revealed');
  syncHeadHeight(refs.head);
}

/** 首次直接落在 /：主页可见，header 收起 */
export function showHomeImmediately(refs: TransitionRefs): void {
  refs.homeView.hidden = false;
  refs.chaptersView.hidden = true;
  refs.head.classList.remove('is-shown');
  refs.chaptersBody.classList.remove('is-revealed');
}

/**
 * 把 header 的实际高度写进 CSS 变量，章节内容靠它顶开。
 * 分数缩放或改动字号时量一次即可，不必每帧算。
 */
export function syncHeadHeight(head: HTMLElement): void {
  const height = Math.round(head.getBoundingClientRect().height);
  if (height > 0) {
    document.documentElement.style.setProperty('--bm-head-h', `${height}px`);
  }
}