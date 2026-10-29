# Hygrolog

[English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh-CN.md) · **繁體中文**

一款小巧、免費的 **Elitech RC 溫濕度記錄器**資料檢視工具（已在 RC-4H Pro 上測試）。量測資料以互動式圖表顯示，時間範圍任選，並可與所選地點的**天氣資料**（溫度和濕度）及**日出日落**時間對照。

> **▶ [直接在瀏覽器中試用](https://mgrundkoetter.github.io/hygrolog/)**：不需安裝。資料只儲存在你的瀏覽器中，不會上傳到任何地方。
> 如果喜歡，可以從[最新版本](https://github.com/mgrundkoetter/hygrolog/releases/latest)下載 macOS、Windows 或 Linux 桌面應用程式。

- 匯入記錄器寫入自身 USB 磁碟的 CSV 報告，不需驅動程式或原廠軟體
- 用日期選擇器（從/至）或快速選項（1 天 … 1 年、全部）選擇時間範圍，並可用滑鼠滾輪或滑桿縮放
- 解析度可自動或固定：全部資料、每小時平均、含最小/最大值區間的每日平均
- 濕度可顯示為**相對濕度 (%)**、**絕對濕度 (g/m³)** 或**露點**。例如在地下室，可以據此判斷通風會讓空氣變乾還是變潮
- 圖表中標出夜間，提示框中顯示日出日落時間
- 多台記錄器：側邊欄列出所有裝置（依序號識別），並附有顯示最新讀數的小圖。每台裝置有自己的名稱（預設「裝置 1」、「裝置 2」…）、自己的上傳資料以及自己的地點和天氣來源，因此不同地點的記錄器可以與各自對應的天氣比較
- 同一份記錄重複匯入也沒有問題：重複的資料會自動合併
- 介面支援英文、德文、簡體中文和繁體中文：語言依系統語言自動選擇，也可在設定中變更
- 一切都在本機：量測資料和天氣快取儲存在應用程式中（IndexedDB），只有天氣請求會連上網路

## 天氣資料

| 來源 | 資料 | 涵蓋範圍 |
|---|---|---|
| **DWD（德國氣象局），經 [Bright Sky](https://brightsky.dev/)**（預設） | 最近 DWD 氣象站的逐時觀測資料，例如 Malter 附近約 4 km 的 *Dippoldiswalde-Reinberg* | 德國，自 2010 年起 |
| **[Open-Meteo](https://open-meteo.com/)** | 約 10 km 網格的再分析和模式資料 | 全球，自 1940 年起 |

兩個來源都是開放的，不需 API 金鑰。資料按月快取。一週以前的月份不會再次取得，當月資料最多每 3 小時更新一次。日出日落時間在本機計算（使用 [SunCalc](https://github.com/mourner/suncalc)）。

## 使用方式

1. 用 USB 連接記錄器。它會顯示為一個磁碟（例如 `RC-4HPro`），其中有一個 PDF 檔案和一個 CSV 檔案。
2. 將 **CSV 檔案**拖到應用程式視窗中，或透過**選擇 CSV 檔案**選取。
3. 透過**編輯裝置**為裝置命名，並設定其地點和天氣來源。預設地點為 Malter（薩克森邦 Dippoldiswalde）；新裝置沿用目前顯示裝置的地點。
4. 為某台裝置加入更多資料：**上傳資料**。新的記錄器：**新增裝置**，或直接拖入它的 CSV 檔案。檔案一律歸到其序號對應的裝置下。
5. 在桌面應用程式以及 Chrome 或 Edge 中，**讀取資料**可透過 USB 直接讀取已連接的記錄器，不需 CSV 檔案；**配置記錄器參數**可設定記錄間隔、啟動模式、時區、警報閾值和裝置時間（已在 RC-4H Pro 上測試）。儲存參數會清除記錄器中的記錄，因此 Hygrolog 會先將其匯入。記錄器連接期間，裝置名稱下方會顯示其狀態、目前讀數和裝置時間。

> **時間基準：** CSV 中包含記錄器配置時使用的時區（`Time Base: UTC+00:00`）。如果曲線與天氣相比偏移了一兩個小時，可以在*已匯入的檔案*清單中按檔案更正時間基準。

## 安裝（下載）

*Releases* 中提供現成的安裝檔：macOS 用 `.dmg`（Apple Silicon 和 Intel），Windows 用 `.msi`/`.exe`，Linux 用 `.AppImage`/`.deb`。

安裝檔沒有簽章，因為簽章憑證需要付費。因此作業系統在第一次啟動時會要求確認：

- **macOS：** 先開啟一次應用程式，用*完成*關閉警告。然後前往*系統設定 → 隱私權與安全性*，向下捲動到關於 Hygrolog 的訊息，點選*強制打開*（用密碼確認）。也可以在終端機中執行：`xattr -dr com.apple.quarantine /Applications/Hygrolog.app`
- **Windows：** SmartScreen → *其他資訊* → *仍要執行*
- **Linux：** 若要透過 USB 讀取記錄器（在應用程式或瀏覽器中），需用 udev 規則授予存取權限，例如在 `/etc/udev/rules.d/70-elitech.rules` 中寫入：`SUBSYSTEM=="hidraw", ATTRS{idVendor}=="246c", ATTRS{idProduct}=="9001", TAG+="uaccess"`。然後重新連接記錄器。

同一個應用程式也可以在瀏覽器中執行，不需安裝：[https://mgrundkoetter.github.io/hygrolog/](https://mgrundkoetter.github.io/hygrolog/)

## 開發

需求：Node.js ≥ 20。桌面應用程式另需 Rust ≥ 1.90（`rustup update stable`）以及 [Tauri 先決條件](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run dev          # 網頁版，網址 http://localhost:5173
npm test             # 單元測試（解析器、濕度換算、彙總）
npm run build        # 靜態網頁版輸出到 dist/

npm run tauri dev    # 以開發模式執行桌面應用程式
npm run tauri build  # 為目前作業系統建置安裝檔
```

### 零託管成本發布

- **安裝檔：** 在 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中設定新版本號，然後推送對應的標籤（`git tag v0.1.0 && git push --tags`）。工作流程 `.github/workflows/release.yml` 會在 GitHub Actions 上為三種作業系統建置安裝檔（約 15 分鐘），並以 Release 發布。標籤與版本號不一致時，它會拒絕執行。
- **網頁版：** 在 *Settings → Pages* 中將來源設為「GitHub Actions」。之後 `.github/workflows/pages.yml` 會發布每一次推送到 `main` 的內容。

### 結構

```
src/parser.ts     Elitech 報告的 CSV 解析器（表頭 + Date,Time,Temperature,Humidity）
src/elitech.ts    記錄器的 USB-HID 協定：讀取記錄和配置
src/usb.ts        USB 傳輸：桌面橋接（src-tauri/src/usb.rs）或 WebHID
src/logger.ts     供介面使用的記錄器存取
src/db.ts         IndexedDB：讀數、匯入、裝置、天氣快取
src/weather.ts    天氣來源（Bright Sky、Open-Meteo）、按月快取、地點搜尋
src/sun.ts        日出日落時間和夜間區間
src/humidity.ts   露點 / 絕對濕度（Magnus 公式）
src/aggregate.ts  每小時/每日平均、缺口偵測、統計
src/chart.ts      圖表（Apache ECharts）
src/deviceArt.ts  裝置選擇器中的風格化裝置圖
src/i18n.ts       介面文字（英文、德文、簡體和繁體中文）及語言偵測
src/main.ts       使用者介面
src-tauri/        桌面外殼（Tauri 2）
```

其他 Elitech 型號（RC-4 Pro、RC-5+ …）寫入相同的 CSV 格式，應該同樣可用。非常歡迎提供其他型號的範例檔案。

## USB 存取

Pro 型號透過 USB 顯示為一個磁碟（PDF/CSV），**同時也是一個 HID 裝置**。Hygrolog 透過 HID 讀取量測資料並寫入配置，因此不再需要原廠應用程式 ElitechLog。桌面應用程式透過 `hidapi` 與記錄器通訊；瀏覽器版使用 WebHID，只有 Chrome 和 Edge 支援。第一次使用時，瀏覽器會詢問允許使用哪台裝置。不帶「Pro」的舊款 RC-4/RC-5 使用序列埠介面（[elitech-datareader](https://pypi.org/project/elitech-datareader/)），是另一種協定。

此協定是透過擷取 ElitechLog 與真實 RC-4H Pro 的通訊解析出來的。詳細說明和記錄的封包見 [tools/hidspy/PROTOCOL.md](tools/hidspy/PROTOCOL.md)。更多擷取（例如其他型號）可用 `tools/hidspy/capture.sh` 完成：結束 ElitechLog，執行指令碼，每次儲存只變更一項設定，然後在 `tools/hidspy/hid.log` 中比較寫入內容。⚠️ 儲存配置會清除裝置上的記錄，請先備份 CSV。

尚待解決：

- 檢查負值量測（低於 0 °C 的讀數）的編碼

## 授權條款

MIT。Elitech 是其各自所有者的商標。本專案是獨立專案，與製造商無關。
