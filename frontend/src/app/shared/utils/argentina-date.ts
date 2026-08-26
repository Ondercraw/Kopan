export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function argentinaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function argentinaRange(from: string, toInclusive: string): { from: string; to: string } {
  return {
    from: new Date(`${from}T00:00:00-03:00`).toISOString(),
    to: new Date(`${shiftDate(toInclusive, 1)}T00:00:00-03:00`).toISOString(),
  };
}

export function argentinaMonthStart(date = argentinaToday()): string {
  return `${date.slice(0, 8)}01`;
}

export function argentinaDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
