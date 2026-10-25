# Hygrolog

[English](README.md) · **Deutsch**

Eine kleine, freie Auswertungs-App für **Elitech-RC-Temperatur- und Feuchtelogger** (getestet mit dem RC-4H Pro). Die Messwerte erscheinen in einem interaktiven Graphen über beliebige Zeiträume, zusammen mit **Wetterdaten** (Temperatur und Luftfeuchte) und **Sonnenauf-/-untergang** für einen frei wählbaren Ort.

- Import der CSV-Berichte, die der Logger selbst auf sein USB-Laufwerk schreibt. Treiber oder Hersteller-Software sind nicht nötig.
- Zeitraum per Datepicker (von/bis) oder per Schnellwahl (1 T … 1 J, Alles), dazu Zoom mit Mausrad bzw. Schieber
- Auflösung automatisch oder fest: alle Messwerte, Stundenmittel, Tagesmittel mit Min/Max-Band
- Feuchte wahlweise **relativ (%)**, **absolut (g/m³)** oder als **Taupunkt**. So lässt sich z. B. für den Keller ablesen, ob Lüften die Luft trockener oder feuchter macht.
- Nächte werden im Graphen schattiert, Sonnenzeiten stehen im Tooltip
- Mehrere Logger lassen sich parallel nutzen, Geräte können umbenannt werden
- Mehrfaches Importieren derselben Aufzeichnung ist unproblematisch, doppelte Messpunkte werden zusammengeführt
- Oberfläche auf Deutsch und Englisch: Die Sprache wird automatisch aus der Systemsprache erkannt und lässt sich in den Einstellungen umstellen
- Alles bleibt lokal: Messdaten und Wetter-Cache liegen in der App (IndexedDB). Ins Netz gehen nur die Wetteranfragen.

## Wetterdaten

