export const paletteOptions = [
  {value: 'emerald', label: '翡翠绿', light: '#f5f8f7', dark: '#111a18'},
  {value: 'red', label: '樱桃红', light: '#fff6f7', dark: '#1c1218'},
  {value: 'orange', label: '蜜橘橙', light: '#fff8f3', dark: '#1e1712'},
  {value: 'amber', label: '琥珀黄', light: '#fffbef', dark: '#1b1810'},
  {value: 'cyan', label: '湖水青', light: '#f2fafb', dark: '#101b20'},
  {value: 'blue', label: '晴空蓝', light: '#f4f7fd', dark: '#111a2b'},
  {value: 'purple', label: '鸢尾紫', light: '#f8f5fd', dark: '#1a1425'},
  {value: 'gray', label: '石墨灰', light: '#f6f7f9', dark: '#15181d'},
  {value: 'rainbow', label: '缤纷彩', light: '#f7f8fa', dark: '#171c22'},
];

export function normalizePalette(value) {
  return paletteOptions.some(option => option.value === value) ? value : 'emerald';
}
