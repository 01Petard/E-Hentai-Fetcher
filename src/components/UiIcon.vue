<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'search'"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></template>
    <template v-else-if="name === 'settings'"><path d="M10 2.8h4l.7 2.1 1.7.7 2-.9 2.8 2.8-.9 2 .7 1.7 2.1.8v4l-2.1.7-.7 1.7.9 2-2.8 2.8-2-.9-1.7.7-.7 2.1h-4l-.7-2.1-1.7-.7-2 .9-2.8-2.8.9-2-.7-1.7-2.1-.7v-4l2.1-.8.7-1.7-.9-2 2.8-2.8 2 .9 1.7-.7z" transform="translate(0 -1) scale(.92) translate(1 1)"/><circle cx="12" cy="12" r="2.8"/></template>
    <template v-else-if="name === 'external'"><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/></template>
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></template>
    <template v-else-if="name === 'list'"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".7" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r=".7" fill="currentColor" stroke="none"/></template>
    <template v-else-if="name === 'rows'"><path d="M4 5h16v4H4zM4 15h16v4H4z"/></template>
    <template v-else-if="name === 'first'"><path d="M5 5v14M18 5l-7 7 7 7"/></template>
    <template v-else-if="name === 'previous'"><path d="m15 5-7 7 7 7"/></template>
    <template v-else-if="name === 'next'"><path d="m9 5 7 7-7 7"/></template>
    <template v-else-if="name === 'last'"><path d="M19 5v14M6 5l7 7-7 7"/></template>
    <template v-else-if="name === 'filter'"><path d="M4 7h16M7 12h10M10 17h4"/><circle cx="8" cy="7" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/></template>
    <template v-else-if="name === 'bookmark'"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.5L5 21z"/></template>
    <template v-else-if="name === 'chevron-down'"><path d="m5 9 7 7 7-7"/></template>
    <template v-else-if="name === 'x'"><path d="M5 5 19 19M19 5 5 19"/></template>
    <template v-else-if="name === 'arrow-right'"><path d="M4 12h16m-6-6 6 6-6 6"/></template>
    <template v-else-if="name === 'reset'"><path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/></template>
    <template v-else-if="name === 'image'"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5-5-8 10"/></template>
    <template v-else-if="name === 'info'"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></template>
    <template v-else-if="name === 'tag'"><path d="M3 4h9l9 9-8 8-9-9V4Z"/><circle cx="8" cy="8" r="1.2"/><path d="m13 7 5 5"/></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></template>
    <template v-else-if="name === 'book'"><path d="M12 6c-2.5-1.8-5.5-2-9-1v14c3.5-1 6.5-.8 9 1 2.5-1.8 5.5-2 9-1V5c-3.5-1-6.5-.8-9 1ZM12 6v14"/></template>
    <template v-else-if="name === 'download'"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></template>
    <template v-else-if="name === 'alert'"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></template>
    <template v-else-if="name === 'check'"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></template>
  </svg>
</template>
