/**
 * 公式渲染（KaTeX）
 *
 * 约定：文本里用 `$...$` 包住数学表达式，其余部分照常写中文。
 *
 *   '这个极限就是 $\\int_0^a f(x)\\,dx$。'
 *
 * 为什么按需加载：KaTeX 连字体约 110 KB gzip，而首页和章节页一个公式都没有。
 * 打进主包会让首屏白白多下载 100 多 KB。所以这里用动态 import ——
 * Vite 会把它切成独立 chunk，只有真正进入可视化页才下载。
 *
 * 加载是异步的，而 `caption(t)` 是每帧同步调用的。所以：
 *   · 未加载完成时，`$...$` 原样显示成等宽字（不难看，也不报错）；
 *   · 加载完成后由外壳触发一次重渲染，公式就换上了。
 */
import type katexType from 'katex';

type Katex = typeof katexType;

let katex: Katex | null = null;
let loading: Promise<void> | null = null;

/** 预加载 KaTeX（重复调用只加载一次） */
export function preloadMath(): Promise<void> {
  if (loading) return loading;

  loading = Promise.all([
    import('katex'),
    // CSS 一并动态加载：Vite 会把它单独打包，随 chunk 一起注入
    import('katex/dist/katex.min.css'),
  ])
    .then(([mod]) => {
      katex = (mod as { default?: Katex }).default ?? (mod as unknown as Katex);
    })
    .catch(() => {
      // 加载失败就退回纯文本，不影响页面其余部分
      katex = null;
    });

  return loading;
}

/** KaTeX 是否已就绪 */
export function isMathReady(): boolean {
  return katex !== null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 把一段文本渲染成 HTML：`$...$` 交给 KaTeX，其余部分做 HTML 转义。
 *
 * 同步函数 —— 没加载完就先把公式原样显示出来，不会卡住渲染。
 */
export function renderMathText(text: string): string {
  // 用捕获组切分，保证 $...$ 的片段落在奇数下标上
  const parts = text.split(/(\$[^$]+\$)/g);

  return parts
    .map((part) => {
      const isMath = part.length > 2 && part.startsWith('$') && part.endsWith('$');
      if (!isMath) return escapeHtml(part);

      const tex = part.slice(1, -1);

      if (!katex) {
        // 兜底：等宽显示，至少能看出这是公式而不是乱码
        return `<code class="viz__tex-pending">${escapeHtml(tex)}</code>`;
      }

      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: false,
          // 行内公式上下留白少一点，免得把行高撑开
          strict: 'ignore',
        });
      } catch {
        return `<code class="viz__tex-pending">${escapeHtml(tex)}</code>`;
      }
    })
    .join('');
}
