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
import { Router } from './chapters/router';
import { bindHeadScroll, renderChapters } from './chapters/render';
import {
  enterChapters,
  leaveChapters,
  showChaptersImmediately,
  showHomeImmediately,
  syncHeadHeight,
  type TransitionRefs,
} from './chapters/transitions';

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

  renderChapters(must('#chapters-body'), must('#chapter-nav'));
  bindHeadScroll(refs.head);

  // ── 路由 ──
  const router = new Router();

  // 一次只跑一个转场：连点「开始探索」不能叠出两个飞行中的克隆
  let busy = false;

  const applyRoute = async (to: 'home' | 'chapters', previous: 'home' | 'chapters' | null): Promise<void> => {
    if (busy) return;
    busy = true;

    // 章节页是长内容，背景降到低密度，省下的 GPU 留给卡片与滚动
    field?.lowPower(to === 'chapters');

    try {
      // 首次进入：不做飞行，直接摆好
      if (previous === null) {
        document.body.dataset.route = to;
        if (to === 'chapters') showChaptersImmediately(refs);
        else showHomeImmediately(refs);
        return;
      }

      // 动画期间**不切** data-route。
      //
      // body[data-route='home'] 上挂着 height:100dvh + overflow:hidden，
      // 一进章节页就摘掉，会立刻出现滚动条 —— 视口宽度瞬间少 15px，
      // 整页重排一次。如果这发生在标题飞行途中，画面会明显抖一下，
      // 严重时还会让正在动的克隆跳位。
      // 等落位之后再切，布局变化就和动画错开了。
      if (to === 'chapters') {
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
  field?.lowPower(router.route === 'chapters');
  showHomeImmediately(refs);
  if (router.route === 'chapters') {
    document.body.dataset.route = 'chapters';
    showChaptersImmediately(refs);
  }

  // 用户点击/编程跳转
  router.subscribe((next, previous) => {
    void applyRoute(next, previous);
  });

  // ── 交互 ──
  const enterButton = must('#enter-button');
  enterButton.addEventListener('click', () => router.navigate('chapters'));

  // header 里的品牌标题就是「返回主页」的入口，另外加一路键盘 Esc
  const brand = must('#head-title-slot');
  brand.addEventListener('click', (event) => {
    event.preventDefault();
    router.navigate('home');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && router.route === 'chapters') {
      router.navigate('home');
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
  window.addEventListener('pagehide', () => field?.destroy(), { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}