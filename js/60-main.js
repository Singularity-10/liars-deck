// @ts-nocheck
/**
 * 60-main.js
 * 职责：React 应用入口挂载点
 * 依赖：50-components.js（Game, ErrorBoundary）
 * 对外暴露：无（直接执行副作用）
 */

// ── 挂载根组件 ──────────────────────────────────────────────────────

// C3：主题初始化（localStorage 偏好 → body[data-theme]，默认酒馆）
try {
  const savedTheme = localStorage.getItem('ld_theme');
  document.body.dataset.theme = ['tavern', 'snow', 'desert'].includes(savedTheme) ? savedTheme : 'tavern';
} catch (e) { document.body.dataset.theme = 'tavern'; }

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(
  h(
    ErrorBoundary,
    null,
    h(
      Fragment,
      null,
      h('div', { className: 'wood-bg' }),
      h('div', { className: 'wood-sheen' }),
      h(Game)
    )
  )
);
