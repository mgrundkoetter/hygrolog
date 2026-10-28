// Logger configuration: decoding and encoding the parameter block. Offsets are listed in
// tools/hidspy/PROTOCOL.md; bytes this module doesn't know are written back as they were read.

use super::*;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

const PDF_LANGUAGE: usize = 29;
const FLAGS_A: usize = 30;
const FLAGS_B: usize = 32;
const FLAGS_C: usize = 33;
const START_STATE: usize = 35;
const TIME_ZONE: usize = 36;
const STATUS: usize = 37;
const DISPLAY: usize = 38;
const START_FLAGS: usize = 39;
const CONFIGURED_AT: usize = 40;
const START_AT: usize = 48;
const START_DELAY: usize = 64;
const INTERVAL: usize = 76;
const TEMP_HIGH: usize = 84;
const TEMP_LOW: usize = 86;
const HUM_HIGH: usize = 112;
const HUM_LOW: usize = 114;
const KEY_TONE: usize = 117;
const ALARM_BEEPS: usize = 124;
const TRIP_ID: std::ops::Range<usize> = 16..23;
const DESCRIPTION: std::ops::Range<usize> = 152..252;

/// Unused limits hold ±400.0.
const LIMIT_OFF: u16 = 0x0fa0;
const SIGN: u16 = 0x8000;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StartMode {
  Button,
  Immediate,
  Timed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
  pub interval_secs: u32,
  pub start_mode: StartMode,
  /// Timed start, as wall-clock epoch ms in the logger's time zone.
  pub start_at: i64,
  pub start_delay_secs: u32,
  pub stop_by_button: bool,
  pub pause: bool,
  pub cyclic: bool,
  pub key_tone: bool,
  /// Beeps per alarm: 0 (off), 3 or 10.
  pub alarm_beeps: u8,
  /// 1 = 15 s, 2 = 30 s; other codes are kept as read.
  pub display_time: u8,
  pub fahrenheit: bool,
  /// Language of the PDF report: English or Chinese.
  pub pdf_chinese: bool,
  /// Minutes east of UTC; the logger stores whole hours.
  pub tz_offset_min: i32,
  /// `None` switches the limit off.
  pub temp_high: Option<f64>,
  pub temp_low: Option<f64>,
  pub hum_high: f64,
  pub hum_low: f64,
  pub trip_id: String,
  pub description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggerConfig {
  pub serial: String,
  pub model: String,
  pub config: Config,
}

// ---------- values ----------

fn bit(byte: u8, n: u8) -> bool {
  byte & (1 << n) != 0
}

fn set_bit(byte: &mut u8, n: u8, on: bool) {
  if on { *byte |= 1 << n } else { *byte &= !(1 << n) }
}

fn put16(params: &mut [u8], at: usize, v: u16) {
  params[at..at + 2].copy_from_slice(&v.to_be_bytes());
}

/// Alarm limit in tenths with the sign in bit 15.
fn decode_limit(v: u16) -> Option<f64> {
  let tenths = (v & !SIGN) as f64;
  (v & !SIGN != LIMIT_OFF).then(|| if v & SIGN != 0 { -tenths } else { tenths } / 10.0)
}

fn encode_limit(v: Option<f64>, off: u16) -> u16 {
  match v {
    None => off,
    Some(x) => {
      let tenths = (x * 10.0).round();
      tenths.abs() as u16 | if tenths < 0.0 { SIGN } else { 0 }
    }
  }
}

fn put_ascii(params: &mut [u8], range: std::ops::Range<usize>, text: &str) {
  params[range.clone()].fill(0);
  params[range.start..range.start + text.len()].copy_from_slice(text.as_bytes());
}

// ---------- decode / encode ----------

pub fn decode(params: &[u8]) -> Config {
  let tz_hours = params[TIME_ZONE] as i32;
  let flags = params[FLAGS_B];
  Config {
    interval_secs: be16(&params[INTERVAL..]) as u32 * 10,
    start_mode: match flags & 0b11 {
      1 => StartMode::Button,
      2 => StartMode::Timed,
      _ => StartMode::Immediate,
    },
    start_at: timestamp(&params[START_AT..START_AT + 7]).unwrap_or(0),
    start_delay_secs: be16(&params[START_DELAY..]) as u32 * 10,
    stop_by_button: bit(flags, 3),
    pause: bit(flags, 7),
    cyclic: bit(params[FLAGS_A], 7),
    key_tone: params[KEY_TONE] != 0,
    alarm_beeps: params[ALARM_BEEPS],
    display_time: params[DISPLAY] >> 4,
    fahrenheit: bit(params[FLAGS_C], 3),
    pdf_chinese: params[PDF_LANGUAGE] == 1,
    tz_offset_min: if tz_hours > 12 { tz_hours - 24 } else { tz_hours } * 60,
    temp_high: decode_limit(be16(&params[TEMP_HIGH..])),
    temp_low: decode_limit(be16(&params[TEMP_LOW..])),
    hum_high: be16(&params[HUM_HIGH..]) as f64 / 10.0,
    hum_low: be16(&params[HUM_LOW..]) as f64 / 10.0,
    trip_id: ascii(&params[TRIP_ID]),
    description: ascii(&params[DESCRIPTION]),
  }
}

fn validate(c: &Config) -> Result<(), Error> {
  let fail = |m: &str| Err(Error::Invalid(m.into()));
  let duration_ok = |s: u32| s % 10 == 0 && s / 10 <= u16::MAX as u32;
  if c.interval_secs < 10 || !duration_ok(c.interval_secs) {
    return fail("The interval must be a multiple of 10 s.");
  }
  if !duration_ok(c.start_delay_secs) {
    return fail("The start delay must be a multiple of 10 s.");
  }
  if ![0, 3, 10].contains(&c.alarm_beeps) {
    return fail("The audible alarm beeps 0, 3 or 10 times.");
  }
  if c.tz_offset_min % 60 != 0 || c.tz_offset_min.abs() > 12 * 60 {
    return fail("The logger only supports whole-hour time zones from UTC−12 to UTC+12.");
  }
  let temps = [c.temp_high, c.temp_low];
  if temps.iter().flatten().any(|t| !(-40.0..=85.0).contains(t)) {
    return fail("Temperature limits must lie between −40 and 85 °C.");
  }
  if matches!(temps, [Some(high), Some(low)] if low >= high) {
    return fail("The low temperature limit must be below the high one.");
  }
  if !(0.0..=100.0).contains(&c.hum_low) || !(0.0..=100.0).contains(&c.hum_high) || c.hum_low >= c.hum_high {
    return fail("Humidity limits must lie between 0 and 100 %, the low one below the high one.");
  }
  if c.trip_id.is_empty() || c.trip_id.len() > TRIP_ID.len() || !c.trip_id.bytes().all(|b| b.is_ascii_alphanumeric()) {
    return fail("The trip code takes 1 to 7 letters or digits.");
  }
  if c.description.len() > DESCRIPTION.len() || !c.description.bytes().all(|b| (0x20..0x7f).contains(&b)) {
    return fail("The description takes up to 100 characters without umlauts or special letters.");
  }
  Ok(())
}

/// Writes `c` into a parameter block read from the logger. `now` is the current wall-clock time in the
/// configured time zone; the logger sets its clock from it.
pub fn apply(c: &Config, params: &mut [u8], now: i64) -> Result<(), Error> {
  validate(c)?;

  let flags = &mut params[FLAGS_B];
  *flags = *flags & !0b11
    | match c.start_mode {
      StartMode::Button => 1,
      StartMode::Immediate => 0,
      StartMode::Timed => 2,
    };
  set_bit(flags, 3, c.stop_by_button);
  set_bit(flags, 7, c.pause);
  set_bit(&mut params[FLAGS_A], 7, c.cyclic);
  set_bit(&mut params[FLAGS_C], 3, c.fahrenheit);

  // ElitechLog's values for these two bytes; their meaning is unknown.
  (params[START_STATE], params[START_FLAGS]) = if c.start_mode == StartMode::Button { (0x00, 0xc1) } else { (0x02, 0x00) };
  params[STATUS] = 0;
  params[DISPLAY] = c.display_time << 4 | 0x08;

  params[PDF_LANGUAGE] = c.pdf_chinese as u8;
  params[TIME_ZONE] = (c.tz_offset_min / 60).rem_euclid(24) as u8;
  params[CONFIGURED_AT..CONFIGURED_AT + 7].copy_from_slice(&encode_timestamp(now));
  let start = if c.start_mode == StartMode::Timed { c.start_at } else { now };
  params[START_AT..START_AT + 7].copy_from_slice(&encode_timestamp(start));
  put16(params, START_DELAY, (c.start_delay_secs / 10) as u16);
  put16(params, INTERVAL, (c.interval_secs / 10) as u16);

  put16(params, TEMP_HIGH, encode_limit(c.temp_high, LIMIT_OFF));
  put16(params, TEMP_LOW, encode_limit(c.temp_low, LIMIT_OFF | SIGN));
  put16(params, HUM_HIGH, (c.hum_high * 10.0).round() as u16);
  put16(params, HUM_LOW, (c.hum_low * 10.0).round() as u16);
  params[KEY_TONE] = c.key_tone as u8;
  params[ALARM_BEEPS] = c.alarm_beeps;

  put_ascii(params, TRIP_ID, &c.trip_id);
  put_ascii(params, DESCRIPTION, &c.description);
  Ok(())
}

/// Reconfigures the logger if it is the one with serial number `target`. Returns false for any other.
fn configure(t: &mut impl Transport, target: &str, c: &Config, now_utc: i64) -> Result<bool, Error> {
  let mut params = read_params(t)?;
  if serial(&params) != target {
    return Ok(false);
  }
  apply(c, &mut params, now_utc + c.tz_offset_min as i64 * 60_000)?;
  write_params(t, &params)?;
  Ok(true)
}

// ---------- USB ----------

/// Configuration of every connected logger.
pub fn read_connected() -> Result<Vec<LoggerConfig>, Error> {
  connected()?
    .iter_mut()
    .map(|hid| {
      let params = read_params(hid)?;
      Ok(LoggerConfig { serial: serial(&params), model: MODEL.into(), config: decode(&params) })
    })
    .collect()
}

/// Writes `c` to the connected logger with serial number `target`. This erases its recording.
pub fn write_connected(target: &str, c: &Config) -> Result<(), Error> {
  validate(c)?;
  let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| Error::Invalid(e.to_string()))?;
  for mut hid in connected()? {
    if configure(&mut hid, target, c, now.as_millis() as i64)? {
      return Ok(());
    }
  }
  Err(Error::NotFound)
}

