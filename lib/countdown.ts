/** Clamp at zero so a timer never briefly displays a negative value at a bell. */
export function secondsUntil(target: string, now: Date): number {
  const difference = new Date(target).getTime() - now.getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.ceil(difference / 1000)) : 0;
}
export function timerText(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const remainder = value % 60;
  return [hours, minutes, remainder].map(n => String(n).padStart(2, '0')).join(':');
}
