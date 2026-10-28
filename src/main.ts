import './styles.css';
import { resolveResolution, stats, type Point, type Resolution, type Stats } from './aggregate';
import { Chart, type ChartSeries } from './chart';
import * as db from './db';
import { deviceArt, modelLabel } from './deviceArt';
import { convertHumidity, humidityUnits, type HumidityMode } from './humidity';
import { languageNames, locale, setLanguage, t, translateDocument, type LangSetting } from './i18n';
import {
  InvalidConfig,
  loggerAccess,
  LoggerNotFound,
  readConfigs,
  readLoggers,
  writeConfig,
  type ConnectedLogger,
  type LoggerConfig,
  type StartMode,
} from './logger';
import { parseElitechCsv } from './parser';
import { loadSettings, saveSettings, type Settings } from './settings';
import { nights } from './sun';
import type { Device, ImportRecord, Location, Reading } from './types';
import { loadWeather, providerById, providers, searchPlace } from './weather';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DAY = 86_400_000;
const NIGHTS_MAX_DAYS = 45;

let settings: Settings = loadSettings();
setLanguage(settings.language);
let devices: Device[] = [];
let imports: ImportRecord[] = [];
let latest = new Map<string, Reading | undefined>();
let range = { from: 0, to: 0 };
let renderSeq = 0;
const chart = new Chart($('chart'));

// ---------- helpers ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtNum = (v: number, digits = 1) =>
  v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const toInputDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);
const endOfDay = (ts: number) => new Date(ts).setHours(23, 59, 59, 999);
const fromInputDate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

const seriesColor = (slot: number) => `var(--series-${(slot % 8) + 1})`;
const cssColor = (value: string) => {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : value;
};

function toast(message: string, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = message;
  $('toasts').append(el);
  setTimeout(() => el.remove(), error ? 9000 : 5000);
}

