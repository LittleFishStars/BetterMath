/**
 * 章节数据
 *
 * 十三个章节，分「代数 / 分析 / 其他」三大类。
 * 每个章节只写题目、一句话描述和代表图形的名字 —— 图形本体是
 * 内联 SVG（见 figures.ts），不在这里塞巨型 path 字符串。
 *
 * 描述都控制在一句话（20 字上下）：网格里卡片不大，写长了会挤成三行，
 * 反而没有「简述」的呼吸感。
 */

/** 大分类 */
export type ChapterCategory = 'algebra' | 'analysis' | 'other';

export interface Chapter {
  /** 稳定的 id，用于路由与 DOM 标识 */
  id: string;
  /** 章节名 */
  title: string;
  /** 一句话描述 */
  description: string;
  /** 代表图形的键，见 figures.ts */
  figure: string;
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
        title: '近世代数',
        description: '群、环、域与它们的运算是怎么来的',
        figure: 'group',
      },
      {
        id: 'operator-algebra',
        title: '算子代数',
        description: '巴拿赫空间上的代数与谱',
        figure: 'spectrum',
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
    id: 'other',
    name: '其他',
    latin: 'Others',
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
