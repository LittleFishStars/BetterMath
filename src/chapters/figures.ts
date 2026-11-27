/**
 * 章节代表图形
 *
 * 每个章节配一幅内联 SVG：细线、渐变描边、不用填充色块。
 * 统一风格才能让网格看起来是一套东西，而不是从各个地方拼来的插画。
 *
 * 为什么用内联 SVG 而不是 emoji / 位图：
 *   · emoji 各平台字形差异巨大，蓝色系配彩色 emoji 会散掉
 *   · 位图要额外请求，还要为 DPR 准备多套尺寸
 *   · SVG 能吃到 CSS 的 currentColor 与渐变，跟着主题走
 *
 * 每个图形都画在 viewBox="0 0 120 120" 里，按容器尺寸自适应缩放。
 * 线条统一 1.6，视觉重量一致；细节笔画用更细的 1.1，避免糊成一团。
 */

export interface Figure {
  /** 可访问名称：图形表达的内容，用于 aria-label */
  label: string;
  /** SVG 内部形状（不含 <svg> 外壳与渐变定义） */
  body: string;
}

/**
 * 所有图形共用的渐变定义。
 *
 * 放在一个隐藏的 <svg> 里定义一次，图形通过 url(#...) 引用。
 * 每个图形各自带一份渐变会让 DOM 里多出十几份重复的 defs，
 * 而且 id 必须唯一 —— 集中定义省事也更省字节。
 */
export const FIGURE_DEFS = `
<defs>
  <linearGradient id="bm-fig-line" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3b8fe0" />
    <stop offset="0.55" stop-color="#2a4ca0" />
    <stop offset="1" stop-color="#12386e" />
  </linearGradient>
  <linearGradient id="bm-fig-soft" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#1c6fc4" stop-opacity="0" />
    <stop offset="1" stop-color="#1c6fc4" stop-opacity="0.22" />
  </linearGradient>
</defs>
`;

/** 描边样式令牌：统一线宽与端点，保证十来幅图形看起来是一套 */
const S = 'fill="none" stroke="url(#bm-fig-line)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const S_THIN = 'fill="none" stroke="url(#bm-fig-line)" stroke-width="1.1" stroke-linecap="round"';

