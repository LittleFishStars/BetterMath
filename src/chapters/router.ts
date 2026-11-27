/**
 * 极简路由
 *
 * 三条路径：
 *   /                              主页
 *   /chapters                      章节列表
 *   /chapters/<chapterId>          章节内容页
 *   /chapters/<chapterId>/<slug>   内容条目的可视化页
 *
 * 用 History API 而不是真正的多页：视图切换要有转场，一旦换成整页跳转，
 * 转场就断了；而且共用一份 canvas 背景场，整页加载会让它重新开始。
 *
 * 为什么不引 react-router / vue-router：这个站只有两条前缀、零依赖。
 * 为了这么点路由引一个库，比手写这些行还重。
 */

export type Route =
  | { view: 'home' }
  | { view: 'chapters' }
  | { view: 'chapter'; chapterId: string }
  | { view: 'viz'; chapterId: string; contentId: string };

/** 路径 → 路由。未知路径一律回主页 */
function parse(pathname: string): Route {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { view: 'home' };
  if (clean === '/chapters') return { view: 'chapters' };

  // 三级要放在二级之前判断，否则 /chapters/a/b 会先被二级规则拒掉
  const viz = /^\/chapters\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(clean);
  if (viz) return { view: 'viz', chapterId: viz[1], contentId: viz[2] };

  const match = /^\/chapters\/([a-z0-9-]+)$/.exec(clean);
  if (match) return { view: 'chapter', chapterId: match[1] };

  return { view: 'home' };
}

/** 路由 → 路径 */
function toPath(route: Route): string {
  switch (route.view) {
    case 'chapters':
      return '/chapters';
    case 'chapter':
      return `/chapters/${route.chapterId}`;
    case 'viz':
      return `/chapters/${route.chapterId}/${route.contentId}`;
    default:
      return '/';
  }
}

/**
 * 两个路由是否「同一页面」。
 *
 * 详情页之间互跳（比如以后加上一篇/下一篇）不必重建视图，
 * 所以比较时要把 chapterId 带上。
 */
function sameRoute(a: Route, b: Route): boolean {
  if (a.view !== b.view) return false;
  if (a.view === 'chapter' && b.view === 'chapter') return a.chapterId === b.chapterId;
  if (a.view === 'viz' && b.view === 'viz') {
    return a.chapterId === b.chapterId && a.contentId === b.contentId;
  }
  return true;
}

type Listener = (next: Route, previous: Route) => void;

export class Router {
  private current: Route;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.current = parse(window.location.pathname);

    // 浏览器前进/后退：只切视图，不主动 push（否则历史记录会翻倍）
    window.addEventListener('popstate', () => {
      const next = parse(window.location.pathname);
      if (sameRoute(next, this.current)) return;
      const previous = this.current;
      this.current = next;
      this.emit(next, previous);
    });
  }

  get route(): Route {
    return this.current;
  }

  /** 跳转；history 选项控制是否写入浏览器历史（前进后退用 false） */
  navigate(to: Route, { history = true }: { history?: boolean } = {}): void {
    if (sameRoute(to, this.current)) return;
    const previous = this.current;
    this.current = to;

    const path = toPath(to);
    if (history) window.history.pushState({ route: to.view }, '', path);
    // 用 replaceState 处理「已经在目标路径但视图没切」的边界：
    // 直接 push 会留下一条重复记录
    else window.history.replaceState({ route: to.view }, '', path);

    this.emit(to, previous);
  }

  /** 订阅视图切换，返回取消订阅函数 */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(next: Route, previous: Route): void {
    for (const fn of this.listeners) fn(next, previous);
  }
}