# Elitech RC-4H Pro USB-HID protocol

Reverse-engineered from ElitechLog for macOS (V8.3.5 / 13.2.4) talking to an RC-4H Pro with firmware V1.4 (serial EFX266100504). All captures are in `fixtures/`; offsets are decimal unless written as `0x…`.

## Transport

- USB HID, VID `0x246c`, PID `0x9001`, 64-byte input and output reports. The logger also mounts as a USB drive with the CSV/PDF report.
- ElitechLog sends each request with `IOHIDDeviceSetReport` as an output report: 12 bytes for requests without payload, 64 bytes for writes. The first packet byte `0x33` doubles as the report ID, so with hidapi the packet can be written as is.
- Responses arrive as 64-byte input reports, padded with zeros after the checksum.
- ElitechLog waits about 150 ms between `05` requests; `03` and `01` requests go back to back. The `c0` commit takes 0.8–1.3 s to answer.

## Packet format

Requests and responses share one layout.

| Byte | Content |
|---|---|
| 0–1 | `33 cc` |
| 2 | `00` |
| 3 | packet length = payload length + 12 |
| 4 | command |
| 5 | sub-command |
| 6 | `00` |
| 7–8 | address, big-endian |
| 9–10 | length, big-endian |
| 11 … | payload |
| last | checksum: sum of all previous bytes, low 8 bits |

In a read request the length field says how much to read and the payload is empty. In a read response the length field says how much was returned.

## Commands

| cmd/sub | Purpose | Address | Length | Response |
|---|---|---|---|---|
| `03/00` | read parameter block | byte offset | up to 50 | data; length 0 at the end (offset 352) |
| `04/00` | write parameter block | byte offset | 50 per chunk | payload `01` |
| `05/00` | read statistics area | byte offset | 48 (ElitechLog asks for 32 at offset 96) | data |
| `01/00` | read measurements | point index | number of points (ElitechLog: 12) | 4 bytes per point |
| `c0/02` | commit configuration and reset the recording | 0 | 1, payload `02` | payload `01` |

An address beyond the end of the `05` area (368 and up) returns a packet with command `03`, length 1 and payload `e3`. ElitechLog then retries with address+1 three times before it gives up.

## Values

- **Time stamps** take 7 bytes: year − 2000, month, weekday, day, hour, minute, second, all binary. ElitechLog counts weekdays from Sunday = 1. The factory setting used Monday = 1, so the device probably ignores the weekday.
- **Temperatures** are 16-bit big-endian tenths of a degree Celsius. Limits use sign-magnitude, with bit 15 as the sign: `812c` = −30.0, `80c8` = −20.0. Negative measurements are not yet captured.
- **Humidity** is 16-bit big-endian tenths of a percent.
- **Durations** (interval, start delay, alarm delay) are 16-bit big-endian multiples of 10 s.
- **Unused alarm zones** hold `0fa0` (+400.0) or `8fa0` (−400.0).

## Parameter block

352 bytes, read with `03` and written with `04` in 50-byte chunks.

| Offset | Field | Notes |
|---|---|---|
| 0 | `00` | |
| 1 | `0x45` ('E') | unknown, constant |
| 2–13 | serial number, ASCII | `EFX266100504` |
| 16–22 | trip code, ASCII | `0000001` |
| 29 | PDF language | 0 English, 1 Chinese |
| 30 | bit 7: cyclic logging | |
| 31 | firmware version | `0x14` = V1.4; read-only, ElitechLog writes `00` |
| 32 | flags | bits 0–1 start mode (1 button, 0 immediate, 2 timed); bit 3 stop by button; bit 4 unknown, always set; bit 7 pause |
| 33 | flags | bit 3 °F; bits 5–6 unknown (`0x60` after any ElitechLog write, `0x50` from the factory) |
| 34 | alarm type per zone | bit set = cumulative; bit 2 is H1, other zones presumably follow the table order below |
| 35 | unknown | `00` or `02`, see open questions |
| 36 | time zone | whole hours, modulo 24: UTC+1 = 1, UTC+5:30 = 5, UTC−3 = 21 |
| 37 | status, read-only | `04` waiting for start, `07` recording |
| 38 | display time / status | high nibble display time (1 = 15 s, 2 = 30 s); low nibble status, `8` idle, `b` recording |
| 39 | unknown | reads `c4` or `04`, see open questions |
| 40–46 | configuration time | the device clock is set from this on commit |
| 48–54 | timed start time | ElitechLog fills it with the dialog's open time in other start modes |
| 56–63 | ElitechLog garbage | kept by the device |
| 64–65 | start delay | × 10 s |
| 68 | unknown | `0xfa`, constant |
| 70–71 | unknown | device resets it to 0 |
| 72–73 | number of points | device-maintained, reset on commit |
| 76–77 | logging interval | × 10 s |
| 80–89 | temperature limits | H3, H2, H1, L1, L2, two bytes each; the RC-4H Pro offers only H1 and L1 |
| 90–91 | ElitechLog garbage | device resets it to 0 |
| 93 | ElitechLog garbage | kept by the device |
| 96–111 | alarm delays | × 10 s; H1 at 100–101 confirmed, the others presumably follow the limit order |
| 112–113 | humidity high limit | |
| 114–115 | humidity low limit | |
| 117 | key tone | 0 off, 1 on |
| 124 | audible alarm | number of beeps: 0 off, 3, 10 |
| 126–127 | live humidity | read-only |
| 134–135 | live temperature | read-only |
| 136–142 | device clock | read-only, live |
| 151 | unknown | `01` from the factory, `00` after the first ElitechLog write |
| 152–251 | trip description, ASCII | NUL-padded, up to 100 characters |
| 253–261 | mode code, ASCII | `TLCFFA089` |
| 341 | daylight-saving marker | see open questions |

