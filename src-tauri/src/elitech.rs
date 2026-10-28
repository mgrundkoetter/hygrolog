// Reads Elitech RC "Pro" loggers over USB-HID. The protocol is documented in tools/hidspy/PROTOCOL.md.

use serde::Serialize;
use std::fmt;
use std::time::Duration;

pub const VENDOR_ID: u16 = 0x246c;
pub const PRODUCT_ID: u16 = 0x9001;

const CMD_READ_POINTS: u8 = 0x01;
const CMD_READ_PARAMS: u8 = 0x03;
const CMD_READ_STATS: u8 = 0x05;

const PARAMS_LEN: u16 = 352;
const PARAMS_CHUNK: u16 = 50;
const STATS_CHUNK: u16 = 48;
const POINTS_PER_READ: u16 = 12;

const TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug)]
pub enum Error {
  NotFound,
  Usb(String),
  Protocol(String),
}

impl fmt::Display for Error {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      // Stable code the frontend translates.
      Error::NotFound => f.write_str("not-found"),
      Error::Usb(m) => write!(f, "USB: {m}"),
      Error::Protocol(m) => write!(f, "protocol: {m}"),
    }
  }
}

impl From<hidapi::HidError> for Error {
  fn from(e: hidapi::HidError) -> Self {
    Error::Usb(e.to_string())
  }
}

/// Same shape as `ParsedReport` from the CSV parser, so both feed the same import.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
  pub serial: String,
  pub model: String,
  pub trip_id: String,
  pub interval: String,
  /// Minutes east of UTC.
  pub tz_offset_min: i32,
  pub has_humidity: bool,
  pub rows: Vec<Row>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Row {
  /// Wall-clock time of the logger, encoded as if it were UTC (epoch ms).
  pub local: i64,
  pub temp: Option<f64>,
  pub hum: Option<f64>,
}

/// Sends one request packet and returns the raw response.
pub trait Transport {
  fn exchange(&mut self, request: &[u8]) -> Result<Vec<u8>, Error>;
}

// ---------- packets ----------

fn checksum(bytes: &[u8]) -> u8 {
  bytes.iter().fold(0u8, |sum, b| sum.wrapping_add(*b))
}

fn request(cmd: u8, addr: u16, len: u16) -> Vec<u8> {
  let [a1, a0] = addr.to_be_bytes();
  let [l1, l0] = len.to_be_bytes();
  let mut p = vec![0x33, 0xcc, 0x00, 12, cmd, 0x00, 0x00, a1, a0, l1, l0];
  p.push(checksum(&p));
  p
}

/// Sends a read request and returns the validated payload.
fn call(t: &mut impl Transport, cmd: u8, addr: u16, len: u16) -> Result<Vec<u8>, Error> {
  let req = request(cmd, addr, len);
  let resp = t.exchange(&req)?;
  let bad = |what: &str| Error::Protocol(format!("{what} (cmd {cmd:02x}, address {addr})"));

  if resp.len() < 12 || resp[..2] != [0x33, 0xcc] {
    return Err(bad("malformed response"));
  }
  let end = resp[3] as usize;
  if end < 12 || end > resp.len() || checksum(&resp[..end - 1]) != resp[end - 1] {
    return Err(bad("bad length or checksum"));
  }
  if resp[4] != cmd || resp[7..9] != req[7..9] {
    return Err(bad("device rejected the request"));
  }
  Ok(resp[11..end - 1].to_vec())
}

// ---------- values ----------

fn be16(b: &[u8]) -> u16 {
  u16::from_be_bytes([b[0], b[1]])
}

fn ascii(b: &[u8]) -> String {
  b.iter().take_while(|&&c| c != 0).map(|&c| c as char).collect::<String>().trim().to_string()
}

/// Temperature in tenths of a degree. Alarm limits store the sign in bit 15; measurements are assumed
/// to do the same, but a two's-complement value is recognized too: its magnitude bits would be far
/// outside the sensor range.
fn temperature(v: u16) -> Option<f64> {
  if v == 0xffff {
    return None;
  }
  let tenths = match v & 0x7fff {
    m if v & 0x8000 == 0 => m as i32,
    m if m <= 1000 => -(m as i32),
    _ => v as i16 as i32,
  };
  Some(tenths as f64 / 10.0)
}

