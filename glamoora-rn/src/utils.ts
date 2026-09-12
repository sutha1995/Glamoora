export const pad = (n: number) => String(n).padStart(2, '0');

export function dISO(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function todayISO(): string {
  return dISO(new Date());
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function parseISO(s: string): Date {
  const [a, b, c] = s.split('-').map(Number);
  return new Date(a, b - 1, c);
}
export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function minToTime(m: number): string {
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}
export function addMin(t: string, n: number): string {
  return minToTime(timeToMin(t) + n);
}
export function overlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLo = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function fmtRM(n: number): string {
  return 'RM' + Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 });
}
export function fmtDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtDateLong(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
export function hashNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
let _seq = 0;
export function uid(p = 'id'): string {
  _seq += 1;
  return p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4) + _seq;
}
export function newRef(): string {
  return 'GLM-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
