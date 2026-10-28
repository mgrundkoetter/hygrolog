// USB-HID protocol of Elitech RC "Pro" loggers: reading recordings and the configuration.
// Documented in tools/hidspy/PROTOCOL.md; the transports (desktop bridge, WebHID) live in usb.ts.

import { t } from './i18n';
import type { ParsedReport, ParsedRow } from './parser';

export const VENDOR_ID = 0x246c;
export const PRODUCT_ID = 0x9001;
/** The only model seen with this VID/PID; matches the CSV's "Device Code". */
export const MODEL = 'RC-4HPro';

const CMD_READ_POINTS = 0x01;
const CMD_READ_PARAMS = 0x03;
const CMD_WRITE_PARAMS = 0x04;
const CMD_READ_STATS = 0x05;
const CMD_COMMIT = 0xc0;

const PARAMS_LEN = 352;
const PARAMS_CHUNK = 50;
const STATS_CHUNK = 48;
const POINTS_PER_READ = 12;

/** Sends one request packet and returns the raw response. */
export interface Transport {
  exchange(request: Uint8Array): Promise<Uint8Array>;
}

export class LoggerNotFound extends Error {}
export class ProtocolError extends Error {}
export class InvalidConfig extends Error {}

// ---------- packets ----------

const checksum = (bytes: Uint8Array) => bytes.reduce((sum, b) => (sum + b) & 0xff, 0);

/** For a read, `len` is how much to read and `payload` is empty; for a write, `len` is the payload length. */
export function packet(cmd: number, ext: number, addr: number, len: number, payload: Uint8Array = new Uint8Array()) {
  const p = new Uint8Array(12 + payload.length);
  p.set([0x33, 0xcc, 0x00, 12 + payload.length, cmd, ext, 0x00, addr >> 8, addr & 0xff, len >> 8, len & 0xff]);
  p.set(payload, 11);
  p[p.length - 1] = checksum(p.subarray(0, -1));
  return p;
}

/** Sends a packet and returns the payload of the matching response. */
async function send(transport: Transport, req: Uint8Array): Promise<Uint8Array> {
  const resp = await transport.exchange(req);
  const bad = (what: string) =>
    new ProtocolError(`${what} (cmd ${req[4].toString(16).padStart(2, '0')}, address ${be16(req, 7)})`);
  if (resp.length < 12 || resp[0] !== 0x33 || resp[1] !== 0xcc) throw bad('malformed response');
  const end = resp[3];
  if (end < 12 || end > resp.length || checksum(resp.subarray(0, end - 1)) !== resp[end - 1]) {
    throw bad('bad length or checksum');
  }
  if ([4, 5, 7, 8].some((i) => resp[i] !== req[i])) throw bad('device rejected the request');
  return resp.slice(11, end - 1);
}

const read = (transport: Transport, cmd: number, addr: number, len: number) =>
  send(transport, packet(cmd, 0, addr, len));

// ---------- values ----------

const be16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];

function put16(b: Uint8Array, at: number, v: number) {
  b[at] = v >> 8;
  b[at + 1] = v & 0xff;
}

const ascii = (b: Uint8Array) => {
  const end = b.indexOf(0);
  return String.fromCharCode(...b.subarray(0, end < 0 ? b.length : end)).trim();
};

function putAscii(b: Uint8Array, [from, to]: readonly [number, number], text: string) {
  b.fill(0, from, to);
  for (let i = 0; i < text.length; i++) b[from + i] = text.charCodeAt(i);
}

/**
 * Temperature in tenths of a degree. Alarm limits store the sign in bit 15; measurements are assumed
 * to do the same, but a two's-complement value is recognized too: its magnitude bits would be far
 * outside the sensor range.
 */
export function temperature(v: number): number | null {
  if (v === 0xffff) return null;
  const m = v & 0x7fff;
  const tenths = !(v & 0x8000) ? m : m <= 1000 ? -m : v - 0x10000;
  return tenths / 10;
}

const humidity = (v: number) => (v === 0xffff ? null : v / 10);

/** Logger time stamp (year − 2000, month, weekday, day, hour, minute, second) as wall-clock epoch ms. */
function timestamp(b: Uint8Array, at: number): number | null {
  const [y, mo, , d, h, mi, s] = b.subarray(at, at + 7);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(2000 + y, mo - 1, d, h, mi, s);
}

