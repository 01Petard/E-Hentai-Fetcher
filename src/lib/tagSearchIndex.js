// Yield between batches so a large translation database does not block painting or typing.
export async function buildTagSearchIndex(translations, {plainText, isCurrent = () => true, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0))}) {
  const index = [];
  await yieldControl();
  let batchStarted = performance.now();
  let count = 0;
  for (const key in translations) {
    if (!Object.hasOwn(translations, key)) continue;
    if (!isCurrent()) return null;
    const name = plainText(translations[key]);
    index.push({key, name, keyLower: key.toLowerCase(), nameLower: name.toLowerCase()});
    if (++count % 200 === 0 || performance.now() - batchStarted >= 8) {
      await yieldControl();
      batchStarted = performance.now();
    }
  }
  return isCurrent() ? index : null;
}
