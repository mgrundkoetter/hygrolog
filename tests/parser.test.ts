import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseElitechCsv, ParseError } from '../src/parser';

const sample = readFileSync(new URL('../samples/EFX267100110-0000001.csv', import.meta.url), 'utf8');

describe('parseElitechCsv', () => {
  it('reads the RC-4H Pro report from the device', () => {
    const r = parseElitechCsv(sample, 'EFX267100110-0000001.csv');
    expect(r.serial).toBe('EFX267100110');
    expect(r.model).toBe('RC-4HPro');
    expect(r.tripId).toBe('0000001');
    expect(r.interval).toBe('5m');
    expect(r.tzOffsetMin).toBe(0);
    expect(r.hasHumidity).toBe(true);
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual({ local: Date.UTC(2026, 6, 27, 0, 49, 12), temp: 11.9, hum: 83.8 });
    expect(r.rows[5]).toEqual({ local: Date.UTC(2026, 6, 27, 1, 14, 12), temp: 12.0, hum: 89.5 });
  });

  it('honours non-zero time bases', () => {
    const r = parseElitechCsv(sample.replace('UTC+00:00', 'UTC+01:00'));
    expect(r.tzOffsetMin).toBe(60);
    expect(parseElitechCsv(sample.replace('UTC+00:00', 'UTC-05:30')).tzOffsetMin).toBe(-330);
  });

  it('handles temperature-only loggers, semicolons, decimal commas and Fahrenheit', () => {
    const csv = [
      'Note: All temperatures are in Degree Fahrenheit.',
      'Serial Number: ABC123',
      'Date;Time;Temperature',
      '27.07.2026;10:00;50,0',
      '27.07.2026;10:05;NC',
    ].join('\r\n');
    const r = parseElitechCsv(csv);
    expect(r.serial).toBe('ABC123');
    expect(r.hasHumidity).toBe(false);
    expect(r.rows).toEqual([
      { local: Date.UTC(2026, 6, 27, 10, 0), temp: 10, hum: null },
      { local: Date.UTC(2026, 6, 27, 10, 5), temp: null, hum: null },
    ]);
  });

  it('rejects files without a data table', () => {
    expect(() => parseElitechCsv('hello')).toThrow(ParseError);
  });
});
