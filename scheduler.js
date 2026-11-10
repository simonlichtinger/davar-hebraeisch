const MINUTE = 60 * 1000;
const DIRECTIONS = ['he-de', 'de-he'];

const numeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};
const count = (value) => Math.max(0, Math.floor(numeric(value)));

export function cardKey(type, id, direction) {
  return `${type}:${id}:${direction}`;
}

/** Due dates follow local calendar days; short error retries retain their minute. */
export function calendarReviewDate(now, days) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function reviewDue(record) {
  const due = numeric(record?.due, 0);
  return numeric(record?.interval) >= 1 ? calendarReviewDate(due, 0) : due;
}

/**
 * A deliberately transparent repetition schedule, tracked per direction.
 * Correct: next calendar day, then 3 days, then about 2.2 times the interval.
 * Incorrect: restart the sequence and make the card due again in one minute.
 * Intervals are capped at one year. The input record is never modified.
 */
export function scheduleReview(previous, correct, now = Date.now()) {
  const timestamp = numeric(now, Date.now());
  const old = previous && typeof previous === 'object' ? previous : {};
  const streak = correct ? count(old.streak) + 1 : 0;
  let interval = 0;
  if (correct) {
    interval = streak === 1 ? 1 : streak === 2 ? 3
      : Math.min(365, Math.max(7, Math.round(numeric(old.interval, 3) * 2.2)));
  }
  return {
    due: correct ? calendarReviewDate(timestamp, interval) : timestamp + MINUTE,
    interval,
    streak,
    lapses: count(old.lapses) + (correct ? 0 : 1),
    reviews: count(old.reviews) + 1,
    lastReviewed: timestamp,
  };
}

function reviewed(record) {
  if (!record || typeof record !== 'object') return false;
  return count(record.reviews) > 0
    || (typeof record.lastReviewed === 'number' && Number.isFinite(record.lastReviewed))
    || (typeof record.due === 'number' && Number.isFinite(record.due));
}

function eligibleEntries(entries, maxLesson) {
  const ids = new Set();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry || entry.id === undefined || entry.id === null || entry.id === '') return false;
    const lesson = numeric(entry.lesson, NaN);
    if (!Number.isFinite(lesson) || lesson < 0 || lesson > maxLesson) return false;
    const id = String(entry.id);
    if (ids.has(id)) return false;
    ids.add(id);
    return true;
  });
}

function allCards(vocabulary, sentences, maxLesson, directions) {
  const result = [];
  for (const [type, entries] of [['word', vocabulary], ['sentence', sentences]]) {
    for (const entry of eligibleEntries(entries, maxLesson)) {
      for (const direction of directions) {
        result.push({
          key: cardKey(type, entry.id, direction),
          type,
          id: entry.id,
          direction,
          lesson: numeric(entry.lesson),
        });
      }
    }
  }
  return result;
}

/** Draw approximately three words for each sentence, alternating directions. */
function interleave(cards, limit, directions, startIndex = 0, previousDirection = null) {
  const queues = { word: {}, sentence: {} };
  for (const type of ['word', 'sentence']) {
    for (const direction of directions) queues[type][direction] = [];
  }
  for (const card of cards) queues[card.type][card.direction].push(card);
  const output = [];
  let lastDirection = previousDirection;
  while (output.length < limit) {
    const preferredType = (startIndex + output.length + 1) % 4 === 0 ? 'sentence' : 'word';
    const types = [preferredType, preferredType === 'word' ? 'sentence' : 'word'];
    const preferredDirection = directions.length === 1 ? directions[0]
      : lastDirection === 'he-de' ? 'de-he' : 'he-de';
    const directionOrder = [preferredDirection, ...directions.filter((value) => value !== preferredDirection)];
    let next;
    for (const type of types) {
      for (const direction of directionOrder) {
        if (queues[type][direction].length) {
          next = queues[type][direction].shift();
          break;
        }
      }
      if (next) break;
    }
    if (!next) break;
    output.push(next);
    lastDirection = next.direction;
  }
  return output;
}

/**
 * Returns only due and new cards up to the current lesson. Due cards always
 * precede new cards in mixed mode. 'new' and 'review' select only that pool.
 * newLimit counts cards (each translation direction is one).
 * Infinity removes the new-card cap while retaining the total session limit.
 * New cards start with the earliest eligible lesson; ties are randomized.
 */
export function buildSession({
  vocabulary = [], sentences = [], progress = {}, maxLesson = Infinity,
  newLimit = 10, limit = 20, direction = 'mixed', includeSentences = true,
  now = Date.now(), random = Math.random, mode = 'mixed',
} = {}) {
  const timestamp = numeric(now, Date.now());
  const sessionLimit = count(limit);
  const newCardLimit = newLimit === Infinity ? Infinity : count(newLimit);
  if (sessionLimit === 0) return [];
  const directions = DIRECTIONS.includes(direction) ? [direction] : DIRECTIONS;
  const records = progress && typeof progress === 'object' ? progress : {};
  const cards = allCards(vocabulary, includeSentences ? sentences : [], numeric(maxLesson, Infinity), directions);
  const due = [];
  const fresh = [];
  for (const card of cards) {
    const record = records[card.key];
    const isNew = !reviewed(record);
    const ranked = { ...card, isNew, tie: numeric(random(), 0.5) };
    if (isNew) fresh.push(ranked);
    else if (reviewDue(record) <= timestamp) {
      due.push({ ...ranked, due: reviewDue(record) });
    }
  }
  due.sort((a, b) => a.due - b.due || a.tie - b.tie);
  fresh.sort((a, b) => a.lesson - b.lesson || a.tie - b.tie);
  const dueCards = mode === 'new' ? [] : interleave(due, sessionLimit, directions);
  const newCards = mode === 'review' ? [] : interleave(
    fresh, Math.min(newCardLimit, sessionLimit - dueCards.length), directions,
    dueCards.length, dueCards.at(-1)?.direction,
  );
  return [...dueCards, ...newCards].map(({ key, type, id, direction: cardDirection, isNew }) => ({
    key, type, id, direction: cardDirection, isNew,
  }));
}

/** Statistics cover only currently unlocked lessons and both directions. */
export function summarize({
  vocabulary = [], sentences = [], progress = {}, maxLesson = Infinity,
  now = Date.now(),
} = {}) {
  const timestamp = numeric(now, Date.now());
  const lessonLimit = numeric(maxLesson, Infinity);
  const words = eligibleEntries(vocabulary, lessonLimit);
  const records = progress && typeof progress === 'object' ? progress : {};
  const cards = allCards(words, sentences, lessonLimit, DIRECTIONS);
  let seenWords = 0;
  let learnedWords = 0;
  for (const word of words) {
    const wordRecords = DIRECTIONS.map((direction) => records[cardKey('word', word.id, direction)]);
    if (wordRecords.some(reviewed)) seenWords += 1;
    if (wordRecords.every((record) => reviewed(record) && numeric(record.interval) >= 7)) learnedWords += 1;
  }
  let dueCards = 0;
  let newCards = 0;
  let reviewedCards = 0;
  for (const card of cards) {
    const record = records[card.key];
    if (!reviewed(record)) newCards += 1;
    else {
      reviewedCards += 1;
      if (reviewDue(record) <= timestamp) dueCards += 1;
    }
  }
  return { eligibleWords: words.length, seenWords, learnedWords, dueCards, newCards, reviewedCards };
}

/** Keep Hebrew vowel marks while disregarding sentence punctuation and spacing. */
export function normalizeText(text) {
  return String(text ?? '').normalize('NFC').replace(/\p{P}/gu, '').replace(/\s+/gu, ' ').trim();
}
