//Added by Marco Mattiuz
use std::path::PathBuf;
mod fsUtilities;

#[tauri::command]
fn scan_music_files(path: String) -> Vec<String> {
  let mut files: Vec<PathBuf> = Vec::new();
  fsUtilities::findMusicFiles(&mut files, path);
  files.iter().map(|p| p.display().to_string()).collect()
}
//-------------------------------------------------------



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
