const progressPrefix = 'gallery-lens.immersive-progress:';
const currentSession = new Map();

function progressKey(source) {
  return `${progressPrefix}${new URL(source).pathname}`;
}

export function readImmersiveProgress(source, total, persist) {
  const key = progressKey(source);
  let number = currentSession.get(key);
  if (number === undefined && persist) {
    try { number = Number(localStorage.getItem(key)); } catch { /* Continue from the first page when storage is unavailable. */ }
  }
  return Number.isSafeInteger(number) && number >= 1 && number <= total ? number : 1;
}

export function saveImmersiveProgress(source, number, persist) {
  const key = progressKey(source);
  currentSession.set(key, number);
  if (!persist) return;
  try { localStorage.setItem(key, String(number)); } catch { /* The current tab still remembers progress. */ }
}

export function clearImmersiveProgress() {
  currentSession.clear();
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(progressPrefix)) localStorage.removeItem(key);
    }
  } catch { /* Keep the reset usable when storage is unavailable. */ }
}
