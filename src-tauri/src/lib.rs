mod usb;

/// Runs USB work off the main thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Ids of all loggers connected via USB.
#[tauri::command]
async fn hid_list() -> Result<Vec<String>, String> {
  blocking(usb::list).await
}

/// Sends one packet to a logger and returns its response.
#[tauri::command]
async fn hid_exchange(id: String, request: Vec<u8>) -> Result<Vec<u8>, String> {
  blocking(move || usb::exchange(&id, &request)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![hid_list, hid_exchange])
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
