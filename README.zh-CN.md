# Hygrolog

[English](README.md) · [Deutsch](README.de.md) · **简体中文** · [繁體中文](README.zh-TW.md)

一款小巧、免费的 **Elitech RC 温湿度记录仪**数据查看工具（已在 RC-4H Pro 上测试）。测量数据以交互式图表显示，时间范围任选，并可与所选地点的**天气数据**（温度和湿度）及**日出日落**时间对照。

> **▶ [直接在浏览器中试用](https://mgrundkoetter.github.io/hygrolog/)**：无需安装。数据只保存在你的浏览器中，不会上传到任何地方。
> 如果喜欢，可以从[最新版本](https://github.com/mgrundkoetter/hygrolog/releases/latest)下载 macOS、Windows 或 Linux 桌面应用。

- 导入记录仪写入自身 USB 磁盘的 CSV 报告，无需驱动程序或厂商软件
- 用日期选择器（从/至）或快捷选项（1 天 … 1 年、全部）选择时间范围，并可用鼠标滚轮或滑块缩放
- 分辨率可自动或固定：全部数据、小时均值、含最小/最大值区间的日均值
- 湿度可显示为**相对湿度 (%)**、**绝对湿度 (g/m³)** 或**露点**。例如在地下室，可以据此判断通风会让空气变干还是变潮
- 图表中标出夜间，提示框中显示日出日落时间
- 多台记录仪：侧边栏列出所有设备（按序列号识别），并配有显示最新读数的小图。每台设备有自己的名称（默认“设备 1”、“设备 2”…）、自己的上传数据以及自己的地点和天气来源，因此不同地点的记录仪可以与各自对应的天气对比
- 同一份记录重复导入也没有问题：重复的数据会自动合并
- 界面支持英语、德语、简体中文和繁体中文：语言按系统语言自动选择，也可在设置中更改
- 一切都在本地：测量数据和天气缓存保存在应用中（IndexedDB），只有天气请求会访问网络

## 天气数据

| 来源 | 数据 | 覆盖范围 |
|---|---|---|
| **DWD（德国气象局），经 [Bright Sky](https://brightsky.dev/)**（默认） | 最近 DWD 气象站的逐小时观测数据，例如 Malter 附近约 4 km 的 *Dippoldiswalde-Reinberg* | 德国，自 2010 年起 |
| **[Open-Meteo](https://open-meteo.com/)** | 约 10 km 网格的再分析和模型数据 | 全球，自 1940 年起 |

两个来源都是开放的，无需 API 密钥。数据按月缓存。一周以前的月份不会再次获取，当月数据最多每 3 小时刷新一次。日出日落时间在本地计算（使用 [SunCalc](https://github.com/mourner/suncalc)）。

## 使用方法

1. 用 USB 连接记录仪。它会显示为一个磁盘（例如 `RC-4HPro`），其中有一个 PDF 文件和一个 CSV 文件。
2. 将 **CSV 文件**拖到应用窗口中，或通过**选择 CSV 文件**选取。
3. 通过**编辑设备**为设备命名，并设置其地点和天气来源。默认地点为 Malter（萨克森州 Dippoldiswalde）；新设备沿用当前显示设备的地点。
4. 为某台设备添加更多数据：**上传数据**。新的记录仪：**添加设备**，或直接拖入它的 CSV 文件。文件总是归到其序列号对应的设备下。
5. 在桌面应用以及 Chrome 或 Edge 中，**读取数据**可通过 USB 直接读取已连接的记录仪，无需 CSV 文件；**配置记录仪参数**可设置记录间隔、启动模式、时区、报警阈值和设备时间（已在 RC-4H Pro 上测试）。保存参数会清空记录仪中的记录，因此 Hygrolog 会先将其导入。记录仪连接期间，设备名称下方会显示其状态、当前读数和设备时间。

> **时间基准：** CSV 中包含记录仪配置时使用的时区（`Time Base: UTC+00:00`）。如果曲线与天气相比偏移了一两个小时，可以在*已导入的文件*列表中按文件更正时间基准。

## 安装（下载）

*Releases* 中提供现成的安装包：macOS 用 `.dmg`（Apple Silicon 和 Intel），Windows 用 `.msi`/`.exe`，Linux 用 `.AppImage`/`.deb`。

安装包没有签名，因为签名证书需要付费。因此操作系统在首次启动时会要求确认：

- **macOS：** 先打开一次应用，用*完成*关闭警告。然后进入*系统设置 → 隐私与安全性*，向下滚动到关于 Hygrolog 的提示，点击*仍要打开*（用密码确认）。也可以在终端中执行：`xattr -dr com.apple.quarantine /Applications/Hygrolog.app`
- **Windows：** SmartScreen → *更多信息* → *仍要运行*
- **Linux：** 要通过 USB 读取记录仪（在应用或浏览器中），需用 udev 规则授予访问权限，例如在 `/etc/udev/rules.d/70-elitech.rules` 中写入：`SUBSYSTEM=="hidraw", ATTRS{idVendor}=="246c", ATTRS{idProduct}=="9001", TAG+="uaccess"`。然后重新连接记录仪。

同一个应用也可以在浏览器中运行，无需安装：[https://mgrundkoetter.github.io/hygrolog/](https://mgrundkoetter.github.io/hygrolog/)

## 开发

要求：Node.js ≥ 20。桌面应用另需 Rust ≥ 1.90（`rustup update stable`）以及 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run dev          # 网页版，地址 http://localhost:5173
npm test             # 单元测试（解析器、湿度换算、聚合）
npm run build        # 静态网页版输出到 dist/

npm run tauri dev    # 以开发模式运行桌面应用
npm run tauri build  # 为当前操作系统构建安装包
```

### 零托管成本发布

- **安装包：** 在 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中设置新版本号，然后推送对应的标签（`git tag v0.1.0 && git push --tags`）。工作流 `.github/workflows/release.yml` 会在 GitHub Actions 上为三种操作系统构建安装包（约 15 分钟），并作为 Release 发布。标签与版本号不一致时，它会拒绝运行。
- **网页版：** 在 *Settings → Pages* 中将来源设为 “GitHub Actions”。之后 `.github/workflows/pages.yml` 会发布每一次推送到 `main` 的内容。

### 结构

```
src/parser.ts     Elitech 报告的 CSV 解析器（表头 + Date,Time,Temperature,Humidity）
src/elitech.ts    记录仪的 USB-HID 协议：读取记录和配置
src/usb.ts        USB 传输：桌面桥接（src-tauri/src/usb.rs）或 WebHID
src/logger.ts     供界面使用的记录仪访问
src/db.ts         IndexedDB：读数、导入、设备、天气缓存
src/weather.ts    天气来源（Bright Sky、Open-Meteo）、按月缓存、地点搜索
src/sun.ts        日出日落时间和夜间区间
src/humidity.ts   露点 / 绝对湿度（Magnus 公式）
src/aggregate.ts  小时/日均值、缺口检测、统计
src/chart.ts      图表（Apache ECharts）
src/deviceArt.ts  设备选择器中的风格化设备图
src/i18n.ts       界面文字（英语、德语、简体和繁体中文）及语言检测
src/main.ts       用户界面
src-tauri/        桌面外壳（Tauri 2）
```

其他 Elitech 型号（RC-4 Pro、RC-5+ …）写入相同的 CSV 格式，应该同样可用。非常欢迎提供其他型号的示例文件。

## USB 访问

Pro 型号通过 USB 显示为一个磁盘（PDF/CSV），**同时也是一个 HID 设备**。Hygrolog 通过 HID 读取测量数据并写入配置，因此不再需要厂商应用 ElitechLog。桌面应用通过 `hidapi` 与记录仪通信；浏览器版使用 WebHID，只有 Chrome 和 Edge 支持。第一次使用时，浏览器会询问允许使用哪台设备。不带 “Pro” 的旧款 RC-4/RC-5 使用串口接口（[elitech-datareader](https://pypi.org/project/elitech-datareader/)），是另一种协议。

该协议是通过抓取 ElitechLog 与真实 RC-4H Pro 的通信解析出来的。详细说明和记录的数据包见 [tools/hidspy/PROTOCOL.md](tools/hidspy/PROTOCOL.md)。更多抓包（例如其他型号）可用 `tools/hidspy/capture.sh` 完成：退出 ElitechLog，运行脚本，每次保存只更改一项设置，然后在 `tools/hidspy/hid.log` 中比较写入内容。⚠️ 保存配置会清空设备上的记录，请先备份 CSV。

尚待解决：

- 检查负值测量（低于 0 °C 的读数）的编码

## 许可证

MIT。Elitech 是其各自所有者的商标。本项目是独立项目，与制造商无关。
