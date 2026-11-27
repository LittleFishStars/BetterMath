/**
 * 章节页渲染与交互
 *
 * 三件事：
 *   1. 把 CATEGORIES 渲染成分组网格（每类一个分区，内含卡片）
 *   2. header 里的分类锚点，点击滚动到对应分区
 *   3. 卡片的 3D 倾斜、反光跟随与「浮出」效果
 *
 * 卡片交互用指针事件 + CSS 变量驱动，而不是逐帧改 style：
 * 每次 pointermove 只写几个 CSS 变量（--tilt-x / --tilt-y / --glare-x / --glare-y），
 * 所有视觉效果由 CSS 的 transform 与 background 表达式消费。
 * 这样滚动、缩放都不用重新计算，而且合成层交给浏览器，帧率稳。
 */
import { CATEGORIES, type Chapter, type ContentItem } from './data';
import { figureOf } from './figures';

/** 卡片倾斜的最大角度（度）。再大就夸张了，文字会被拉得不好读 */
const MAX_TILT = 7;

/** 渲染一个章节卡片的 DOM */
function createCard(chapter: Chapter, onOpen: (id: string) => void): HTMLElement {
  const figure = figureOf(chapter.figure);

  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.chapter = chapter.id;

  // 还没做出详情页的章节，左下角挂一个「敬请期待」标签。
  // 语义上这类卡片**不是**可点链接 —— 声明成 role="link" 会让屏幕阅读器
  // 报「链接」，读屏用户点了却什么也不发生。所以 role 跟着 ready 走。
  const ready = chapter.ready === true;
  if (!ready) card.classList.add('is-soon');

  // tabindex 保留：键盘用户也要能聚焦、能感受到悬停与倾斜效果
  card.tabIndex = 0;
  card.setAttribute('role', ready ? 'link' : 'article');
  card.setAttribute(
    'aria-label',
    ready
      ? `${chapter.title}：${chapter.description}`
      : `${chapter.title}：${chapter.description}（敬请期待）`,
  );

  // 已实现的章节整张卡都可点。用回车/空格也能进，
  // 所以 role 是 link 时要补 keydown —— role 只改语义，不改行为。
  if (ready) {
    card.addEventListener('click', () => onOpen(chapter.id));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen(chapter.id);
      }
    });
  }

  card.innerHTML = `
    <div class="card__glare" aria-hidden="true"></div>
    <div class="card__edge" aria-hidden="true"></div>
    <div class="card__content">
      <div class="card__text">
        <h3 class="card__title">${chapter.title}</h3>
        <p class="card__desc">${chapter.description}</p>
      </div>
      <div class="card__figure" aria-hidden="true">
        <svg viewBox="0 0 120 120" role="img">
          <title>${figure.label}</title>
          ${figure.body}
        </svg>
      </div>
    </div>
    ${ready ? '' : '<span class="card__badge" aria-hidden="true">敬请期待</span>'}
  `;

  return card;
}

/** 渲染一个分类分区（标题 + 卡片网格） */
function createSection(
  categoryId: string,
  name: string,
  latin: string,
  chapters: Chapter[],
  onOpen: (id: string) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'chapter-group';
  section.id = `group-${categoryId}`;
  section.dataset.category = categoryId;

  const head = document.createElement('header');
  head.className = 'chapter-group__head';
  head.innerHTML = `
    <h2 class="chapter-group__title">${name}</h2>
    <span class="chapter-group__latin" aria-hidden="true">${latin}</span>
    <span class="chapter-group__count">${chapters.length} 个章节</span>
    <span class="chapter-group__rule" aria-hidden="true"></span>
  `;

  const grid = document.createElement('div');
  grid.className = 'chapter-grid';
  for (const chapter of chapters) grid.append(createCard(chapter, onOpen));

  section.append(head, grid);
  return section;
}

/**
 * 给卡片装上 3D 倾斜与反光。
 *
 * 关键点：用 pointermove 而不是 mousemove —— 触控笔与触屏的 pointer
 * 也能触发；同时只在 (hover: hover) 的设备上绑定，避免手机上
 * 手指划过时卡片乱晃。
 */
function bindCardMotion(card: HTMLElement): void {
  let raf = 0;
  let pending: { x: number; y: number } | null = null;

  const apply = (): void => {
    raf = 0;
    if (!pending) return;
    const { x, y } = pending;
    pending = null;

    // 归一化到 [-1, 1]，中心为 0
    const nx = x * 2 - 1;
    const ny = y * 2 - 1;

    // 倾斜方向与鼠标位置**相反**：鼠标在右上时，卡片右上角要「压下去」，
    // 视觉上才是往鼠标那侧倒，而不是翘起来
    card.style.setProperty('--tilt-x', `${(-ny * MAX_TILT).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(nx * MAX_TILT).toFixed(2)}deg`);

    // 反光跟着鼠标走
    card.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
  };

  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pending = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    // 一帧只写一次样式，pointermove 在高刷屏上可能一帧来好几次
    if (!raf) raf = requestAnimationFrame(apply);
  });

  const reset = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    pending = null;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--glare-x', '50%');
    card.style.setProperty('--glare-y', '0%');
  };

  card.addEventListener('pointerleave', reset);
  card.addEventListener('blur', reset);
  // 缩小到最小后回到原位，避免卡片停在倾斜状态
  reset();
}