fn humidity(v: u16) -> Option<f64> {
  (v != 0xffff).then(|| v as f64 / 10.0)
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
  let y = if m <= 2 { y - 1 } else { y };
  let era = y.div_euclid(400);
  let yoe = y - era * 400;
  let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
  let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  era * 146_097 + doe - 719_468
}

/// Logger time stamp (year − 2000, month, weekday, day, hour, minute, second) as wall-clock epoch ms.
fn timestamp(b: &[u8]) -> Option<i64> {
  let [y, mo, _weekday, d, h, mi, s] = <[u8; 7]>::try_from(b).ok()?;
  if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 59 {
    return None;
  }
  let days = days_from_civil(2000 + y as i64, mo as i64, d as i64);
  Some(((days * 24 + h as i64) * 60 + mi as i64) * 60_000 + s as i64 * 1000)
}

/// Same style as the CSV's "Log Interval": "10s", "15m", "1h 30m".
fn duration_label(secs: u32) -> String {
  let parts = [(secs / 3600, "h"), (secs / 60 % 60, "m"), (secs % 60, "s")];
  let label: Vec<String> = parts.iter().filter(|(n, _)| *n > 0).map(|(n, u)| format!("{n}{u}")).collect();
  if label.is_empty() { "0s".into() } else { label.join(" ") }
}

// ---------- reading ----------

pub fn read_report(t: &mut impl Transport) -> Result<Report, Error> {
  let mut params = Vec::with_capacity(PARAMS_LEN as usize);
  while params.len() < PARAMS_LEN as usize {
    let chunk = call(t, CMD_READ_PARAMS, params.len() as u16, PARAMS_CHUNK)?;
    if chunk.is_empty() {
      break;
    }
    params.extend(chunk);
  }
  if params.len() < PARAMS_LEN as usize {
    return Err(Error::Protocol(format!("parameter block has only {} bytes", params.len())));
  }

  // The time-zone byte holds whole hours modulo 24.
  let tz_hours = params[36] as i32;
  let tz_hours = if tz_hours > 12 { tz_hours - 24 } else { tz_hours };
  let interval_ms = be16(&params[76..78]) as i64 * 10_000;
  let count = be16(&params[72..74]);

  let mut rows = Vec::with_capacity(count as usize);
  if count > 0 {
    let stats = call(t, CMD_READ_STATS, 0, STATS_CHUNK)?;
    let start = stats
      .get(8..15)
      .and_then(timestamp)
      .ok_or_else(|| Error::Protocol("invalid start time".into()))?;
    let mut index = 0;
    while index < count {
      let chunk = call(t, CMD_READ_POINTS, index, POINTS_PER_READ)?;
      for point in chunk.chunks_exact(4).take((count - index) as usize) {
        rows.push(Row {
          local: start + rows.len() as i64 * interval_ms,
          temp: temperature(be16(&point[0..2])),
          hum: humidity(be16(&point[2..4])),
        });
      }
      index += POINTS_PER_READ;
    }
  }

  Ok(Report {
    serial: ascii(&params[2..14]),
    model: "RC-4HPro".into(),
    trip_id: ascii(&params[16..23]),
    interval: duration_label(interval_ms as u32 / 1000),
    tz_offset_min: tz_hours * 60,
    has_humidity: true,
    rows,
  })
}

// ---------- USB ----------

struct Hid(hidapi::HidDevice);

impl Transport for Hid {
  fn exchange(&mut self, request: &[u8]) -> Result<Vec<u8>, Error> {
    let mut buf = [0u8; 64];
    while self.0.read_timeout(&mut buf, 0)? > 0 {}

    // Leading 0: the device uses no report IDs, so hidapi strips it and sends the 64-byte report.
    let mut out = [0u8; 65];
    out[1..=request.len()].copy_from_slice(request);
    self.0.write(&out)?;

    match self.0.read_timeout(&mut buf, TIMEOUT.as_millis() as i32)? {
      0 => Err(Error::Usb("no response".into())),
      n => Ok(buf[..n].to_vec()),
    }
  }
}

