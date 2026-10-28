# Hygrolog

[English](README.md) · **Deutsch**

Eine kleine, freie Auswertungs-App für **Elitech-RC-Temperatur- und Feuchtelogger** (getestet mit dem RC-4H Pro). Die Messwerte erscheinen in einem interaktiven Graphen über beliebige Zeiträume, zusammen mit **Wetterdaten** (Temperatur und Luftfeuchte) und **Sonnenauf-/-untergang** für einen frei wählbaren Ort.

> **▶ [Direkt im Browser ausprobieren](https://mgrundkoetter.github.io/hygrolog/)**: ohne Installation. Deine Daten bleiben in deinem Browser und werden nirgendwohin hochgeladen.
> Gefällt sie dir, gibt es die Desktop-App für macOS, Windows und Linux im [aktuellen Release](https://github.com/mgrundkoetter/hygrolog/releases/latest).

- Import der CSV-Berichte, die der Logger selbst auf sein USB-Laufwerk schreibt. Treiber oder Hersteller-Software sind nicht nötig.
- Zeitraum per Datepicker (von/bis) oder per Schnellwahl (1 T … 1 J, Alles), dazu Zoom mit Mausrad bzw. Schieber
- Auflösung automatisch oder fest: alle Messwerte, Stundenmittel, Tagesmittel mit Min/Max-Band
- Feuchte wahlweise **relativ (%)**, **absolut (g/m³)** oder als **Taupunkt**. So lässt sich z. B. für den Keller ablesen, ob Lüften die Luft trockener oder feuchter macht.
- Nächte werden im Graphen schattiert, Sonnenzeiten stehen im Tooltip
- Mehrere Logger: Eine Seitenleiste listet alle Geräte (erkannt an der Seriennummer) mit einem kleinen Bild, das den letzten Messwert zeigt. Jedes Gerät hat einen eigenen Titel (Standard „Gerät 1“, „Gerät 2“, …), eigene Uploads sowie eigenen Standort und eigene Wetterquelle. So werden Logger an verschiedenen Orten mit dem passenden Wetter verglichen
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
3. Über **Gerät bearbeiten** einen Titel vergeben sowie Standort und Wetterquelle einstellen. Voreingestellt ist Malter (Dippoldiswalde); neue Geräte übernehmen den Standort des gerade angezeigten Geräts.
4. Weitere Daten für ein Gerät: **Daten hochladen**. Ein neuer Logger: **Gerät hinzufügen** oder einfach seine CSV-Datei ins Fenster ziehen. Dateien landen immer bei dem Gerät, zu dem ihre Seriennummer gehört.
5. In der Desktop-App liest **Vom Logger lesen** einen angeschlossenen Logger direkt per USB aus, ohne CSV-Datei. **Logger konfigurieren** stellt Intervall, Startmodus, Zeitzone, Alarmgrenzen und die Uhr ein (getestet mit dem RC-4H Pro). Speichern löscht die Aufzeichnung auf dem Logger, deshalb importiert Hygrolog sie vorher.

> **Zeitbasis:** Die CSV enthält die Zeitzone, mit der der Logger konfiguriert wurde (`Time Base: UTC+00:00`). Wirken die Kurven gegenüber dem Wetter um ein oder zwei Stunden verschoben, lässt sich die Zeitbasis in der Liste *Importierte Dateien* pro Datei korrigieren.

## Installation (Download)

Fertige Pakete stehen unter *Releases*: `.dmg` für macOS (Apple Silicon und Intel), `.msi`/`.exe` für Windows, `.AppImage`/`.deb` für Linux.

Die Pakete sind nicht signiert, weil Signaturzertifikate Geld kosten. Beim ersten Start fragt das System deshalb nach:

- **macOS:** App einmal öffnen und die Warnung mit *Fertig* schließen. Dann *Systemeinstellungen → Datenschutz & Sicherheit* öffnen, nach unten zum Hinweis zu Hygrolog scrollen und *Dennoch öffnen* klicken (mit Passwort bestätigen). Alternativ im Terminal: `xattr -dr com.apple.quarantine /Applications/Hygrolog.app`
- **Windows:** SmartScreen → *Weitere Informationen* → *Trotzdem ausführen*
- **Linux:** Damit die App Logger per USB auslesen darf, braucht es eine udev-Regel, z. B. in `/etc/udev/rules.d/70-elitech.rules`: `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="246c", ATTRS{idProduct}=="9001", TAG+="uaccess"`. Danach den Logger neu anstecken.

Alternativ läuft dieselbe App ohne Installation im Browser: [https://mgrundkoetter.github.io/hygrolog/](https://mgrundkoetter.github.io/hygrolog/)

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

- **Installer:** Neue Version in `package.json`, `src-tauri/tauri.conf.json` und `src-tauri/Cargo.toml` eintragen, dann ein passendes Tag pushen (`git tag v0.1.0 && git push --tags`). Der Workflow `.github/workflows/release.yml` baut auf GitHub Actions die Pakete für alle drei Betriebssysteme (ca. 15 Minuten) und veröffentlicht sie als Release. Weichen Tag und Version voneinander ab, bricht er ab.
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
src/deviceArt.ts  stilisierte Gerätebilder für die Geräteauswahl
src/i18n.ts       Oberflächentexte (Englisch, Deutsch) und Spracherkennung
src/main.ts       Oberfläche
src-tauri/        Desktop-Hülle (Tauri 2)
```

Weitere Elitech-Modelle (RC-4 Pro, RC-5+, …) schreiben dasselbe CSV-Format und sollten deshalb ebenfalls funktionieren. Über Beispieldateien anderer Modelle freue ich mich.

## USB-Zugriff

Die Pro-Modelle melden sich per USB als Laufwerk (PDF/CSV) **und zusätzlich als HID-Gerät**. Über HID liest die Desktop-App Messwerte aus und schreibt die Konfiguration, die Hersteller-App ElitechLog ist damit nicht mehr nötig. Ältere RC-4/RC-5 ohne „Pro“ nutzen dagegen eine serielle Schnittstelle ([elitech-datareader](https://pypi.org/project/elitech-datareader/)), das ist ein anderes Protokoll.

Das Protokoll wurde aus Mitschnitten von ElitechLog mit einem echten RC-4H Pro entschlüsselt. Details und aufgezeichnete Pakete stehen in [tools/hidspy/PROTOCOL.md](tools/hidspy/PROTOCOL.md) (englisch). Weitere Mitschnitte (z. B. von anderen Modellen) entstehen mit `tools/hidspy/capture.sh`: ElitechLog beenden, Skript starten, pro Speichern genau eine Einstellung ändern und die Schreibvorgänge in `tools/hidspy/hid.log` vergleichen. ⚠️ Speichern löscht die laufende Aufzeichnung auf dem Gerät, deshalb vorher die CSV vom Laufwerk sichern.

Noch offen:

- Kodierung negativer Messwerte prüfen (ein Messwert unter 0 °C)
- Live-Infos vom Logger (Status, aktueller Messwert) in der Oberfläche
- Optional für die Browser-Version: WebHID (nur Chrome/Edge)

## Lizenz

MIT. Elitech ist eine Marke ihres jeweiligen Inhabers. Dieses Projekt ist unabhängig und steht in keiner Verbindung zum Hersteller.
