import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Device, ImportRecord, Reading, WeatherPoint } from './types';
import type { ParsedReport } from './parser';

export interface WeatherCacheEntry {
  key: string;
  fetchedAt: number;
  /** True once the month lies far enough in the past that the source won't change any more. */
  complete: boolean;
  station?: string;
  points: WeatherPoint[];
}

interface Schema extends DBSchema {
  readings: { key: [string, number]; value: Reading; indexes: { importId: string } };
  imports: { key: string; value: ImportRecord };
  devices: { key: string; value: Device };
  weather: { key: string; value: WeatherCacheEntry };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | undefined;

function db() {
  dbPromise ??= openDB<Schema>('hygrolog', 1, {
    upgrade(d) {
      d.createObjectStore('readings', { keyPath: ['serial', 'ts'] }).createIndex('importId', 'importId');
      d.createObjectStore('imports', { keyPath: 'id' });
      d.createObjectStore('devices', { keyPath: 'serial' });
      d.createObjectStore('weather', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export interface ImportResult {
  record: ImportRecord;
  added: number;
}

export async function importReport(report: ParsedReport, fileName: string): Promise<ImportResult> {
  const d = await db();
  const id = crypto.randomUUID();
  const offsetMs = report.tzOffsetMin * 60_000;
  const first = report.rows[0].local - offsetMs;
  const last = report.rows[report.rows.length - 1].local - offsetMs;

  const tx = d.transaction(['readings', 'imports', 'devices'], 'readwrite');
  const readings = tx.objectStore('readings');
  const range = IDBKeyRange.bound([report.serial, first], [report.serial, last]);
  const before = await readings.count(range);
  for (const r of report.rows) {
    readings.put({ serial: report.serial, ts: r.local - offsetMs, local: r.local, temp: r.temp, hum: r.hum, importId: id });
  }
  const after = await readings.count(range);

  const record: ImportRecord = {
    id,
    fileName,
    serial: report.serial,
    model: report.model,
    tripId: report.tripId,
    importedAt: Date.now(),
    tzOffsetMin: report.tzOffsetMin,
    fileTzOffsetMin: report.tzOffsetMin,
    count: report.rows.length,
    first,
    last,
    interval: report.interval,
  };
  tx.objectStore('imports').put(record);

  const devices = tx.objectStore('devices');
  if (!(await devices.get(report.serial))) {
    const all = await devices.getAll();
    const slot = all.reduce((m, dev) => Math.max(m, dev.slot + 1), 0);
    devices.put({ serial: report.serial, model: report.model, name: `${report.model} ${report.serial.slice(-4)}`, visible: true, slot });
  }
  await tx.done;
  return { record, added: after - before };
}

export async function listImports(): Promise<ImportRecord[]> {
  const all = await (await db()).getAll('imports');
  return all.sort((a, b) => b.first - a.first);
}

export async function deleteImport(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['readings', 'imports', 'devices'], 'readwrite');
  let cursor = await tx.objectStore('readings').index('importId').openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  const rec = await tx.objectStore('imports').get(id);
  await tx.objectStore('imports').delete(id);
  if (rec) {
    const remaining = (await tx.objectStore('imports').getAll()).some((i) => i.serial === rec.serial);
    if (!remaining) await tx.objectStore('devices').delete(rec.serial);
  }
  await tx.done;
}

/** Re-interprets the wall-clock times of one import with a different UTC offset. */
export async function setImportOffset(id: string, tzOffsetMin: number): Promise<void> {
  const d = await db();
  const tx = d.transaction(['readings', 'imports'], 'readwrite');
  const store = tx.objectStore('readings');
  const moved: Reading[] = [];
  let cursor = await store.index('importId').openCursor(id);
  while (cursor) {
    moved.push(cursor.value);
    await cursor.delete();
    cursor = await cursor.continue();
  }
  const offsetMs = tzOffsetMin * 60_000;
  for (const r of moved) store.put({ ...r, ts: r.local - offsetMs });
  const rec = await tx.objectStore('imports').get(id);
  if (rec) {
    const delta = (rec.tzOffsetMin - tzOffsetMin) * 60_000;
    await tx.objectStore('imports').put({ ...rec, tzOffsetMin, first: rec.first + delta, last: rec.last + delta });
  }
  await tx.done;
}

export async function getReadings(serial: string, from: number, to: number): Promise<Reading[]> {
  return (await db()).getAll('readings', IDBKeyRange.bound([serial, from], [serial, to]));
}

export async function dataExtent(): Promise<{ first: number; last: number } | null> {
  const imports = await listImports();
  if (!imports.length) return null;
  return {
    first: Math.min(...imports.map((i) => i.first)),
    last: Math.max(...imports.map((i) => i.last)),
  };
}

export async function listDevices(): Promise<Device[]> {
  return (await (await db()).getAll('devices')).sort((a, b) => a.slot - b.slot);
}

export async function saveDevice(device: Device): Promise<void> {
  await (await db()).put('devices', device);
}

export async function getWeatherCache(key: string) {
  return (await db()).get('weather', key);
}

export async function putWeatherCache(entry: WeatherCacheEntry) {
  await (await db()).put('weather', entry);
}

export async function clearWeatherCache(): Promise<number> {
  const d = await db();
  const n = await d.count('weather');
  await d.clear('weather');
  return n;
}

export async function weatherCacheSize(): Promise<number> {
  return (await db()).count('weather');
}
