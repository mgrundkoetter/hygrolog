// Magnus formula (Sonntag 1990 constants, over water).
const A = 17.62;
const B = 243.12;

function saturationVaporPressure(t: number): number {
  return 6.112 * Math.exp((A * t) / (B + t)); // hPa
}

/** Dew point in °C. */
export function dewPoint(t: number, rh: number): number {
  const g = Math.log(Math.max(rh, 0.1) / 100) + (A * t) / (B + t);
  return (B * g) / (A - g);
}

/** Absolute humidity in g/m³. */
export function absoluteHumidity(t: number, rh: number): number {
  const e = (rh / 100) * saturationVaporPressure(t);
  return (216.7 * e) / (273.15 + t);
}

export type HumidityMode = 'relative' | 'absolute' | 'dewpoint';

export const humidityUnits: Record<HumidityMode, string> = {
  relative: '%',
  absolute: 'g/m³',
  dewpoint: '°C',
};

export function convertHumidity(mode: HumidityMode, t: number | null, rh: number | null): number | null {
  if (rh === null) return null;
  if (mode === 'relative') return rh;
  if (t === null) return null;
  return mode === 'absolute' ? absoluteHumidity(t, rh) : dewPoint(t, rh);
}
