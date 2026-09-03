// Format a Date as a local "YYYY-MM-DD" string. Deliberately NOT using
// toISOString(), since that converts to UTC first and can shift the date by
// a day in timezones behind UTC. Ported from the reference web app.
export function toDateStr(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

// "YYYY-MM-DD" -> local Date at midnight (avoids TZ off-by-one).
export function parseDateLocal(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysAgo(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - offset);
  return toDateStr(dt);
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function addMonthsStr(dateStr: string, months: number): string {
  const d = parseDateLocal(dateStr);
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

export function formatDayHeading(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  const today = parseDateLocal(todayStr());
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatShortDate(dateStr: string): string {
  return parseDateLocal(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Relative time for an epoch-ms timestamp — used by history modals (chat,
// quiz, flashcards) to show "5m ago" style previews.
export function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
