use std::fs;
use std::path::Path;
use crate::models::{Playlist, SessionState, SongInfo, SessionQueueSong};
use crate::utils::{normalize_playlist_filename, playlist_song_key, playlist_song_to_json};
use serde_json::{Value, json};

pub fn storage_base_dir() -> Result<std::path::PathBuf, String> {
  let mut current = std::env::current_dir().map_err(|e| e.to_string())?;

  loop {
    let candidate = current.join("save");
    if candidate.exists() && candidate.is_dir() {
      return Ok(candidate);
    }

    if let Some(parent) = current.parent() {
      current = parent.to_path_buf();
    } else {
      break;
    }
  }

  let base_dir = std::env::current_dir().map_err(|e| e.to_string())?;
  let root_dir = if base_dir.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
    base_dir.parent().map(|p| p.to_path_buf()).unwrap_or(base_dir.clone())
  } else {
    base_dir.clone()
  };
  Ok(root_dir.join("save"))
}

pub fn db_base_dir() -> Result<std::path::PathBuf, String> {
  Ok(storage_base_dir()?.join("db"))
}

pub fn ensure_default_save_files() -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let playlists_dir = db_dir.join("playlists");
  fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  let paths_path = db_dir.join("paths.json");
  if !paths_path.exists() {
    let empty_paths: Vec<String> = Vec::new();
    let paths_json = serde_json::to_string_pretty(&empty_paths).map_err(|e| e.to_string())?;
    fs::write(&paths_path, paths_json).map_err(|e| e.to_string())?;
  }

  let collection_path = db_dir.join("songs.json");
  if !collection_path.exists() {
    let empty_collection: Vec<SongInfo> = Vec::new();
    let collection_json = serde_json::to_string_pretty(&empty_collection).map_err(|e| e.to_string())?;
    fs::write(&collection_path, collection_json).map_err(|e| e.to_string())?;
  }

  let playlist_path = playlists_dir.join(format!("{}.json", normalize_playlist_filename("All songs")));
  let legacy_files = [
    playlists_dir.join("AllSong.json"),
    playlists_dir.join("All_songs.json"),
  ];
  for legacy in legacy_files.iter() {
    if legacy.exists() && legacy != &playlist_path {
      let _ = fs::remove_file(legacy);
    }
  }

  if !playlist_path.exists() {
    let default_playlist = Playlist {
      name: "All songs".to_string(),
      description: "All your favourite songs".to_string(),
      cover: "assets/AllSongs/CoverArt/cover.png".to_string(),
      songs: Vec::new(),
    };
    save_playlist_file(&default_playlist, &playlist_path)?;
  }

  Ok(())
}

pub fn load_saved_paths() -> Result<Vec<String>, String> {
  let db_dir = db_base_dir()?;
  let paths_path = db_dir.join("paths.json");
  if !paths_path.exists() {
    return Ok(Vec::new());
  }
  let raw = fs::read_to_string(&paths_path).map_err(|e| e.to_string())?;
  let paths: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(paths)
}

pub fn save_saved_paths(paths: &[String]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let paths_path = db_dir.join("paths.json");
  let paths_json = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
  fs::write(&paths_path, paths_json).map_err(|e| e.to_string())
}

pub fn load_saved_collection_songs() -> Result<Vec<SongInfo>, String> {
  let db_dir = db_base_dir()?;
  let collection_path = db_dir.join("songs.json");
  if !collection_path.exists() {
    return Ok(Vec::new());
  }

  let raw = fs::read_to_string(&collection_path).map_err(|e| e.to_string())?;
  let songs: Vec<SongInfo> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(songs)
}

pub fn save_collection(songs: &[SongInfo]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
  let collection_path = db_dir.join("songs.json");
  let collection_json = serde_json::to_string_pretty(&songs).map_err(|e| e.to_string())?;
  fs::write(&collection_path, collection_json).map_err(|e| e.to_string())
}

pub fn session_file_path() -> Result<std::path::PathBuf, String> {
  Ok(storage_base_dir()?.join("session.json"))
}

pub fn save_session_to_disk(session: &SessionState) -> Result<(), String> {
  let session_path = session_file_path()?;
  let session_json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
  fs::write(session_path, session_json).map_err(|e| e.to_string())
}

pub fn load_session_from_disk() -> Result<Option<SessionState>, String> {
  let session_path = session_file_path()?;
  if !session_path.exists() {
    return Ok(None);
  }

  let raw = fs::read_to_string(&session_path).map_err(|e| e.to_string())?;
  let session: SessionState = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  fs::remove_file(&session_path).map_err(|e| e.to_string())?;
  Ok(Some(session))
}

pub fn clear_tmp_dir() -> Result<(), String> {
  let save_dir = storage_base_dir()?;
  let tmp_dir = save_dir.join("tmp");
  if tmp_dir.exists() {
    fs::remove_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub fn prepare_tmp_dir() -> Result<std::path::PathBuf, String> {
  let save_dir = storage_base_dir()?;
  let tmp_dir = save_dir.join("tmp");
  if tmp_dir.exists() {
    fs::remove_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  Ok(tmp_dir)
}

pub fn save_playlist_file(playlist: &Playlist, dest: &std::path::Path) -> Result<(), String> {
  let mut object = serde_json::Map::new();
  object.insert("name".to_string(), json!(playlist.name));
  object.insert("description".to_string(), json!(playlist.description));
  object.insert("cover".to_string(), json!(playlist.cover));

  let mut songs_map = serde_json::Map::new();
  for entry in playlist.songs.iter() {
    let key = playlist_song_key(entry);
    songs_map.insert(key, playlist_song_to_json(entry));
  }

  object.insert("songs".to_string(), Value::Object(songs_map));
  let playlist_json = serde_json::to_string_pretty(&Value::Object(object)).map_err(|e| e.to_string())?;
  fs::write(dest, playlist_json).map_err(|e| e.to_string())
}

pub fn save_playlists_to_disk(playlists: &[Playlist]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let playlists_dir = db_dir.join("playlists");
  fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  for playlist in playlists.iter() {
    let filename = format!("{}.json", normalize_playlist_filename(&playlist.name));
    let file_path = playlists_dir.join(filename);
    save_playlist_file(playlist, &file_path)?;
  }

  Ok(())
}
