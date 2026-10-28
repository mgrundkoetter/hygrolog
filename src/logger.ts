// Logger access for the UI: combines the protocol (elitech.ts) with the USB transports (usb.ts).

import {
  configure,
  decodeConfig,
  decodeStatus,
  LoggerNotFound,
  MODEL,
  readParams,
  readReport,
  serialOf,
  validateConfig,
  type LoggerConfig,
  type LoggerStatus,
  type Transport,
} from './elitech';
import type { ParsedReport } from './parser';
import { connectedLoggers, usbAvailable } from './usb';

export { InvalidConfig, LoggerNotFound, type LoggerConfig, type LoggerStatus, type StartMode } from './elitech';

export const loggerAccess = usbAvailable;

export interface ConnectedLogger {
  serial: string;
  model: string;
  config: LoggerConfig;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` on every connected logger, one session at a time so packets never interleave. */
function withLoggers<T>(ask: boolean, task: (logger: Transport) => Promise<T>): Promise<T[]> {
  const run = queue.then(async () => {
    const loggers = await connectedLoggers(ask);
    if (!loggers.length) throw new LoggerNotFound();
    const results: T[] = [];
    for (const logger of loggers) results.push(await task(logger));
    return results;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** One report per connected logger, shaped like a parsed CSV. */
export const readLoggers = (): Promise<ParsedReport[]> => withLoggers(true, readReport);

export const readConfigs = (): Promise<ConnectedLogger[]> =>
  withLoggers(true, async (logger) => {
    const params = await readParams(logger);
    return { serial: serialOf(params), model: MODEL, config: decodeConfig(params) };
  });

/** Current reading, state and clock of every connected logger. Never opens the browser's device picker. */
export const readStatus = (): Promise<LoggerStatus[]> =>
  withLoggers(false, async (logger) => decodeStatus(await readParams(logger)));

/** Reconfigures the logger with this serial number and sets its clock. This erases its recording. */
export async function writeConfig(serial: string, config: LoggerConfig) {
  validateConfig(config);
  const done = await withLoggers(true, (logger) => configure(logger, serial, config, Date.now()));
  if (!done.includes(true)) throw new LoggerNotFound();
}
