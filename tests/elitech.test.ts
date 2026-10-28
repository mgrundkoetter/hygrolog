import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyConfig,
  configure,
  decodeConfig,
  decodeLimit,
  encodeLimit,
  InvalidConfig,
  packet,
  readReport,
  temperature,
  validateConfig,
  type LoggerConfig,
  type Transport,
} from '../src/elitech';

const fixture = (name: string) => readFileSync(new URL(`../tools/hidspy/fixtures/${name}`, import.meta.url), 'utf8');

/** Packets of a capture in hid.log format, in order. */
function packets(log: string) {
  return log
    .split('\n')
    .filter((l) => !l.startsWith('#') && / (OUT|IN ) /.test(l))
    .map((l) => ({ out: l.includes(' OUT '), bytes: Uint8Array.from(l.split(' : ')[1].trim().split(' '), (h) => parseInt(h, 16)) }));
}

/** Answers requests with the responses ElitechLog got in a capture. */
function replay(log: string): Transport {
  const answers = new Map<string, Uint8Array>();
  let pending: string | undefined;
  for (const p of packets(log)) {
    if (p.out) pending = p.bytes.join();
    else if (pending) {
      answers.set(pending, p.bytes);
      pending = undefined;
    }
  }
  return {
    exchange: async (req) => {
      const answer = answers.get(req.join());
      if (!answer) throw new Error(`not in capture: ${req}`);
      return answer;
    },
  };
}

/** The parameter blocks ElitechLog wrote, W0 … W26 as named in the fixture. */
function capturedWrites(): Uint8Array[] {
  const blocks: Uint8Array[] = [];
  for (const { out, bytes } of packets(fixture('config-writes.log'))) {
    if (!out || bytes[4] !== 0x04) continue;
    const addr = (bytes[7] << 8) | bytes[8];
    if (addr === 0) blocks.push(new Uint8Array(352));
    blocks[blocks.length - 1].set(bytes.subarray(11, 61), addr);
  }
  return blocks;
}

const timeAt = (b: Uint8Array, at: number) => Date.UTC(2000 + b[at], b[at + 1] - 1, b[at + 3], b[at + 4], b[at + 5], b[at + 6]);

