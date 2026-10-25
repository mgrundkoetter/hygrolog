import type { Resolution } from './aggregate';
import type { HumidityMode } from './humidity';
import type { LangSetting } from './i18n';
import type { Location } from './types';

export interface Settings {
  language: LangSetting;
  location: Location;
  provider: string;
  resolution: Resolution;
  humidityMode: HumidityMode;
  showNights: boolean;
  showWeather: boolean;
}

export const defaultSettings: Settings = {
  language: 'auto',
  location: { name: 'Malter (Dippoldiswalde)', lat: 50.918, lon: 13.662 },
  provider: 'brightsky',
  resolution: 'auto',
  humidityMode: 'relative',
  showNights: true,
  showWeather: true,
};

const KEY = 'hygrolog.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return { ...defaultSettings };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
