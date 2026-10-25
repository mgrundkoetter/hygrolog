import SunCalc from 'suncalc';

export interface Night {
  from: number;
  to: number;
}

export interface SunDay {
  sunrise: Date | null;
  sunset: Date | null;
}

const DAY = 86_400_000;

export function sunTimes(ts: number, lat: number, lon: number): SunDay {
  const noon = new Date(ts);
  noon.setHours(12, 0, 0, 0);
  const t = SunCalc.getTimes(noon, lat, lon);
  const ok = (d: Date) => (Number.isNaN(d.getTime()) ? null : d);
  return { sunrise: ok(t.sunrise), sunset: ok(t.sunset) };
}

/** Night intervals (sunset → next sunrise) overlapping [from, to]. Computed locally, no network needed. */
export function nights(from: number, to: number, lat: number, lon: number): Night[] {
  const out: Night[] = [];
  const start = new Date(from - DAY);
  start.setHours(12, 0, 0, 0);
  for (let d = start.getTime(); d <= to; d += DAY) {
    const today = sunTimes(d, lat, lon);
    const tomorrow = sunTimes(d + DAY, lat, lon);
    if (!today.sunset || !tomorrow.sunrise) continue;
    const n = { from: today.sunset.getTime(), to: tomorrow.sunrise.getTime() };
    if (n.to >= from && n.from <= to) out.push({ from: Math.max(n.from, from), to: Math.min(n.to, to) });
  }
  return out;
}