/** 章节 id → 图形 */
export const FIGURES: Record<string, Figure> = {
  /* ── 代数 ───────────────────────────────────────────── */

  // 高等代数：特征向量的拉伸。一个圆经线性变换成椭圆，两条主轴是特征方向
  eigen: {
    label: '线性变换把圆映成椭圆，两条主轴是特征方向',
    body: `
      <ellipse cx="60" cy="60" rx="42" ry="24" transform="rotate(-24 60 60)"
        fill="none" stroke="#2a4ca0" stroke-width="1.1" stroke-dasharray="3 4" opacity="0.55" />
      <line x1="18" y1="78" x2="102" y2="42" stroke="url(#bm-fig-line)" stroke-width="1.6" stroke-linecap="round" />
      <line x1="38" y1="28" x2="82" y2="92" stroke="url(#bm-fig-line)" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="60" cy="60" r="3" fill="#12386e" />
    `,
  },

  // 抽象代数：正六边形的对称群。六条对称轴 + 旋转提示弧
  group: {
    label: '正六边形及其对称轴，表示群的结构',
    body: `
      <polygon points="60,16 98,38 98,82 60,104 22,82 22,38" ${S} />
      <line x1="60" y1="16" x2="60" y2="104" ${S_THIN} opacity="0.5" />
      <line x1="22" y1="38" x2="98" y2="82" ${S_THIN} opacity="0.5" />
      <line x1="22" y1="82" x2="98" y2="38" ${S_THIN} opacity="0.5" />
      <path d="M96 60 A36 36 0 0 1 86 88" ${S_THIN} opacity="0.85" />
      <polygon points="86,88 89,80 80,84" fill="#2a4ca0" />
      <circle cx="60" cy="60" r="2.6" fill="#12386e" />
    `,
  },


  /* ── 分析 ───────────────────────────────────────────── */

  // 数学分析：极限。曲线逼近一条水平渐近线，带 ε 带
  limit: {
    label: '曲线逐渐逼近水平渐近线',
    body: `
      <rect x="16" y="44" width="88" height="16" fill="url(#bm-fig-soft)" />
      <line x1="16" y1="52" x2="104" y2="52" ${S_THIN} stroke-dasharray="4 4" opacity="0.7" />
      <path d="M16 96 C42 96 54 68 68 58 C82 50 94 52 104 52" ${S} />
      <line x1="16" y1="52" x2="16" y2="96" stroke="#2a4ca0" stroke-width="1.1" opacity="0.5" />
      <circle cx="88" cy="52.4" r="2.6" fill="#12386e" />
    `,
  },

  // 实变函数：测度。不规则集合被小矩形覆盖
  measure: {
    label: '用一列小矩形覆盖不规则集合以度量其大小',
    body: `
      <path d="M22 84 C30 60 44 56 52 66 C60 76 70 48 80 52 C90 56 96 68 98 84"
        ${S} opacity="0.55" />
      <rect x="24" y="78" width="14" height="12" ${S_THIN} opacity="0.9" />
      <rect x="42" y="62" width="14" height="12" ${S_THIN} opacity="0.9" />
      <rect x="60" y="52" width="14" height="12" ${S_THIN} opacity="0.9" />
      <rect x="78" y="66" width="14" height="12" ${S_THIN} opacity="0.9" />
      <line x1="16" y1="94" x2="104" y2="94" ${S_THIN} opacity="0.5" />
    `,
  },

  // 复变函数：围道积分。闭合曲线 + 内部的极点 + 绕行方向
  contour: {
    label: '绕极点的闭合围道与积分方向',
    body: `
      <path d="M60 22 C88 22 104 40 104 62 C104 86 86 102 60 102
               C34 102 16 84 16 60 C16 38 34 22 60 22 Z" ${S} />
      <circle cx="60" cy="62" r="7" ${S_THIN} />
      <circle cx="60" cy="62" r="2.6" fill="#2a4ca0" />
      <path d="M92 50 l0 10 l-7 -5 Z" fill="#12386e" opacity="0.85" />
      <circle cx="47" cy="44" r="2.2" fill="#2a4ca0" opacity="0.7" />
    `,
  },

  // 泛函分析：希尔伯特空间里的正交基与投影
  hilbert: {
    label: '向量在正交基上的投影',
    body: `
      <line x1="16" y1="96" x2="104" y2="96" ${S_THIN} opacity="0.6" />
      <line x1="16" y1="96" x2="16" y2="20" ${S_THIN} opacity="0.6" />
      <line x1="16" y1="96" x2="86" y2="34" stroke="url(#bm-fig-line)" stroke-width="2.2" stroke-linecap="round" />
      <line x1="86" y1="34" x2="86" y2="96" ${S_THIN} stroke-dasharray="3 4" opacity="0.75" />
      <path d="M16 82 A14 14 0 0 0 27 90" ${S_THIN} opacity="0.8" />
      <circle cx="86" cy="34" r="3" fill="#12386e" />
    `,
  },

  // 常微分方程：方向场 + 两条积分曲线。
  // 斜线段表示「每一点的斜率」，积分曲线处处与它们相切。
  //
  // 两条曲线**不能相交**：一阶方程满足解的唯一性，过同一点的积分曲线只有一条。
  // 早先画成 X 形交叉，插图里看着像两个抛物线叠一起，数学上也不对。
  // 现在两条曲线平行、只是起点不同。
  ode: {
    label: '方向场中的两条积分曲线',
    body: `
      <line x1="40" y1="20" x2="56" y2="25" ${S_THIN} opacity="0.5" />
      <line x1="62" y1="22" x2="78" y2="27" ${S_THIN} opacity="0.5" />
      <line x1="84" y1="26" x2="100" y2="31" ${S_THIN} opacity="0.5" />
      <line x1="24" y1="40" x2="40" y2="45" ${S_THIN} opacity="0.5" />
      <line x1="46" y1="42" x2="62" y2="47" ${S_THIN} opacity="0.5" />
      <line x1="68" y1="44" x2="84" y2="49" ${S_THIN} opacity="0.5" />
      <line x1="24" y1="62" x2="40" y2="67" ${S_THIN} opacity="0.5" />
      <line x1="46" y1="64" x2="62" y2="69" ${S_THIN} opacity="0.5" />
      <line x1="68" y1="66" x2="84" y2="71" ${S_THIN} opacity="0.5" />
      <line x1="24" y1="84" x2="40" y2="89" ${S_THIN} opacity="0.5" />
      <line x1="46" y1="86" x2="62" y2="91" ${S_THIN} opacity="0.5" />
      <path d="M18 30 C34 36 44 48 58 60 C72 72 86 82 100 88" ${S} />
      <path d="M18 52 C34 58 44 70 58 82 C66 89 72 93 78 96" ${S} opacity="0.6" />
      <circle cx="46" cy="49" r="3" fill="#12386e" />
    `,
  },

  // 偏微分方程：点热源周围的等温线。
  // 早先画的是三条平行波浪，和「大学物理」的行波图形撞了；
  // 同心闭合的等值线才是热传导方程（拉普拉斯/热方程）的典型图像。
  pde: {
    label: '方形区域中点热源周围的等温线',
    body: `
      <rect x="20" y="24" width="80" height="72" ${S_THIN} opacity="0.4" />
      <ellipse cx="60" cy="60" rx="34" ry="27" ${S_THIN} opacity="0.45" />
      <ellipse cx="60" cy="60" rx="22" ry="17" ${S_THIN} opacity="0.75" />
      <ellipse cx="60" cy="60" rx="11" ry="8.5" ${S} />
      <circle cx="60" cy="60" r="2.8" fill="#12386e" />
    `,
  },

  // 概率论：正态分布曲线
  bell: {
    label: '正态分布的概率密度曲线',
    body: `
      <path d="M16 90 C34 90 42 88 48 74 C54 58 56 30 60 30
               C64 30 66 58 72 74 C78 88 86 90 104 90 L104 96 L16 96 Z"
        fill="url(#bm-fig-soft)" />
      <path d="M16 90 C34 90 42 88 48 74 C54 58 56 30 60 30
               C64 30 66 58 72 74 C78 88 86 90 104 90" ${S} />
      <line x1="60" y1="30" x2="60" y2="96" ${S_THIN} stroke-dasharray="3 4" opacity="0.6" />
      <line x1="44" y1="96" x2="76" y2="96" stroke="#12386e" stroke-width="2.4" stroke-linecap="round" opacity="0.55" />
    `,
  },

  // 数理统计：散点与回归线
  scatter: {
    label: '散点与拟合出的回归直线',
    body: `
      <line x1="16" y1="92" x2="104" y2="92" ${S_THIN} opacity="0.55" />
      <line x1="16" y1="92" x2="16" y2="20" ${S_THIN} opacity="0.55" />
      <line x1="24" y1="84" x2="96" y2="34" stroke="url(#bm-fig-line)"
        stroke-width="2.2" stroke-linecap="round" />
      <circle cx="32" cy="80" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="44" cy="72" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="52" cy="62" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="64" cy="60" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="72" cy="46" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="84" cy="42" r="2.6" fill="#2a4ca0" opacity="0.85" />
      <circle cx="90" cy="32" r="2.6" fill="#2a4ca0" opacity="0.85" />
    `,
  },

  /* ── 几何 ───────────────────────────────────────────── */

  // 解析几何：圆锥曲线。椭圆 + 两条准线
  conic: {
    label: '圆锥曲线及其焦点与准线',
    body: `
      <ellipse cx="60" cy="60" rx="40" ry="26" ${S} />
      <line x1="22" y1="24" x2="22" y2="96" ${S_THIN} stroke-dasharray="3 4" opacity="0.6" />
      <line x1="98" y1="24" x2="98" y2="96" ${S_THIN} stroke-dasharray="3 4" opacity="0.6" />
      <circle cx="42" cy="60" r="2.8" fill="#12386e" />
      <circle cx="78" cy="60" r="2.8" fill="#12386e" />
      <line x1="42" y1="60" x2="78" y2="60" ${S_THIN} opacity="0.45" />
    `,
  },

  // 高等几何：射影。两平面间的投影线束
  projective: {
    label: '从一点投射出的线束把一平面映到另一平面',
    body: `
      <path d="M22 34 L22 86" ${S} />
      <path d="M98 44 L98 76" ${S} />
      <line x1="34" y1="60" x2="88" y2="52" ${S_THIN} opacity="0.55" />
      <line x1="34" y1="60" x2="88" y2="60" ${S_THIN} opacity="0.55" />
      <line x1="34" y1="60" x2="88" y2="68" ${S_THIN} opacity="0.55" />
      <line x1="34" y1="60" x2="88" y2="76" ${S_THIN} opacity="0.4" />
      <line x1="34" y1="60" x2="88" y2="44" ${S_THIN} opacity="0.4" />
      <circle cx="34" cy="60" r="3.2" fill="#12386e" />
      <circle cx="88" cy="60" r="2.4" fill="#2a4ca0" opacity="0.8" />
    `,
  },

  // 微分几何：球面上的点与它的法向量。
  // 早先画的是「曲面网格 + 法线 + 两条主曲率方向」，三条线挤在一点、
  // 再加密集等参线，在 92px 的卡片里糊成一团。改成球面 + 一根法线，
  // 概念更单一（法向量是谈曲率、谈曲面第一/第二基本形的入口），
  // 图形也立得住。
  surface: {
    label: '球面上的点与它的法向量',
    body: `
      <circle cx="60" cy="68" r="30" ${S} />
      <ellipse cx="60" cy="68" rx="30" ry="10" ${S_THIN} opacity="0.55" />
      <path d="M60 38 C47 51 47 85 60 98" ${S_THIN} opacity="0.4" />
      <path d="M60 38 C73 51 73 85 60 98" ${S_THIN} opacity="0.4" />
      <line x1="60" y1="38" x2="60" y2="18" stroke="url(#bm-fig-line)"
        stroke-width="2.2" stroke-linecap="round" />
      <path d="M56.5 24 L60 18 L63.5 24" fill="none" stroke="#12386e"
        stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="60" cy="38" r="3.2" fill="#12386e" />
    `,
  },

  // 高中数学：抛物线（以顶点为原点，对称轴竖直）
  parabola: {
    label: '抛物线与它的对称轴',
    body: `
      <line x1="16" y1="88" x2="104" y2="88" ${S_THIN} opacity="0.5" />
      <line x1="60" y1="16" x2="60" y2="100" ${S_THIN} stroke-dasharray="3 4" opacity="0.55" />
      <path d="M28 24 C46 24 58 56 60 88 C62 56 74 24 92 24" ${S} />
      <circle cx="60" cy="88" r="3" fill="#12386e" />
      <circle cx="60" cy="68" r="2.4" fill="#2a4ca0" opacity="0.7" />
    `,
  },

  // 大学物理：行波。两条相位不同的正弦曲线叠一起
  wave: {
    label: '两条相位不同的行波叠加',
    body: `
      <path d="M16 60 C26 34 38 34 48 60 C58 86 70 86 80 60 C90 34 100 34 104 44"
        ${S} opacity="0.55" />
      <path d="M16 60 C26 86 38 86 48 60 C58 34 70 34 80 60 C90 86 100 86 104 76" ${S} />
      <line x1="16" y1="60" x2="104" y2="60" ${S_THIN} stroke-dasharray="2 5" opacity="0.45" />
      <circle cx="48" cy="60" r="2.6" fill="#12386e" />
      <circle cx="80" cy="60" r="2.6" fill="#12386e" />
    `,
  },

  /* ── 其他 ───────────────────────────────────────────── */

  // 数值分析：用折线逼近光滑曲线。
  // 节点不能太密 —— 密到与曲线贴合时两条线完全重合，
  // 「用折线逼近」这层意思就看不出来了。
  numerical: {
    label: '用折线逼近光滑曲线，圆圈是采样节点',
    body: `
      <line x1="16" y1="92" x2="104" y2="92" ${S_THIN} opacity="0.45" />
      <line x1="16" y1="92" x2="16" y2="22" ${S_THIN} opacity="0.45" />
      <path d="M18 86 C34 80 46 50 62 38 C78 26 94 24 102 23" ${S} opacity="0.5" />
      <polyline points="18,86 44,74 66,44 88,28 102,23"
        stroke="url(#bm-fig-line)" stroke-width="1.8" fill="none"
        stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="18" cy="86" r="3.4" fill="#fff" stroke="#12386e" stroke-width="1.6" />
      <circle cx="44" cy="74" r="3.4" fill="#fff" stroke="#12386e" stroke-width="1.6" />
      <circle cx="66" cy="44" r="3.4" fill="#fff" stroke="#12386e" stroke-width="1.6" />
      <circle cx="88" cy="28" r="3.4" fill="#fff" stroke="#12386e" stroke-width="1.6" />
      <circle cx="102" cy="23" r="3.4" fill="#fff" stroke="#12386e" stroke-width="1.6" />
    `,
  },

  // 离散数学：一张带环的图。节点 + 边，比坐标几何更能代表「离散」
  graph: {
    label: '顶点与边构成的图',
    body: `
      <line x1="40" y1="32" x2="82" y2="44" ${S_THIN} opacity="0.8" />
      <line x1="82" y1="44" x2="88" y2="82" ${S_THIN} opacity="0.8" />
      <line x1="88" y1="82" x2="46" y2="90" ${S_THIN} opacity="0.8" />
      <line x1="46" y1="90" x2="26" y2="58" ${S_THIN} opacity="0.8" />
      <line x1="26" y1="58" x2="40" y2="32" ${S} opacity="0.85" />
      <line x1="40" y1="32" x2="88" y2="82" ${S_THIN} opacity="0.5" stroke-dasharray="3 4" />
      <line x1="26" y1="58" x2="82" y2="44" ${S_THIN} opacity="0.5" stroke-dasharray="3 4" />
      <circle cx="40" cy="32" r="4.4" fill="#fff" stroke="url(#bm-fig-line)" stroke-width="1.8" />
      <circle cx="82" cy="44" r="4.4" fill="#fff" stroke="url(#bm-fig-line)" stroke-width="1.8" />
      <circle cx="88" cy="82" r="4.4" fill="#fff" stroke="url(#bm-fig-line)" stroke-width="1.8" />
      <circle cx="46" cy="90" r="4.4" fill="#fff" stroke="url(#bm-fig-line)" stroke-width="1.8" />
      <circle cx="26" cy="58" r="4.4" fill="#fff" stroke="url(#bm-fig-line)" stroke-width="1.8" />
    `,
  },
};

/** 取图形；未知键返回一个占位圆点，避免整张卡片渲染崩掉 */
export function figureOf(key: string): Figure {
  return (
    FIGURES[key] ?? {
      label: '章节示意图',
      body: '<circle cx="60" cy="60" r="18" fill="none" stroke="url(#bm-fig-line)" stroke-width="1.6" />',
    }
  );
}
