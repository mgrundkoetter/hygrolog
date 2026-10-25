# Hygrolog

**English** · [Deutsch](README.de.md)

A small, free viewer for **Elitech RC temperature and humidity data loggers** (tested with the RC-4H Pro). Measurements are shown in an interactive chart over any time range, together with **weather data** (temperature and humidity) and **sunrise/sunset** for a location of your choice.

- Imports the CSV reports the logger writes to its own USB drive. No drivers or vendor software needed.
- Pick a time range with the date picker (from/to) or a quick selection (1 d … 1 y, all), and zoom with the mouse wheel or slider
- Automatic or fixed resolution: all readings, hourly means, daily means with a min/max band
- Humidity as **relative (%)**, **absolute (g/m³)** or **dew point**. For a basement, for example, this tells you whether airing out makes the air drier or damper.
- Nights are shaded in the chart, sun times are shown in the tooltip
- Several loggers: a sidebar lists every device (recognized by its serial number) with a small picture showing its latest reading. Each device gets its own title (default "Device 1", "Device 2", …), its own uploads and its own location and weather source, so loggers in different places are compared with the right weather
- Importing the same recording more than once is harmless: duplicate readings are merged
- Everything stays local: measurements and the weather cache live in the app (IndexedDB). Only weather requests go over the network.

- User interface in English and German: detected automatically from the system language, switchable in the settings

## Weather data

