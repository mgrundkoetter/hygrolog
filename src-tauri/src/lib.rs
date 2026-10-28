mod elitech;

/// Reads all loggers connected via USB. Runs off the main thread: a large memory takes a few seconds.
#[tauri::command]
async fn read_loggers() -> Result<Vec<elitech::Report>, String> {
  tauri::async_runtime::spawn_blocking(elitech::read_connected)
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![read_loggers])
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
