import { getWeatherCache, putWeatherCache } from './db';
import { baseLang, t } from './i18n';
import type { Location, WeatherPoint } from './types';

export interface MonthData {
  points: WeatherPoint[];
  station?: string;
}

export interface WeatherProvider {
  id: string;
  /** Localized, so read them at render time. */
  readonly label: string;
  readonly description: string;
  readonly attribution: string;
  attributionUrl: string;
  /** Fetch hourly data for [from, to) (UTC epoch ms). */
  fetchRange(loc: Location, from: number, to: number): Promise<MonthData>;
}

const DAY = 86_400_000;
const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return res.json();
}

const brightSky: WeatherProvider = {
  id: 'brightsky',
  get label() { return t().brightSkyLabel; },
  get description() { return t().brightSkyDescription; },
  get attribution() { return t().brightSkyAttribution; },
  attributionUrl: 'https://brightsky.dev/',
  async fetchRange(loc, from, to) {
    const url =
      `https://api.brightsky.dev/weather?lat=${loc.lat}&lon=${loc.lon}&tz=Etc/UTC` +
      `&date=${new Date(from).toISOString()}&last_date=${new Date(to).toISOString()}`;
    const json = await getJson(url);
    const forecastIds = new Set<number>(
      (json.sources ?? []).filter((s: any) => s.observation_type === 'forecast').map((s: any) => s.id),
    );
    const now = Date.now();
    const points: WeatherPoint[] = (json.weather ?? [])
      .filter((w: any) => !forecastIds.has(w.source_id))
      .map((w: any) => ({ ts: Date.parse(w.timestamp), temp: w.temperature ?? null, hum: w.relative_humidity ?? null }))
      .filter((p: WeatherPoint) => p.ts < now && p.ts >= from && p.ts < to);
    const station = (json.sources ?? []).find((s: any) => s.observation_type === 'historical')?.station_name;
    return { points, station };
  },
};

const openMeteo: WeatherProvider = {
  id: 'openmeteo',
  get label() { return t().openMeteoLabel; },
  get description() { return t().openMeteoDescription; },
  attribution: 'Open-Meteo.com (CC BY 4.0)',
  attributionUrl: 'https://open-meteo.com/',
  async fetchRange(loc, from, to) {
    const now = Date.now();
    const end = Math.min(to - 1, now);
    const params =
      `latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,relative_humidity_2m` +
      `&timeformat=unixtime&timezone=GMT&start_date=${isoDay(from)}&end_date=${isoDay(end)}`;
    const toPoints = (json: any): WeatherPoint[] =>
      (json.hourly?.time ?? []).map((t: number, i: number) => ({
        ts: t * 1000,
        temp: json.hourly.temperature_2m[i] ?? null,
        hum: json.hourly.relative_humidity_2m[i] ?? null,
      }));
    let points = toPoints(await getJson(`https://archive-api.open-meteo.com/v1/archive?${params}`));
    // The archive lags a few days behind; fill the most recent days from the forecast model's past runs.
    if (now - end < 10 * DAY) {
      const recent = new Map<number, WeatherPoint>(
        toPoints(await getJson(`https://api.open-meteo.com/v1/forecast?${params}`)).map((p) => [p.ts, p]),
      );
      points = points.map((p) => (p.temp === null && recent.has(p.ts) ? recent.get(p.ts)! : p));
    }
    return { points: points.filter((p) => p.ts < now && p.ts >= from && p.ts < to && p.temp !== null) };
  },
};

export const providers: WeatherProvider[] = [brightSky, openMeteo];
export const providerById = (id: string) => providers.find((p) => p.id === id) ?? brightSky;

/** UTC month starts covering [from, to]. */
function months(from: number, to: number): number[] {
  const out: number[] = [];
  const d = new Date(from);
  let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  while (m <= to) {
    out.push(m);
    const md = new Date(m);
    m = Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 1);
  }
  return out;
}

const nextMonth = (m: number) => {
  const d = new Date(m);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

export interface WeatherResult {
  points: WeatherPoint[];
  station?: string;
  errors: string[];
  fromCache: number;
  fetched: number;
}

const REFRESH_INCOMPLETE_MS = 3 * 3_600_000;

/**
 * Hourly weather for [from, to], served from the IndexedDB cache in monthly chunks.
 * Months that lie more than a week in the past are cached forever; recent ones are refreshed every few hours.
 */
export async function loadWeather(
  provider: WeatherProvider,
  loc: Location,
  from: number,
  to: number,
  onProgress?: (done: number, total: number) => void,
): Promise<WeatherResult> {
  const locKey = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
  const now = Date.now();
  const list = months(from, Math.min(to, now));
  const result: WeatherResult = { points: [], errors: [], fromCache: 0, fetched: 0 };
  let done = 0;

  const loadMonth = async (m: number) => {
    const key = `${provider.id}|${locKey}|${new Date(m).toISOString().slice(0, 7)}`;
    const cached = await getWeatherCache(key);
    let entry = cached;
    if (!cached || (!cached.complete && now - cached.fetchedAt > REFRESH_INCOMPLETE_MS)) {
      try {
        const data = await provider.fetchRange(loc, m, nextMonth(m));
        entry = { key, fetchedAt: now, complete: nextMonth(m) < now - 7 * DAY, station: data.station, points: data.points };
        await putWeatherCache(entry);
        result.fetched++;
      } catch (e) {
        result.errors.push(`${new Date(m).toISOString().slice(0, 7)}: ${(e as Error).message}`);
      }
    } else {
      result.fromCache++;
    }
    onProgress?.(++done, list.length);
    return entry;
  };

  // A few requests in parallel keeps long ranges quick without hammering free services.
  const entries: (Awaited<ReturnType<typeof loadMonth>>)[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        entries[i] = await loadMonth(list[i]);
      }
    }),
  );

  for (const e of entries) {
    if (!e) continue;
    result.station ??= e.station;
    for (const p of e.points) if (p.ts >= from && p.ts <= to) result.points.push(p);
  }
  result.points.sort((a, b) => a.ts - b.ts);
  return result;
}

export interface GeoResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export async function searchPlace(query: string): Promise<GeoResult[]> {
  const json = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${baseLang()}&format=json`,
  );
  return (json.results ?? []).map((r: any) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: Math.round(r.latitude * 1000) / 1000,
    lon: Math.round(r.longitude * 1000) / 1000,
  }));
}