function setStatus(text: string, warn = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

function offsetLabel(min: number) {
  const sign = min < 0 ? '−' : '+';
  const a = Math.abs(min);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// ---------- devices ----------

const current = (): Device | undefined => devices.find((d) => d.serial === settings.selectedDevice);
const deviceTitle = (d: Device) => d.name || t().deviceDefault(d.slot + 1);
const deviceLocation = (d: Device): Location => d.location ?? settings.location;
const deviceProvider = (d: Device) => providerById(d.provider ?? settings.provider);

async function selectDevice(serial: string) {
  settings.selectedDevice = serial;
  saveSettings(settings);
  renderDeviceList();
  renderDeviceHead();
  renderImports();
  updateAttribution();
  await presetRange(30);
}

// ---------- import ----------

/** New devices start out where the currently shown one is; most loggers live close together. */
function newDeviceDefaults() {
  const dev = current();
  return {
    location: dev ? deviceLocation(dev) : settings.location,
    provider: dev ? deviceProvider(dev).id : settings.provider,
  };
}

async function showImported(serial: string) {
  if (serial !== settings.selectedDevice) await selectDevice(serial);
  else await presetRange(30);
}

/** Imports CSV files. Each file goes to the device named by its serial number; `target` is the device the user uploaded for. */
async function importFiles(files: FileList | File[], target?: string) {
  const list = Array.from(files).filter((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
  if (!list.length) {
    toast(t().pickCsvOnly, true);
    return;
  }
  const defaults = newDeviceDefaults();
  let lastSerial: string | undefined;
  const elsewhere: [file: string, serial: string][] = [];
  for (const file of list) {
    try {
      const report = parseElitechCsv(await file.text(), file.name);
      const { record, added } = await db.importReport(report, file.name, defaults);
      toast(t().imported(file.name, record.count, record.count - added));
      if (target && report.serial !== target) elsewhere.push([file.name, report.serial]);
      lastSerial = report.serial;
    } catch (e) {
      toast(`${file.name}: ${(e as Error).message}`, true);
    }
  }
  await reloadMeta();
  if (!lastSerial) return;
  for (const [name, serial] of elsewhere) {
    const owner = devices.find((d) => d.serial === serial);
    if (owner) toast(t().importedOtherDevice(name, deviceTitle(owner)));
  }
  await showImported(lastSerial);
}

function loggerError(e: unknown) {
  if (e instanceof LoggerNotFound) toast(t().loggerNotFound, true);
  else if (e instanceof InvalidConfig) toast(e.message, true);
  else toast(t().loggerFailed(e instanceof Error ? e.message : String(e)), true);
}

/** Reads every connected logger over USB and imports its recording. Returns false if reading failed. */
async function importFromLoggers(): Promise<boolean> {
  const buttons = [$<HTMLButtonElement>('btn-read'), $<HTMLButtonElement>('btn-read-empty')];
  const label = (text: string) =>
    buttons.forEach((b) => ((b.querySelector('span') ?? b).textContent = text));
  buttons.forEach((b) => (b.disabled = true));
  label(t().readingLogger);
  let lastSerial: string | undefined;
  let ok = true;
  try {
    const defaults = newDeviceDefaults();
    for (const report of await readLoggers()) {
      if (!report.rows.length) {
        toast(t().loggerEmpty(report.serial));
        continue;
      }
      const name = `${report.serial}-${report.tripId} (USB)`;
      const { record, added } = await db.importReport(report, name, defaults);
      toast(t().imported(name, record.count, record.count - added));
      lastSerial = report.serial;
    }
  } catch (e) {
    loggerError(e);
    ok = false;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    label(t().readLogger);
  }
  await reloadMeta();
  if (lastSerial) await showImported(lastSerial);
  return ok;
}

// ---------- logger dialog ----------

const loggerDialog = $<HTMLDialogElement>('logger-dialog');
let configuring: ConnectedLogger | undefined;

const INTERVALS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
const DELAYS = [0, 60, 300, 600, 1800, 3600];
const HOUR = 3_600_000;

function durationLabel(secs: number) {
  if (!secs) return t().lgOff;
  const parts = [[Math.floor(secs / 3600), 'h'], [Math.floor(secs / 60) % 60, 'min'], [secs % 60, 's']] as const;
  return parts.filter(([n]) => n).map(([n, unit]) => `${n} ${unit}`).join(' ');
}

/** Offers `values` plus the logger's current value, which may lie outside them. */
function fillSelect(id: string, values: number[], current: number, label: (v: number) => string) {
  const select = $<HTMLSelectElement>(id);
  const all = [...new Set([...values, current])].sort((a, b) => a - b);
  select.replaceChildren(...all.map((v) => new Option(label(v), String(v))));
  select.value = String(current);
}

// datetime-local values are wall-clock times, like the logger's: read and write them as UTC.
const toLocalInput = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const fromLocalInput = (value: string) => Date.parse(value + 'Z');

const field = (id: string) => $<HTMLInputElement>(id);

function syncStartFields() {
  const mode = field('lg-start-mode').value;
  $('lg-start-at-field').hidden = mode !== 'timed';
  $('lg-delay-field').hidden = mode !== 'button';
  field('lg-start-at').required = mode === 'timed';
}

async function openLoggerDialog() {
  const button = $<HTMLButtonElement>('btn-configure');
  button.disabled = true;
  try {
    const loggers = await readConfigs();
    configuring = loggers.find((l) => l.serial === settings.selectedDevice) ?? loggers[0];
  } catch (e) {
    loggerError(e);
    return;
  } finally {
    button.disabled = false;
  }
  const { serial, model, config: c } = configuring;
  const known = devices.find((d) => d.serial === serial);
  $('lg-ident').textContent = [known && deviceTitle(known), modelLabel(model), `${t().serialNo} ${serial}`].filter(Boolean).join(' · ');

  fillSelect('lg-interval', INTERVALS, c.intervalSecs, durationLabel);
  fillSelect('lg-delay', DELAYS, c.startDelaySecs, durationLabel);
  fillSelect('lg-tz', Array.from({ length: 25 }, (_, i) => (i - 12) * 60), c.tzOffsetMin, offsetLabel);
  fillSelect('lg-display', [1, 2], c.displayTime, (v) => ({ 1: '15 s', 2: '30 s' })[v] ?? t().lgDisplayCode(v));
  field('lg-start-mode').value = c.startMode;
  const nextHour = Math.ceil((Date.now() + c.tzOffsetMin * 60_000) / HOUR) * HOUR;
  field('lg-start-at').value = toLocalInput(c.startMode === 'timed' ? c.startAt : nextHour);
  field('lg-trip').value = c.tripId;
  field('lg-desc').value = c.description;
  field('lg-temp-high').value = c.tempHigh?.toString() ?? '';
  field('lg-temp-low').value = c.tempLow?.toString() ?? '';
  field('lg-hum-high').value = String(c.humHigh);
  field('lg-hum-low').value = String(c.humLow);
  field('lg-beeps').value = String(c.alarmBeeps);
  field('lg-unit').value = c.fahrenheit ? 'f' : 'c';
  field('lg-pdf').value = c.pdfChinese ? 'zh' : 'en';
  field('lg-stop-button').checked = c.stopByButton;
  field('lg-pause').checked = c.pause;
  field('lg-cyclic').checked = c.cyclic;
  field('lg-key-tone').checked = c.keyTone;
  syncStartFields();
  loggerDialog.returnValue = '';
  loggerDialog.showModal();
}

function loggerFormConfig(base: LoggerConfig): LoggerConfig {
  const startMode = field('lg-start-mode').value as StartMode;
  const optional = (id: string) => (field(id).value === '' ? null : Number(field(id).value));
  return {
    ...base,
    intervalSecs: Number(field('lg-interval').value),
    startMode,
    startAt: startMode === 'timed' ? fromLocalInput(field('lg-start-at').value) : base.startAt,
    startDelaySecs: startMode === 'button' ? Number(field('lg-delay').value) : 0,
    tzOffsetMin: Number(field('lg-tz').value),
    tripId: field('lg-trip').value,
    description: field('lg-desc').value,
    tempHigh: optional('lg-temp-high'),
    tempLow: optional('lg-temp-low'),
    humHigh: Number(field('lg-hum-high').value),
    humLow: Number(field('lg-hum-low').value),
    alarmBeeps: Number(field('lg-beeps').value),
    displayTime: Number(field('lg-display').value),
    fahrenheit: field('lg-unit').value === 'f',
    pdfChinese: field('lg-pdf').value === 'zh',
    stopByButton: field('lg-stop-button').checked,
    pause: field('lg-pause').checked,
    cyclic: field('lg-cyclic').checked,
    keyTone: field('lg-key-tone').checked,
  };
}

/** Saves the recording first, because the new configuration erases it. */
async function saveLoggerConfig() {
  if (!configuring) return;
  const { serial } = configuring;
  const config = loggerFormConfig(configuring.config);
  if (!(await importFromLoggers())) return;
  try {
    await writeConfig(serial, config);
    toast(t().loggerConfigured(serial));
  } catch (e) {
    loggerError(e);
  }
}

// ---------- range ----------

async function presetRange(days: number | 'all') {
  const dev = current();
  const extent = dev ? await db.dataExtent(dev.serial) : null;
  const last = extent?.last ?? Date.now();
  const to = endOfDay(last);
  const from = days === 'all' ? startOfDay(extent?.first ?? last - 30 * DAY) : startOfDay(last - (days - 1) * DAY);
  setRange(from, to);
}

function setRange(from: number, to: number) {
  if (from > to) [from, to] = [startOfDay(to), endOfDay(from)];
  range = { from, to };
  $<HTMLInputElement>('from').value = toInputDate(from);
  $<HTMLInputElement>('to').value = toInputDate(to);
  void renderAll();
}

async function markPreset() {
  const dev = current();
  const extent = dev ? await db.dataExtent(dev.serial) : null;
  const spanDays = Math.round((range.to - range.from) / DAY);
  const endsAtData = !!extent && toInputDate(range.to) === toInputDate(extent.last);
  const isAll = endsAtData && toInputDate(range.from) === toInputDate(extent!.first);
  document.querySelectorAll<HTMLButtonElement>('#presets button').forEach((b) => {
    const d = b.dataset.days!;
    b.classList.toggle('active', d === 'all' ? isAll : !isAll && endsAtData && spanDays === Number(d));
  });
}

// ---------- rendering ----------

async function reloadMeta() {
  [devices, imports] = await Promise.all([db.listDevices(), db.listImports()]);
  latest = new Map(await Promise.all(devices.map(async (d) => [d.serial, await db.lastReading(d.serial)] as const)));
  if (!current() && devices.length) {
    settings.selectedDevice = devices[0].serial;
    saveSettings(settings);
  }
  const hasData = devices.length > 0;
  $('empty').hidden = hasData;
  $('layout').hidden = !hasData;
  renderDeviceList();
  renderDeviceHead();
  renderImports();
  updateAttribution();
}

function renderDeviceList() {
  $('device-list').innerHTML = devices
    .map((d) => {
      const last = latest.get(d.serial);
      const selected = d.serial === settings.selectedDevice;
      return `<button type="button" class="device-tile${selected ? ' selected' : ''}" role="option" aria-selected="${selected}" data-serial="${esc(d.serial)}" style="--device-color:${seriesColor(d.slot)}">
        ${deviceArt(d.model, last ? { temp: last.temp, hum: last.hum } : null)}
        <span class="device-tile-text">
          <span class="device-tile-title">${esc(deviceTitle(d))}</span>
          <span class="device-tile-sub">${esc(d.serial)}</span>
          <span class="device-tile-sub">${last ? esc(t().lastReading(fmtDateTime(last.ts))) : t().noReadingsYet}</span>
        </span>
      </button>`;
    })
    .join('');
}

function renderDeviceHead() {
  const dev = current();
  if (!dev) return;
  $('device-title').innerHTML = `<span class="swatch" style="background:${seriesColor(dev.slot)}"></span>${esc(deviceTitle(dev))}`;
  $('device-meta').textContent = [
    modelLabel(dev.model),
    `${t().serialNo} ${dev.serial}`,
    `${deviceLocation(dev).name} (${deviceProvider(dev).label})`,
  ].join(' · ');
}

async function renderAll() {
  const dev = current();
  if (!dev) return;
  const seq = ++renderSeq;
  const { from, to } = range;
  const res = resolveResolution(settings.resolution, from, to);
  const mode = settings.humidityMode;
  const location = deviceLocation(dev);
  void markPreset();

  const rows = await db.getReadings(dev.serial, from, to);
  if (seq !== renderSeq) return;
  const deviceSeries: ChartSeries = {
    id: dev.serial,
    name: deviceTitle(dev),
    color: cssColor(seriesColor(dev.slot)),
    reference: false,
    temp: rows.map((r) => ({ ts: r.ts, v: r.temp })),
    hum: rows.map((r) => ({ ts: r.ts, v: convertHumidity(mode, r.temp, r.hum) })),
  };

  const tooManyNights = to - from > NIGHTS_MAX_DAYS * DAY;
  const input = {
    from,
    to,
    res,
    humMode: mode,
    location,
    nights: settings.showNights && !tooManyNights ? nights(from, to, location.lat, location.lon) : null,
  };
  chart.render({ ...input, series: [deviceSeries] });
  renderStats(deviceSeries, null);

  const notes: string[] = [];
  if (!rows.length) notes.push(t().noReadingsInRange);
  if (settings.showNights && tooManyNights) notes.push(t().nightsLimited(NIGHTS_MAX_DAYS));

  if (!settings.showWeather) {
    setStatus(notes.join(' '));
    return;
  }

  setStatus(t().loadingWeather);
  const weather = await loadWeather(deviceProvider(dev), location, from, to, (done, total) => {
    if (seq === renderSeq && total > 1) setStatus(t().loadingWeatherProgress(done, total));
  });
  if (seq !== renderSeq) return;

  const weatherSeries: ChartSeries = {
    id: 'weather',
    name: t().weatherSeries(weather.station ?? location.name),
    color: cssColor('var(--weather)'),
    reference: true,
    temp: weather.points.map((p): Point => ({ ts: p.ts, v: p.temp })),
    hum: weather.points.map((p): Point => ({ ts: p.ts, v: convertHumidity(mode, p.temp, p.hum) })),
  };
  chart.render({ ...input, series: [deviceSeries, weatherSeries] });
  renderStats(deviceSeries, weatherSeries);

  if (weather.errors.length) {
    notes.push(t().weatherIncomplete(weather.errors.length, !weather.points.length));
    console.warn('Weather errors', weather.errors);
  }
  setStatus(notes.join(' '), weather.errors.length > 0);
}

function statBlock(label: string, s: Stats | null, unit: string, digits: number) {
  if (!s) return `<span class="label">${label}</span><span class="value">–</span><span></span><span></span>`;
  return (
    `<span class="label">${label}</span>` +
    `<span class="value">${fmtNum(s.min, digits)}<span class="when">${fmtDateTime(s.minTs)}</span></span>` +
    `<span class="value">${fmtNum(s.mean, digits)}<span class="when">${unit}</span></span>` +
    `<span class="value">${fmtNum(s.max, digits)}<span class="when">${fmtDateTime(s.maxTs)}</span></span>`
  );
}

function renderStats(device: ChartSeries, weather: ChartSeries | null) {
  const m = t();
  const humUnit = humidityUnits[settings.humidityMode];
  const humDigits = settings.humidityMode === 'relative' ? 0 : 1;
  const humLabel = { relative: m.statHumRelative, absolute: m.statHumAbsolute, dewpoint: m.statHumDewpoint }[settings.humidityMode];
  const cards = [device, ...(weather ? [weather] : [])].map((s) => {
    const temp = stats(s.temp);
    const h = stats(s.hum);
    return `<div class="card stat-card">
      <h3><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</h3>
      <div class="stat-grid">
        <span></span><span class="head">${m.statMin}</span><span class="head">${m.statMean}</span><span class="head">${m.statMax}</span>
        ${statBlock(m.statTemp, temp, '°C', 1)}
        ${statBlock(humLabel, h, humUnit, humDigits)}
      </div>
      <div class="stat-foot">${temp ? m.values(temp.n.toLocaleString(locale())) : m.noValues} · ${fmtDate(range.from)} – ${fmtDate(range.to)}</div>
    </div>`;
  });
  $('stats').innerHTML = cards.join('');
}

function renderImports() {
  const el = $('imports');
  const own = imports.filter((i) => i.serial === settings.selectedDevice);
  if (!own.length) {
    el.innerHTML = `<div class="list-empty">${t().nothingImported}</div>`;
    return;
  }
  const offsets = Array.from({ length: 27 }, (_, i) => (i - 12) * 60);
  el.innerHTML = own
    .map((i) => {
      const opts = [...new Set([...offsets, i.fileTzOffsetMin, i.tzOffsetMin])]
        .sort((a, b) => a - b)
        .map(
          (o) =>
            `<option value="${o}" ${o === i.tzOffsetMin ? 'selected' : ''}>${offsetLabel(o)}${o === i.fileTzOffsetMin ? t().fromFile : ''}</option>`,
        )
        .join('');
      return `<div class="list-row" data-id="${i.id}">
        <div class="list-main">
          <div class="list-title" title="${esc(i.fileName)}">${esc(i.fileName)}</div>
          <div class="list-sub">${fmtDateTime(i.first)} – ${fmtDateTime(i.last)} · ${t().values(i.count.toLocaleString(locale()))}${i.interval ? ` · ${t().every(esc(i.interval))}` : ''}</div>
        </div>
        <select data-act="offset" title="${t().timeBaseHint}">${opts}</select>
        <button class="btn small danger" data-act="delete" type="button">${t().remove}</button>
      </div>`;
    })
    .join('');
}

// ---------- settings dialog (app-wide) ----------

const settingsDialog = $<HTMLDialogElement>('settings');

function openSettings() {
  const languageSelect = $<HTMLSelectElement>('language');
  languageSelect.querySelectorAll('option:not([value=auto])').forEach((o) => o.remove());
  for (const [code, name] of Object.entries(languageNames)) languageSelect.add(new Option(name, code));
  languageSelect.value = settings.language;
  void updateCacheInfo();
  settingsDialog.showModal();
}

async function updateCacheInfo() {
  const n = await db.weatherCacheSize();
  $('cache-info').textContent = n ? t().cacheInfo(n) : t().cacheEmpty;
}

function applySettingsDialog() {
  const language = $<HTMLSelectElement>('language').value as LangSetting;
  if (language === settings.language) return;
  settings.language = language;
  setLanguage(language);
  translateDocument();
  saveSettings(settings);
  renderDeviceList();
  renderDeviceHead();
  renderImports();
  updateAttribution();
  void renderAll();
}

// ---------- device dialog ----------

const deviceDialog = $<HTMLDialogElement>('device-dialog');

function openDeviceSettings() {
  const dev = current();
  if (!dev) return;
  const loc = deviceLocation(dev);
  const name = $<HTMLInputElement>('dev-name');
  name.value = dev.name;
  name.placeholder = t().deviceDefault(dev.slot + 1);
  $('dev-ident').textContent = `${modelLabel(dev.model)} · ${t().serialNo} ${dev.serial}`;
  $<HTMLInputElement>('loc-name').value = loc.name;
  $<HTMLInputElement>('loc-lat').value = String(loc.lat);
  $<HTMLInputElement>('loc-lon').value = String(loc.lon);
  $('place-results').innerHTML = '';
  $<HTMLInputElement>('place-query').value = '';
  const providerId = deviceProvider(dev).id;
  $('providers').innerHTML = providers
    .map(
      (p) => `<label><input type="radio" name="provider" value="${p.id}" ${p.id === providerId ? 'checked' : ''} />
        <span>${esc(p.label)}<small>${esc(p.description)}</small></span></label>`,
    )
    .join('');
  deviceDialog.showModal();
}

async function runPlaceSearch() {
  const q = $<HTMLInputElement>('place-query').value.trim();
  if (!q) return;
  const out = $('place-results');
  out.innerHTML = `<span class="muted">${t().searching}</span>`;
  try {
    const results = await searchPlace(q);
    out.innerHTML = results.length
      ? results
          .map(
            (r, i) =>
              `<button type="button" data-i="${i}">${esc(r.name)}<small>${esc(r.detail)} · ${r.lat}, ${r.lon}</small></button>`,
          )
          .join('')
      : `<span class="muted">${t().nothingFound}</span>`;
    out.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        const r = results[Number(b.dataset.i)];
        $<HTMLInputElement>('loc-name').value = r.name;
        $<HTMLInputElement>('loc-lat').value = String(r.lat);
        $<HTMLInputElement>('loc-lon').value = String(r.lon);
        out.innerHTML = '';
      }),
    );
  } catch (e) {
    out.innerHTML = `<span class="muted">${esc(t().searchFailed((e as Error).message))}</span>`;
  }
}

async function applyDeviceDialog() {
  const dev = current();
  if (!dev) return;
  dev.name = $<HTMLInputElement>('dev-name').value.trim();
  const lat = Number($<HTMLInputElement>('loc-lat').value);
  const lon = Number($<HTMLInputElement>('loc-lon').value);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    dev.location = { name: $<HTMLInputElement>('loc-name').value.trim() || `${lat}, ${lon}`, lat, lon };
  } else {
    toast(t().invalidCoords, true);
  }
  const p = deviceDialog.querySelector<HTMLInputElement>('input[name=provider]:checked');
  if (p) dev.provider = p.value;
  await db.saveDevice(dev);
  renderDeviceList();
  renderDeviceHead();
  updateAttribution();
  void renderAll();
}