#[cfg(test)]
mod tests {
  use super::*;

  const ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");

  /// The parameter blocks ElitechLog wrote, W0 … W26 as named in the fixture.
  fn captured_writes() -> Vec<Vec<u8>> {
    let text = std::fs::read_to_string(format!("{ROOT}/tools/hidspy/fixtures/config-writes.log")).unwrap();
    let mut blocks: Vec<Vec<u8>> = Vec::new();
    for line in text.lines().filter(|l| l.contains(" OUT ")) {
      let bytes: Vec<u8> = line.split_once(" : ").unwrap().1.split_whitespace().map(|h| u8::from_str_radix(h, 16).unwrap()).collect();
      if bytes[4] != CMD_WRITE_PARAMS {
        continue;
      }
      let addr = u16::from_be_bytes([bytes[7], bytes[8]]) as usize;
      if addr == 0 {
        blocks.push(vec![0; PARAMS_LEN as usize]);
      }
      blocks.last_mut().unwrap()[addr..addr + 50].copy_from_slice(&bytes[11..61]);
    }
    blocks
  }

  #[test]
  fn decodes_each_captured_setting() {
    let w: Vec<Config> = captured_writes().iter().map(|b| decode(b)).collect();
    assert_eq!(w.len(), 27);
    assert_eq!(w[0].interval_secs, 900);
    assert_eq!(w[1].interval_secs, 10);
    assert_eq!(w[2].start_mode, StartMode::Immediate);
    assert_eq!(w[3].start_mode, StartMode::Timed);
    assert_eq!(encode_timestamp(w[3].start_at), [26, 10, 4, 28, 22, 21, 46]);
    assert_eq!((w[4].start_mode, w[4].start_delay_secs), (StartMode::Button, 90));
    assert!(w[4].stop_by_button && !w[5].stop_by_button);
    assert!(w[6].cyclic && !w[6].pause && w[7].pause);
    assert!(w[10].key_tone && !w[9].key_tone);
    assert_eq!(w[11].alarm_beeps, 3);
    assert_eq!((w[11].display_time, w[12].display_time), (1, 2));
    assert!(w[13].fahrenheit && w[14].pdf_chinese);
    assert_eq!((w[17].tz_offset_min, w[18].tz_offset_min), (300, -180));
    assert_eq!(w[19].temp_high, Some(61.5));
    assert_eq!((w[22].trip_id.as_str(), w[22].temp_high, w[22].temp_low), ("0000042", Some(60.0), Some(-20.0)));
    assert_eq!((w[22].hum_high, w[22].hum_low), (90.0, 10.0));
    assert_eq!(w[23].description, "Hygrolog Test");
    assert_eq!(w[26].description, "");
  }

