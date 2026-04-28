mod fsUtilities;
mod models;
mod utils;
mod audio;
mod storage;
mod scan;
mod commands;

use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::sync::mpsc::channel;
use tauri::api::dialog::ask;
use tauri::WindowEvent;
use audio::{AudioCommand, AudioController, PlaybackEngine};
use crate::storage::{clear_tmp_dir, ensure_default_save_files};
use crate::commands::*;

fn main() {
  let context = tauri::generate_context!();
  ensure_default_save_files().expect("failed to initialize save directories and files");

  let (audio_tx, audio_rx) = channel::<AudioCommand>();
  let audio_controller = AudioController::new(audio_tx);

  std::thread::Builder::new()
    .name("audio-player".into())
    .spawn(move || {
      let mut engine = PlaybackEngine::new().expect("failed to initialize native playback engine");
      while let Ok(command) = audio_rx.recv() {
        match command {
          AudioCommand::Play { path, volume, app_handle } => {
            engine.set_volume(volume);
            if let Err(err) = engine.play_path(&path, app_handle) {
              eprintln!("Audio thread playback error: {}", err);
            }
          }
          AudioCommand::Pause => engine.pause(),
          AudioCommand::Resume => engine.resume(),
          AudioCommand::Stop => engine.stop(),
          AudioCommand::SetVolume(volume) => engine.set_volume(volume),
          AudioCommand::Seek { seconds, app_handle } => {
            if let Err(err) = engine.seek(seconds, app_handle.clone()) {
              eprintln!("Audio thread seek error: {}", err);
            }
          }
        }
      }
    })
    .expect("failed to start audio thread");

  let exit_confirmation = Arc::new(AtomicBool::new(false));

  tauri::Builder::default()
    .manage(audio_controller)
    .menu(tauri::Menu::os_default(&context.package_info().name))
    .invoke_handler(tauri::generate_handler![
      get_saved_paths,
      remove_saved_path,
      scan_music_files,
      load_saved_collection,
      sync_saved_paths,
      load_session,
      save_session,
      play_track,
      seek_playback,
      pause_playback,
      resume_playback,
      stop_playback,
      set_playback_volume,
      save_playlist,
      delete_playlist,
    ])
    .on_window_event({
      let exit_confirmation = exit_confirmation.clone();
      move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event.event() {
          if exit_confirmation.load(Ordering::SeqCst) {
            return;
          }

          api.prevent_close();
          let window = event.window().clone();
          let window_for_callback = window.clone();
          let exit_confirmation = exit_confirmation.clone();
          ask(
            Some(&window),
            "Quit RetroTunes",
            "Are you sure you want to quit RetroTunes?",
            move |confirmed| {
              if confirmed {
                exit_confirmation.store(true, Ordering::SeqCst);
                let _ = window_for_callback.emit("perform-save-session", ());
              }
            },
          );
        }
      }
    })
    .build(context)
    .expect("error while running tauri application")
    .run(|_app_handle, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        if let Err(err) = clear_tmp_dir() {
          eprintln!("Failed to clear tmp dir on shutdown: {}", err);
        }
      }
    });
}