describe('reading a recording', () => {
  it('decodes the captured recording', async () => {
    const r = await readReport(replay(fixture('read-recording.log')));
    expect(r).toMatchObject({ serial: 'EFX266100504', model: 'RC-4HPro', tripId: '0000001', interval: '10s', tzOffsetMin: 60 });
    expect(r.rows).toHaveLength(43);
    expect(r.rows[0].local).toBe(Date.UTC(2026, 9, 28, 21, 10, 24));
    expect(r.rows[42].local - r.rows[0].local).toBe(42 * 10_000);
  });

  it('matches the CSV of the same recording', async () => {
    const r = await readReport(replay(fixture('read-recording.log')));
    const csv = readFileSync(new URL('../samples/EFX266100504-0000001.csv', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('2026/'))
      .map((l) => l.split(','));
    expect(csv).toHaveLength(42);
    csv.forEach(([, time, temp, hum], i) => {
      expect(new Date(r.rows[i].local).toISOString().slice(11, 19)).toBe(time);
      expect([r.rows[i].temp, r.rows[i].hum]).toEqual([Number(temp), Number(hum)]);
    });
  });

  it('decodes temperatures', () => {
    expect(temperature(0x00dc)).toBe(22);
    expect(temperature(0x80c8)).toBe(-20);
    expect(temperature(0xff38)).toBe(-20);
    expect(temperature(0xffff)).toBeNull();
  });
});

describe('configuration', () => {
  it('decodes each captured setting', () => {
    const w = capturedWrites().map(decodeConfig);
    expect(w).toHaveLength(27);
    expect([w[0].intervalSecs, w[1].intervalSecs]).toEqual([900, 10]);
    expect([w[2].startMode, w[3].startMode, w[4].startMode]).toEqual(['immediate', 'timed', 'button']);
    expect(w[3].startAt).toBe(Date.UTC(2026, 9, 28, 22, 21, 46));
    expect(w[4].startDelaySecs).toBe(90);
    expect([w[4].stopByButton, w[5].stopByButton]).toEqual([true, false]);
    expect([w[6].cyclic, w[6].pause, w[7].pause]).toEqual([true, false, true]);
    expect([w[9].keyTone, w[10].keyTone]).toEqual([false, true]);
    expect(w[11].alarmBeeps).toBe(3);
    expect([w[11].displayTime, w[12].displayTime]).toEqual([1, 2]);
    expect([w[13].fahrenheit, w[14].pdfChinese]).toEqual([true, true]);
    expect([w[17].tzOffsetMin, w[18].tzOffsetMin]).toEqual([300, -180]);
    expect(w[19].tempHigh).toBe(61.5);
    expect(w[22]).toMatchObject({ tripId: '0000042', tempHigh: 60, tempLow: -20, humHigh: 90, humLow: 10 });
    expect([w[23].description, w[26].description]).toEqual(['Hygrolog Test', '']);
  });

  // Apart from the bytes ElitechLog fills from its dialog state, encoding reproduces its writes.
  it('encodes like ElitechLog', () => {
    capturedWrites().forEach((block, i) => {
      const c = decodeConfig(block);
      const ours = block.slice();
      applyConfig(c, ours, timeAt(block, 40));
      block.forEach((byte, at) => {
        const dialogState = [35, 37, 39].includes(at);
        const dialogTime = at >= 48 && at < 55 && c.startMode !== 'timed';
        if (!dialogState && !dialogTime) expect(ours[at], `W${i}, byte ${at}`).toBe(byte);
      });
    });
  });

  it('rejects invalid settings', () => {
    const ok = decodeConfig(capturedWrites()[26]);
    const bad: Partial<LoggerConfig>[] = [{ intervalSecs: 15 }, { tzOffsetMin: 330 }, { description: 'Kühlschrank' }, { tempLow: 70 }];
    for (const change of bad) expect(() => validateConfig({ ...ok, ...change })).toThrow(InvalidConfig);
    expect(() => validateConfig({ ...ok, cyclic: true })).not.toThrow();
  });

  it('switches limits off', () => {
    expect(encodeLimit(null, 0x8fa0)).toBe(0x8fa0);
    expect(decodeLimit(0x8fa0)).toBeNull();
    expect(decodeLimit(encodeLimit(-0.5, 0))).toBe(-0.5);
  });

  it('writes and commits like ElitechLog', async () => {
    const block = capturedWrites()[26];
    const sent: Uint8Array[] = [];
    // A logger holding `block`: answers reads, acknowledges writes and the commit.
    const logger: Transport = {
      exchange: async (req) => {
        sent.push(req);
        const addr = (req[7] << 8) | req[8];
        const len = (req[9] << 8) | req[10];
        if (req[4] !== 0x03) return packet(req[4], req[5], addr, 1, Uint8Array.of(1));
        const data = block.subarray(Math.min(addr, 352), Math.min(addr + len, 352));
        return packet(0x03, 0, addr, data.length, data);
      },
    };
    const c = decodeConfig(block);
    const utc = timeAt(block, 40) - 60 * 60_000;

    expect(await configure(logger, 'EFX000000000', c, utc)).toBe(false);
    sent.length = 0;
    expect(await configure(logger, 'EFX266100504', c, utc)).toBe(true);

    const writes = sent.filter((p) => p[4] !== 0x03);
    expect(writes.map((p) => (p[7] << 8) | p[8])).toEqual([0, 50, 100, 150, 200, 250, 300, 0]);
    expect([...writes[7]]).toEqual([0x33, 0xcc, 0x00, 0x0d, 0xc0, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0xd1]);
    // Same configuration, so the block goes back unchanged apart from the timed-start slot and status.
    const written = new Uint8Array(350);
    for (const p of writes.slice(0, 7)) written.set(p.subarray(11, 61), (p[7] << 8) | p[8]);
    written.forEach((byte, at) => {
      if ((at < 48 || at >= 55) && at !== 37) expect(byte, `byte ${at}`).toBe(block[at]);
    });
  });
});
