use std::panic;
use tauri::{AppHandle, State};
use crate::audio::{AudioCommand, AudioController};
use crate::models::{Playlist, ResolvedPlaylist, ScanResult, SessionState};
use crate::scan::{add_missing_playlist_songs_to_collection, ensure_all_songs_playlist, load_all_playlists, load_saved_collection_from_disk, resolve_playlist, save_resolved_playlist, scan_all_paths, validate_existing_collection, build_all_songs_playlist_from_songs};
use crate::storage::{db_base_dir, load_saved_paths, load_saved_collection_songs, save_collection, save_playlists_to_disk, save_saved_paths, save_session_to_disk};
use crate::utils::normalize_playlist_filename;

#[tauri::command]
pub fn get_saved_paths() -> Result<Vec<String>, String> {
  load_saved_paths()
}

#[tauri::command]
pub fn remove_saved_path(path: String) -> Result<ScanResult, String> {
  panic::catch_unwind(|| {
    let mut saved_paths = load_saved_paths()?;
    saved_paths.retain(|saved| saved != &path);
    save_saved_paths(&saved_paths)?;
    if saved_paths.is_empty() {
      let songs: Vec<crate::models::SongInfo> = Vec::new();
      save_collection(&songs)?;
      let playlists = vec![build_all_songs_playlist_from_songs(&songs)];
      let tmp_dir = crate::storage::prepare_tmp_dir()?;
      let mut resolved_playlists = Vec::new();
      for playlist in playlists.iter() {
        let resolved = resolve_playlist(playlist, &songs);
        save_resolved_playlist(&resolved, &tmp_dir)?;
        resolved_playlists.push(resolved);
      }
      Ok(ScanResult {
        total: 0,
        songs,
        playlists,
        resolved_playlists,
        saved_file: crate::storage::storage_base_dir()?.join("db").join("songs.json").display().to_string(),
        saved_playlist_file: crate::storage::storage_base_dir()?.join("db").join("playlists").join(format!("{}.json", normalize_playlist_filename("All songs"))).display().to_string(),
      })
    } else {
      scan_all_paths(&saved_paths)
    }
  })
  .map_err(|panic_info| {
    eprintln!("remove_saved_path panic: {:?}", panic_info);
    "Internal scan error".to_string()
  })?
}

#[tauri::command]
pub fn scan_music_files(path: String) -> Result<ScanResult, String> {
  panic::catch_unwind(|| {
    let mut saved_paths = load_saved_paths()?;
    if !saved_paths.iter().any(|saved| saved == &path) {
      saved_paths.push(path.clone());
      save_saved_paths(&saved_paths)?;
    }
    scan_all_paths(&saved_paths)
  })
  .map_err(|panic_info| {
    eprintln!("scan_music_files panic: {:?}", panic_info);
    "Internal scan error".to_string()
  })?
}

#[tauri::command]
pub fn load_saved_collection() -> Result<ScanResult, String> {
  panic::catch_unwind(|| load_saved_collection_from_disk())
    .map_err(|panic_info| {
      eprintln!("load_saved_collection panic: {:?}", panic_info);
      "Internal load error".to_string()
    })?
}

#[tauri::command]
pub fn sync_saved_paths() -> Result<ScanResult, String> {
  panic::catch_unwind(|| {
    let saved_paths = load_saved_paths()?;
    if saved_paths.is_empty() {
      load_saved_collection_from_disk()
    } else {
      scan_all_paths(&saved_paths)
    }
  })
  .map_err(|panic_info| {
    eprintln!("sync_saved_paths panic: {:?}", panic_info);
    "Internal sync error".to_string()
  })?
}

#[tauri::command]
pub fn play_track(path: String, volume: f32, state: State<'_, AudioController>, app_handle: AppHandle) -> Result<(), String> {
  state.0
    .send(AudioCommand::Play { path, volume, app_handle })
    .map_err(|e| format!("Failed to send audio play command: {}", e))
}

#[tauri::command]
pub fn seek_playback(seconds: u64, state: State<'_, AudioController>, app_handle: AppHandle) -> Result<(), String> {
  state.0
    .send(AudioCommand::Seek { seconds, app_handle })
    .map_err(|e| format!("Failed to send audio seek command: {}", e))
}

