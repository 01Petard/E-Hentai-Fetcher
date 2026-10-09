// Apply the saved appearance before CSS and Vue load, including standalone pages.
(() => {
  let preference = 'system';
  try { preference = JSON.parse(localStorage.getItem('gallery-lens.preferences'))?.theme; } catch { /* Use the system appearance. */ }
  if (!['light', 'dark', 'system'].includes(preference)) preference = 'system';
  const theme = preference === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151b18' : '#f5f5f1');
})();