/// Reads every connected logger.
pub fn read_connected() -> Result<Vec<Report>, Error> {
  let api = hidapi::HidApi::new()?;
  let mut paths: Vec<_> = api
    .device_list()
    .filter(|d| d.vendor_id() == VENDOR_ID && d.product_id() == PRODUCT_ID)
    .map(|d| d.path().to_owned())
    .collect();
  paths.dedup();
  if paths.is_empty() {
    return Err(Error::NotFound);
  }
  paths.iter().map(|p| read_report(&mut Hid(api.open_path(p)?))).collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::HashMap;

  const ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");

  /// Answers requests with the responses ElitechLog got in a capture.
  struct Replay(HashMap<Vec<u8>, Vec<u8>>);

  impl Replay {
    fn load(fixture: &str) -> Self {
      let text = std::fs::read_to_string(format!("{ROOT}/tools/hidspy/fixtures/{fixture}")).unwrap();
      let mut map = HashMap::new();
      let mut pending: Option<Vec<u8>> = None;
      for line in text.lines().filter(|l| !l.starts_with('#') && l.contains(" : ")) {
        let (head, hex) = line.split_once(" : ").unwrap();
        let bytes: Vec<u8> = hex.split_whitespace().map(|h| u8::from_str_radix(h, 16).unwrap()).collect();
        if head.contains(" OUT ") {
          pending = Some(bytes);
        } else if head.contains(" IN ") {
          if let Some(req) = pending.take() {
            map.insert(req, bytes);
          }
        }
      }
      Replay(map)
    }
  }

  impl Transport for Replay {
    fn exchange(&mut self, request: &[u8]) -> Result<Vec<u8>, Error> {
      self.0.get(request).cloned().ok_or_else(|| Error::Usb(format!("not in capture: {request:02x?}")))
    }
  }

  #[test]
  fn reads_the_captured_recording() {
    let report = read_report(&mut Replay::load("read-recording.log")).unwrap();
    assert_eq!(report.serial, "EFX266100504");
    assert_eq!(report.trip_id, "0000001");
    assert_eq!(report.interval, "10s");
    assert_eq!(report.tz_offset_min, 60);
    assert_eq!(report.rows.len(), 43);
    // 2026-10-28 21:10:24 wall-clock
    assert_eq!(report.rows[0].local, 1_793_221_824_000);
    assert_eq!(report.rows[42].local - report.rows[0].local, 42 * 10_000);
  }

  #[test]
  fn matches_the_csv_of_the_same_recording() {
    let report = read_report(&mut Replay::load("read-recording.log")).unwrap();
    let csv = std::fs::read_to_string(format!("{ROOT}/samples/EFX266100504-0000001.csv")).unwrap();
    let rows: Vec<(String, f64, f64)> = csv
      .lines()
      .filter(|l| l.starts_with("2026/"))
      .map(|l| {
        let f: Vec<&str> = l.split(',').collect();
        (f[1].to_string(), f[2].trim().parse().unwrap(), f[3].trim().parse().unwrap())
      })
      .collect();
    assert_eq!(rows.len(), 42);
    for (row, (time, temp, hum)) in report.rows.iter().zip(&rows) {
      let secs = row.local / 1000 % 86_400;
      assert_eq!(&format!("{:02}:{:02}:{:02}", secs / 3600, secs / 60 % 60, secs % 60), time);
      assert_eq!((row.temp, row.hum), (Some(*temp), Some(*hum)));
    }
  }

  #[test]
  fn decodes_temperatures() {
    assert_eq!(temperature(0x00dc), Some(22.0));
    assert_eq!(temperature(0x80c8), Some(-20.0));
    assert_eq!(temperature(0xff38), Some(-20.0));
    assert_eq!(temperature(0xffff), None);
  }

  #[test]
  fn formats_intervals() {
    assert_eq!(duration_label(10), "10s");
    assert_eq!(duration_label(900), "15m");
    assert_eq!(duration_label(5400), "1h 30m");
  }

  /// Reads a real logger; run with `cargo test -- --ignored` while one is connected.
  #[test]
  #[ignore]
  fn reads_a_connected_logger() {
    for r in read_connected().unwrap() {
      println!("{} trip {} every {} UTC{:+}h: {} points", r.serial, r.trip_id, r.interval, r.tz_offset_min / 60, r.rows.len());
      println!("first {:?}\nlast  {:?}", r.rows.first(), r.rows.last());
    }
  }
}
