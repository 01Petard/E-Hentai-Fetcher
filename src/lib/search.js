const flags = ['f_sh', 'f_sto', 'f_sfl', 'f_sfu', 'f_sft'];

function encodeSearch(value) {
  return encodeURIComponent(value).replace(/%20/g, '+').replace(/%3A/gi, ':');
}

export function buildSearchUrl(term, options) {
  if (!term.trim()) throw new Error('请输入搜索内容');
  const params = [`f_search=${encodeSearch(term)}`];
  if (options.advanced) {
    const min = options.f_spf.trim();
    const max = options.f_spt.trim();
    for (const value of [min, max]) {
      if (value && (!/^\d{1,4}$/.test(value) || Number(value) < 1)) {
        throw new Error('页数须为 1 至 9999 的整数');
      }
    }
    if (min && max) {
      const low = Number(min);
      const high = Number(max);
      if (high - low < 20 || low / high > 0.8) {
        throw new Error('页数范围需相差至少 20，且最小值不超过最大值的 80%');
      }
    }
    for (const key of flags.slice(0, 2)) if (options[key]) params.push(`${key}=on`);
    if (min) params.push(`f_spf=${Number(min)}`);
    if (max) params.push(`f_spt=${Number(max)}`);
    if (['2', '3', '4', '5'].includes(options.f_srdd)) params.push(`f_srdd=${options.f_srdd}`);
    for (const key of flags.slice(2)) if (options[key]) params.push(`${key}=on`);
    params.push('advsearch=1');
  }
  return `https://e-hentai.org/?${params.join('&')}`;
}
