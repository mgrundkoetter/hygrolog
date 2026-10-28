mod elitech;

use elitech::config::{self, Config, LoggerConfig};

/// Runs USB work off the main thread: reading a full memory takes a few seconds.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, elitech::Error> + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f)
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Reads the recordings of all loggers connected via USB.
#[tauri::command]
async fn read_loggers() -> Result<Vec<elitech::Report>, String> {
  blocking(elitech::read_connected).await
}

#[tauri::command]
async fn read_configs() -> Result<Vec<LoggerConfig>, String> {
  blocking(config::read_connected).await
}

/// Reconfigures one logger and sets its clock. Erases its recording.
#[tauri::command]
async fn write_config(serial: String, config: Config) -> Result<(), String> {
  blocking(move || config::write_connected(&serial, &config)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![read_loggers, read_configs, write_config])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
