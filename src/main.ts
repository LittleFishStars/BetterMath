/**
 * 应用入口
 *
 * 把一个单页站点接上三件事：背景符号场、双视图路由、视图切换动画。
 * 视图内的结构（章节卡片等）由各模块自己渲染，这里只负责编排。
 */
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/home.css';
import './styles/chapters.css';

import { SymbolField } from './field/SymbolField';

/** 模块开始执行的时刻，用于让加载页至少显示 200ms */
const bootShownAt = performance.now();
import { Router, type Route } from './chapters/router';
import { bindHeadScroll, renderChapterDetail, renderChapters } from './chapters/render';
import { CHAPTER_CONTENTS, findChapter } from './chapters/data';
import {
  enterChapters,
  leaveChapters,
  showChaptersImmediately,
  showHomeImmediately,
  syncHeadHeight,
  type TransitionRefs,
} from './chapters/transitions';

/**
 * 收掉首屏加载页（index.html 里的 #boot）。
 *
 * 调用时机要卡在「样式已经应用、首帧已经画好」之后：
 *   · 样式是 JS import 进来的，bootstrap 跑完时 CSS 一定已注入；
 *   · 再等两帧，确保浏览器用新样式重绘过一帧，否则淡出时可能露出旧样式。
 *
 * 字体再单独等一小会儿：字体没到会先按 fallback 渲染，标题会「跳」一下。
 * 但也不能干等 —— 网络慢时最长等 400ms，到点就用 fallback 顶上。
 */
async function dismissBoot(): Promise<void> {
  const boot = document.getElementById('boot');
  if (!boot) return;

  // 加载页至少露个脸：极快的加载（缓存命中）下若一帧就撤掉，
  // 反而像闪屏。以模块开始执行为零点，补足到 200ms。
  const elapsed = performance.now() - bootShownAt;
  if (elapsed < 200) {
    await new Promise((resolve) => setTimeout(resolve, 200 - elapsed));
  }

  // 字体最多等 250ms：等太久加载页显得拖沓，
  // 而 font-display: swap 保证字体迟到也只是平滑替换，不会缺字。
  await Promise.race([
    document.fonts?.ready.catch(() => undefined) ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 250)),
  ]);

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  boot.classList.add('is-done');

  // 过渡结束后移除；transitionend 偶尔不触发（标签页后台等），定时器兜底
  const remove = (): void => boot.remove();
  boot.addEventListener('transitionend', remove, { once: true });
  window.setTimeout(remove, 500);
}

function must<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`缺少必需的节点：${selector}`);
  return el;
}

