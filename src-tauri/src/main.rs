//Added by Marco Mattiuz
use rsmediainfo::{MediaInfo, Track};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};
use std::panic;
mod fsUtilities;

#[derive(Serialize, Clone)]
pub struct SongInfo {
  id: String,
  path: String,
  cover: Option<bool>,
  title: Option<String>,
  time: Option<String>,
  performer: Option<String>,
  album: Option<String>,
  release: Option<String>,
  bitrate: Option<String>,
  sample: Option<String>,
  depth: Option<String>,
  format: Option<String>,
  rating: Option<String>,
  lyrics: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct PlaylistSongMetadata {
  pub title: Option<String>,
  pub album: Option<String>,
  pub performer: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct PlaylistSong {
  pub id: String,
  pub metadata: PlaylistSongMetadata,
  pub exists: bool,
}

#[derive(Serialize, Clone)]
pub struct Playlist {
  pub name: String,
  pub description: String,
  pub cover: String,
  pub songs: Vec<PlaylistSong>,
}

#[derive(Serialize)]
pub struct AllSongsCollection {
  #[serde(rename = "AllSongsCollection")]
  pub all_songs_collection: Vec<SongInfo>,
}

#[derive(Serialize)]
pub struct ScanResult {
  songs: Vec<SongInfo>,
  playlists: Vec<Playlist>,
  total: usize,
  saved_file: String,
  saved_playlist_file: String,
}

fn make_id(path: &str) -> String {
  let mut hasher = DefaultHasher::new();
  path.hash(&mut hasher);
  format!("{:016x}", hasher.finish())
}

fn normalized_metadata_value(value: &Option<String>) -> String {
  value
    .as_ref()
    .map(|s| s.trim().to_lowercase())
    .filter(|s| !s.is_empty())
    .unwrap_or_default()
}

fn metadata_key(title: &Option<String>, album: &Option<String>, performer: &Option<String>) -> String {
  let title = normalized_metadata_value(title);
  let album = normalized_metadata_value(album);
  let performer = normalized_metadata_value(performer);
  if title.is_empty() && album.is_empty() && performer.is_empty() {
    String::new()
  } else {
    format!("{}|{}|{}", title, album, performer)
  }
}

fn make_song_id(song: &SongInfo) -> String {
  let key = metadata_key(&song.title, &song.album, &song.performer);
  if key.is_empty() {
    make_id(&song.path)
  } else {
    make_id(&key)
  }
}

fn default_all_songs_playlist() -> Playlist {
  Playlist {
    name: "All songs".to_string(),
    description: "All your favourite songs".to_string(),
    cover: "assets/AllSongs/CoverArt/cover.png".to_string(),
    songs: Vec::new(),
  }
}

fn load_playlist() -> Result<Playlist, String> {
  let save_dir = storage_base_dir()?;
  let playlist_path = save_dir.join("collections").join("playlists").join("AllSong.json");
  if !playlist_path.exists() {
    return Ok(default_all_songs_playlist());
  }

  let raw = std::fs::read_to_string(&playlist_path).map_err(|e| e.to_string())?;
  let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  let obj = value.as_object().ok_or("Invalid playlist JSON")?;

  let name = obj.get("name").and_then(Value::as_str).unwrap_or("All songs").to_string();
  let description = obj.get("description").and_then(Value::as_str).unwrap_or("All your favourite songs").to_string();
  let cover = obj.get("cover").and_then(Value::as_str).unwrap_or("assets/AllSongs/CoverArt/cover.png").to_string();

  let songs = match obj.get("songs") {
    Some(Value::Array(items)) => items.iter().filter_map(|item| {
      let id = if let Some(id) = item.as_str() {
        Some(id.to_string())
      } else if let Some(id) = item.as_i64() {
        Some(id.to_string())
      } else if let Some(song_obj) = item.as_object() {
        song_obj.get("id").and_then(Value::as_str).map(String::from)
          .or_else(|| song_obj.get("id").and_then(Value::as_i64).map(|n| n.to_string()))
      } else {
        None
      };

      let exists = item.get("exists").and_then(Value::as_bool).unwrap_or(true);
      let metadata = if let Some(song_obj) = item.as_object() {
        let meta = song_obj.get("metadata").and_then(Value::as_object);
        PlaylistSongMetadata {
          title: meta.and_then(|m| m.get("title").and_then(Value::as_str).map(String::from))
            .or_else(|| song_obj.get("title").and_then(Value::as_str).map(String::from)),
          album: meta.and_then(|m| m.get("album").and_then(Value::as_str).map(String::from))
            .or_else(|| song_obj.get("album").and_then(Value::as_str).map(String::from)),
          performer: meta.and_then(|m| m.get("performer").and_then(Value::as_str).map(String::from))
            .or_else(|| song_obj.get("performer").and_then(Value::as_str).map(String::from)),
        }
      } else {
        PlaylistSongMetadata { title: None, album: None, performer: None }
      };

      id.map(|id| PlaylistSong { id, metadata, exists })
    }).collect(),
    _ => Vec::new(),
  };

  Ok(Playlist { name, description, cover, songs })
}

fn save_playlist(playlist: &Playlist) -> Result<(), String> {
  let save_dir = storage_base_dir()?;
  let playlist_path = save_dir.join("collections").join("playlists").join("AllSong.json");
  let playlist_json = serde_json::to_string_pretty(playlist).map_err(|e| e.to_string())?;
  std::fs::write(&playlist_path, playlist_json).map_err(|e| e.to_string())
}

fn parse_int_value(value: &Option<String>) -> i64 {
  value
    .as_ref()
    .and_then(|s| s.split_whitespace().next()?.parse::<i64>().ok())
    .unwrap_or(0)
}

fn is_higher_quality(new: &SongInfo, existing: &SongInfo) -> bool {
  let new_bitrate = parse_int_value(&new.bitrate);
  let existing_bitrate = parse_int_value(&existing.bitrate);
  if new_bitrate != existing_bitrate {
    return new_bitrate > existing_bitrate;
  }

  let new_sample = parse_int_value(&new.sample);
  let existing_sample = parse_int_value(&existing.sample);
  if new_sample != existing_sample {
    return new_sample > existing_sample;
  }

  let new_depth = parse_int_value(&new.depth);
  let existing_depth = parse_int_value(&existing.depth);
  if new_depth != existing_depth {
    return new_depth > existing_depth;
  }

  let new_format = new.format.as_deref().unwrap_or("");
  let existing_format = existing.format.as_deref().unwrap_or("");
  if new_format != existing_format {
    return new_format > existing_format;
  }

  let new_release = new.release.as_deref().unwrap_or("");
  let existing_release = existing.release.as_deref().unwrap_or("");
  if new_release != existing_release {
    return new_release > existing_release;
  }

  let new_time = new.time.as_deref().unwrap_or("");
  let existing_time = existing.time.as_deref().unwrap_or("");
  if new_time != existing_time {
    return new_time > existing_time;
  }

  false
}

fn update_all_songs_playlist(current_songs: &[SongInfo]) -> Result<Playlist, String> {
  let mut playlist = load_playlist()?;
  let mut metadata_to_id: HashMap<String, String> = HashMap::new();

  for entry in playlist.songs.iter() {
    let key = metadata_key(&entry.metadata.title, &entry.metadata.album, &entry.metadata.performer);
    if !key.is_empty() {
      metadata_to_id.entry(key).or_insert_with(|| entry.id.clone());
    }
  }

  let mut current_ids: HashSet<String> = HashSet::new();

  for song in current_songs {
    let key = metadata_key(&song.title, &song.album, &song.performer);
    let id = if !key.is_empty() {
      metadata_to_id
        .get(&key)
        .cloned()
        .unwrap_or_else(|| make_song_id(song))
    } else {
      make_song_id(song)
    };

    current_ids.insert(id.clone());
    let metadata = PlaylistSongMetadata {
      title: song.title.clone(),
      album: song.album.clone(),
      performer: song.performer.clone(),
    };

    if let Some(entry) = playlist.songs.iter_mut().find(|entry| entry.id == id) {
      entry.exists = true;
      entry.metadata = metadata;
    } else {
      playlist.songs.push(PlaylistSong {
        id: id.clone(),
        metadata,
        exists: true,
      });
    }
  }

  for entry in playlist.songs.iter_mut() {
    if !current_ids.contains(&entry.id) {
      entry.exists = false;
    }
  }

  save_playlist(&playlist)?;
  Ok(playlist)
}

fn load_saved_paths() -> Result<Vec<String>, String> {
  let save_dir = storage_base_dir()?;
  let paths_path = save_dir.join("paths.json");
  if !paths_path.exists() {
    return Ok(Vec::new());
  }
  let raw = std::fs::read_to_string(&paths_path).map_err(|e| e.to_string())?;
  let paths: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(paths)
}

fn save_saved_paths(paths: &[String]) -> Result<(), String> {
  let save_dir = storage_base_dir()?;
  let paths_path = save_dir.join("paths.json");
  let paths_json = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
  std::fs::write(&paths_path, paths_json).map_err(|e| e.to_string())
}

fn scan_all_paths(paths: &[String]) -> Result<ScanResult, String> {
  let mut song_map: HashMap<String, SongInfo> = HashMap::new();
  for path in paths {
    let file_paths = fsUtilities::findMusicFiles(path.clone())
      .map_err(|e| format!("failed to list files for {}: {}", path, e))?;

    for file_path in file_paths {
      let file = file_path.display().to_string();
      let parse_result = panic::catch_unwind(|| parse_mediainfo(&file, ""));
      let info = match parse_result {
        Ok(Ok(mut info)) => {
          info.path = file.clone();
          info.id = make_song_id(&info);
          info
        }
        Ok(Err(err)) => {
          eprintln!("Skipping {}: {}", file, err);
          let mut info = SongInfo {
            id: String::new(),
            path: file.clone(),
            cover: None,
            title: None,
            time: None,
            performer: None,
            album: None,
            release: None,
            bitrate: None,
            sample: None,
            depth: None,
            format: None,
            rating: None,
            lyrics: None,
          };
          info.id = make_song_id(&info);
          info
        }
        Err(panic_info) => {
          eprintln!("Panic parsing {}: {:?}", file, panic_info);
          let mut info = SongInfo {
            id: String::new(),
            path: file.clone(),
            cover: None,
            title: None,
            time: None,
            performer: None,
            album: None,
            release: None,
            bitrate: None,
            sample: None,
            depth: None,
            format: None,
            rating: None,
            lyrics: None,
          };
          info.id = make_song_id(&info);
          info
        }
      };

      let dedupe_key = {
        let meta_key = metadata_key(&info.title, &info.album, &info.performer);
        if meta_key.is_empty() {
          format!("__path__{}", info.path)
        } else {
          meta_key
        }
      };

      song_map
        .entry(dedupe_key)
        .and_modify(|existing| {
          if is_higher_quality(&info, existing) {
            *existing = info.clone();
          }
        })
        .or_insert(info);
    }
  }

  let songs: Vec<SongInfo> = song_map.into_iter().map(|(_key, song)| song).collect();
  let playlist = update_all_songs_playlist(&songs)?;

  let collection = AllSongsCollection {
    all_songs_collection: songs.clone(),
  };

  let save_dir = storage_base_dir()?;
  let collections_dir = save_dir.join("collections");
  let playlists_dir = collections_dir.join("playlists");
  std::fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  let collection_path = collections_dir.join("AllSongsCollection.json");
  let playlist_path = playlists_dir.join("AllSong.json");

  let collection_json = serde_json::to_string_pretty(&collection).map_err(|e| e.to_string())?;
  std::fs::write(&collection_path, collection_json).map_err(|e| e.to_string())?;

  Ok(ScanResult {
    total: collection.all_songs_collection.len(),
    songs: collection.all_songs_collection.clone(),
    playlists: vec![playlist],
    saved_file: collection_path.display().to_string(),
    saved_playlist_file: playlist_path.display().to_string(),
  })
}

fn storage_base_dir() -> Result<std::path::PathBuf, String> {
  let base_dir = std::env::current_dir().map_err(|e| e.to_string())?;
  let root_dir = if base_dir.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
    base_dir.parent().map(|p| p.to_path_buf()).unwrap_or(base_dir.clone())
  } else {
    base_dir.clone()
  };
  Ok(root_dir.join("save"))
}

fn ensure_default_save_files() -> Result<(), String> {
  let save_dir = storage_base_dir()?;
  let collections_dir = save_dir.join("collections");
  let playlists_dir = collections_dir.join("playlists");
  std::fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  let paths_path = save_dir.join("paths.json");
  if !paths_path.exists() {
    let empty_paths: Vec<String> = Vec::new();
    let paths_json = serde_json::to_string_pretty(&empty_paths).map_err(|e| e.to_string())?;
    std::fs::write(&paths_path, paths_json).map_err(|e| e.to_string())?;
  }

  let collection_path = collections_dir.join("AllSongsCollection.json");
  if !collection_path.exists() {
    let empty_collection = AllSongsCollection {
      all_songs_collection: Vec::new(),
    };
    let collection_json = serde_json::to_string_pretty(&empty_collection).map_err(|e| e.to_string())?;
    std::fs::write(&collection_path, collection_json).map_err(|e| e.to_string())?;
  }

  let playlist_path = playlists_dir.join("AllSong.json");
  if !playlist_path.exists() {
    let default_playlist = Playlist {
      name: "All songs".to_string(),
      description: "All your favourite songs".to_string(),
      cover: "assets/AllSongs/CoverArt/cover.png".to_string(),
      songs: Vec::new(),
    };
    let playlist_json = serde_json::to_string_pretty(&default_playlist).map_err(|e| e.to_string())?;
    std::fs::write(&playlist_path, playlist_json).map_err(|e| e.to_string())?;
  }

  Ok(())
}

fn parse_duration_string(value: &str) -> Option<String> {
  if let Ok(millis) = value.parse::<i64>() {
    if millis > 0 {
      let seconds = millis as u64 / 1000;
      return Some(format!("{:02}:{:02}", seconds / 60, seconds % 60));
    }
  }

  if let Ok(seconds) = value.parse::<f64>() {
    if seconds > 0.0 {
      let millis = (seconds * 1000.0).round() as u64;
      return Some(format!("{:02}:{:02}", millis / 1000 / 60, (millis / 1000) % 60));
    }
  }

  None
}

fn get_string_field(track: Option<&Track>, keys: &[&str]) -> Option<String> {
  track
    .and_then(|track| {
      keys
        .iter()
        .find_map(|key| track.get_string(key).map(String::from))
    })
}

fn get_int_field(track: Option<&Track>, keys: &[&str]) -> Option<i64> {
  track.and_then(|track| {
    keys
      .iter()
      .find_map(|key| track.get_int(key))
  })
}

fn parse_mediainfo(path: &str, song_id: &str) -> Result<SongInfo, String> {
  let info = MediaInfo::parse_media_info_path(path)
    .map_err(|e| format!("mediainfo failed to open file {}: {:?}", path, e))?;

  let general = info.tracks().iter().find(|t| t.track_type() == "General");
  let audio = info.tracks().iter().find(|t| t.track_type() == "Audio");
  let image = info.tracks().iter().find(|t| t.track_type() == "Image");

  let title = general
    .and_then(|track| track.get_string("title"))
    .or_else(|| general.and_then(|track| track.get_string("track")))
    .map(String::from);

  let performer = general
    .and_then(|track| track.get_string("performer"))
    .or_else(|| general.and_then(|track| track.get_string("artist")))
    .or_else(|| general.and_then(|track| track.get_string("album_performer")))
    .map(String::from);

  let album = general.and_then(|track| track.get_string("album")).map(String::from);

  let release = general
    .and_then(|track| track.get_string("recorded_date"))
    .or_else(|| general.and_then(|track| track.get_string("year")))
    .map(String::from);

  let bitrate = get_int_field(general, &["overallbitrate", "overall_bit_rate"])
    .or_else(|| get_int_field(audio, &["bitrate", "bit_rate"]))
    .map(|b| format!("{} kb/s", b / 1000));

  let time = get_int_field(general, &["duration"])
    .map(|d| format!("{:02}:{:02}", d as u64 / 1000 / 60, (d as u64 / 1000) % 60))
    .or_else(|| get_string_field(general, &["duration"]).as_deref().and_then(parse_duration_string));

  let format = get_string_field(audio, &["format"])
    .or_else(|| get_string_field(general, &["format"]));

  let sample = get_int_field(audio, &["samplingrate", "sampling_rate"])
    .map(|rate| format!("{} Hz", rate))
    .or_else(|| {
      get_string_field(audio, &["samplingrate", "sampling_rate"])
        .and_then(|s| s.parse::<i64>().ok())
        .map(|rate| format!("{} Hz", rate))
    });

  let depth = get_int_field(audio, &["bitdepth", "bit_depth"])
    .or_else(|| get_int_field(audio, &["resolution"]))
    .map(|bits| bits.to_string());

  let rating = None;
  let lyrics = get_string_field(general, &["lyrics", "lyric"]);
  let cover = image.map(|_| true);

  Ok(SongInfo {
    id: song_id.to_string(),
    path: path.to_string(),
    cover,
    title,
    time,
    performer,
    album,
    release,
    bitrate,
    sample,
    depth,
    format,
    rating,
    lyrics,
  })
}

#[tauri::command]
fn get_saved_paths() -> Result<Vec<String>, String> {
  load_saved_paths()
}

#[tauri::command]
fn remove_saved_path(path: String) -> Result<ScanResult, String> {
  panic::catch_unwind(|| {
    let mut saved_paths = load_saved_paths()?;
    saved_paths.retain(|saved| saved != &path);
    save_saved_paths(&saved_paths)?;
    scan_all_paths(&saved_paths)
  })
  .map_err(|panic_info| {
    eprintln!("remove_saved_path panic: {:?}", panic_info);
    "Internal scan error".to_string()
  })?
}

#[tauri::command]
fn scan_music_files(path: String) -> Result<ScanResult, String> {
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
//-------------------------------------------------------


fn main() {

  let context = tauri::generate_context!();

  ensure_default_save_files().expect("failed to initialize save directories and files");
  let saved_paths = load_saved_paths().unwrap_or_default();
  if !saved_paths.is_empty() {
    if let Err(err) = scan_all_paths(&saved_paths) {
      eprintln!("failed to rescan saved paths on startup: {}", err);
    }
  }

  tauri::Builder::default()
    .menu(tauri::Menu::os_default(&context.package_info().name))
    .invoke_handler(tauri::generate_handler![scan_music_files, get_saved_paths, remove_saved_path])
    .build(context)
    .expect("error while running tauri application")
    .run(|_app_handle, event| {
      if let tauri::RunEvent::ExitRequested { api, .. } = event {
        api.prevent_exit();
      }
    });
}
