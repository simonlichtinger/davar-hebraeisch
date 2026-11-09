/** Render only explicitly annotated raised vowels; source text is never HTML. */
const REDUCED_DISPLAY = { 'ə': 'e', 'ă': 'a', 'ĕ': 'ä', 'ŏ': 'å' };
const escape = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderTransliteration(item) {
  const text = typeof item?.transliteration === 'string' ? item.transliteration : '';
  const characters = [...text];
  const raised = new Set(Array.isArray(item?.transliterationSuperscript)
    ? item.transliterationSuperscript.filter(index => Number.isInteger(index) && index >= 0 && index < characters.length)
    : []);
  let result = '';
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    if (raised.has(index) && /^[aeäåáəăĕŏ]$/u.test(character)) {
      let vowel = REDUCED_DISPLAY[character] ?? character;
      // Keep an accent attached to the vowel, even in decomposed Unicode.
      while (/^\p{M}$/u.test(characters[index + 1] ?? '')) vowel += characters[++index];
      result += `<sup class="reduced-vowel">${escape(vowel)}</sup>`;
    } else result += escape(character);
  }
  return result;
}