#[tauri::command]
pub fn pause_playback(state: State<'_, AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Pause)
    .map_err(|e| format!("Failed to send audio pause command: {}", e))
}

#[tauri::command]
pub fn resume_playback(state: State<'_, AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Resume)
    .map_err(|e| format!("Failed to send audio resume command: {}", e))
}

#[tauri::command]
pub fn stop_playback(state: State<'_, AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Stop)
    .map_err(|e| format!("Failed to send audio stop command: {}", e))
}

#[tauri::command]
pub fn set_playback_volume(volume: f32, state: State<'_, AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::SetVolume(volume))
    .map_err(|e| format!("Failed to send volume command: {}", e))
}

#[tauri::command]
pub fn load_session() -> Result<Option<SessionState>, String> {
  panic::catch_unwind(|| crate::storage::load_session_from_disk())
    .map_err(|panic_info| {
      eprintln!("load_session panic: {:?}", panic_info);
      "Internal session load error".to_string()
    })?
}

#[tauri::command]
pub fn save_session(session: SessionState) -> Result<(), String> {
  panic::catch_unwind(|| save_session_to_disk(&session))
    .map_err(|panic_info| {
      eprintln!("save_session panic: {:?}", panic_info);
      "Internal session save error".to_string()
    })?
}

#[tauri::command]
pub fn save_playlist(playlist: Playlist, old_name: Option<String>) -> Result<ResolvedPlaylist, String> {
  panic::catch_unwind(|| {
    let mut playlists = load_all_playlists().unwrap_or_else(|_| Vec::new());
    if let Some(old) = old_name.as_ref() {
      if old != &playlist.name {
        let db_dir = db_base_dir()?;
        let old_path = db_dir.join("playlists").join(format!("{}.json", normalize_playlist_filename(old)));
        if old_path.exists() {
          let _ = std::fs::remove_file(&old_path);
        }
        let tmp_dir = crate::storage::prepare_tmp_dir()?;
        let old_tmp = tmp_dir.join(format!("{}.resolved.json", normalize_playlist_filename(old)));
        if old_tmp.exists() {
          let _ = std::fs::remove_file(&old_tmp);
        }
      }
    }

    let exists = playlists.iter_mut().any(|existing| {
      if existing.name == playlist.name {
        *existing = playlist.clone();
        true
      } else {
        false
      }
    });

    if !exists {
      playlists.push(playlist.clone());
    }

    let mut songs = load_saved_collection_songs()?;
    add_missing_playlist_songs_to_collection(&playlist, &mut songs);
    save_collection(&songs)?;

    ensure_all_songs_playlist(&mut playlists, &songs);
    save_playlists_to_disk(&playlists)?;

    let validated_songs = validate_existing_collection(songs);
    let resolved = resolve_playlist(&playlist, &validated_songs);
    let save_dir = crate::storage::storage_base_dir()?;
    let tmp_dir = save_dir.join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    save_resolved_playlist(&resolved, &tmp_dir)?;
    Ok(resolved)
  })
  .map_err(|panic_info| {
    eprintln!("save_playlist panic: {:?}", panic_info);
    "Internal playlist save error".to_string()
  })?
}

#[tauri::command]
pub fn delete_playlist(name: String) -> Result<(), String> {
  if name == "All songs" {
    return Err("Cannot delete the All songs playlist".to_string());
  }

  panic::catch_unwind(|| {
    let mut playlists = load_all_playlists()?;
    let original_count = playlists.len();
    playlists.retain(|playlist| playlist.name != name);
    if playlists.len() == original_count {
      return Err("Playlist not found".to_string());
    }

    save_playlists_to_disk(&playlists)?;

    let db_dir = db_base_dir()?;
    let playlist_path = db_dir.join("playlists").join(format!("{}.json", normalize_playlist_filename(&name)));
    if playlist_path.exists() {
      let _ = std::fs::remove_file(&playlist_path);
    }

    let tmp_dir = crate::storage::prepare_tmp_dir()?;
    let resolved_path = tmp_dir.join(format!("{}.resolved.json", normalize_playlist_filename(&name)));
    if resolved_path.exists() {
      let _ = std::fs::remove_file(&resolved_path);
    }

    Ok(())
  })
  .map_err(|panic_info| {
    eprintln!("delete_playlist panic: {:?}", panic_info);
    "Internal delete error".to_string()
  })?
}
