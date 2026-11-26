/**
 * 首页入口
 *
 * 只做两件事：挂上背景符号场，并在容器移除/页面卸载时收干净。
 * 视觉全部交给 CSS（src/styles/），这里不生成任何结构。
 */
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/home.css';

import { SymbolField } from './field/SymbolField';

function bootstrap(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#symbol-field');
  if (!canvas) return;

  const field = new SymbolField({ canvas });
  field.start();

  // 页面卸载时停掉 rAF 与监听，避免与 bfcache 里的旧页面一起燃烧
  window.addEventListener('pagehide', () => field.destroy(), { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
