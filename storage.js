export const DEFAULT_SETTINGS = Object.freeze({
  maxLesson: 2,
  newLimit: 12,
  sessionSize: 12,
  direction: 'mixed',
  includeSentences: true,
  showTransliteration: false,
});

const STORAGE_KEY = 'davar.state.v1';
const MAX_DATE = 8_640_000_000_000_000;
const MAX_HISTORY = 100_000;
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);
const DIRECTIONS = new Set(['he-de', 'de-he']);

export function emptyState() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, progress: {}, history: [], onboarded: false };
}

function invalid(message) {
  throw new Error(`Ungültiger Lernstand: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} muss ein Objekt sein.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(`${label} hat ein unerlaubtes Format.`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PROPERTIES.has(key)) invalid(`${label} enthält einen unerlaubten Schlüssel.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) invalid(`${label} enthält eine unerlaubte Eigenschaft.`);
  }
  return value;
}

function number(value, label, minimum, maximum, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum
    || (integer && !Number.isSafeInteger(value))) {
    invalid(`${label} liegt außerhalb des erlaubten Bereichs.`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') invalid(`${label} muss wahr oder falsch sein.`);
  return value;
}

function keyParts(key) {
  if (typeof key !== 'string' || key.length > 256) invalid('Eine Kartenkennung ist ungültig.');
  const match = /^(word|sentence):([^\s:]+):(he-de|de-he)$/u.exec(key);
  if (!match) invalid('Eine Kartenkennung ist ungültig.');
  return { type: match[1], direction: match[3] };
}

function cleanSettings(input) {
  const settings = object(input, 'Die Einstellungen');
  if (!['mixed', 'he-de', 'de-he'].includes(settings.direction)) invalid('Die Übungsrichtung ist ungültig.');
  return {
    maxLesson: number(settings.maxLesson, 'Die letzte Lektion', 2, 49, true),
    newLimit: settings.newLimit === 'unlimited' ? 'unlimited'
      : number(settings.newLimit, 'Die Zahl neuer Karten', 0, 100, true),
    sessionSize: number(settings.sessionSize, 'Die Sitzungsgröße', 5, 50, true),
    direction: settings.direction,
    includeSentences: boolean(settings.includeSentences, 'Die Satzeinstellung'),
    showTransliteration: boolean(settings.showTransliteration, 'Die Umschrifteinstellung'),
  };
}

function cleanRecord(input) {
  const record = object(input, 'Ein Wiederholungsstand');
  return {
    due: number(record.due, 'Das Fälligkeitsdatum', 0, MAX_DATE),
    interval: number(record.interval, 'Der Wiederholungsabstand', 0, 365),
    streak: number(record.streak, 'Die Erfolgsfolge', 0, Number.MAX_SAFE_INTEGER, true),
    lapses: number(record.lapses, 'Die Zahl der Fehler', 0, Number.MAX_SAFE_INTEGER, true),
    reviews: number(record.reviews, 'Die Zahl der Antworten', 0, Number.MAX_SAFE_INTEGER, true),
    lastReviewed: number(record.lastReviewed, 'Das letzte Übungsdatum', 0, MAX_DATE),
  };
}

function cleanHistoryEntry(input) {
  const entry = object(input, 'Ein Verlaufseintrag');
  const parts = keyParts(entry.key);
  if (!['word', 'sentence'].includes(entry.type) || !DIRECTIONS.has(entry.direction)
    || entry.type !== parts.type || entry.direction !== parts.direction) {
    invalid('Ein Verlaufseintrag passt nicht zu seiner Kartenkennung.');
  }
  return {
    key: entry.key,
    at: number(entry.at, 'Ein Übungsdatum', 0, MAX_DATE),
    correct: boolean(entry.correct, 'Das Übungsergebnis'),
    isNew: boolean(entry.isNew, 'Der Kartenstatus'),
    type: entry.type,
    direction: entry.direction,
  };
}

function cleanState(input, validKeys) {
  const state = object(input, 'Der Lernstand');
  if (state.version !== 1) invalid('Diese Version wird nicht unterstützt.');
  if (validKeys !== undefined && !(validKeys instanceof Set)) invalid('Die gültigen Kartenkennungen müssen eine Menge sein.');
  const settings = cleanSettings(state.settings);
  const sourceProgress = object(state.progress, 'Die Wiederholungsstände');
  const progressEntries = [];
  for (const [key, value] of Object.entries(sourceProgress)) {
    keyParts(key);
    const record = cleanRecord(value);
    if (validKeys === undefined || validKeys.has(key)) progressEntries.push([key, record]);
  }
  if (!Array.isArray(state.history) || state.history.length > MAX_HISTORY) {
    invalid(`Der Verlauf muss eine Liste mit höchstens ${MAX_HISTORY} Einträgen sein.`);
  }
  const history = [];
  for (const inputEntry of state.history) {
    const entry = cleanHistoryEntry(inputEntry);
    if (validKeys === undefined || validKeys.has(entry.key)) history.push(entry);
  }
  return {
    version: 1,
    settings,
    progress: Object.fromEntries(progressEntries),
    history,
    onboarded: boolean(state.onboarded, 'Der Einrichtungsstatus'),
  };
}

/** Validate the complete backup before dropping cards unknown to this course. */
export function validateBackup(input, { validKeys } = {}) {
  const backup = object(input, 'Die Sicherung');
  if (backup.app !== 'davar' || backup.version !== 1) {
    throw new Error('Diese Datei ist keine unterstützte Davar-Sicherung.');
  }
  if (typeof backup.exportedAt !== 'string' || backup.exportedAt.length > 64
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(backup.exportedAt)
    || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error('Das Erstellungsdatum der Sicherung ist ungültig.');
  }
  return cleanState(backup.state, validKeys);
}

export function exportBackup(state) {
  return { app: 'davar', version: 1, exportedAt: new Date().toISOString(), state: cleanState(state) };
}

/** Reading a damaged state never overwrites it, so it can still be recovered. */
export function loadState(storage) {
  let raw;
  try {
    const backend = storage === undefined ? globalThis.localStorage : storage;
    if (!backend || typeof backend.getItem !== 'function') throw new Error('Kein lokaler Speicher');
    raw = backend.getItem(STORAGE_KEY);
  } catch {
    return { state: emptyState(), error: 'Der lokale Speicher ist nicht verfügbar. Dein Lernstand konnte nicht geladen werden.' };
  }
  if (raw === null) return { state: emptyState(), error: null };
  try {
    if (typeof raw !== 'string') throw new Error('Ungültiger gespeicherter Text');
    return { state: cleanState(JSON.parse(raw)), error: null };
  } catch {
    return { state: emptyState(), error: 'Der gespeicherte Lernstand ist beschädigt oder nicht kompatibel. Er wurde nicht überschrieben.', recoveryText: typeof raw === 'string' ? raw : null };
  }
}

export function saveState(state, storage) {
  const clean = cleanState(state);
  try {
    const backend = storage === undefined ? globalThis.localStorage : storage;
    if (!backend || typeof backend.setItem !== 'function') throw new Error('Kein lokaler Speicher');
    backend.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) {
      throw new Error('Der Gerätespeicher für diese App ist voll. Dein Lernstand konnte nicht gespeichert werden. Exportiere eine Sicherung.');
    }
    throw new Error('Dein Lernstand konnte nicht gespeichert werden. Prüfe, ob der Browser lokalen Speicher erlaubt, und exportiere eine Sicherung.');
  }
}
