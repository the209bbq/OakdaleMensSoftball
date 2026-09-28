/** Oakdale is on Pacific time. League weeks flip Thursday at 12:01 AM. */
export const LEAGUE_TIME_ZONE = 'America/Los_Angeles';

export interface LeagueClock {
  dateKey: string;
  weekday: string;
  hour: number;
  minute: number;
}

function pacificParts(now: Date): LeagueClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    dateKey: `${read('year')}-${read('month')}-${read('day')}`,
    weekday: read('weekday'),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  };
}

/**
 * Calendar date used to pick the current schedule week.
 * Thursday 12:00 AM Pacific still belongs to the previous day so Wednesday
 * night games stay up until 12:01 AM.
 */
export function leagueDateKey(now: Date = new Date()): string {
  const clock = pacificParts(now);
  if (clock.weekday === 'Thu' && clock.hour === 0 && clock.minute === 0) {
    return leagueDateKey(new Date(now.getTime() - 60_000));
  }
  return clock.dateKey;
}