  /// Encoding a decoded block reproduces what ElitechLog wrote, apart from the bytes ElitechLog fills
  /// from its dialog state.
  #[test]
  fn encodes_like_elitechlog() {
    for (i, block) in captured_writes().iter().enumerate() {
      let c = decode(block);
      let now = timestamp(&block[CONFIGURED_AT..CONFIGURED_AT + 7]).unwrap();
      let mut ours = block.clone();
      apply(&c, &mut ours, now).unwrap();
      for at in 0..block.len() {
        let dialog_state = [START_STATE, STATUS, START_FLAGS].contains(&at);
        let dialog_time = (START_AT..START_AT + 7).contains(&at) && c.start_mode != StartMode::Timed;
        if !dialog_state && !dialog_time {
          assert_eq!(ours[at], block[at], "W{i}, byte {at}");
        }
      }
    }
  }

  #[test]
  fn rejects_invalid_settings() {
    let ok = decode(&captured_writes()[26]);
    let mut c = ok.clone();
    c.interval_secs = 15;
    assert!(validate(&c).is_err());
    let mut c = ok.clone();
    c.tz_offset_min = 330;
    assert!(validate(&c).is_err());
    let mut c = ok.clone();
    c.description = "Kühlschrank".into();
    assert!(validate(&c).is_err());
  }

