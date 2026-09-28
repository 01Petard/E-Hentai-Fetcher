<script setup>
import { computed } from 'vue';
import UiIcon from './UiIcon.vue';
import { inDevelopment, roadmap, roadmapStages, updates } from '../data/developmentLog.js';

const groupedUpdates = computed(() => {
  const months = new Map();
  for (const update of [...updates].sort((a, b) => b.date.localeCompare(a.date))) {
    const [year, month] = update.date.split('-');
    const key = `${year} 年 ${Number(month)} 月`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(update);
  }
  return [...months].map(([label, entries]) => ({ label, entries }));
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand log-brand" href="/" aria-label="Gallery Lens 首页">
        <span class="brand-mark">E<span>·</span></span>
        <span><strong>Gallery Lens</strong><small>在线图库检索</small></span>
      </a>
      <nav class="header-actions" aria-label="页面导航"><a href="/">返回首页</a></nav>
    </header>

    <main class="development-log">
      <div class="log-intro">
        <div><a class="log-back" href="/"><UiIcon name="previous" :size="16" /> 返回首页</a><h1>开发日志</h1><p>查看功能更新、当前开发进度与后续计划</p></div>
        <div class="log-stats" aria-label="功能概况"><span><strong>{{ updates.length }}</strong> 条更新</span><span><strong>{{ inDevelopment.length }}</strong> 开发中</span><span><strong>{{ roadmap.length }}</strong> 计划中</span></div>
      </div>

      <section class="log-section" aria-labelledby="in-development-title">
        <div class="log-section-heading"><span class="section-mark active"></span><div><h2 id="in-development-title">正在开发</h2><p>当前正在实现的功能</p></div></div>
        <div v-if="inDevelopment.length" class="development-grid"><article v-for="item in inDevelopment" :key="item.title" class="development-card"><div class="card-heading"><h3>{{ item.title }}</h3><span class="status-badge" :class="`status-${item.status}`">{{ item.status }}</span></div><p>{{ item.description }}</p><div v-if="item.targetVersion || item.updatedAt" class="card-meta"><span v-if="item.targetVersion">目标版本 {{ item.targetVersion }}</span><time v-if="item.updatedAt" :datetime="item.updatedAt">最近更新 {{ item.updatedAt }}</time></div></article></div>
        <p v-else class="log-empty">目前没有公开的开发中功能。新进展会在这里更新。</p>
      </section>

      <section class="log-section" aria-labelledby="roadmap-title">
        <div class="log-section-heading"><span class="section-mark planned"></span><div><h2 id="roadmap-title">开发计划</h2><p>按准备阶段整理的后续方向，暂无确定上线日期</p></div></div>
        <div class="roadmap-grid"><section v-for="stage in roadmapStages" :key="stage" class="roadmap-stage"><h3>{{ stage }}</h3><div class="roadmap-items"><article v-for="item in roadmap.filter(entry => entry.stage === stage)" :key="item.title" class="roadmap-item"><h4>{{ item.title }}</h4><p>{{ item.description }}</p></article></div></section></div>
      </section>

      <section class="log-section" aria-labelledby="updates-title">
        <div class="log-section-heading"><span class="section-mark released"></span><div><h2 id="updates-title">更新记录</h2><p>已上线的功能更新，按日期倒序排列</p></div></div>
        <div v-if="groupedUpdates.length" class="update-months"><section v-for="month in groupedUpdates" :key="month.label" class="update-month"><h3>{{ month.label }}</h3><ol class="update-list"><li v-for="entry in month.entries" :key="entry.date + entry.version" class="update-entry"><div class="update-date"><time :datetime="entry.date">{{ entry.date.slice(5) }}</time><span class="timeline-dot"></span></div><div class="update-content"><h4 v-if="entry.version">{{ entry.version }}</h4><ul><li v-for="change in entry.changes" :key="change.type + change.content"><span class="change-badge" :class="`change-${change.type}`">{{ change.type }}</span><span>{{ change.content }}</span></li></ul></div></li></ol></section></div>
        <p v-else class="log-empty">暂无更新记录。</p>
      </section>
    </main>

    <footer class="site-footer"><span>E-HENTAI FETCHER <span class="footer-dot">·</span> INTEGRATION TOOL</span><nav class="footer-links" aria-label="页脚导航"><a href="/development-log" aria-current="page">开发日志</a><span aria-hidden="true">·</span><a href="https://www.bugstack.top" target="_blank" rel="noopener noreferrer"><UiIcon name="blog" :size="13" /> 作者主页</a></nav></footer>
  </div>
</template>