ElitechLog writes uninitialised memory into 128–132, 136–148 and 344–348 as well. Some of it, such as the macOS heap pointers in 128–132 and 344–348, survives on the device.

## Statistics area

368 bytes, read with `05`. It holds what the CSV prints as *Logging Summary* and what the measurement read needs for its time stamps.

| Offset | Field |
|---|---|
| 0 | `01` once points exist, `00` before |
| 8–14 | start time of the recording |
| 138 | number of points |
| 144–145, 152–153, 160–161 | temperature max, min, average |
| 176–177, 184–185, 192–193 | humidity max, min, average |
| 265–266, 345–346 | probably seconds within limits for temperature and humidity, little-endian (`a4 01` = 420 s) |

Before the first point, the max/min/average fields hold `0fa0`.

## Measurements

`01` reads points by index. Each point is temperature then humidity, 2 bytes each. Free slots read as `ff ff ff ff`. The time of point *i* is the start time from the statistics area plus *i* × interval; the device sends no time stamps.

ElitechLog reads 12 points per request from index 0 until the count from parameter block 72–73 is covered; the last chunk ends in `ff` padding.

## Writing a configuration

1. Read the whole parameter block.
2. Change the known fields and leave unknown bytes as they were read.
3. Set 40–46 to the current time in the target time zone. The clock runs in that zone's local time, including half-hour offsets the time-zone byte cannot hold.
4. Write the block in 50-byte chunks from offset 0; each chunk is acknowledged with `01`.
5. Send `c0/02` with payload `02`. It erases the recording on the device, so read the measurements first.

ElitechLog applies two rules that Hygrolog should copy or deliberately drop:

- It turns pause off whenever cyclic logging or the audible alarm is switched on, and resets H1's alarm type and delay when its limit is edited.
- Its *daylight saving time* option only subtracts one hour from the time it writes, whatever the date. Hygrolog should not offer it, and should write standard time with byte 341 set to `01`.

## Open questions

- How negative temperatures are encoded in measurements. They will probably use sign-magnitude like the limits.
- Bytes 35, 39 and 341 change together with ElitechLog's dialog state. A fresh dialog writes `00`/`c1`/`00`, and after changing the start mode it writes `02`/`00`/`01`. The device accepts both sets.
- Bits 4 of byte 32, 5–6 of byte 33, and bytes 1 and 68. They never changed with any setting.
- Alarm type bits and delays for zones other than H1, and the humidity alarm delays.

## Fixtures

- `fixtures/read-recording.log` holds a full connect sequence while recording: parameter block, statistics area and 43 points. The first 42 match `samples/EFX266100504-0000001.csv`.
- `fixtures/config-writes.log` holds all 27 configuration writes with their commits, each headed by a comment naming the setting it changed.

Both use the line format of `hid.log`. Lines starting with `#` are comments.

## Capturing

`capture.sh` builds the interposer in `hidspy.c`, makes an ad-hoc signed copy of ElitechLog (the original stays untouched) and appends every HID report to `hid.log`. Quit the regular ElitechLog first. To isolate a field, change one setting per save and diff consecutive writes.
