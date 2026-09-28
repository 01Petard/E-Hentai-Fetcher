export const loadingStyleOptions = [
  {value: 'spinner', label: '旋转指示器'},
  {value: 'skeleton', label: '骨架屏'},
  {value: 'progress', label: '进度条'},
  {value: 'dots', label: '点加载'},
];

export function normalizeLoadingStyle(value) {
  return loadingStyleOptions.some(option => option.value === value) ? value : 'spinner';
}

export function readLoadingStyle() {
  try { return normalizeLoadingStyle(JSON.parse(localStorage.getItem('gallery-lens.preferences'))?.loadingStyle); }
  catch { return 'spinner'; }
}
