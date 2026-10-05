<script setup>
defineProps({view: {type: String, default: 'thumbnail'}});
</script>

<template>
  <div role="status">
    <span class="sr-only">正在获取搜索结果…</span>
    <div class="gallery search-skeleton" :class="view" aria-hidden="true">
      <article v-for="item in (view === 'extended' ? 6 : 12)" :key="item" class="gallery-item">
        <template v-if="view === 'minimal'">
          <span class="search-placeholder search-placeholder-chip"></span>
          <span class="search-placeholder search-placeholder-date"></span>
          <span class="search-placeholder search-placeholder-chip"></span>
          <div class="minimal-content"><span class="search-placeholder search-placeholder-title"></span><span class="search-placeholder search-placeholder-line"></span></div>
          <span class="search-placeholder search-placeholder-chip"></span>
        </template>
        <template v-else>
          <span class="item-image search-placeholder"></span>
          <span class="item-title search-placeholder search-placeholder-title"></span>
          <div class="item-main"><span class="search-placeholder search-placeholder-chip"></span></div>
          <div class="item-details"><span class="search-placeholder search-placeholder-date"></span><span class="search-placeholder search-placeholder-chip"></span></div>
          <div v-if="view === 'extended'" class="item-extra"><span class="search-placeholder search-placeholder-line"></span></div>
        </template>
      </article>
    </div>
  </div>
</template>