| Quelle | Daten | Abdeckung |
|---|---|---|
| **DWD via [Bright Sky](https://brightsky.dev/)** (Standard) | Stündliche Messwerte der nächstgelegenen DWD-Station, für Malter z. B. *Dippoldiswalde-Reinberg* (≈ 4 km) | Deutschland, ab 2010 |
| **[Open-Meteo](https://open-meteo.com/)** | Reanalyse-/Modelldaten im ~10-km-Raster | weltweit, ab 1940 |

Beide Quellen sind offen und brauchen keinen API-Schlüssel. Die Daten werden pro Monat zwischengespeichert. Monate, die mehr als eine Woche zurückliegen, werden nie wieder geladen. Den laufenden Monat aktualisiert die App höchstens alle 3 Stunden. Sonnenauf- und -untergang werden lokal berechnet (Bibliothek [SunCalc](https://github.com/mourner/suncalc)).

## Benutzung

1. Logger per USB anschließen. Er erscheint als Laufwerk (z. B. `RC-4HPro`) mit einer PDF- und einer CSV-Datei.
2. Die **CSV-Datei** in das App-Fenster ziehen oder über **CSV importieren** auswählen.
3. Ort und Wetterquelle über das Zahnrad einstellen. Voreingestellt ist Malter (Dippoldiswalde).

> **Zeitbasis:** Die CSV enthält die Zeitzone, mit der der Logger konfiguriert wurde (`Time Base: UTC+00:00`). Wirken die Kurven gegenüber dem Wetter um ein oder zwei Stunden verschoben, lässt sich die Zeitbasis in der Liste *Importierte Dateien* pro Datei korrigieren.

## Installation (Download)

Fertige Pakete stehen unter *Releases*: `.dmg` für macOS (Apple Silicon und Intel), `.msi`/`.exe` für Windows, `.AppImage`/`.deb` für Linux.

Die Pakete sind nicht signiert, weil Signaturzertifikate Geld kosten. Beim ersten Start fragt das System deshalb nach:

- **macOS:** Rechtsklick auf die App → *Öffnen* → *Öffnen*. Falls macOS meldet, die App sei „beschädigt“: `xattr -dr com.apple.quarantine /Applications/Hygrolog.app`
- **Windows:** SmartScreen → *Weitere Informationen* → *Trotzdem ausführen*

Alternativ läuft dieselbe App auch im Browser, z. B. kostenlos über GitHub Pages (siehe unten).

## Entwicklung

Voraussetzungen: Node.js ≥ 20. Für die Desktop-App zusätzlich Rust ≥ 1.90 (`rustup update stable`) und die [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev          # Web-Version unter http://localhost:5173
npm test             # Unit-Tests (Parser, Feuchte-Umrechnung, Aggregation)
npm run build        # statische Web-Version nach dist/

npm run tauri dev    # Desktop-App im Entwicklungsmodus
npm run tauri build  # Installer für das aktuelle Betriebssystem
```

### Veröffentlichen ohne Hostingkosten

- **Installer:** Ein Tag pushen (`git tag v0.1.0 && git push --tags`). Der Workflow `.github/workflows/release.yml` baut auf GitHub Actions die Pakete für alle drei Betriebssysteme und legt einen Release-Entwurf an.
- **Web-Version:** Unter *Settings → Pages* als Quelle „GitHub Actions“ wählen. Danach veröffentlicht `.github/workflows/pages.yml` jeden Push auf `main`.

### Aufbau

```
src/parser.ts     CSV-Parser für Elitech-Berichte (Kopfbereich + Date,Time,Temperature,Humidity)
src/db.ts         IndexedDB: Messwerte, Importe, Geräte, Wetter-Cache
src/weather.ts    Wetterquellen (Bright Sky, Open-Meteo), Monats-Cache, Ortssuche
src/sun.ts        Sonnenzeiten und Nachtintervalle
src/humidity.ts   Taupunkt / absolute Feuchte (Magnus-Formel)
src/aggregate.ts  Stunden-/Tagesmittel, Lückenerkennung, Statistik
src/chart.ts      Graph (Apache ECharts)
src/i18n.ts       Oberflächentexte (Englisch, Deutsch) und Spracherkennung
src/main.ts       Oberfläche
src-tauri/        Desktop-Hülle (Tauri 2)
```

Weitere Elitech-Modelle (RC-4 Pro, RC-5+, …) schreiben dasselbe CSV-Format und sollten deshalb ebenfalls funktionieren. Über Beispieldateien anderer Modelle freue ich mich.

## TODO: Gerät direkt per USB konfigurieren

Ziel: Hygrolog soll den Logger selbst konfigurieren können (Intervall, Startmodus, Grenzwerte, Zeitzone, Uhrzeit vom Rechner übernehmen), damit die Hersteller-App gar nicht mehr nötig ist. Als Bonus: Messwerte direkt per USB auslesen statt über die CSV-Datei.

**Bisherige Erkenntnisse (aus ElitechLog V8.3.5 / 13.2.4 für macOS, nur lesend analysiert):**

- Die Pro-Modelle melden sich per USB als Laufwerk (PDF/CSV) **und zusätzlich als HID-Gerät**. ElitechLog nutzt dafür [hidapi](https://github.com/libusb/hidapi). Ältere RC-4/RC-5 ohne „Pro“ nutzen dagegen eine serielle Schnittstelle ([elitech-datareader](https://pypi.org/project/elitech-datareader/)), das ist ein anderes Protokoll.
- Paketaufbau (aus `initializePacket:withCmd:withExtCmd:withAddr:withLen:withData:dataLen:`):

  | Byte | Inhalt |
  |---|---|
  | 0–1 | `33 CC` (Kennung) |
  | 2 | `00` |
  | 3 | Paketlänge = Datenlänge + 12 |
  | 4 | Befehl (`cmd`) |
  | 5 | Unterbefehl (`extCmd`) |
  | 6 | `00` |
  | 7–8 | Adresse, big-endian |
  | 9–10 | Länge, big-endian |
  | 11 … | Nutzdaten |
  | letztes | Prüfsumme: Summe aller vorherigen Bytes, 8 Bit |

- Noch unbekannt: die Befehlsnummern (Geräteinfo, Konfiguration lesen/schreiben, Uhrzeit, Daten lesen), die Kodierung der Konfiguration, die Antwortpakete, VID/PID und die HID-Reportgröße.

**Nächster Schritt: Mitschnitt mit echtem Gerät**

1. Das normale ElitechLog beenden.
2. `tools/hidspy/capture.sh` starten. Das Skript erzeugt eine ad-hoc signierte Kopie von ElitechLog mit einem kleinen HID-Protokollierer (das Original bleibt unverändert) und schreibt alle Pakete nach `tools/hidspy/hid.log`.
3. Logger anstecken und warten, bis die Geräteinfos erscheinen.
4. In **Konfigurieren** Werte einstellen und **„Parameter“** klicken. ⚠️ Das löscht die laufende Aufzeichnung auf dem Gerät, deshalb vorher die CSV vom Laufwerk sichern.
5. Optional: Daten auslesen bzw. „Daten neu“, damit auch der Lesebefehl im Mitschnitt landet.
6. App schließen und `hid.log` auswerten.

**Umsetzung danach:**

- Rust-Seite (Tauri) mit dem Crate `hidapi`: Befehle als Tauri-Commands (`device_info`, `read_config`, `write_config`, `sync_time`, ggf. `read_records`)
- UI-Bereich „Gerät“: Live-Infos (Uhrzeit, Batterie, Status, Messwerte) und Konfigurationsformular, mit deutlicher Warnung, dass Speichern die Aufzeichnung löscht
- Optional für die Browser-Version: WebHID (nur Chrome/Edge)
- Linux: udev-Regel für den HID-Zugriff dokumentieren
- Tests mit aufgezeichneten Paketen als Fixtures

## Lizenz

MIT. Elitech ist eine Marke ihres jeweiligen Inhabers. Dieses Projekt ist unabhängig und steht in keiner Verbindung zum Hersteller.
