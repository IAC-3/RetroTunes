fn main() {
  let context = tauri::generate_context!();

  tauri::Builder::default()
    .menu(tauri::Menu::os_default(&context.package_info().name))
    .invoke_handler(tauri::generate_handler![])
    .build(context)
    .expect("error while running tauri application")
    .run(|_app_handle, event| {
      if let tauri::RunEvent::ExitRequested { api, .. } = event {
        api.prevent_exit();
      }
    });
}
