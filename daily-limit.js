/** Persist the explicit string sentinel; Infinity is only used by the scheduler. */
export const DAILY_LIMIT_OPTIONS = Object.freeze([0, 6, 12, 20, 30, 50, 100, 'unlimited']);

const count = (value) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.floor(value)) : 0;

/** Each translation direction counts as a separate new card. */
export function remainingNewCards(limit, completedToday) {
  return limit === 'unlimited' ? Infinity : Math.max(0, count(limit) - count(completedToday));
}

/** Offer only limits that both increase the setting and allow another new card. */
export function higherDailyLimits(limit, completedToday) {
  if (limit === 'unlimited') return [];
  const threshold = Math.max(count(limit), count(completedToday));
  return DAILY_LIMIT_OPTIONS.filter((option) => option === 'unlimited' || option > threshold);
}
