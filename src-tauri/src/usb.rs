// USB-HID bridge for the frontend: finds Elitech RC "Pro" loggers and passes packets to and from them.
// The protocol itself lives in src/elitech.ts, shared with the browser version (WebHID).

use hidapi::{HidApi, HidDevice};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const VENDOR_ID: u16 = 0x246c;
const PRODUCT_ID: u16 = 0x9001;

/// The commit after a configuration write takes up to 1.3 s.
const TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default)]
struct Loggers {
  api: Option<HidApi>,
  /// Open devices by platform path.
  open: HashMap<String, HidDevice>,
}

static LOGGERS: LazyLock<Mutex<Loggers>> = LazyLock::new(Default::default);

fn locked() -> std::sync::MutexGuard<'static, Loggers> {
  LOGGERS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Opens every connected logger and returns their ids; forgets loggers that were unplugged.
pub fn list() -> Result<Vec<String>, String> {
  let mut loggers = locked();
  let Loggers { api, open } = &mut *loggers;
  let api = match api {
    Some(api) => {
      api.refresh_devices().map_err(|e| e.to_string())?;
      api
    }
    None => api.insert(HidApi::new().map_err(|e| e.to_string())?),
  };

  let mut paths: Vec<_> = api
    .device_list()
    .filter(|d| d.vendor_id() == VENDOR_ID && d.product_id() == PRODUCT_ID)
    .map(|d| d.path().to_owned())
    .collect();
  paths.dedup();

  let ids: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
  open.retain(|id, _| ids.contains(id));
  for (path, id) in paths.iter().zip(&ids) {
    if !open.contains_key(id) {
      open.insert(id.clone(), api.open_path(path).map_err(|e| e.to_string())?);
    }
  }
  Ok(ids)
}

/// Sends one packet and returns the logger's 64-byte response.
pub fn exchange(id: &str, request: &[u8]) -> Result<Vec<u8>, String> {
  let mut loggers = locked();
  let device = loggers.open.get(id).ok_or("logger disconnected")?;
  let result = send(device, request);
  if result.is_err() {
    // Most likely unplugged; the next `list` reopens it if it is back.
    loggers.open.remove(id);
  }
  result.map_err(|e| e.to_string())
}

fn send(device: &HidDevice, request: &[u8]) -> Result<Vec<u8>, String> {
  let mut buf = [0u8; 64];
  while device.read_timeout(&mut buf, 0).map_err(|e| e.to_string())? > 0 {}

  // Leading 0: the logger uses no report IDs, so hidapi strips it and sends the 64-byte report.
  let mut out = [0u8; 65];
  out[1..=request.len().min(64)].copy_from_slice(&request[..request.len().min(64)]);
  device.write(&out).map_err(|e| e.to_string())?;

  match device.read_timeout(&mut buf, TIMEOUT.as_millis() as i32).map_err(|e| e.to_string())? {
    0 => Err("no response".into()),
    n => Ok(buf[..n].to_vec()),
  }
}

#[cfg(test)]
mod tests {
  /// Asks a real logger for the start of its parameter block; run with `cargo test -- --ignored`.
  #[test]
  #[ignore]
  fn exchanges_with_a_connected_logger() {
    let ids = super::list().unwrap();
    assert!(!ids.is_empty(), "no logger connected");
    let request = [0x33, 0xcc, 0x00, 0x0c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x40];
    let response = super::exchange(&ids[0], &request).unwrap();
    assert_eq!(response[..11], [0x33, 0xcc, 0x00, 0x3e, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x32]);
    println!("serial {}", String::from_utf8_lossy(&response[13..25]));
  }
}
