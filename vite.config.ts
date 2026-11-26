import { defineConfig } from 'vite';

/**
 * 开发服务器固定绑到 127.0.0.1：宿主的 Preview 面板按 HTTP URL 打开页面，
 * 绑 0.0.0.0 时 URL 里的地址不一定可达。
 */
export default defineConfig({
  server: { host: '127.0.0.1', port: 5178 },
  build: { target: 'es2022' },
});
