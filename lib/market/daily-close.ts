/** 마지막으로 지난 서울 15:30. 장중·주말에는 직전 평일 종가까지만 허용한다. */
export function closeDate(now = new Date()): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (seoul.getUTCHours() * 60 + seoul.getUTCMinutes() < 15 * 60 + 30) seoul.setUTCDate(seoul.getUTCDate() - 1);
  while (seoul.getUTCDay() === 0 || seoul.getUTCDay() === 6) seoul.setUTCDate(seoul.getUTCDate() - 1);
  return seoul.toISOString().slice(0, 10);
}

export function nextCloseDelay(now = new Date()): number {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), 6, 30));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}
