<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import UiIcon from './UiIcon.vue';

const props = defineProps({
  id: {type: String, required: true},
  modelValue: {type: [String, Boolean], required: true},
  options: {type: Array, required: true},
});
const emit = defineEmits(['update:modelValue']);
const element = ref(null);
const open = ref(false);
const active = ref(0);
const selected = computed(() => props.options.find(option => option.value === props.modelValue));
let dialog;

watch([open, active], () => {
  if (open.value) element.value?.querySelector('.is-active')?.scrollIntoView({block: 'nearest'});
}, {flush: 'post'});

function close() { open.value = false; }

function toggle() {
  if (!open.value) active.value = Math.max(0, props.options.findIndex(option => option.value === props.modelValue));
  open.value = !open.value;
}

function choose(value) {
  emit('update:modelValue', value);
  close();
  element.value?.querySelector('button')?.focus();
}

function onKeydown(event) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === 'Tab') { close(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Enter' || event.key === ' ') {
    if (open.value) choose(props.options[active.value].value);
    else toggle();
    return;
  }
  if (!open.value) {
    active.value = Math.max(0, props.options.findIndex(option => option.value === props.modelValue));
    open.value = true;
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + props.options.length) % props.options.length;
  }
  if (event.key === 'Home') active.value = 0;
  if (event.key === 'End') active.value = props.options.length - 1;
}

function onOutsideClick(event) {
  if (!element.value?.contains(event.target)) close();
}

onMounted(() => {
  dialog = element.value.closest('dialog');
  dialog?.addEventListener('close', close);
  document.addEventListener('pointerdown', onOutsideClick);
});
onUnmounted(() => {
  dialog?.removeEventListener('close', close);
  document.removeEventListener('pointerdown', onOutsideClick);
});
</script>

<template>
  <div ref="element" class="settings-select" @keydown="onKeydown" @focusout="event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }">
    <button :id="id" class="settings-select-trigger" type="button" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="`${id}-options`" :aria-labelledby="`${id}-label ${id}-value`" :aria-activedescendant="open ? `${id}-option-${active}` : undefined" @click="toggle">
      <span :id="`${id}-value`">{{ selected?.label }}</span><UiIcon class="settings-select-arrow" name="chevron-down" :size="15" />
    </button>
    <div v-if="open" :id="`${id}-options`" class="settings-select-options" role="listbox" :aria-labelledby="`${id}-label`">
      <button v-for="(option, index) in options" :id="`${id}-option-${index}`" :key="String(option.value)" class="settings-select-option" :class="{'is-active': active === index}" type="button" role="option" :aria-selected="modelValue === option.value" tabindex="-1" @pointerenter="active = index" @pointerdown.prevent @click="choose(option.value)">
        <span>{{ option.label }}</span><UiIcon v-if="modelValue === option.value" name="check" :size="15" />
      </button>
    </div>
  </div>
</template>
