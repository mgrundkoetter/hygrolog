import './styles.css';
import { resolveResolution, stats, type Point, type Resolution, type Stats } from './aggregate';
import { Chart, type ChartSeries } from './chart';
import * as db from './db';
import { convertHumidity, humidityUnits, type HumidityMode } from './humidity';
import { languageNames, locale, setLanguage, t, translateDocument, type LangSetting } from './i18n';
import { parseElitechCsv } from './parser';
import { loadSettings, saveSettings, type Settings } from './settings';
import { nights } from './sun';
import type { Device, ImportRecord } from './types';
import { loadWeather, providerById, providers, searchPlace } from './weather';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DAY = 86_400_000;
const NIGHTS_MAX_DAYS = 45;

let settings: Settings = loadSettings();
setLanguage(settings.language);
let devices: Device[] = [];
let imports: ImportRecord[] = [];
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

// ---------- import ----------

async function importFiles(files: FileList | File[]) {
  const list = Array.from(files).filter((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
  if (!list.length) {
    toast(t().pickCsvOnly, true);
    return;
  }
  const hadData = imports.length > 0;
  for (const file of list) {
    try {
      const report = parseElitechCsv(await file.text(), file.name);
      const { record, added } = await db.importReport(report, file.name);
      const dup = record.count - added;
      toast(t().imported(file.name, record.count, dup));
    } catch (e) {
      toast(`${file.name}: ${(e as Error).message}`, true);
    }
  }
  await reloadMeta();
  if (!hadData) await presetRange(30);
  else await renderAll();
}

// ---------- range ----------

async function presetRange(days: number | 'all') {
  const extent = await db.dataExtent();
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
  const extent = await db.dataExtent();
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
  const hasData = imports.length > 0;
  $('empty').hidden = hasData;
  $('workspace').hidden = !hasData;
  renderDevices();
  renderImports();
}

async function renderAll() {
  if (!imports.length) return;
  const seq = ++renderSeq;
  const { from, to } = range;
  const res = resolveResolution(settings.resolution, from, to);
  const mode = settings.humidityMode;
  void markPreset();

  const deviceSeries: ChartSeries[] = [];
  const visible = devices.filter((d) => d.visible);
  const label = (d: Device) => {
    const name = d.name || d.serial;
    return visible.filter((o) => (o.name || o.serial) === name).length > 1 ? `${name} (${d.serial.slice(-4)})` : name;
  };
  for (const dev of visible) {
    const rows = await db.getReadings(dev.serial, from, to);
    deviceSeries.push({
      id: dev.serial,
      name: label(dev),
      color: cssColor(seriesColor(dev.slot)),
      reference: false,
      temp: rows.map((r) => ({ ts: r.ts, v: r.temp })),
      hum: rows.map((r) => ({ ts: r.ts, v: convertHumidity(mode, r.temp, r.hum) })),
    });
  }
  if (seq !== renderSeq) return;

  const tooManyNights = to - from > NIGHTS_MAX_DAYS * DAY;
  const input = {
    from,
    to,
    res,
    humMode: mode,
    location: settings.location,
    nights: settings.showNights && !tooManyNights ? nights(from, to, settings.location.lat, settings.location.lon) : null,
  };
  chart.render({ ...input, series: deviceSeries });
  renderStats(deviceSeries, null);

  const empty = deviceSeries.every((s) => s.temp.length === 0);
  const notes: string[] = [];
  if (empty) notes.push(t().noReadingsInRange);
  if (settings.showNights && tooManyNights) notes.push(t().nightsLimited(NIGHTS_MAX_DAYS));

  if (!settings.showWeather) {
    setStatus(notes.join(' '));
    return;
  }

  const provider = providerById(settings.provider);
  setStatus(t().loadingWeather);
  const weather = await loadWeather(provider, settings.location, from, to, (done, total) => {
    if (seq === renderSeq && total > 1) setStatus(t().loadingWeatherProgress(done, total));
  });
  if (seq !== renderSeq) return;

  const where = weather.station ? weather.station : settings.location.name;
  const weatherSeries: ChartSeries = {
    id: 'weather',
    name: t().weatherSeries(where),
    color: cssColor('var(--weather)'),
    reference: true,
    temp: weather.points.map((p): Point => ({ ts: p.ts, v: p.temp })),
    hum: weather.points.map((p): Point => ({ ts: p.ts, v: convertHumidity(mode, p.temp, p.hum) })),
  };
  const all = [...deviceSeries, weatherSeries];
  chart.render({ ...input, series: all });
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

function renderStats(deviceSeries: ChartSeries[], weather: ChartSeries | null) {
  const m = t();
  const humUnit = humidityUnits[settings.humidityMode];
  const humDigits = settings.humidityMode === 'relative' ? 0 : 1;
  const humLabel = { relative: m.statHumRelative, absolute: m.statHumAbsolute, dewpoint: m.statHumDewpoint }[settings.humidityMode];
  const withData = deviceSeries.filter((s) => s.temp.length || s.hum.length);
  const cards = [...withData, ...(weather ? [weather] : [])].map((s) => {
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

function renderDevices() {
  const el = $('devices');
  if (!devices.length) {
    el.innerHTML = `<div class="list-empty">${t().noDevices}</div>`;
    return;
  }
  el.innerHTML = devices
    .map(
      (d) => `<div class="list-row" data-serial="${esc(d.serial)}">
        <label class="switch" title="${t().showInChart}"><input type="checkbox" data-act="visible" ${d.visible ? 'checked' : ''} /></label>
        <span class="swatch" style="background:${seriesColor(d.slot)}"></span>
        <div class="list-main">
          <input type="text" data-act="name" value="${esc(d.name)}" aria-label="${t().deviceName}" />
          <div class="list-sub">${esc(d.model)} · ${t().serialNo} ${esc(d.serial)}</div>
        </div>
      </div>`,
    )
    .join('');
}

function renderImports() {
  const el = $('imports');
  if (!imports.length) {
    el.innerHTML = `<div class="list-empty">${t().nothingImported}</div>`;
    return;
  }
  const names = new Map(devices.map((d) => [d.serial, d.name || d.serial]));
  const offsets = Array.from({ length: 27 }, (_, i) => (i - 12) * 60);
  el.innerHTML = imports
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
          <div class="list-sub">${esc(names.get(i.serial) ?? i.serial)} · ${fmtDateTime(i.first)} – ${fmtDateTime(i.last)} · ${t().values(i.count.toLocaleString(locale()))}${i.interval ? ` · ${t().every(esc(i.interval))}` : ''}</div>
        </div>
        <select data-act="offset" title="${t().timeBaseHint}">${opts}</select>
        <button class="btn small danger" data-act="delete" type="button">${t().remove}</button>
      </div>`;
    })
    .join('');
}

// ---------- settings dialog ----------

const dialog = $<HTMLDialogElement>('settings');

async function openSettings() {
  const languageSelect = $<HTMLSelectElement>('language');
  languageSelect.querySelectorAll('option:not([value=auto])').forEach((o) => o.remove());
  for (const [code, name] of Object.entries(languageNames)) languageSelect.add(new Option(name, code));
  languageSelect.value = settings.language;
  $<HTMLInputElement>('loc-name').value = settings.location.name;
  $<HTMLInputElement>('loc-lat').value = String(settings.location.lat);
  $<HTMLInputElement>('loc-lon').value = String(settings.location.lon);
  $('place-results').innerHTML = '';
  $<HTMLInputElement>('place-query').value = '';
  $('providers').innerHTML = providers
    .map(
      (p) => `<label><input type="radio" name="provider" value="${p.id}" ${p.id === settings.provider ? 'checked' : ''} />
        <span>${esc(p.label)}<small>${esc(p.description)}</small></span></label>`,
    )
    .join('');
  updateCacheInfo();
  dialog.showModal();
}

async function updateCacheInfo() {
  const n = await db.weatherCacheSize();
  $('cache-info').textContent = n ? t().cacheInfo(n) : t().cacheEmpty;
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

function applySettingsDialog() {
  const lat = Number($<HTMLInputElement>('loc-lat').value);
  const lon = Number($<HTMLInputElement>('loc-lon').value);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    settings.location = { name: $<HTMLInputElement>('loc-name').value.trim() || `${lat}, ${lon}`, lat, lon };
  } else {
    toast(t().invalidCoords, true);
  }
  const p = dialog.querySelector<HTMLInputElement>('input[name=provider]:checked');
  if (p) settings.provider = p.value;
  const language = $<HTMLSelectElement>('language').value as LangSetting;
  if (language !== settings.language) {
    settings.language = language;
    applyLanguage();
  }
  persist();
}

// ---------- wiring ----------

function persist() {
  saveSettings(settings);
  updateAttribution();
  void renderAll();
}

/** Switches the UI language; dynamic parts are redrawn by the following persist()/renderAll(). */
function applyLanguage() {
  setLanguage(settings.language);
  translateDocument();
  renderDevices();
  renderImports();
}

function updateAttribution() {
  const p = providerById(settings.provider);
  const a = $<HTMLAnchorElement>('attribution');
  a.textContent = p.attribution;
  a.href = p.attributionUrl;
}

function bindControls() {
  const fileInput = $<HTMLInputElement>('file');
  const pick = () => fileInput.click();
  $('btn-import').addEventListener('click', pick);
  $('btn-import-empty').addEventListener('click', pick);
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) void importFiles(fileInput.files);
    fileInput.value = '';
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

  $('devices').addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    const serial = t.closest<HTMLElement>('[data-serial]')?.dataset.serial;
    const dev = devices.find((d) => d.serial === serial);
    if (!dev) return;
    if (t.dataset.act === 'visible') dev.visible = t.checked;
    if (t.dataset.act === 'name') dev.name = t.value.trim() || dev.model;
    await db.saveDevice(dev);
    renderImports();
    void renderAll();
  });

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
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') applySettingsDialog();
  });

  // Drag & drop anywhere in the window.
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
  updateAttribution();
  await reloadMeta();
  if (imports.length) await presetRange(30);
}

void init();
