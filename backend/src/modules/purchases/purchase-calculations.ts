import { BadRequestException } from '@nestjs/common';

export function dateRange(from?: string, to?: string) {
  const result: Record<string, Date> = {};
  for (const [value, key, suffix] of [
    [from, '$gte', 'T00:00:00-03:00'],
    [to, '$lte', 'T23:59:59.999-03:00'],
  ] as const) {
    if (!value) continue;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(new Date(value).getTime()) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Fecha inválida');
    result[key] = new Date(value + suffix);
  }
  if (result.$gte && result.$lte && result.$gte > result.$lte)
    throw new BadRequestException('Desde no puede ser posterior a Hasta');
  return result;
}

export function purchaseDateTime(value?: string) {
  if (!value) return new Date();
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const result = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T' + time + '-03:00')
    : new Date(value);
  if (!Number.isFinite(result.getTime()) || result > now)
    throw new BadRequestException('La fecha de recepción no puede ser futura');
  return result;
}