/** 渲染整页章节内容 */
export function renderChapters(
  body: HTMLElement,
  nav: HTMLElement,
  onOpen: (chapterId: string) => void,
): void {
  body.replaceChildren();
  nav.replaceChildren();

  for (const category of CATEGORIES) {
    body.append(
      createSection(category.id, category.name, category.latin, category.chapters, onOpen),
    );

    // header 里的分类锚点
    const link = document.createElement('a');
    link.className = 'chapter-head__link';
    link.href = `#group-${category.id}`;
    link.textContent = category.name;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document
        .getElementById(`group-${category.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.append(link);
  }

  // 卡片动效：只在真正支持悬停的设备上绑，触屏上不绑
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const card of body.querySelectorAll<HTMLElement>('.card')) {
      bindCardMotion(card);
    }
  }
}

/**
 * 只绑定「反光跟随鼠标」，不做 3D 倾斜。
 *
 * 内容行是单行的列表项：倾斜会让左右两端一高一低，标题和描述跟着歪，
 * 一行字歪着读很别扭。所以这里只保留光晕，去掉 transform。
 */
function bindGlareOnly(el: HTMLElement): void {
  let raf = 0;
  let pending: { x: number; y: number } | null = null;

  const apply = (): void => {
    raf = 0;
    if (!pending) return;
    const { x, y } = pending;
    pending = null;
    el.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
  };

  el.addEventListener('pointermove', (event) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pending = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    if (!raf) raf = requestAnimationFrame(apply);
  });

  const reset = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    pending = null;
    el.style.setProperty('--glare-x', '50%');
    el.style.setProperty('--glare-y', '0%');
  };

  el.addEventListener('pointerleave', reset);
  el.addEventListener('blur', reset);
  reset();
}

/** 渲染一行内容卡片 */
function createContentRow(item: ContentItem): HTMLElement {
  const row = document.createElement('article');
  row.className = 'row';
  row.dataset.content = item.id;
  // 内容条目暂时没有内页，先做成可聚焦的静态块而不是链接
  row.tabIndex = 0;
  row.setAttribute('aria-label', `${item.title}：${item.description}`);

  row.innerHTML = `
    <div class="row__glare" aria-hidden="true"></div>
    <div class="row__edge" aria-hidden="true"></div>
    <div class="row__inner">
      <h3 class="row__title">${item.title}</h3>
      <span class="row__desc">${item.description}</span>
    </div>
  `;

  return row;
}

/**
 * 渲染某个章节的内容页。
 *
 * 结构：返回链接 + 章节标题 + 内容列表。
 * 标题用的是章节自己的名字与描述，所以这里不需要额外传参。
 */
export function renderChapterDetail(
  container: HTMLElement,
  chapter: Chapter,
  items: readonly ContentItem[],
  onBack: () => void,
): void {
  container.replaceChildren();

  const head = document.createElement('div');
  head.className = 'detail__head';

  const back = document.createElement('a');
  back.className = 'detail__back';
  back.href = '/chapters';
  back.textContent = '全部章节';
  back.addEventListener('click', (event) => {
    event.preventDefault();
    onBack();
  });

  const title = document.createElement('h1');
  title.className = 'detail__title';
  title.textContent = chapter.title;

  const desc = document.createElement('p');
  desc.className = 'detail__desc';
  desc.textContent = chapter.description;

  head.append(back, title, desc);

  const list = document.createElement('div');
  list.className = 'row-list';
  for (const item of items) list.append(createContentRow(item));

  // 一条内容都没有时说清楚，别留个空页面
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'row-list__empty';
    empty.textContent = '这一章的内容还在整理中。';
    list.append(empty);
  }

  container.append(head, list);

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const row of list.querySelectorAll<HTMLElement>('.row')) {
      bindGlareOnly(row);
    }
  }
}

/**
 * 滚动时给 header 加一层「已滚动」状态，让玻璃更实一些。
 * 顶部时玻璃更透（能看到背后的符号），滚下去后要能压住内容。
 */
export function bindHeadScroll(head: HTMLElement): void {
  let ticking = false;
  const update = (): void => {
    ticking = false;
    head.classList.toggle('is-scrolled', window.scrollY > 8);
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}
