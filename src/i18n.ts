// UI strings. English is the source of truth; every other language must provide the same keys.

const en = {
  // static page (index.html, via data-i18n attributes)
  metaDescription: 'Viewer for Elitech RC temperature and humidity loggers with weather data for comparison.',
  brandSub: 'Viewer for Elitech RC loggers',
  settings: 'Settings',
  emptyTitle: 'No measurements yet',
  emptyStep1: 'Connect the logger via USB. It shows up as a drive, e.g. <b>RC-4HPro</b>.',
  emptyStep2: 'Drag the <b>CSV file</b> (e.g. <code>EFX267100110-0000001.csv</code>) here or choose it with the button below.',
  emptyStep3: 'Done. The data stays stored locally on this computer.',
  emptyHint: 'You can import the same recording again later: duplicate readings are merged.',
  chooseCsv: 'Choose CSV file',
  from: 'From',
  to: 'To',
  timeRange: 'Time range',
  presetDay: '1 d',
  presetWeek: '7 d',
  presetMonth: '30 d',
  presetQuarter: '90 d',
  presetYear: '1 y',
  presetAll: 'All',
  resolution: 'Resolution',
  resAuto: 'Automatic',
  resRaw: 'All readings',
  resHour: 'Hourly mean',
  resDay: 'Daily mean with min/max',
  humidityAs: 'Humidity as',
  humRelativeOption: 'relative humidity (%)',
  humAbsoluteOption: 'absolute humidity (g/m³)',
  humDewpointOption: 'dew point (°C)',
  weather: 'Weather',
  shadeNights: 'Shade nights',
  devices: 'Devices',
  importedFiles: 'Imported files',
  addDevice: 'Add device',
  addDeviceHint: 'Devices are recognized by the serial number in the CSV file.',
  uploadData: 'Upload data',
  readLogger: 'Read from logger',
  configureLogger: 'Configure logger',
  lgRecording: 'Recording',
  lgInterval: 'Logging interval',
  lgTimeZone: 'Time zone',
  lgTimeZoneHint: 'The logger doesn’t switch to daylight saving time. Standard time keeps the readings consistent all year.',
  lgStartMode: 'Start',
  lgStartButton: 'By button',
  lgStartImmediate: 'Immediately',
  lgStartTimed: 'At a set time',
  lgStartAt: 'Start time',
  lgStartDelay: 'Start delay',
  lgTripId: 'Trip code',
  lgDescription: 'Description',
  lgLimits: 'Alarm limits',
  lgTempHigh: 'Temperature high (°C)',
  lgTempLow: 'Temperature low (°C)',
  lgHumHigh: 'Humidity high (%)',
  lgHumLow: 'Humidity low (%)',
  lgDevice: 'Device',
  lgAlarmBeeps: 'Audible alarm',
  lgOff: 'off',
  lgBeeps3: '3 times',
  lgBeeps10: '10 times',
  lgDisplay: 'Display time',
  lgUnit: 'Display unit',
  lgPdfLanguage: 'PDF report',
  lgStopButton: 'Stop by button',
  lgPause: 'Pause by button',
  lgCyclic: 'Cyclic logging (overwrites the oldest readings when full)',
  lgKeyTone: 'Key tone',
  lgEraseWarning: 'Saving restarts the logger and erases its recording. Hygrolog imports the recording first.',
  lgSave: 'Save to logger',
  editDevice: 'Edit device',
  deviceTitle: 'Title',
  removeDevice: 'Remove device',
  removeDeviceHint: 'Deletes all imported files and readings of this device.',
  locationHint: 'Where this device is used. The comparison weather is loaded for this place.',
  footerWeather: 'Weather data:',
  footerSun: 'Sun times are computed locally',
  footerLocal: 'All data stays on this device',
  close: 'Close',
  language: 'Language',
  languageAuto: 'Automatic (system language)',
  locationLegend: 'Location for weather & sun times',
  placeSearchPlaceholder: 'Search place, e.g. Dippoldiswalde',
  search: 'Search',
  locName: 'Name',
  locLat: 'Latitude',
  locLon: 'Longitude',
  weatherSource: 'Weather source',
  weatherCache: 'Weather cache',
  clearCache: 'Clear cache',
  apply: 'Apply',
  dropHere: 'Drop CSV files here',

  // dynamic
  pickCsvOnly: 'Please choose the logger’s CSV files (the PDF file contains no importable raw data).',
  imported: (file: string, n: number, dup: number) =>
    `${file}: ${n} readings${dup > 0 ? `, ${dup} of them already present` : ''}.`,
  readingLogger: 'Reading logger …',
  loggerNotFound: 'No logger found. Connect it via USB and try again.',
  loggerFailed: (message: string) => `Reading the logger failed (${message}).`,
  loggerEmpty: (serial: string) => `${serial}: the logger holds no readings yet.`,
  loggerConfigured: (serial: string) => `${serial}: configuration saved and clock set.`,
  lgDisplayCode: (code: number) => `code ${code}`,
  noReadingsInRange: 'No readings in the selected time range.',
  nightsLimited: (days: number) => `Nights are only shaded for ranges up to ${days} days.`,
  loadingWeather: 'Loading weather data …',
  loadingWeatherProgress: (done: number, total: number) => `Loading weather data … ${done}/${total} months`,
  weatherSeries: (where: string) => `Weather ${where}`,
  weatherIncomplete: (months: number, offline: boolean) =>
    `Weather data incomplete (${months} month${months === 1 ? '' : 's'} not loaded${offline ? ', offline?' : ''}).`,
  statMin: 'Min',
  statMean: 'Mean',
  statMax: 'Max',
  statTemp: 'Temp.',
  statHumRelative: 'Humidity',
  statHumAbsolute: 'Abs. hum.',
  statHumDewpoint: 'Dew point',
  values: (n: string) => `${n} values`,
  noValues: 'No values',
  deviceDefault: (n: number) => `Device ${n}`,
  serialNo: 'Serial no.',
  lastReading: (when: string) => `Last reading ${when}`,
  noReadingsYet: 'No readings yet',
  confirmRemoveDevice: (title: string) => `Remove “${title}” with all its imported files and readings?`,
  importedOtherDevice: (file: string, title: string) => `${file} belongs to another device (serial number), so it was added to “${title}”.`,
  nothingImported: 'Nothing imported yet.',
  fromFile: ' (file)',
  every: (interval: string) => `every ${interval}`,
  timeBaseHint: 'Time base of the device clock. Only change it if the times look shifted.',
  remove: 'Remove',
  confirmRemove: (file: string) => `Remove “${file}” and its readings?`,
  cacheInfo: (n: number) => `${n} month${n === 1 ? '' : 's'} of weather data cached.`,
  cacheEmpty: 'The cache is empty.',
  searching: 'Searching …',
  nothingFound: 'Nothing found.',
  searchFailed: (msg: string) => `Search failed: ${msg}`,
  invalidCoords: 'Invalid coordinates, location not changed.',
  cacheCleared: (n: number) => `Removed ${n} month${n === 1 ? '' : 's'} from the weather cache.`,

  // chart
  axisTemp: 'Temperature (°C)',
  axisHumRelative: 'Rel. humidity (%)',
  axisHumAbsolute: 'Abs. humidity (g/m³)',
  axisHumDewpoint: 'Dew point (°C)',
  sunrise: 'Sunrise',
  sunset: 'Sunset',

  // weather providers
  brightSkyLabel: 'DWD station data (Bright Sky)',
  brightSkyDescription: 'Observations from the nearest station of the German Weather Service, from 2010. Germany only.',
  brightSkyAttribution: 'Deutscher Wetterdienst, via Bright Sky',
  openMeteoLabel: 'Open-Meteo (model data)',
  openMeteoDescription: 'Reanalysis and model data on a ~10 km grid, worldwide, from 1940. Good for places without a nearby DWD station.',

  // parser
  parseNoTable: 'No data table found (expected a line “Date,Time,Temperature,…”).',
  parseNoColumns: 'Found neither a temperature nor a humidity column.',
  parseNoRows: 'The file contains no readings.',
};