/** Wall-clock epoch ms as a logger time stamp. The weekday counts from Sunday = 1, like ElitechLog. */
function encodeTimestamp(ms: number): number[] {
  const d = new Date(ms);
  return [
    d.getUTCFullYear() - 2000,
    d.getUTCMonth() + 1,
    d.getUTCDay() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  ];
}

/** Same style as the CSV's "Log Interval": "10s", "15m", "1h 30m". */
function durationLabel(secs: number) {
  const parts = [[Math.floor(secs / 3600), 'h'], [Math.floor(secs / 60) % 60, 'm'], [secs % 60, 's']] as const;
  return parts.filter(([n]) => n).map(([n, unit]) => `${n}${unit}`).join(' ') || '0s';
}

// ---------- parameter block ----------

const SERIAL = [2, 14] as const;
const TRIP_ID = [16, 23] as const;
const PDF_LANGUAGE = 29;
const FLAGS_A = 30;
const FLAGS_B = 32;
const FLAGS_C = 33;
const START_STATE = 35;
const TIME_ZONE = 36;
const STATUS = 37;
const DISPLAY = 38;
const START_FLAGS = 39;
const CONFIGURED_AT = 40;
const START_AT = 48;
const START_DELAY = 64;
const POINT_COUNT = 72;
const INTERVAL = 76;
const TEMP_HIGH = 84;
const TEMP_LOW = 86;
const HUM_HIGH = 112;
const HUM_LOW = 114;
const KEY_TONE = 117;
const ALARM_BEEPS = 124;
const DESCRIPTION = [152, 252] as const;

/** Unused limits hold ±400.0. */
const LIMIT_OFF = 0x0fa0;
const SIGN = 0x8000;

export async function readParams(transport: Transport): Promise<Uint8Array> {
  const params = new Uint8Array(PARAMS_LEN);
  let at = 0;
  while (at < PARAMS_LEN) {
    const chunk = await read(transport, CMD_READ_PARAMS, at, PARAMS_CHUNK);
    if (!chunk.length) break;
    params.set(chunk.subarray(0, PARAMS_LEN - at), at);
    at += chunk.length;
  }
  if (at < PARAMS_LEN) throw new ProtocolError(`parameter block has only ${at} bytes`);
  return params;
}

/**
 * Writes the parameter block the way ElitechLog does (offsets 0–349; the last two bytes are never
 * written), then commits it. The commit restarts the logger and erases its recording.
 */
async function writeParams(transport: Transport, params: Uint8Array) {
  for (let addr = 0; addr + PARAMS_CHUNK <= PARAMS_LEN; addr += PARAMS_CHUNK) {
    const ack = await send(transport, packet(CMD_WRITE_PARAMS, 0, addr, PARAMS_CHUNK, params.subarray(addr, addr + PARAMS_CHUNK)));
    if (ack.length !== 1 || ack[0] !== 1) throw new ProtocolError(`write at ${addr} not acknowledged`);
  }
  const ack = await send(transport, packet(CMD_COMMIT, 0x02, 0, 1, Uint8Array.of(0x02)));
  if (ack.length !== 1 || ack[0] !== 1) throw new ProtocolError('commit not acknowledged');
}

export const serialOf = (params: Uint8Array) => ascii(params.subarray(...SERIAL));

/** The time-zone byte holds whole hours modulo 24. */
function tzOffsetMin(params: Uint8Array) {
  const hours = params[TIME_ZONE];
  return (hours > 12 ? hours - 24 : hours) * 60;
}

// ---------- recording ----------

export async function readReport(transport: Transport): Promise<ParsedReport> {
  const params = await readParams(transport);
  const intervalMs = be16(params, INTERVAL) * 10_000;
  const count = be16(params, POINT_COUNT);

  const rows: ParsedRow[] = [];
  if (count > 0) {
    const stats = await read(transport, CMD_READ_STATS, 0, STATS_CHUNK);
    const start = timestamp(stats, 8);
    if (start === null) throw new ProtocolError('invalid start time');
    for (let index = 0; index < count; index += POINTS_PER_READ) {
      const chunk = await read(transport, CMD_READ_POINTS, index, POINTS_PER_READ);
      for (let at = 0; at + 4 <= chunk.length && rows.length < count; at += 4) {
        rows.push({
          local: start + rows.length * intervalMs,
          temp: temperature(be16(chunk, at)),
          hum: humidity(be16(chunk, at + 2)),
        });
      }
    }
  }

  return {
    serial: serialOf(params),
    model: MODEL,
    tripId: ascii(params.subarray(...TRIP_ID)),
    interval: durationLabel(intervalMs / 1000),
    tzOffsetMin: tzOffsetMin(params),
    hasHumidity: true,
    rows,
  };
}

