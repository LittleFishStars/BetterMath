/**
 * 背景符号表
 *
 * 分三档：结构符号（∑ ∫ ∂ 之类，字形舒展）、字母（希腊/英文变量，视觉轻）、
 * 关系符（≈ ≠ ∞ 之类，笔画细小）。抽的时候按权重打散，让画面既有大字形
 * 撑开留白，也有小符号填缝，看起来才像「散落的数学」而不是一张表格。
 *
 * 只放单字符：多字符的公式在逐帧渲染下会糊成一团，识别度反而比不上单个符号。
 */
export interface SymbolGroup {
  /** 该组在抽取时占的权重 */
  weight: number;
  /** 字号相对基准的倍数区间 [最小, 最大] */
  scale: readonly [number, number];
  /** 基础不透明度区间 */
  alpha: readonly [number, number];
  glyphs: readonly string[];
}

export const SYMBOL_GROUPS: readonly SymbolGroup[] = [
  {
    // 大型结构符：∑ ∏ ∫ 这些，做背景里的「大件」，撑出层次
    weight: 3,
    scale: [1.35, 2.6],
    alpha: [0.07, 0.15],
    glyphs: ['∑', '∏', '∫', '∬', '∮', '∂', '∇', '√', '∞', '≈', '⊕', '⊗', '⊂', '⊃', '∪', '∩', '∅', '∀', '∃', '¬'],
  },
  {
    // 中号字母：希腊字母与数学常用拉丁变量
    weight: 4,
    scale: [0.95, 1.7],
    alpha: [0.07, 0.16],
    glyphs: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω'],
  },
  {
    // 小符号：关系符与运算符，密集的小点，负责颗粒感
    weight: 3,
    scale: [0.55, 1.05],
    alpha: [0.08, 0.18],
    glyphs: ['+', '−', '×', '÷', '±', '∓', '≠', '≤', '≥', '≡', '≅', '∼', '∈', '∉', '⊆', '⊇', '→', '←', '↔', '⇒', '⇔', '⊥', '∥', '%', '°', '′', '∴', '∵'],
  },
  {
    // 记号：集合与函数相关的小符号，作为最细的一层
    weight: 2,
    scale: [0.62, 1.15],
    alpha: [0.06, 0.14],
    glyphs: ['ℝ', 'ℕ', 'ℤ', 'ℚ', 'ℂ', 'ℵ', '∐', '⋃', '⋂', '⌊', '⌋', '⌈', '⌉', '⟨', '⟩', '‖', '⊢', '⊨', '∝'],
  },
];

/** 各组权重之和，构造时预先算好避免每帧重复求和 */
const TOTAL_WEIGHT = SYMBOL_GROUPS.reduce((sum, g) => sum + g.weight, 0);

/** 按权重抽一个组 */
export function pickGroup(rand: number): SymbolGroup {
  let acc = rand * TOTAL_WEIGHT;
  for (const group of SYMBOL_GROUPS) {
    acc -= group.weight;
    if (acc <= 0) return group;
  }
  return SYMBOL_GROUPS[SYMBOL_GROUPS.length - 1]!;
}

/** 在区间里取随机值 */
export function between(range: readonly [number, number], rand: number): number {
  return range[0] + (range[1] - range[0]) * rand;
}