function bootstrap(): void {
  // ── 背景符号场：两个视图共用一个画布，切页时背景是连续的 ──
  const canvas = document.querySelector<HTMLCanvasElement>('#symbol-field');
  let field: SymbolField | null = null;
  if (canvas) {
    field = new SymbolField({ canvas });
    field.start();
  }

  // ── 视图引用 ──
  const refs: TransitionRefs = {
    homeView: must('#view-home'),
    chaptersView: must('#view-chapters'),
    head: must('#chapter-head'),
    chaptersBody: must('#chapters-body'),
  };
  const detailBox = must('#chapter-detail');
  const headNav = must('#chapter-nav');

  // ── 路由 ──
  // router 要先于 renderChapters 建好：卡片的点击回调里用到它。
  const router = new Router();

  renderChapters(refs.chaptersBody, headNav, (chapterId) => {
    router.navigate({ view: 'chapter', chapterId });
  });
  bindHeadScroll(refs.head);

  // 一次只跑一个转场：连点不能叠出两个正在动的页面
  let busy = false;

  /** 章节列表 ↔ 章节内容：两者共用 header，只切主体区域 */
  const showList = (): void => {
    detailBox.hidden = true;
    refs.chaptersBody.hidden = false;
    headNav.hidden = false;
  };

  const showDetail = (chapterId: string): void => {
    const chapter = findChapter(chapterId);
    if (!chapter) {
      // 未知 id：退回列表，别让人停在空白页
      router.navigate({ view: 'chapters' }, { history: false });
      return;
    }

    renderChapterDetail(detailBox, chapter, CHAPTER_CONTENTS[chapterId] ?? [], () => {
      router.navigate({ view: 'chapters' });
    });

    // header 的分类锚点在内容页没有意义，收起
    headNav.hidden = true;
    refs.chaptersBody.hidden = true;
    detailBox.hidden = false;

    // 淡入：先摘 class 再下一帧加回，否则元素从 hidden 变可见的那一帧
    // 加 class 不会触发过渡（见 transitions.ts 里同样的坑）
    detailBox.classList.remove('is-revealed');
    requestAnimationFrame(() => detailBox.classList.add('is-revealed'));

    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const applyRoute = async (next: Route, previous: Route | null): Promise<void> => {
    if (busy) return;
    busy = true;

    // 非主页都算长内容页，背景降到低密度，省下的 GPU 留给卡片与滚动
    field?.lowPower(next.view !== 'home');

    try {
      // 首次进入：不做转场，直接摆好
      if (previous === null) {
        if (next.view === 'home') {
          document.body.dataset.route = 'home';
          showHomeImmediately(refs);
        } else {
          document.body.dataset.route = 'chapters';
          showChaptersImmediately(refs);
          if (next.view === 'chapter') showDetail(next.chapterId);
          else showList();
        }
        return;
      }

      // 章节列表 ↔ 章节内容：同一个视图内的两屏，不走 header 转场
      if (previous.view !== 'home' && next.view !== 'home') {
        if (next.view === 'chapter') showDetail(next.chapterId);
        else showList();
        return;
      }

      // 动画期间**不切** data-route。
      //
      // body[data-route='home'] 上挂着 height:100dvh + overflow:hidden，
      // 一进章节页就摘掉，会立刻出现滚动条 —— 视口宽度瞬间少 15px，
      // 整页重排一次。如果这发生在转场途中，画面会明显抖一下。
      // 等落位之后再切，布局变化就和动画错开了。
      if (next.view !== 'home') {
        if (next.view === 'chapter') showDetail(next.chapterId);
        else showList();
        await enterChapters(refs);
        document.body.dataset.route = 'chapters';
      } else {
        await leaveChapters(refs);
        document.body.dataset.route = 'home';
      }
    } finally {
      busy = false;
    }
  };

  // 初始状态
  const initial = router.route;
  field?.lowPower(initial.view !== 'home');
  showHomeImmediately(refs);
  if (initial.view !== 'home') {
    document.body.dataset.route = 'chapters';
    showChaptersImmediately(refs);
    if (initial.view === 'chapter') showDetail(initial.chapterId);
    else showList();
  } else {
    showList();
  }

  // 用户点击/编程跳转
  router.subscribe((next, previous) => {
    void applyRoute(next, previous);
  });

  // ── 交互 ──
  const enterButton = must('#enter-button');
  enterButton.addEventListener('click', () => router.navigate({ view: 'chapters' }));

  // header 里的品牌标题就是「返回主页」的入口，另外加一路键盘 Esc
  const brand = must('#head-title-slot');
  brand.addEventListener('click', (event) => {
    event.preventDefault();
    router.navigate({ view: 'home' });
  });

  // Esc：内容页 → 章节列表 → 主页，逐级退
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const current = router.route;
    if (current.view === 'chapter') router.navigate({ view: 'chapters' });
    else if (current.view === 'chapters') router.navigate({ view: 'home' });
  });

  // header 高度随断点变化（桌面 76px / 窄屏 64px），
  // --bm-head-h 也要跟着重量，否则窄屏上章节内容会被顶低一截
  let headResizeRaf = 0;
  window.addEventListener(
    'resize',
    () => {
      if (headResizeRaf) return;
      headResizeRaf = requestAnimationFrame(() => {
        headResizeRaf = 0;
        syncHeadHeight(refs.head);
      });
    },
    { passive: true },
  );

  // 页面卸载时停掉 rAF 与监听，避免与 bfcache 里的旧页面一起燃烧
  window.addEventListener('pagehide', () => field?.destroy(), { once: true });

  // 一切就绪，收掉加载页
  void dismissBoot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}