// ---------- live status ----------

export type LoggerState = 'waiting' | 'recording' | 'other';

export interface LoggerStatus {
  serial: string;
  state: LoggerState;
  temp: number | null;
  hum: number | null;
  /** The logger's clock, as wall-clock epoch ms in its time zone. */
  clock: number | null;
  tzOffsetMin: number;
  points: number;
}

/** Status byte: 04 waiting for start, 07 recording; other values haven't been seen. */
const STATES: Record<number, LoggerState> = { 0x04: 'waiting', 0x07: 'recording' };
const LIVE_HUM = 126;
const LIVE_TEMP = 134;
const CLOCK = 136;

export const decodeStatus = (params: Uint8Array): LoggerStatus => ({
  serial: serialOf(params),
  state: STATES[params[STATUS]] ?? 'other',
  temp: temperature(be16(params, LIVE_TEMP)),
  hum: humidity(be16(params, LIVE_HUM)),
  clock: timestamp(params, CLOCK),
  tzOffsetMin: tzOffsetMin(params),
  points: be16(params, POINT_COUNT),
});

// ---------- configuration ----------

export type StartMode = 'button' | 'immediate' | 'timed';

/** By bits 0–1 of the flags byte; 3 hasn't been seen. */
const START_MODES: StartMode[] = ['immediate', 'button', 'timed', 'immediate'];

export interface LoggerConfig {
  intervalSecs: number;
  startMode: StartMode;
  /** Timed start, as wall-clock epoch ms in the logger's time zone. */
  startAt: number;
  startDelaySecs: number;
  stopByButton: boolean;
  pause: boolean;
  cyclic: boolean;
  keyTone: boolean;
  /** Beeps per alarm: 0 (off), 3 or 10. */
  alarmBeeps: number;
  /** 1 = 15 s, 2 = 30 s; other codes are kept as read. */
  displayTime: number;
  fahrenheit: boolean;
  /** Language of the PDF report: English or Chinese. */
  pdfChinese: boolean;
  /** Minutes east of UTC; the logger stores whole hours. */
  tzOffsetMin: number;
  /** null switches the limit off. */
  tempHigh: number | null;
  tempLow: number | null;
  humHigh: number;
  humLow: number;
  tripId: string;
  description: string;
}

const bit = (byte: number, n: number) => (byte & (1 << n)) !== 0;
const setBit = (byte: number, n: number, on: boolean) => (on ? byte | (1 << n) : byte & ~(1 << n));

/** Alarm limit in tenths with the sign in bit 15. */
export function decodeLimit(v: number): number | null {
  const tenths = v & ~SIGN;
  if (tenths === LIMIT_OFF) return null;
  return (v & SIGN ? -tenths : tenths) / 10;
}

export function encodeLimit(v: number | null, off: number): number {
  if (v === null) return off;
  const tenths = Math.round(v * 10);
  return Math.abs(tenths) | (tenths < 0 ? SIGN : 0);
}

export function decodeConfig(params: Uint8Array): LoggerConfig {
  const flags = params[FLAGS_B];
  return {
    intervalSecs: be16(params, INTERVAL) * 10,
    startMode: START_MODES[flags & 0b11],
    startAt: timestamp(params, START_AT) ?? 0,
    startDelaySecs: be16(params, START_DELAY) * 10,
    stopByButton: bit(flags, 3),
    pause: bit(flags, 7),
    cyclic: bit(params[FLAGS_A], 7),
    keyTone: params[KEY_TONE] !== 0,
    alarmBeeps: params[ALARM_BEEPS],
    displayTime: params[DISPLAY] >> 4,
    fahrenheit: bit(params[FLAGS_C], 3),
    pdfChinese: params[PDF_LANGUAGE] === 1,
    tzOffsetMin: tzOffsetMin(params),
    tempHigh: decodeLimit(be16(params, TEMP_HIGH)),
    tempLow: decodeLimit(be16(params, TEMP_LOW)),
    humHigh: be16(params, HUM_HIGH) / 10,
    humLow: be16(params, HUM_LOW) / 10,
    tripId: ascii(params.subarray(...TRIP_ID)),
    description: ascii(params.subarray(...DESCRIPTION)),
  };
}