export type Messages = typeof en;

const de: Messages = {
  metaDescription: 'Auswertung von Elitech-RC-Temperatur- und Feuchteloggern mit Wetterdaten zum Vergleich.',
  brandSub: 'Auswertung für Elitech-RC-Logger',
  settings: 'Einstellungen',
  emptyTitle: 'Noch keine Messdaten',
  emptyStep1: 'Logger per USB anschließen. Er erscheint als Laufwerk, z.&nbsp;B. <b>RC-4HPro</b>.',
  emptyStep2: 'Die <b>CSV-Datei</b> (z.&nbsp;B. <code>EFX267100110-0000001.csv</code>) hierher ziehen oder über die Schaltfläche unten auswählen.',
  emptyStep3: 'Fertig. Die Daten bleiben lokal auf diesem Rechner gespeichert.',
  emptyHint: 'Du kannst dieselbe Aufzeichnung später noch einmal importieren: doppelte Messpunkte werden zusammengeführt.',
  chooseCsv: 'CSV-Datei auswählen',
  from: 'Von',
  to: 'Bis',
  timeRange: 'Zeitraum',
  presetDay: '1 T',
  presetWeek: '7 T',
  presetMonth: '30 T',
  presetQuarter: '90 T',
  presetYear: '1 J',
  presetAll: 'Alles',
  resolution: 'Auflösung',
  resAuto: 'Automatisch',
  resRaw: 'Alle Messwerte',
  resHour: 'Stundenmittel',
  resDay: 'Tagesmittel mit Min/Max',
  humidityAs: 'Feuchte als',
  humRelativeOption: 'relative Feuchte (%)',
  humAbsoluteOption: 'absolute Feuchte (g/m³)',
  humDewpointOption: 'Taupunkt (°C)',
  weather: 'Wetter',
  shadeNights: 'Nächte schattieren',
  devices: 'Geräte',
  importedFiles: 'Importierte Dateien',
  addDevice: 'Gerät hinzufügen',
  addDeviceHint: 'Geräte werden anhand der Seriennummer in der CSV-Datei erkannt.',
  uploadData: 'Daten hochladen',
  readLogger: 'Vom Logger lesen',
  configureLogger: 'Logger konfigurieren',
  lgRecording: 'Aufzeichnung',
  lgInterval: 'Messintervall',
  lgTimeZone: 'Zeitzone',
  lgTimeZoneHint: 'Der Logger stellt nicht auf Sommerzeit um. Mit Normalzeit bleiben die Messwerte das ganze Jahr einheitlich.',
  lgStartMode: 'Start',
  lgStartButton: 'Per Taste',
  lgStartImmediate: 'Sofort',
  lgStartTimed: 'Zu festem Zeitpunkt',
  lgStartAt: 'Startzeit',
  lgStartDelay: 'Startverzögerung',
  lgTripId: 'Fahrtenkode',
  lgDescription: 'Beschreibung',
  lgLimits: 'Alarmgrenzen',
  lgTempHigh: 'Temperatur oben (°C)',
  lgTempLow: 'Temperatur unten (°C)',
  lgHumHigh: 'Feuchte oben (%)',
  lgHumLow: 'Feuchte unten (%)',
  lgDevice: 'Gerät',
  lgAlarmBeeps: 'Akustischer Alarm',
  lgOff: 'aus',
  lgBeeps3: '3-mal',
  lgBeeps10: '10-mal',
  lgDisplay: 'Anzeigedauer',
  lgUnit: 'Anzeigeeinheit',
  lgPdfLanguage: 'PDF-Bericht',
  lgStopButton: 'Stopp per Taste',
  lgPause: 'Pause per Taste',
  lgCyclic: 'Zyklisch aufzeichnen (überschreibt bei vollem Speicher die ältesten Messwerte)',
  lgKeyTone: 'Tastenton',
  lgEraseWarning: 'Speichern startet den Logger neu und löscht seine Aufzeichnung. Hygrolog importiert sie vorher.',
  lgSave: 'Auf Logger speichern',
  editDevice: 'Gerät bearbeiten',
  deviceTitle: 'Titel',
  removeDevice: 'Gerät entfernen',
  removeDeviceHint: 'Löscht alle importierten Dateien und Messwerte dieses Geräts.',
  locationHint: 'Wo dieses Gerät im Einsatz ist. Für diesen Ort werden die Vergleichs-Wetterdaten geladen.',
  footerWeather: 'Wetterdaten:',
  footerSun: 'Sonnenzeiten werden lokal berechnet',
  footerLocal: 'Alle Daten bleiben auf diesem Gerät',
  close: 'Schließen',
  language: 'Sprache',
  languageAuto: 'Automatisch (Systemsprache)',
  locationLegend: 'Standort für Wetter & Sonnenzeiten',
  placeSearchPlaceholder: 'Ort suchen, z. B. Dippoldiswalde',
  search: 'Suchen',
  locName: 'Name',
  locLat: 'Breite',
  locLon: 'Länge',
  weatherSource: 'Wetterquelle',
  weatherCache: 'Wetter-Cache',
  clearCache: 'Cache leeren',
  apply: 'Übernehmen',
  dropHere: 'CSV-Dateien hier ablegen',

  pickCsvOnly: 'Bitte CSV-Dateien des Loggers auswählen (die PDF-Datei enthält keine importierbaren Rohdaten).',
  imported: (file, n, dup) => `${file}: ${n} Messwerte${dup > 0 ? `, davon ${dup} bereits vorhanden` : ''}.`,
  readingLogger: 'Lese Logger …',
  loggerNotFound: 'Kein Logger gefunden. Bitte per USB anschließen und erneut versuchen.',
  loggerFailed: (message) => `Auslesen des Loggers fehlgeschlagen (${message}).`,
  loggerEmpty: (serial) => `${serial}: Der Logger enthält noch keine Messwerte.`,
  loggerConfigured: (serial) => `${serial}: Konfiguration gespeichert und Uhr gestellt.`,
  lgDisplayCode: (code) => `Code ${code}`,
  noReadingsInRange: 'Keine Messwerte im gewählten Zeitraum.',
  nightsLimited: (days) => `Nächte werden nur bis ${days} Tage Zeitraum schattiert.`,
  loadingWeather: 'Lade Wetterdaten …',
  loadingWeatherProgress: (done, total) => `Lade Wetterdaten … ${done}/${total} Monate`,
  weatherSeries: (where) => `Wetter ${where}`,
  weatherIncomplete: (months, offline) =>
    `Wetterdaten unvollständig (${months} ${months === 1 ? 'Monat' : 'Monate'} nicht geladen${offline ? ', offline?' : ''}).`,
  statMin: 'Min',
  statMean: 'Mittel',
  statMax: 'Max',
  statTemp: 'Temp.',
  statHumRelative: 'Feuchte',
  statHumAbsolute: 'Abs. F.',
  statHumDewpoint: 'Taupunkt',
  values: (n) => `${n} Werte`,
  noValues: 'Keine Werte',
  deviceDefault: (n) => `Gerät ${n}`,
  serialNo: 'Seriennr.',
  lastReading: (when) => `Letzter Wert ${when}`,
  noReadingsYet: 'Noch keine Messwerte',
  confirmRemoveDevice: (title) => `„${title}“ mit allen importierten Dateien und Messwerten entfernen?`,
  importedOtherDevice: (file, title) => `${file} gehört laut Seriennummer zu einem anderen Gerät und wurde bei „${title}“ einsortiert.`,
  nothingImported: 'Noch nichts importiert.',
  fromFile: ' (Datei)',
  every: (interval) => `alle ${interval}`,
  timeBaseHint: 'Zeitbasis der Gerätezeit. Nur ändern, wenn die Uhrzeiten verschoben wirken.',
  remove: 'Entfernen',
  confirmRemove: (file) => `„${file}“ und die zugehörigen Messwerte entfernen?`,
  cacheInfo: (n) => `${n} ${n === 1 ? 'Monat' : 'Monate'} Wetterdaten zwischengespeichert.`,
  cacheEmpty: 'Der Cache ist leer.',
  searching: 'Suche …',
  nothingFound: 'Nichts gefunden.',
  searchFailed: (msg) => `Suche fehlgeschlagen: ${msg}`,
  invalidCoords: 'Ungültige Koordinaten, Standort nicht geändert.',
  cacheCleared: (n) => `${n} ${n === 1 ? 'Monat' : 'Monate'} aus dem Wetter-Cache entfernt.`,

  axisTemp: 'Temperatur (°C)',
  axisHumRelative: 'Rel. Feuchte (%)',
  axisHumAbsolute: 'Abs. Feuchte (g/m³)',
  axisHumDewpoint: 'Taupunkt (°C)',
  sunrise: 'Sonnenaufgang',
  sunset: 'Sonnenuntergang',

  brightSkyLabel: 'DWD-Stationsdaten (Bright Sky)',
  brightSkyDescription: 'Messwerte der nächstgelegenen Station des Deutschen Wetterdienstes, ab 2010. Nur Deutschland.',
  brightSkyAttribution: 'Deutscher Wetterdienst, via Bright Sky',
  openMeteoLabel: 'Open-Meteo (Modelldaten)',
  openMeteoDescription: 'Reanalyse- und Modelldaten im ~10-km-Raster, weltweit, ab 1940. Gut für Orte ohne nahe DWD-Station.',

  parseNoTable: 'Keine Datentabelle gefunden (erwartet: Zeile „Date,Time,Temperature,…“).',
  parseNoColumns: 'Weder Temperatur- noch Feuchtespalte gefunden.',
  parseNoRows: 'Die Datei enthält keine Messwerte.',
};

