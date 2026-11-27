/**
 * 视图切换动画
 *
 * 主页 → 章节页的编排（这是整个交互的门面，顺序不能乱）：
 *
 *   0ms    克隆主页标题，钉在它原来的位置（fixed），原标题隐藏
 *   0ms    主页的按钮与页脚开始淡出
 *   0ms    标题开始缩小、飞向左上角 header 里的插槽
 *   260ms  液态玻璃 header 从顶部滑下来（等标题飞了一小段再起身，
 *          看起来像 header 去「接住」标题，而不是两者各飞各的）
 *   880ms  header 到位（比标题早 70ms，像「伸出去接住」）
 *   950ms  标题落位：隐藏克隆，露出 header 里真正的标题
 *   950ms+ 三组章节卡片依次浮现
 *
 * 反向（章节页 → 主页）把上面的顺序倒过来。
 *
 * 为什么用克隆而不是直接动真标题：
 *   真标题在 home 视图里，而 home 视图要淡出；直接把真标题留在原地飞，
 *   会跟着父级一起淡掉。克隆到 body 下、position: fixed，
 *   它就不受任何父级影响，飞行轨迹才能精确到像素。
 *
 * 为什么用 transform: scale 而不是改 font-size：
 *   改 font-size 会触发整棵树重排，60fps 下基本做不到；scale 是合成层变换，
 *   由 GPU 完成。代价是缩放过程中字形会有轻微的「软」，但 560ms 内看不出来。
 */

/** 标题落位动画时长（毫秒） */
const FLY_MS = 950;
/** header 滑出的时长 */
const HEAD_MS = 620;
/** header 起步比标题晚多久 —— 让它看起来是「去接」*/
const HEAD_DELAY = 260;
/**
 * 缓动：起步平缓、中段加速、收尾减速。
 *
 * 早先用的是 cubic-bezier(0.22, 0.68, 0.16, 1) —— 控制点在 22% 处就
 * 达到 68% 进度，等于「一瞬间弹出去再慢慢停」。配合 560ms 的时长，
 * 观感是标题「嗖」一下就不见了，看不清它是怎么过去的。
 *
 * 换成 Material 的标准减速曲线：前 40% 几乎没动，中间才加速，
 * 末端缓缓贴进目标位置。整个过程是可读的。
 */
const FLY_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const HEAD_EASE = 'cubic-bezier(0.32, 0, 0.24, 1)';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 等一帧，确保刚改的样式已经生效（否则测量拿到的是旧布局） */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * 让一个元素从 from 位置飞到 to 位置。
 *
 * 用 transform-origin: top-left + translate/scale，而不是动画 left/top/width：
 * 前者只走合成，后者每帧都要重排重绘。
 */
async function fly(
  source: HTMLElement,
  target: HTMLElement,
  {
    duration = FLY_MS,
    toRect,
  }: { duration?: number; toRect?: DOMRect } = {},
): Promise<void> {
  const from = source.getBoundingClientRect();
  // 目标位置允许外部传入。
  //
  // 必须支持这个参数：进入章节页时 header 还停在 translateY(-100%)（屏幕外），
  // 此刻调 target.getBoundingClientRect() 拿到的是屏幕上方 76px 处的位置，
  // 克隆会飞出视口上缘 —— 实测落点在 top: -54px。
  // 调用方会在 header 归位的瞬间先把落点量好，再交给这里。
  const to = toRect ?? target.getBoundingClientRect();

  // 源元素可能比目标大也可能小（进出两个方向对称），
  // 缩放比按宽度算：同一段文字、同一种字体，宽高比一致，单用宽度就够
  const scale = to.width / Math.max(from.width, 1);

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('title-flight');
  clone.removeAttribute('id');
  // 去掉可能带过来的动画与过渡，只保留静态样式
  clone.style.animation = 'none';
  clone.style.transition = 'none';

  // 先钉在源位置
  clone.style.left = `${from.left}px`;
  clone.style.top = `${from.top}px`;
  clone.style.width = `${from.width}px`;
  document.body.append(clone);

  // 源元素隐藏（用 visibility 而不是 display，保持布局不变，
  // 这样回退时能立刻量到原来的位置）
  source.style.visibility = 'hidden';
  target.style.visibility = 'hidden';

  const dx = to.left - from.left;
  const dy = to.top - from.top;

  if (prefersReducedMotion()) {
    clone.remove();
    source.style.visibility = '';
    target.style.visibility = '';
    return;
  }

  clone.style.transformOrigin = 'top left';
  const animation = clone.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        // 缩到很小时线宽会变细，末端稍微提一点不透明度保持「实」
        opacity: 1,
      },
    ],
    { duration, easing: FLY_EASE, fill: 'forwards' },
  );

  await animation.finished.catch(() => undefined);

  clone.remove();
  source.style.visibility = '';
  target.style.visibility = '';
}

