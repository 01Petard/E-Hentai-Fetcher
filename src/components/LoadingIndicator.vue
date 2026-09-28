<script setup>
import {computed} from 'vue';
import {normalizeLoadingStyle} from '../lib/loadingStyle.js';

const props = defineProps({variant: {type: String, default: 'spinner'}, dark: {type: Boolean, default: false}});
const mode = computed(() => normalizeLoadingStyle(props.variant));
</script>

<template>
  <div class="loading-indicator" :class="[`loading-indicator--${mode}`, {'loading-indicator--dark': dark}]" aria-hidden="true">
    <span v-if="mode === 'spinner'" class="spinner"></span>
    <template v-else-if="mode === 'skeleton'">
      <span class="loading-skeleton-cover"></span>
      <span class="loading-skeleton-lines"><span></span><span></span><span></span></span>
    </template>
    <span v-else-if="mode === 'progress'" class="loading-progress-track"><span></span></span>
    <span v-else class="loading-dots"><span></span><span></span><span></span></span>
  </div>
</template>