const dictionaries = { en, de } satisfies Record<string, Messages>;

export type Lang = keyof typeof dictionaries;
export type LangSetting = Lang | 'auto';

/** Native names, shown in the language picker regardless of the current UI language. */
export const languageNames: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

const locales: Record<Lang, string> = { en: 'en-GB', de: 'de-DE' };

let current: Lang = 'en';

/** First of the user's preferred languages (browser or OS setting) that we support, else English. */
export function detectLanguage(): Lang {
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of prefs) {
    const base = tag?.toLowerCase().split('-')[0];
    if (base && base in dictionaries) return base as Lang;
  }
  return 'en';
}

export function setLanguage(setting: LangSetting): Lang {
  current = setting === 'auto' ? detectLanguage() : setting;
  return current;
}

export const lang = () => current;
/** BCP 47 tag for number and date formatting. */
export const locale = () => locales[current];
/** Messages in the current language. */
export const t = (): Messages => dictionaries[current];

/**
 * Fills static markup: data-i18n sets text, data-i18n-html sets trusted markup from the dictionary,
 * data-i18n-attr="attr:key;attr:key" sets attributes.
 */
export function translateDocument(root: ParentNode = document): void {
  const m = t() as unknown as Record<string, string>;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = m[el.dataset.i18n!]));
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = m[el.dataset.i18nHtml!]));
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, m[key]);
    }
  });
  document.documentElement.lang = current;
}