/** header 的滑入/滑出 */
function slideHead(head: HTMLElement, show: boolean): Animation {
  if (prefersReducedMotion()) {
    head.style.transform = show ? 'translateY(0)' : 'translateY(-100%)';
    head.style.opacity = show ? '1' : '0';
    return head.animate([], { duration: 0 });
  }

  return head.animate(
    [
      {
        transform: show ? 'translateY(-100%)' : 'translateY(0)',
        opacity: show ? 0 : 1,
      },
      {
        transform: show ? 'translateY(0)' : 'translateY(-100%)',
        opacity: show ? 1 : 0,
      },
    ],
    {
      duration: HEAD_MS,
      delay: show ? HEAD_DELAY : 0,
      easing: HEAD_EASE,
      fill: 'forwards',
    },
  );
}

export interface TransitionRefs {
  homeView: HTMLElement;
  chaptersView: HTMLElement;
  homeTitle: HTMLElement;
  headTitle: HTMLElement;
  head: HTMLElement;
  chaptersBody: HTMLElement;
}

/**
 * 切到章节页。
 *
 * 顺序：先让章节视图可测量（hidden 去掉、header 摆到最终位置但不可见），
 * 量完再摆回去做动画 —— 否则量到的 header 标题位置是 -100% 处的。
 */
export async function enterChapters(refs: TransitionRefs): Promise<void> {
  const { homeView, chaptersView, homeTitle, headTitle, head, chaptersBody } = refs;

  // 1) 章节视图上台，但先不显形
  chaptersView.hidden = false;
  chaptersBody.style.opacity = '0';
  chaptersBody.style.transform = 'translateY(18px)';

  // 2) header 摆到最终位置量标题落点，再弹回顶部
  head.style.transform = 'translateY(0)';
  head.style.opacity = '0';
  headTitle.style.visibility = 'hidden';
  await nextFrame();
  const headRect = head.getBoundingClientRect();
  // 标题落点必须在 header 处于最终位置时量，量完再弹回去
  const titleRect = headTitle.getBoundingClientRect();
  head.style.transform = 'translateY(-100%)';

  // 3) 主页开始退场（只淡出按钮与页脚，标题留给飞行）
  homeView.classList.add('is-leaving');

  // 4) 飞
  const flight = fly(homeTitle, headTitle, { toRect: titleRect });

  // 5) header 从顶部滑下（略晚一点起步）
  slideHead(head, true);

  await flight;

  // 6) 落位：主页彻底让位
  homeView.hidden = true;
  homeView.classList.remove('is-leaving');

  // 7) 章节内容浮现
  if (prefersReducedMotion()) {
    chaptersBody.style.opacity = '1';
    chaptersBody.style.transform = 'none';
  } else {
    chaptersBody.animate(
      [
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
    );
    chaptersBody.style.opacity = '';
    chaptersBody.style.transform = '';
  }

  // header 高度要参与章节内容的顶距，量一次写进变量
  document.documentElement.style.setProperty('--bm-head-h', `${headRect.height}px`);
}

/** 切回主页：把上面的顺序反过来 */
export async function leaveChapters(refs: TransitionRefs): Promise<void> {
  const { homeView, chaptersView, homeTitle, headTitle, head, chaptersBody } = refs;

  // 1) 章节内容先退场
  if (!prefersReducedMotion()) {
    await chaptersBody
      .animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(10px)' },
        ],
        { duration: 220, easing: 'ease-out', fill: 'forwards' },
      )
      .finished.catch(() => undefined);
  }

  // 2) 主页回来（但标题还看不见，等飞行落位）
  homeView.hidden = false;
  homeTitle.style.visibility = 'hidden';
  await nextFrame();

  // 3) 飞回去
  await fly(headTitle, homeTitle);

  // 4) header 收上去
  slideHead(head, false);

  // 5) 章节视图下台
  chaptersView.hidden = true;
  chaptersBody.style.opacity = '';
  chaptersBody.style.transform = '';

  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

/** 首次直接落在 /chapters（刷新或分享链接进入）时的状态：不做飞行 */
export function showChaptersImmediately(refs: TransitionRefs): void {
  refs.homeView.hidden = true;
  refs.chaptersView.hidden = false;
  refs.head.style.transform = 'translateY(0)';
  refs.head.style.opacity = '1';
  refs.headTitle.style.visibility = '';
  const height = refs.head.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--bm-head-h', `${height}px`);
}

/** 首次直接落在 / 时的状态 */
export function showHomeImmediately(refs: TransitionRefs): void {
  refs.homeView.hidden = false;
  refs.chaptersView.hidden = true;
  refs.head.style.transform = 'translateY(-100%)';
  refs.head.style.opacity = '0';
  refs.homeTitle.style.visibility = '';
}
