// Parser for the CSV reports Elitech RC-4 / RC-4H(C) / RC-5 "Pro" loggers write to their USB drive.
// The file is a free-form header block followed by a "Date,Time,Temperature[,Humidity]" table.

export interface ParsedRow {
  local: number;
  temp: number | null;
  hum: number | null;
}

export interface ParsedReport {
  serial: string;
  model: string;
  tripId: string;
  interval: string;
  /** Minutes east of UTC, from "Time Base: UTC+01:00". */
  tzOffsetMin: number;
  hasHumidity: boolean;
  rows: ParsedRow[];
}

export class ParseError extends Error {}

function field(text: string, label: string): string | undefined {
  const m = text.match(new RegExp(label + '\\s*:\\s*([^\\r\\n]*)', 'i'));
  return m?.[1].trim();
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(',', '.');
  if (s === '' || !/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Returns wall-clock time encoded as UTC epoch ms, or null if unparseable. */
function parseDateTime(date: string, time: string): number | null {
  const d = date.trim();
  let y: number, mo: number, da: number;
  let m = d.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (m) {
    [y, mo, da] = [+m[1], +m[2], +m[3]];
  } else if ((m = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [da, mo, y] = [+m[1], +m[2], +m[3]];
  } else {
    return null;
  }
  const t = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!t) return null;
  return Date.UTC(y, mo - 1, da, +t[1], +t[2], t[3] ? +t[3] : 0);
}

export function parseElitechCsv(text: string, fileName = ''): ParsedReport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\s*"?date"?\s*[,;\t]\s*"?time"?/i.test(l));
  if (headerIdx < 0) {
    throw new ParseError('Keine Datentabelle gefunden (erwartet: Zeile „Date,Time,Temperature,…“).');
  }

  const head = lines.slice(0, headerIdx).join('\n');
  const delimiter = [',', ';', '\t'].find((c) => lines[headerIdx].includes(c)) ?? ',';
  const cols = lines[headerIdx].split(delimiter).map((c) => c.replace(/"/g, '').trim().toLowerCase());
  const tempIdx = cols.findIndex((c) => c.startsWith('temp'));
  const humIdx = cols.findIndex((c) => c.startsWith('hum'));
  if (tempIdx < 0 && humIdx < 0) throw new ParseError('Weder Temperatur- noch Feuchtespalte gefunden.');

  const fahrenheit = /fahrenheit/i.test(head);

  // "Serial Number" can share a line with "Probe Type", so search anywhere rather than per line.
  const serial =
    head.match(/Serial Number\s*:\s*([A-Za-z0-9-]+)/i)?.[1] ??
    fileName.match(/^([A-Za-z0-9]+)-\d+/)?.[1] ??
    'unbekannt';
  const tb = head.match(/Time Base\s*:\s*UTC\s*([+-])\s*(\d{1,2}):?(\d{2})?/i);
  const tzOffsetMin = tb ? (tb[1] === '-' ? -1 : 1) * (+tb[2] * 60 + (tb[3] ? +tb[3] : 0)) : 0;

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(delimiter);
    const local = parseDateTime(parts[0] ?? '', parts[1] ?? '');
    if (local === null) continue;
    let temp = tempIdx >= 0 ? parseNumber(parts[tempIdx]) : null;
    if (temp !== null && fahrenheit) temp = Math.round(((temp - 32) * 5) / 9 * 10) / 10;
    const hum = humIdx >= 0 ? parseNumber(parts[humIdx]) : null;
    rows.push({ local, temp, hum });
  }
  if (rows.length === 0) throw new ParseError('Die Datei enthält keine Messwerte.');
  rows.sort((a, b) => a.local - b.local);

  return {
    serial,
    model: field(head, 'Device Code') ?? field(head, 'Model') ?? 'Elitech',
    tripId: field(head, 'Trip Id') ?? '',
    interval: field(head, 'Log Interval') ?? '',
    tzOffsetMin,
    hasHumidity: humIdx >= 0,
    rows,
  };
}