  /// Reads the configuration of a real logger; run with `cargo test -- --ignored` while one is connected.
  #[test]
  #[ignore]
  fn reads_a_connected_configuration() {
    for l in read_connected().unwrap() {
      println!("{} {:#?}", l.serial, l.config);
    }
  }

  #[test]
  fn switches_limits_off() {
    assert_eq!(encode_limit(None, LIMIT_OFF | SIGN), 0x8fa0);
    assert_eq!(decode_limit(0x8fa0), None);
    assert_eq!(decode_limit(encode_limit(Some(-0.5), 0)), Some(-0.5));
  }

  /// Acts as a logger holding `params`: answers reads, acknowledges writes and the commit.
  struct FakeLogger {
    params: Vec<u8>,
    sent: Vec<Vec<u8>>,
  }

  impl Transport for FakeLogger {
    fn exchange(&mut self, req: &[u8]) -> Result<Vec<u8>, Error> {
      self.sent.push(req.to_vec());
      let addr = u16::from_be_bytes([req[7], req[8]]);
      let len = u16::from_be_bytes([req[9], req[10]]);
      Ok(match req[4] {
        CMD_READ_PARAMS => {
          let data = &self.params[(addr as usize).min(352)..(addr + len).min(352) as usize];
          packet(req[4], 0, addr, data.len() as u16, data)
        }
        _ => packet(req[4], req[5], addr, 1, &[1]),
      })
    }
  }

  #[test]
  fn writes_and_commits_like_elitechlog() {
    let block = captured_writes()[26].clone();
    let mut logger = FakeLogger { params: block.clone(), sent: vec![] };
    let c = decode(&block);
    let utc = timestamp(&block[CONFIGURED_AT..CONFIGURED_AT + 7]).unwrap() - 60 * 60_000;

    assert!(!configure(&mut logger, "EFX000000000", &c, utc).unwrap());
    logger.sent.clear();
    assert!(configure(&mut logger, "EFX266100504", &c, utc).unwrap());

    let writes: Vec<&Vec<u8>> = logger.sent.iter().filter(|p| p[4] != CMD_READ_PARAMS).collect();
    let addrs: Vec<u16> = writes.iter().map(|p| u16::from_be_bytes([p[7], p[8]])).collect();
    assert_eq!(addrs, [0, 50, 100, 150, 200, 250, 300, 0]);
    assert_eq!(writes[7], &vec![0x33, 0xcc, 0x00, 0x0d, 0xc0, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0xd1]);
    // Same configuration, so the block goes back unchanged apart from the timed-start slot.
    let mut written = vec![0u8; 350];
    for p in &writes[..7] {
      let at = u16::from_be_bytes([p[7], p[8]]) as usize;
      written[at..at + 50].copy_from_slice(&p[11..61]);
    }
    for at in (0..350).filter(|a| !(START_AT..START_AT + 7).contains(a) && *a != STATUS) {
      assert_eq!(written[at], block[at], "byte {at}");
    }
  }
}
