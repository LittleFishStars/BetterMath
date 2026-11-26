/**
 * 不重复的元素抽取器
 *
 * 需求是「背景里尽量不要有重复」，所以这里不是每帧随机抽一个，
 * 而是在铺满一屏时把整个池子洗一遍按顺序发牌（无放回抽样）：
 * 洗牌保证位置与顺序是随机的，按顺序取保证一屏之内绝不重样。
 *
 * 池子抽完了再重洗——这时必然出现重复，但前提是那一轮的条目已经
 * 全部用过一遍，这是「尽量不重复」能做到的极限，而不是疏漏。
 */
export class ItemBag<T> {
  /** 洗好待发的列表，从尾部弹出 */
  private deck: T[] = [];
  /** 池子的原始顺序，重洗时要用 */
  private readonly source: readonly T[];

  /** 只保存引用、不复制不修改：池子是常量，洗牌的副本在 shuffle 里造 */
  constructor(items: readonly T[]) {
    if (items.length === 0) throw new Error('元素池不能为空');
    this.source = items;
  }

  /** 取一个元素；当前这轮发完了会自动重洗 */
  draw(): T {
    if (this.deck.length === 0) this.shuffle();
    return this.deck.pop()!;
  }

  /**
   * Fisher–Yates 洗牌。
   *
   * 从后往前扫，每次与 [0, i] 里随机的某个位置交换 —— 这样每个排列
   * 出现概率相同。反过来（从前往后）会让靠后的元素被换走的概率偏低，
   * 洗出来的顺序有可预测性，背景看起来会「有规律」。
   */
  private shuffle(): void {
    const pool = this.source.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    this.deck = pool;
  }
}