| Source | Data | Coverage |
|---|---|---|
| **DWD via [Bright Sky](https://brightsky.dev/)** (default) | Hourly observations from the nearest DWD station, e.g. *Dippoldiswalde-Reinberg* (≈ 4 km) for Malter | Germany, from 2010 |
| **[Open-Meteo](https://open-meteo.com/)** | Reanalysis/model data on a ~10 km grid | worldwide, from 1940 |

Both sources are open and need no API key. Data is cached per month. Months more than a week in the past are never fetched again, and the current month is refreshed at most every 3 hours. Sunrise and sunset are computed locally (using [SunCalc](https://github.com/mourner/suncalc)).

## Usage

1. Connect the logger via USB. It shows up as a drive (e.g. `RC-4HPro`) containing a PDF and a CSV file.
2. Drag the **CSV file** into the app window or choose it via **Import CSV**.
3. Use **Edit device** to give the device a title and set its location and weather source. The default is Malter (Dippoldiswalde, Saxony); new devices start with the location of the device currently shown.
4. More data for a device: **Upload data**. A new logger: **Add device**, or simply drop its CSV file. Files always end up at the device named by their serial number.

> **Time base:** The CSV contains the time zone the logger was configured with (`Time Base: UTC+00:00`). If the curves look shifted by an hour or two compared to the weather, you can correct the time base per file in the *Imported files* list.

## Installation (download)

Ready-made packages are available under *Releases*: `.dmg` for macOS (Apple Silicon and Intel), `.msi`/`.exe` for Windows, `.AppImage`/`.deb` for Linux.

The packages are not signed, because signing certificates cost money. The operating system will therefore ask for confirmation on first launch:

- **macOS:** Open the app once and close the warning with *Done*. Then go to *System Settings → Privacy & Security*, scroll down to the message about Hygrolog and click *Open Anyway* (confirm with your password). Alternatively, in the Terminal: `xattr -dr com.apple.quarantine /Applications/Hygrolog.app`
- **Windows:** SmartScreen → *More info* → *Run anyway*

The same app also runs in the browser, e.g. for free via GitHub Pages (see below).

## Development

Requirements: Node.js ≥ 20. For the desktop app additionally Rust ≥ 1.90 (`rustup update stable`) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev          # web version at http://localhost:5173
npm test             # unit tests (parser, humidity conversion, aggregation)
npm run build        # static web version into dist/

npm run tauri dev    # desktop app in development mode
npm run tauri build  # installer for the current operating system
```

### Publishing without hosting costs

- **Installers:** Set the new version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then push a matching tag (`git tag v0.1.0 && git push --tags`). The workflow `.github/workflows/release.yml` builds packages for all three operating systems on GitHub Actions (about 15 minutes) and publishes them as a release. It refuses to run if the tag and the version differ.
- **Web version:** Under *Settings → Pages*, select "GitHub Actions" as the source. After that, `.github/workflows/pages.yml` publishes every push to `main`.

### Structure

```
src/parser.ts     CSV parser for Elitech reports (header + Date,Time,Temperature,Humidity)
src/db.ts         IndexedDB: readings, imports, devices, weather cache
src/weather.ts    weather sources (Bright Sky, Open-Meteo), monthly cache, location search
src/sun.ts        sun times and night intervals
src/humidity.ts   dew point / absolute humidity (Magnus formula)
src/aggregate.ts  hourly/daily means, gap detection, statistics
src/chart.ts      chart (Apache ECharts)
src/deviceArt.ts  stylized device pictures for the device picker
src/i18n.ts       UI strings (English, German) and language detection
src/main.ts       user interface
src-tauri/        desktop shell (Tauri 2)
```

Other Elitech models (RC-4 Pro, RC-5+, …) write the same CSV format and should work as well. Sample files from other models are very welcome.

## TODO: Configure the device directly via USB

Goal: Hygrolog should be able to configure the logger itself (interval, start mode, alarm limits, time zone, set the clock from the computer), so the vendor app is no longer needed at all. Bonus: read measurements directly via USB instead of through the CSV file.

**Findings so far (from ElitechLog V8.3.5 / 13.2.4 for macOS, read-only analysis):**

- The Pro models present themselves via USB as a drive (PDF/CSV) **and additionally as a HID device**. ElitechLog uses [hidapi](https://github.com/libusb/hidapi) for this. Older RC-4/RC-5 models without "Pro" use a serial interface instead ([elitech-datareader](https://pypi.org/project/elitech-datareader/)), which is a different protocol.
- Packet layout (from `initializePacket:withCmd:withExtCmd:withAddr:withLen:withData:dataLen:`):

  | Byte | Content |
  |---|---|
  | 0–1 | `33 CC` (magic) |
  | 2 | `00` |
  | 3 | packet length = data length + 12 |
  | 4 | command (`cmd`) |
  | 5 | sub-command (`extCmd`) |
  | 6 | `00` |
  | 7–8 | address, big-endian |
  | 9–10 | length, big-endian |
  | 11 … | payload |
  | last | checksum: sum of all previous bytes, 8 bit |

- Still unknown: the command numbers (device info, read/write configuration, clock, read data), the configuration encoding, the response packets, VID/PID and the HID report size.

**Next step: capture traffic with a real device**

1. Quit the regular ElitechLog.
2. Run `tools/hidspy/capture.sh`. The script creates an ad-hoc signed copy of ElitechLog with a small HID logger injected (the original stays untouched) and writes all packets to `tools/hidspy/hid.log`.
3. Plug in the logger and wait until the device info appears.
4. Under **Configure**, set values and click **"Parameter"**. ⚠️ This erases the running recording on the device, so back up the CSV from the drive first.
5. Optional: read data or use "new data" so the read command ends up in the capture as well.
6. Close the app and analyse `hid.log`.

**Implementation afterwards:**

- Rust side (Tauri) using the `hidapi` crate: commands as Tauri commands (`device_info`, `read_config`, `write_config`, `sync_time`, possibly `read_records`)
- "Device" section in the UI: live info (clock, battery, status, readings) and a configuration form, with a clear warning that saving erases the recording
- Optional for the browser version: WebHID (Chrome/Edge only)
- Linux: document a udev rule for HID access
- Tests with recorded packets as fixtures

## License

MIT. Elitech is a trademark of its respective owner. This project is independent and not affiliated with the manufacturer.
