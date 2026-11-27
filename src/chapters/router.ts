/**
 * 极简路由
 *
 * 两个视图：主页（`/`）与章节页（`/chapters`）。用 History API 而不是
 * 真正的多页：标题从主页飞进 header 的动画必须跨视图连续，一旦换成
 * 整页跳转，动画就断了。
 *
 * 为什么不引 react-router / vue-router：这个站只有两个视图、零依赖。
 * 为了两条路径引一个路由库，比手写这 60 行还重。
 */

export type Route = 'home' | 'chapters';

/** 路径 → 视图。未知路径一律回主页 */
function parse(pathname: string): Route {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/chapters') return 'chapters';
  return 'home';
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
      if (next === this.current) return;
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
    if (to === this.current) return;
    const previous = this.current;
    this.current = to;

    const path = to === 'chapters' ? '/chapters' : '/';
    if (history) window.history.pushState({ route: to }, '', path);
    // 用 replaceState 处理「已经在目标路径但视图没切」的边界：
    // 直接 push 会留下一条重复记录
    else window.history.replaceState({ route: to }, '', path);

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
