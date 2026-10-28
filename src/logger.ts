// Talks to loggers directly over USB. Only the desktop app has HID access (src-tauri/src/elitech.rs).

import type { ParsedReport } from './parser';

export const loggerAccess = '__TAURI_INTERNALS__' in window;

export type StartMode = 'button' | 'immediate' | 'timed';

/** Mirrors `Config` in src-tauri/src/elitech/config.rs. */
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
  alarmBeeps: number;
  /** 1 = 15 s, 2 = 30 s. */
  displayTime: number;
  fahrenheit: boolean;
  pdfChinese: boolean;
  tzOffsetMin: number;
  /** null switches the limit off. */
  tempHigh: number | null;
  tempLow: number | null;
  humHigh: number;
  humLow: number;
  tripId: string;
  description: string;
}

export interface ConnectedLogger {
  serial: string;
  model: string;
  config: LoggerConfig;
}

/** Commands reject with "not-found" if no logger is connected. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** One report per connected logger, shaped like a parsed CSV. */
export const readLoggers = () => call<ParsedReport[]>('read_loggers');

export const readConfigs = () => call<ConnectedLogger[]>('read_configs');

/** Reconfigures the logger and sets its clock. This erases its recording. */
export const writeConfig = (serial: string, config: LoggerConfig) => call<void>('write_config', { serial, config });
