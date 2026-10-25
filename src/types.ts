export interface Reading {
  serial: string;
  /** Absolute time, epoch ms (UTC). */
  ts: number;
  /** Wall-clock time as written in the file, encoded as if it were UTC. ts = local - offset. */
  local: number;
  temp: number | null;
  hum: number | null;
  importId: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  serial: string;
  model: string;
  tripId: string;
  importedAt: number;
  /** Offset currently applied (minutes east of UTC). */
  tzOffsetMin: number;
  /** Offset stated in the file ("Time Base"). */
  fileTzOffsetMin: number;
  count: number;
  first: number;
  last: number;
  interval: string;
}

export interface Device {
  serial: string;
  model: string;
  /** User-given title; empty means the default "Device <slot + 1>". */
  name: string;
  /** Fixed slot, assigned once: drives the color and the default title. */
  slot: number;
  /** Where the device is used: location and source of its comparison weather. */
  location?: Location;
  provider?: string;
}

export interface WeatherPoint {
  ts: number;
  temp: number | null;
  hum: number | null;
}

export interface Location {
  name: string;
  lat: number;
  lon: number;
}
