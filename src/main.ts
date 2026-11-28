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
import { VISUALS } from './viz/registry';
import { VizShell } from './viz/shell';
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
  const vizBox = must('#viz-view');
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

  // ── 主体切换（章节列表 ↔ 章节内容）──
  //
  // 两屏共用同一个 header，所以这里只动主体区域：
  // 旧主体淡出上移 → 换内容 → 新主体淡入上移。
  // 时长与首页⇄章节页的转场对齐（退场 150ms / 进场 300ms），
  // 这样三层页面之间来回走，节奏是同一个。
  //
  // 为什么退场要先等完再显示新主体，而不是交叉淡化：
  // 两屏都是文档流里的块，同时可见会把页面撑高、滚动条跳一下。
  // 串行做没有这个副作用，中间也只有一帧的空档，肉眼看不出来。
  const BODY_LEAVE_MS = 150;

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /** 旧主体退场：淡出上移，结束后隐藏 */
  const leaveBody = async (el: HTMLElement): Promise<void> => {
    if (el.hidden) return;
    el.classList.remove('is-revealed');
    el.classList.add('is-leaving');
    await wait(BODY_LEAVE_MS);
    el.hidden = true;
    el.classList.remove('is-leaving');
  };

  /** 新主体进场：显示后下一帧再加 class 触发过渡 */
  const enterBody = (el: HTMLElement): void => {
    el.hidden = false;
    // 元素从 hidden 变可见的那一帧加 class 不会触发过渡，先摘再下一帧加
    el.classList.remove('is-revealed');
    requestAnimationFrame(() => el.classList.add('is-revealed'));
  };

  /** 摆好列表（不做动画，供首屏与 header 转场使用） */
  /**
   * 三个主体（列表 / 内容页 / 可视化）同时只有一个可见。
   *
   * 切换时**必须**把其余的收起来。之前 showList 只收了 detailBox、
   * prepareDetail 只收了 chaptersBody，谁都没管 vizBox ——
   * 于是从可视化页直接回首页再进章节页，可视化会「接在后面」一起显示。
   */
  const showOnly = (active: HTMLElement): void => {
    for (const el of [refs.chaptersBody, detailBox, vizBox]) {
      el.hidden = el !== active;
    }
  };

  const showList = (): void => {
    showOnly(refs.chaptersBody);
    detailBox.classList.remove('is-revealed', 'is-leaving');
    // 分类锚点淡回。首屏时整棵树刚从 display:none 出来，
    // 同一帧加的 class 不产生过渡，所以直接这么写就够了。
    headNav.classList.remove('is-gone');
  };

  /** 渲染并摆好内容页（不做动画） */
  const prepareDetail = (chapterId: string): boolean => {
    const chapter = findChapter(chapterId);
    if (!chapter) return false;

    renderChapterDetail(
      detailBox,
      chapter,
      CHAPTER_CONTENTS[chapterId] ?? [],
      () => router.navigate({ view: 'chapters' }),
      (item) => {
        if (item.visual) {
          router.navigate({ view: 'viz', chapterId, contentId: item.id });
        }
      },
    );

    // header 的分类锚点在内容页没有意义，淡出（首屏时无过渡）
    headNav.classList.add('is-gone');
    showOnly(detailBox);
    refs.chaptersBody.classList.remove('is-revealed', 'is-leaving');
    return true;
  };

  // ── 可视化页 ──
  // 具体实现查注册表，main.ts 不认识任何具体可视化
  let currentViz: { destroy(): void } | null = null;
  /** 异步加载的可视化如果还没到就换了页，用它作废回调 */
  let vizLoadToken = 0;

  const disposeViz = (): void => {
    vizLoadToken += 1;
    currentViz?.destroy();
    currentViz = null;
    vizBox.replaceChildren();
  };

  /** 渲染并摆好可视化页（不做动画） */
  const prepareViz = (chapterId: string, contentId: string): boolean => {
    const chapter = findChapter(chapterId);
    const items = CHAPTER_CONTENTS[chapterId] ?? [];
    const item = items.find((entry) => entry.id === contentId);
    if (!chapter || !item?.visual) return false;

    const entry = VISUALS[item.visual];
    if (!entry) return false;

    disposeViz();
    const token = vizLoadToken;

    const place = (shell: VizShell): void => {
      shell.setTitle(item.title);
      vizBox.replaceChildren(shell.root);
      currentViz = shell;
      if (shell.autofocus) shell.focus();
    };

    const loaded = entry.load();
    if (loaded instanceof Promise) {
      // 复杂可视化（比如带 Three.js 的三维场景）是按需加载的，
      // 先放个占位，等 chunk 到了再换上去。
      const placeholder = document.createElement('div');
      placeholder.className = 'viz-loading';
      placeholder.textContent = '正在加载…';
      vizBox.replaceChildren(placeholder);

      void loaded.then((def) => {
        if (token !== vizLoadToken) return; // 期间已经切走了
        // 「深入」按钮由外壳自己处理（切到下一个部分），这里只管返回
        const shell = new VizShell(def, () => router.navigate({ view: 'chapter', chapterId }));
        place(shell);
        vizBox.classList.add('is-revealed');
      });
      currentViz = { destroy: () => { /* 由 token 作废 */ } };
    } else {
      const shell = new VizShell(loaded, () => router.navigate({ view: 'chapter', chapterId }));
      place(shell);
    }

    headNav.classList.add('is-gone');
    showOnly(vizBox);
    return true;
  };

  /** 带动画地切到列表 / 内容页 */
  /** 路由 → 它对应的主体容器 */
  const bodyOf = (route: Route): HTMLElement => {
    if (route.view === 'chapter') return detailBox;
    if (route.view === 'viz') return vizBox;
    return refs.chaptersBody;
  };

  const switchBody = async (next: Route): Promise<void> => {
    const to = bodyOf(next);
    // 当前可见的那个（三个主体同时只有一个没 hidden）
    const from = [refs.chaptersBody, detailBox, vizBox].find((el) => !el.hidden);

    // 1) 旧主体先退场。
    //    必须排在「摆好新主体」之前：showList/prepareDetail 会直接写 hidden，
    //    一旦先隐藏，leaveBody 里的 el.hidden 判断就会短路，动画整个跳过。
    if (from && from !== to) await leaveBody(from);

    // 2) 摆好新主体
    let prepared = true;
    if (next.view === 'viz') {
      prepared = prepareViz(next.chapterId, next.contentId);
    } else if (next.view === 'chapter') {
      prepared = prepareDetail(next.chapterId);
    } else {
      showList();
    }

    if (!prepared) {
      // 未知 id：退回列表。这里不能靠 router.navigate 转场 ——
      // applyRoute 的 busy 锁会把紧接着的那次 emit 丢掉，所以手动摆好视图，
      // 只让 router 把地址栏改回去（history: false，不新增记录）。
      showList();
      router.navigate({ view: 'chapters' }, { history: false });
      enterBody(refs.chaptersBody);
      return;
    }

    // 3) 新主体进场
    if (next.view !== 'chapters') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    enterBody(to);
  };

  // 只处理「导航引起」的切换：首次落地由下面的初始状态那段负责
  const applyRoute = async (next: Route, previous: Route): Promise<void> => {
    if (busy) return;
    busy = true;

    // 非主页都算长内容页，背景降到低密度，省下的 GPU 留给卡片与滚动
    field?.lowPower(next.view !== 'home');

    try {
      // 章节列表 ↔ 章节内容：同一个视图内的两屏，不走 header 转场
      if (previous.view !== 'home' && next.view !== 'home') {
        await switchBody(next);
        return;
      }

      // 动画期间**不切** data-route。
      //
      // body[data-route='home'] 上挂着 height:100dvh + overflow:hidden，
      // 一进章节页就摘掉，会立刻出现滚动条 —— 视口宽度瞬间少 15px，
      // 整页重排一次。如果这发生在转场途中，画面会明显抖一下。
      // 等落位之后再切，布局变化就和动画错开了。
      if (next.view !== 'home') {
        // 从主页过来：主体静态就位，进场交给 enterChapters（含 header 滑下）
        let prepared = true;
        if (next.view === 'viz') prepared = prepareViz(next.chapterId, next.contentId);
        else if (next.view === 'chapter') prepared = prepareDetail(next.chapterId);
        else showList();

        if (!prepared) {
          // 未知 id：落到章节列表，别把人留在空白页
          showList();
          router.navigate({ view: 'chapters' }, { history: false });
          await enterChapters(refs);
          document.body.dataset.route = 'chapters';
          return;
        }

        await enterChapters(refs);
        enterBody(bodyOf(next));
        document.body.dataset.route = 'chapters';
      } else {
        // 回主页时，当前显示的可能不是章节列表：内容页是 detailBox，
        // 可视化页是 vizBox。传错的话那个主体会一直留到视图被 hidden，
        // 主页淡入途中直接透出来。
        const activeBody =
          previous.view === 'viz'
            ? vizBox
            : previous.view === 'chapter'
              ? detailBox
              : refs.chaptersBody;

        await leaveChapters(refs, activeBody);

        // 离开可视化页时把实例销毁：它可能挂着 rAF 循环（播放中），
        // 不销毁会一直在后台空转。DOM 已经在淡出之后，这里清空不会闪。
        // 顺手把 hidden 收回去 —— 不依赖「下次进章节页时 showOnly 会修正」。
        if (previous.view === 'viz') {
          disposeViz();
          vizBox.hidden = true;
        }

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
    if (initial.view === 'viz') {
      if (prepareViz(initial.chapterId, initial.contentId)) vizBox.classList.add('is-revealed');
      else showList();
    } else if (initial.view === 'chapter') {
      if (prepareDetail(initial.chapterId)) detailBox.classList.add('is-revealed');
      else showList();
    } else {
      showList();
    }
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
    if (current.view === 'viz') {
      router.navigate({ view: 'chapter', chapterId: current.chapterId });
    } else if (current.view === 'chapter') {
      router.navigate({ view: 'chapters' });
    } else if (current.view === 'chapters') {
      router.navigate({ view: 'home' });
    }
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
  window.addEventListener('pagehide', () => {
    field?.destroy();
    currentViz?.destroy();
  }, { once: true });

  // 一切就绪，收掉加载页
  void dismissBoot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}