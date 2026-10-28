// Reads loggers directly over USB. Only the desktop app has HID access (src-tauri/src/elitech.rs).

import type { ParsedReport } from './parser';

export const loggerAccess = '__TAURI_INTERNALS__' in window;

/** One report per connected logger, shaped like a parsed CSV. Rejects with "not-found" if none is connected. */
export async function readLoggers(): Promise<ParsedReport[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ParsedReport[]>('read_loggers');
}
