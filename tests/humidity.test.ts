import { describe, expect, it } from 'vitest';
import { absoluteHumidity, dewPoint } from '../src/humidity';
import { aggregate, breakGaps } from '../src/aggregate';

describe('humidity', () => {
  it('matches reference values', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.3, 1);
    expect(absoluteHumidity(20, 50)).toBeCloseTo(8.6, 1);
    expect(absoluteHumidity(12, 90)).toBeCloseTo(9.6, 1);
  });
});

describe('aggregate', () => {
  it('buckets by hour with min/max', () => {
    const t0 = new Date(2026, 6, 27, 10, 0).getTime();
    const pts = [0, 20, 40, 60].map((m, i) => ({ ts: t0 + m * 60_000, v: [1, 3, 2, 10][i] }));
    const b = aggregate(pts, 'hour');
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ mean: 2, min: 1, max: 3 });
    expect(b[1]).toMatchObject({ mean: 10 });
  });

  it('breaks lines at gaps', () => {
    const pts = [0, 5, 10, 15, 200].map((m) => ({ ts: m * 60_000, v: 1 as number | null }));
    const out = breakGaps(pts, (ts) => ({ ts, v: null }));
    expect(out.filter((p) => p.v === null)).toHaveLength(1);
  });
});