async function removeCurrentDevice() {
  const dev = current();
  if (!dev || !confirm(t().confirmRemoveDevice(deviceTitle(dev)))) return;
  deviceDialog.close();
  await db.deleteDevice(dev.serial);
  settings.selectedDevice = undefined;
  await reloadMeta();
  if (current()) await presetRange(30);
}

// ---------- wiring ----------

function updateAttribution() {
  const dev = current();
  const p = dev ? deviceProvider(dev) : providerById(settings.provider);
  const a = $<HTMLAnchorElement>('attribution');
  a.textContent = p.attribution;
  a.href = p.attributionUrl;
}

function bindControls() {
  const fileInput = $<HTMLInputElement>('file');
  let uploadTarget: string | undefined;
  const pick = (target?: string) => {
    uploadTarget = target;
    fileInput.click();
  };
  $('btn-import-empty').addEventListener('click', () => pick());
  $('btn-add-device').addEventListener('click', () => pick());
  $('btn-upload').addEventListener('click', () => pick(settings.selectedDevice));
  for (const id of ['btn-read', 'btn-read-empty']) {
    $(id).hidden = !loggerAccess;
    $(id).addEventListener('click', () => void importFromLoggers());
  }
  $('btn-configure').hidden = !loggerAccess;
  $('btn-configure').addEventListener('click', () => void openLoggerDialog());
  $('lg-start-mode').addEventListener('change', syncStartFields);
  // Like ElitechLog: switching on cyclic logging or the alarm switches pause off; it can be turned back on.
  $('lg-cyclic').addEventListener('change', () => field('lg-cyclic').checked && (field('lg-pause').checked = false));
  $('lg-beeps').addEventListener('change', () => field('lg-beeps').value !== '0' && (field('lg-pause').checked = false));
  loggerDialog.addEventListener('close', () => {
    if (loggerDialog.returnValue === 'save') void saveLoggerConfig();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) void importFiles(fileInput.files, uploadTarget);
    fileInput.value = '';
  });

  $('device-list').addEventListener('click', (e) => {
    const serial = (e.target as HTMLElement).closest<HTMLElement>('[data-serial]')?.dataset.serial;
    if (serial && serial !== settings.selectedDevice) void selectDevice(serial);
  });
  $('btn-device-settings').addEventListener('click', openDeviceSettings);
  $('dev-delete').addEventListener('click', removeCurrentDevice);
  deviceDialog.addEventListener('close', () => {
    if (deviceDialog.returnValue === 'save') void applyDeviceDialog();
  });

  $('from').addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (v) setRange(fromInputDate(v), range.to);
  });
  $('to').addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (v) setRange(range.from, endOfDay(fromInputDate(v)));
  });
  document.querySelectorAll<HTMLButtonElement>('#presets button').forEach((b) =>
    b.addEventListener('click', () => presetRange(b.dataset.days === 'all' ? 'all' : Number(b.dataset.days))),
  );

  const persist = () => {
    saveSettings(settings);
    void renderAll();
  };
  const res = $<HTMLSelectElement>('res');
  const hum = $<HTMLSelectElement>('hum');
  const showWeather = $<HTMLInputElement>('show-weather');
  const showNights = $<HTMLInputElement>('show-nights');
  res.value = settings.resolution;
  hum.value = settings.humidityMode;
  showWeather.checked = settings.showWeather;
  showNights.checked = settings.showNights;
  res.addEventListener('change', () => { settings.resolution = res.value as Resolution; persist(); });
  hum.addEventListener('change', () => { settings.humidityMode = hum.value as HumidityMode; persist(); });
  showWeather.addEventListener('change', () => { settings.showWeather = showWeather.checked; persist(); });
  showNights.addEventListener('change', () => { settings.showNights = showNights.checked; persist(); });

  $('imports').addEventListener('change', async (e) => {
    const t = e.target as HTMLSelectElement;
    const id = t.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!id || t.dataset.act !== 'offset') return;
    await db.setImportOffset(id, Number(t.value));
    await reloadMeta();
    void renderAll();
  });
  $('imports').addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.act !== 'delete') return;
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
    const rec = imports.find((i) => i.id === id);
    if (!rec || !confirm(t().confirmRemove(rec.fileName))) return;
    await db.deleteImport(rec.id);
    await reloadMeta();
    void renderAll();
  });

  $('btn-settings').addEventListener('click', openSettings);
  $('place-search').addEventListener('click', runPlaceSearch);
  $('place-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runPlaceSearch();
    }
  });
  $('cache-clear').addEventListener('click', async () => {
    const n = await db.clearWeatherCache();
    toast(t().cacheCleared(n));
    void updateCacheInfo();
  });
  settingsDialog.addEventListener('close', () => {
    if (settingsDialog.returnValue === 'save') applySettingsDialog();
  });

  // Drag & drop anywhere in the window; the serial number in each file decides the device.
  let depth = 0;
  const drop = $('drop');
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    depth++;
    drop.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) drop.hidden = true;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    drop.hidden = true;
    if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files);
  });

  // Inside the desktop app, external links must be handed to the system browser.
  if ('__TAURI_INTERNALS__' in window) {
    document.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="http"]');
      if (!a) return;
      e.preventDefault();
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(a.href);
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void renderAll());
}

async function init() {
  translateDocument();
  bindControls();
  await reloadMeta();
  if (current()) await presetRange(30);
}

void init();
