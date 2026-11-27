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
import { CATEGORIES, type Chapter } from './data';
import { figureOf } from './figures';

/** 卡片倾斜的最大角度（度）。再大就夸张了，文字会被拉得不好读 */
const MAX_TILT = 7;

/** 渲染一个章节卡片的 DOM */
function createCard(chapter: Chapter): HTMLElement {
  const figure = figureOf(chapter.figure);

  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.chapter = chapter.id;
  // 目前还没有章节内页，卡片本身先做成可聚焦的容器而非链接，
  // 用 tabindex 让它能进键盘序，避免只有鼠标用户能感知悬停效果
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `${chapter.title}：${chapter.description}`);

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
  `;

  return card;
}

/** 渲染一个分类分区（标题 + 卡片网格） */
function createSection(categoryId: string, name: string, latin: string, chapters: Chapter[]): HTMLElement {
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
  for (const chapter of chapters) grid.append(createCard(chapter));

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
export function renderChapters(body: HTMLElement, nav: HTMLElement): void {
  body.replaceChildren();
  nav.replaceChildren();

  for (const category of CATEGORIES) {
    body.append(createSection(category.id, category.name, category.latin, category.chapters));

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
