import {ref} from 'vue';

export function readPrivacyMode() {
  try { return JSON.parse(localStorage.getItem('gallery-lens.preferences'))?.privacyMode === true; }
  catch { return false; }
}

export const privacyMode = ref(readPrivacyMode());
