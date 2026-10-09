// Apply the saved appearance before CSS and Vue load, including standalone pages.
(() => {
  let preference = 'system';
  let palette = 'emerald';
  try {
    const saved = JSON.parse(localStorage.getItem('gallery-lens.preferences'));
    preference = saved?.theme;
    palette = saved?.palette;
  } catch { /* Use the system appearance and default palette. */ }
  if (!['light', 'dark', 'system'].includes(preference)) preference = 'system';
  const backgrounds = {
    emerald: ['#f5f8f7', '#111a18'], red: ['#fff6f7', '#1c1218'],
    orange: ['#fff8f3', '#1e1712'], amber: ['#fffbef', '#1b1810'],
    cyan: ['#f2fafb', '#101b20'], blue: ['#f4f7fd', '#111a2b'],
    purple: ['#f8f5fd', '#1a1425'], gray: ['#f6f7f9', '#15181d'],
    rainbow: ['#f7f8fa', '#171c22'],
  };
  if (!Object.hasOwn(backgrounds, palette)) palette = 'emerald';
  const theme = preference === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgrounds[palette][theme === 'dark' ? 1 : 0]);
})();
