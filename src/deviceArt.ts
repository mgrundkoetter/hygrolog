// Stylized device drawings for the device picker. The LCD shows the latest reading, so the
// picture doubles as a preview. Other models can get their own drawing in `deviceArt`.

export interface LcdValues {
  temp: number | null;
  hum: number | null;
}

const fmt = (v: number | null, digits: number) => (v === null ? '--' : v.toFixed(digits));

/** Elitech RC-4/RC-5 "Pro" family: white body, vents, LCD, blue button with keyhole slot, USB tab. */
function rcPro(model: string, lcd: LcdValues | null): string {
  const vents = [18, 28, 64, 74]
    .flatMap((x) => [`<circle cx="${x}" cy="15" r="1.8"/>`, `<circle cx="${x + 4}" cy="20" r="1.8"/>`])
    .join('');
  const hum = lcd && lcd.hum !== null ? `<text x="78" y="46" font-size="8" text-anchor="end">${fmt(lcd.hum, 0)}%</text>` : '';
  return `<svg class="device-art" viewBox="0 0 100 184" role="img" aria-label="${model}">
    <rect x="34" y="174" width="32" height="8" rx="2" fill="#dcdcd7"/>
    <rect x="3" y="3" width="94" height="174" rx="20" fill="#f8f8f6" stroke="#c9c9c3" stroke-width="2"/>
    <g fill="#55554f">${vents}</g>
    <path d="M45 12h10l-5 6z" fill="#e2e2dc"/>
    <rect x="14" y="30" width="72" height="44" rx="6" fill="#3b3d3c"/>
    <rect x="18" y="34" width="64" height="36" rx="3" fill="#b9c0b8"/>
    <g fill="#222622" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-weight="600">
      <rect x="22" y="39" width="10" height="5" rx="1" fill="none" stroke="#222622" stroke-width="1.2"/>
      ${hum}
      <text x="70" y="65" font-size="17" text-anchor="end" letter-spacing="-0.5">${lcd ? fmt(lcd.temp, 1) : '--.-'}</text>
      <text x="71" y="65" font-size="7">°C</text>
    </g>
    <text x="50" y="86" font-size="8" fill="#6d6d67" text-anchor="middle" font-family="system-ui, sans-serif">${model}</text>
    <rect x="43" y="110" width="14" height="44" rx="7" fill="#efefeb" stroke="#d3d3cd"/>
    <circle cx="50" cy="108" r="15" fill="#efefeb" stroke="#d3d3cd"/>
    <circle cx="50" cy="108" r="11" fill="#2f74c9"/>
    <path d="M46.5 104.5a5 5 0 1 0 7 0M50 102.5v5" fill="none" stroke="#9cc2ef" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}

/** Display name of a model as printed on the housing: "RC-4HPro" → "RC-4H Pro". */
export const modelLabel = (model: string) => model.replace(/(\S)Pro$/, '$1 Pro');

/** Inline SVG for a device. `lcd` is the latest reading, or null if there is none. */
export function deviceArt(model: string, lcd: LcdValues | null): string {
  // All Elitech models we know of so far share the RC "Pro" housing; add others here.
  return rcPro(modelLabel(model.replace(/[<>&"]/g, '')), lcd);
}
