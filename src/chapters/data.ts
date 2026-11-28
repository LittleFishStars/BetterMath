/**
 * 章节数据
 *
 * 十七个章节，分「代数 / 分析 / 几何 / 其他」四大类。
 * 每个章节只写题目、一句话描述和代表图形的名字 —— 图形本体是
 * 内联 SVG（见 figures.ts），不在这里塞巨型 path 字符串。
 *
 * 描述都控制在一句话（20 字上下）：网格里卡片不大，写长了会挤成三行，
 * 反而没有「简述」的呼吸感。
 */

/** 大分类 */
export type ChapterCategory = 'algebra' | 'analysis' | 'geometry' | 'other';

export interface Chapter {
  /** 稳定的 id，用于路由与 DOM 标识 */
  id: string;
  /** 章节名 */
  title: string;
  /** 一句话描述 */
  description: string;
  /** 代表图形的键，见 figures.ts */
  figure: string;
  /**
   * 详情页是否已就绪。
   *
   * 缺省（不写）视为「还没做」，卡片左下角会显示「敬请期待」。
   * 将来某个章节做完了，回来加一行 `ready: true`，标签自动消失 ——
   * 不需要去改渲染逻辑。
   */
  ready?: boolean;
}

export interface Category {
  id: ChapterCategory;
  /** 分类名 */
  name: string;
  /** 分类的英文标签，做装饰用 */
  latin: string;
  chapters: Chapter[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'algebra',
    name: '代数',
    latin: 'Algebra',
    chapters: [
      {
        id: 'higher-algebra',
        title: '高等代数',
        description: '矩阵、线性空间与特征值',
        figure: 'eigen',
      },
      {
        id: 'abstract-algebra',
        title: '抽象代数',
        description: '群、环、域与它们的运算是怎么来的',
        figure: 'group',
      },
    ],
  },
  {
    id: 'analysis',
    name: '分析',
    latin: 'Analysis',
    chapters: [
      {
        id: 'mathematical-analysis',
        title: '数学分析',
        description: '极限、连续与无穷小',
        figure: 'limit',
        ready: true,
      },
      {
        id: 'real-analysis',
        title: '实变函数',
        description: '测度、可测集与勒贝格积分',
        figure: 'measure',
      },
      {
        id: 'complex-analysis',
        title: '复变函数',
        description: '解析函数与留数',
        figure: 'contour',
      },
      {
        id: 'functional-analysis',
        title: '泛函分析',
        description: '无穷维空间里的算子与谱',
        figure: 'hilbert',
      },
      {
        id: 'ode',
        title: '常微分方程',
        description: '方向场、积分曲线与初值问题',
        figure: 'ode',
      },
      {
        id: 'pde',
        title: '偏微分方程',
        description: '热传导、波动与拉普拉斯方程',
        figure: 'pde',
      },
      {
        id: 'probability',
        title: '概率论',
        description: '随机变量与它的分布',
        figure: 'bell',
      },
      {
        id: 'statistics',
        title: '数理统计',
        description: '从样本推断总体',
        figure: 'scatter',
      },
    ],
  },
  {
    id: 'geometry',
    name: '几何',
    latin: 'Geometry',
    chapters: [
      {
        id: 'analytic-geometry',
        title: '解析几何',
        description: '用坐标描述空间中的图形',
        figure: 'conic',
      },
      {
        id: 'higher-geometry',
        title: '高等几何',
        description: '射影、变换与不变量',
        figure: 'projective',
      },
      {
        id: 'differential-geometry',
        title: '微分几何',
        description: '曲线、曲面与它们的曲率',
        figure: 'surface',
      },
    ],
  },
  {
    id: 'other',
    name: '其他',
    latin: 'Others',
    chapters: [
      {
        id: 'numerical-analysis',
        title: '数值分析',
        description: '用有限的步骤逼近精确解',
        figure: 'numerical',
      },
      {
        id: 'discrete-math',
        title: '离散数学',
        description: '图、组合与计数',
        figure: 'graph',
      },
      {
        id: 'highschool-math',
        title: '高中数学',
        description: '函数、数列与圆锥曲线',
        figure: 'parabola',
      },
      {
        id: 'university-physics',
        title: '大学物理',
        description: '力、场与波动的数学表达',
        figure: 'wave',
      },
    ],
  },
];

/** 扁平化后的全部章节，路由查找与总数统计用 */
export const ALL_CHAPTERS: readonly Chapter[] = CATEGORIES.flatMap((c) => c.chapters);

/** 按 id 找章节，详情页路由用 */
export function findChapter(id: string): Chapter | undefined {
  return ALL_CHAPTERS.find((c) => c.id === id);
}

/**
 * 章节内容条目
 *
 * 详情页是一列单行卡片：标题靠左、描述靠右。
 * 描述要短（一行放得下），长了会挤压标题。
 */
export interface ContentItem {
  /** 稳定的 id，用于 DOM 标识与路由 */
  id: string;
  title: string;
  description: string;
  /**
   * 可视化组件的键。有值时这一行可以点进去看交互演示，
   * 键对应 main.ts 里的可视化注册表。
   */
  visual?: string;
}

/**
 * 各章节的内容列表。
 *
 * 没有登记的章节 = 详情页还没做（卡片上显示「敬请期待」）。
 * 注意这与 `Chapter.ready` 是两回事：ready 决定卡片能不能点，
 * 这里决定点进去有什么。两者要一起维护 —— 所以章节做完时，
 * 在 CHAPTER_CONTENTS 里加条目、同时给该章节写上 ready: true。
 */
export const CHAPTER_CONTENTS: Readonly<Record<string, readonly ContentItem[]>> = {
  'mathematical-analysis': [
    {
      id: 'riemann-integral',
      title: '定积分与黎曼和',
      description: '用矩形分割逼近曲边梯形的面积',
      visual: 'riemann',
    },
    {
      id: 'integrability',
      title: '函数可积的定义',
      description: '达布判据，以及两种让判据失效的函数',
      visual: 'integrability',
    },
  ],
};