export function validateConfig(c: LoggerConfig) {
  const fail = (message: string) => {
    throw new InvalidConfig(message);
  };
  const durationOk = (s: number) => Number.isInteger(s / 10) && s / 10 <= 0xffff;
  if (c.intervalSecs < 10 || !durationOk(c.intervalSecs)) fail(t().lgBadInterval);
  if (c.startDelaySecs < 0 || !durationOk(c.startDelaySecs)) fail(t().lgBadInterval);
  if (![0, 3, 10].includes(c.alarmBeeps)) fail(t().lgBadBeeps);
  if (c.tzOffsetMin % 60 !== 0 || Math.abs(c.tzOffsetMin) > 12 * 60) fail(t().lgBadTimeZone);
  const temps = [c.tempHigh, c.tempLow].filter((v) => v !== null);
  if (temps.some((v) => !(v >= -40 && v <= 85))) fail(t().lgBadTempRange);
  if (c.tempHigh !== null && c.tempLow !== null && c.tempLow >= c.tempHigh) fail(t().lgBadTempOrder);
  if (!(c.humLow >= 0 && c.humHigh <= 100 && c.humLow < c.humHigh)) fail(t().lgBadHumidity);
  if (!/^[A-Za-z0-9]{1,7}$/.test(c.tripId)) fail(t().lgBadTripId);
  if (c.description.length > DESCRIPTION[1] - DESCRIPTION[0] || !/^[ -~]*$/.test(c.description)) fail(t().lgBadDescription);
}

/**
 * Writes `c` into a parameter block read from the logger. `now` is the current wall-clock time in the
 * configured time zone; the logger sets its clock from it. Bytes this doesn't know stay as read.
 */
export function applyConfig(c: LoggerConfig, params: Uint8Array, now: number) {
  validateConfig(c);
  let flags = (params[FLAGS_B] & ~0b11) | START_MODES.indexOf(c.startMode);
  flags = setBit(flags, 3, c.stopByButton);
  params[FLAGS_B] = setBit(flags, 7, c.pause);
  params[FLAGS_A] = setBit(params[FLAGS_A], 7, c.cyclic);
  params[FLAGS_C] = setBit(params[FLAGS_C], 3, c.fahrenheit);

  // ElitechLog's values for these two bytes; their meaning is unknown.
  [params[START_STATE], params[START_FLAGS]] = c.startMode === 'button' ? [0x00, 0xc1] : [0x02, 0x00];
  params[STATUS] = 0;
  params[DISPLAY] = (c.displayTime << 4) | 0x08;

  params[PDF_LANGUAGE] = c.pdfChinese ? 1 : 0;
  params[TIME_ZONE] = (((c.tzOffsetMin / 60) % 24) + 24) % 24;
  params.set(encodeTimestamp(now), CONFIGURED_AT);
  params.set(encodeTimestamp(c.startMode === 'timed' ? c.startAt : now), START_AT);
  put16(params, START_DELAY, c.startDelaySecs / 10);
  put16(params, INTERVAL, c.intervalSecs / 10);

  put16(params, TEMP_HIGH, encodeLimit(c.tempHigh, LIMIT_OFF));
  put16(params, TEMP_LOW, encodeLimit(c.tempLow, LIMIT_OFF | SIGN));
  put16(params, HUM_HIGH, Math.round(c.humHigh * 10));
  put16(params, HUM_LOW, Math.round(c.humLow * 10));
  params[KEY_TONE] = c.keyTone ? 1 : 0;
  params[ALARM_BEEPS] = c.alarmBeeps;

  putAscii(params, TRIP_ID, c.tripId);
  putAscii(params, DESCRIPTION, c.description);
}

/** Reconfigures the logger if it is the one with serial number `target`. Returns false for any other. */
export async function configure(transport: Transport, target: string, c: LoggerConfig, nowUtc: number): Promise<boolean> {
  const params = await readParams(transport);
  if (serialOf(params) !== target) return false;
  applyConfig(c, params, nowUtc + c.tzOffsetMin * 60_000);
  await writeParams(transport, params);
  return true;
}
