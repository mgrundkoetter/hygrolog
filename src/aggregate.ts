export type Resolution = 'auto' | 'raw' | 'hour' | 'day';
export type ConcreteResolution = Exclude<Resolution, 'auto'>;

export interface Point {
  ts: number;
  v: number | null;
}

export interface Bucket {
  ts: number;
  mean: number;
  min: number;
  max: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function resolveResolution(r: Resolution, from: number, to: number): ConcreteResolution {
  if (r !== 'auto') return r;
  const span = to - from;
  if (span <= 10 * DAY) return 'raw';
  if (span <= 45 * DAY) return 'hour';
  return 'day';
}

/** Start of the bucket containing ts, in the viewer's local time (so days break at local midnight). */
function bucketStart(ts: number, res: 'hour' | 'day'): number {
  const d = new Date(ts);
  if (res === 'hour') d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function aggregate(points: Point[], res: 'hour' | 'day'): Bucket[] {
  const out: Bucket[] = [];
  let key = NaN;
  let sum = 0, n = 0, min = Infinity, max = -Infinity;
  const flush = () => {
    if (n > 0) out.push({ ts: key + (res === 'hour' ? HOUR : DAY) / 2, mean: sum / n, min, max });
  };
  for (const p of points) {
    if (p.v === null) continue;
    const k = bucketStart(p.ts, res);
    if (k !== key) {
      flush();
      key = k; sum = 0; n = 0; min = Infinity; max = -Infinity;
    }
    sum += p.v; n++;
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  flush();
  return out;
}

/** Inserts null points where the series has gaps so lines break instead of bridging missing data. */
export function breakGaps<T extends { ts: number }>(points: T[], make: (ts: number) => T, minGap = 30 * 60_000): T[] {
  if (points.length < 3) return points;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(points.length, 500); i++) diffs.push(points[i].ts - points[i - 1].ts);
  diffs.sort((a, b) => a - b);
  const threshold = Math.max(minGap, diffs[Math.floor(diffs.length / 2)] * 3);
  const out: T[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].ts - points[i - 1].ts > threshold) out.push(make(points[i - 1].ts + 1));
    out.push(points[i]);
  }
  return out;
}

export interface Stats {
  min: number;
  max: number;
  mean: number;
  minTs: number;
  maxTs: number;
  n: number;
}

export function stats(points: Point[]): Stats | null {
  let n = 0, sum = 0, min = Infinity, max = -Infinity, minTs = 0, maxTs = 0;
  for (const p of points) {
    if (p.v === null) continue;
    n++; sum += p.v;
    if (p.v < min) { min = p.v; minTs = p.ts; }
    if (p.v > max) { max = p.v; maxTs = p.ts; }
  }
  return n ? { min, max, mean: sum / n, minTs, maxTs, n } : null;
}
