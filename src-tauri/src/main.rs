//Added by Marco Mattiuz
use rsmediainfo::{MediaInfo, Track};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};
use std::panic;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use rodio::{buffer::SamplesBuffer, Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::{get_codecs, get_probe};
use tauri::Manager;
mod fsUtilities;

struct PlaybackEngine {
  _stream: OutputStream,
  handle: OutputStreamHandle,
  sink: Option<Arc<Sink>>,
  sink_active: Option<Arc<AtomicBool>>,
  paused: bool,
  volume: f32,
  current_path: Option<String>,
  current_position: u64,
}

impl PlaybackEngine {
  fn new() -> Result<Self, String> {
    let (stream, handle) = OutputStream::try_default().map_err(|e| e.to_string())?;
    Ok(Self {
      _stream: stream,
      handle,
      sink: None,
      sink_active: None,
      paused: false,
      volume: 1.0,
      current_path: None,
      current_position: 0,
    })
  }

  fn stop(&mut self) {
    if let Some(active) = self.sink_active.take() {
      active.store(false, Ordering::SeqCst);
    }
    if let Some(sink) = self.sink.take() {
      sink.stop();
    }
    self.paused = false;
  }

  fn pause(&mut self) {
    if let Some(sink) = self.sink.as_ref() {
      sink.pause();
      self.paused = true;
    }
  }

  fn resume(&mut self) {
    if let Some(sink) = self.sink.as_ref() {
      sink.play();
      self.paused = false;
    }
  }

  fn set_volume(&mut self, volume: f32) {
    self.volume = volume;
    if let Some(sink) = self.sink.as_ref() {
      sink.set_volume(volume);
    }
  }

  fn play_path(&mut self, path: &str, app_handle: tauri::AppHandle) -> Result<(), String> {
    self.play_path_at(path, 0, app_handle)
  }

  fn play_path_at(&mut self, path: &str, start_seconds: u64, app_handle: tauri::AppHandle) -> Result<(), String> {
    self.stop();
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let sink = Sink::try_new(&self.handle).map_err(|e| e.to_string())?;
    let sink = Arc::new(sink);
    sink.set_volume(self.volume);

    if let Ok(decoder) = Decoder::new(reader) {
      if start_seconds > 0 {
        sink.append(decoder.skip_duration(Duration::from_secs(start_seconds)));
      } else {
        sink.append(decoder);
      }
    } else {
      let source = decode_audio_file(path)?;
      if start_seconds > 0 {
        sink.append(source.skip_duration(Duration::from_secs(start_seconds)));
      } else {
        sink.append(source);
      }
    }

    sink.play();
    let active = Arc::new(AtomicBool::new(true));
    self.spawn_end_thread(app_handle.clone(), sink.clone(), active.clone());
    self.sink_active = Some(active);
    self.sink = Some(sink);
    self.current_path = Some(path.to_string());
    self.current_position = start_seconds;
    self.paused = false;
    Ok(())
  }

  fn seek(&mut self, seconds: u64, app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(path) = self.current_path.clone() {
      self.play_path_at(&path, seconds, app_handle)
    } else {
      Err("No active track to seek".to_string())
    }
  }

  fn spawn_end_thread(&self, app_handle: tauri::AppHandle, sink: Arc<Sink>, active: Arc<AtomicBool>) {
    std::thread::spawn(move || {
      sink.sleep_until_end();
      if active.load(Ordering::SeqCst) {
        let _ = app_handle.emit_all("playback-ended", ());
      }
    });
  }
}

fn decode_audio_file(path: &str) -> Result<SamplesBuffer<f32>, String> {
  let file = File::open(path).map_err(|e| e.to_string())?;
  let mss = MediaSourceStream::new(Box::new(file), Default::default());
  let mut hint = Hint::new();
  if let Some(ext) = Path::new(path).extension().and_then(|ext| ext.to_str()) {
    hint.with_extension(ext);
  }

  let probed = get_probe().format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
    .map_err(|e| format!("Failed to probe audio file: {}", e))?;
  let mut format = probed.format;
  let chosen_track = format.tracks().iter()
    .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
    .ok_or_else(|| "No audio track found".to_string())?;

  let track_id = chosen_track.id;
  let codec_params = chosen_track.codec_params.clone();

  let decoder = get_codecs()
    .make(&codec_params, &DecoderOptions::default())
    .map_err(|e| format!("Failed to create decoder: {}", e))?;

  let mut decoder = decoder;
  let mut samples = Vec::new();
  let mut sample_rate = 0;
  let mut channels = 0;

  loop {
    match format.next_packet() {
      Ok(packet) => {
        if packet.track_id() != track_id {
          continue;
        }

        let decoded = decoder.decode(&packet).map_err(|e| format!("Decode failed: {}", e))?;
        let spec = *decoded.spec();

        if sample_rate == 0 {
          sample_rate = spec.rate;
          channels = spec.channels.count() as u16;
        }

        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buffer.samples());
      }
      Err(SymphoniaError::IoError(_)) => break,
      Err(SymphoniaError::DecodeError(_)) => continue,
      Err(SymphoniaError::ResetRequired) => {
        decoder.reset();
      }
      Err(e) => return Err(format!("Audio decode error: {}", e)),
    }
  }

  if sample_rate == 0 || channels == 0 {
    return Err("No audio samples decoded".to_string());
  }

  Ok(SamplesBuffer::new(channels, sample_rate, samples))
}

enum AudioCommand {
  Play { path: String, volume: f32, app_handle: tauri::AppHandle },
  Pause,
  Resume,
  Stop,
  SetVolume(f32),
  Seek { seconds: u64, app_handle: tauri::AppHandle },
}

struct AudioController(Sender<AudioCommand>);

impl AudioController {
  fn new(sender: Sender<AudioCommand>) -> Self {
    Self(sender)
  }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SongInfo {
  id: String,
  path: Option<String>,
  scan: Option<String>,
  exists: bool,
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
  size_bytes: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlaylistSongMetadata {
  pub title: Option<String>,
  pub album: Option<String>,
  pub performer: Option<String>,
  pub time: Option<String>,
  pub release: Option<String>,
  pub bitrate: Option<String>,
  pub sample: Option<String>,
  pub depth: Option<String>,
  pub format: Option<String>,
  pub rating: Option<String>,
  pub size_bytes: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlaylistSong {
  pub lid: String,
  pub title: Option<String>,
  pub performer: Option<String>,
  pub album: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Playlist {
  pub name: String,
  pub description: String,
  pub cover: String,
  pub songs: Vec<PlaylistSong>,
}

#[derive(Serialize, Clone)]
pub struct ResolvedSong {
  pub lid: String,
  pub title: Option<String>,
  pub performer: Option<String>,
  pub album: Option<String>,
  pub path: Option<String>,
  pub scan: Option<String>,
  pub exists: bool,
  pub time: Option<String>,
  pub release: Option<String>,
  pub bitrate: Option<String>,
  pub sample: Option<String>,
  pub depth: Option<String>,
  pub format: Option<String>,
  pub rating: Option<String>,
  pub size_bytes: Option<u64>,
}

#[derive(Serialize, Clone)]
pub struct ResolvedPlaylist {
  pub name: String,
  pub description: String,
  pub cover: String,
  pub songs: Vec<ResolvedSong>,
  pub queue: Vec<ResolvedSong>,
}

#[derive(Serialize)]
pub struct ScanResult {
  songs: Vec<SongInfo>,
  playlists: Vec<Playlist>,
  resolved_playlists: Vec<ResolvedPlaylist>,
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
  if !key.is_empty() {
    make_id(&key)
  } else if let Some(path) = &song.path {
    make_id(path)
  } else {
    make_id("")
  }
}

fn playlist_song_key(entry: &PlaylistSong) -> String {
  let key = metadata_key(&entry.title, &entry.album, &entry.performer);
  if !key.is_empty() {
    key
  } else {
    entry.lid.clone()
  }
}

fn playlist_song_to_json(entry: &PlaylistSong) -> Value {
  let mut object = serde_json::Map::new();
  if let Some(title) = &entry.title {
    object.insert("title".to_string(), json!(title));
  }
  if let Some(performer) = &entry.performer {
    object.insert("performer".to_string(), json!(performer));
  }
  if let Some(album) = &entry.album {
    object.insert("album".to_string(), json!(album));
  }
  object.insert("lid".to_string(), json!(entry.lid.clone()));
  Value::Object(object)
}

fn parse_playlist_song_from_map(key: &str, item: &Value) -> Option<PlaylistSong> {
  let song_obj = item.as_object()?;

  let title = song_obj.get("title").and_then(Value::as_str).map(String::from);
  let performer = song_obj.get("performer").and_then(Value::as_str).map(String::from);
  let album = song_obj.get("album").and_then(Value::as_str).map(String::from);
  let lid = song_obj.get("lid").and_then(Value::as_str).map(String::from)
    .unwrap_or_else(|| make_id(key));

  let parts: Vec<&str> = key.splitn(3, '|').collect();
  let title = title.or_else(|| parts.get(0).and_then(|s| if !s.is_empty() { Some(s.to_string()) } else { None }).map(|s| s.to_string()));
  let album = album.or_else(|| parts.get(1).and_then(|s| if !s.is_empty() { Some(s.to_string()) } else { None }).map(|s| s.to_string()));
  let performer = performer.or_else(|| parts.get(2).and_then(|s| if !s.is_empty() { Some(s.to_string()) } else { None }).map(|s| s.to_string()));

  Some(PlaylistSong { lid, title, performer, album })
}

fn parse_playlist_song(item: &Value) -> Option<PlaylistSong> {
  let song_obj = item.as_object()?;

  let title = song_obj.get("title").and_then(Value::as_str).map(String::from)
    .or_else(|| song_obj.get("metadata").and_then(Value::as_object).and_then(|meta| meta.get("title").and_then(Value::as_str).map(String::from)));
  let performer = song_obj.get("performer").and_then(Value::as_str).map(String::from)
    .or_else(|| song_obj.get("metadata").and_then(Value::as_object).and_then(|meta| meta.get("performer").and_then(Value::as_str).map(String::from)));
  let album = song_obj.get("album").and_then(Value::as_str).map(String::from)
    .or_else(|| song_obj.get("metadata").and_then(Value::as_object).and_then(|meta| meta.get("album").and_then(Value::as_str).map(String::from)));

  let lid = song_obj.get("lid").and_then(Value::as_str).map(String::from)
    .or_else(|| song_obj.get("id").and_then(Value::as_str).map(String::from))
    .or_else(|| song_obj.get("id").and_then(Value::as_i64).map(|n| n.to_string()))
    .unwrap_or_else(|| make_id(&metadata_key(&title, &album, &performer)));

  Some(PlaylistSong { lid, title, performer, album })
}

fn parse_playlist_file(path: &std::path::Path) -> Result<Playlist, String> {
  let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
  let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  let obj = value.as_object().ok_or("Invalid playlist JSON")?;

  let name = obj.get("name").and_then(Value::as_str).unwrap_or("All songs").to_string();
  let description = obj.get("description").and_then(Value::as_str).unwrap_or("All your favourite songs").to_string();
  let cover = obj.get("cover").and_then(Value::as_str).unwrap_or("assets/AllSongs/CoverArt/cover.png").to_string();

  let songs = match obj.get("songs") {
    Some(Value::Array(items)) => items.iter().filter_map(parse_playlist_song).collect(),
    Some(Value::Object(map)) => map.iter().filter_map(|(key, item)| parse_playlist_song_from_map(key, item)).collect(),
    _ => Vec::new(),
  };

  Ok(Playlist { name, description, cover, songs })
}

fn db_base_dir() -> Result<std::path::PathBuf, String> {
  Ok(storage_base_dir()?.join("db"))
}

fn load_all_playlists() -> Result<Vec<Playlist>, String> {
  let db_dir = db_base_dir()?;
  let playlists_dir = db_dir.join("playlists");
  if !playlists_dir.exists() {
    return Ok(Vec::new());
  }

  let mut playlists = Vec::new();
  for entry in std::fs::read_dir(&playlists_dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
      if let Ok(playlist) = parse_playlist_file(&path) {
        playlists.push(playlist);
      }
    }
  }

  Ok(playlists)
}

fn build_all_songs_playlist_from_songs(songs: &[SongInfo]) -> Playlist {
  let mut seen_ids = HashSet::new();
  let songs = songs
    .iter()
    .filter_map(|song| {
      let lid = make_song_id(song);
      if seen_ids.contains(&lid) {
        return None;
      }
      seen_ids.insert(lid.clone());
      Some(PlaylistSong {
        lid,
        title: song.title.clone(),
        performer: song.performer.clone(),
        album: song.album.clone(),
      })
    })
    .collect();

  Playlist {
    name: "All songs".to_string(),
    description: "All your favourite songs".to_string(),
    cover: "assets/AllSongs/CoverArt/cover.png".to_string(),
    songs,
  }
}

fn save_playlist_file(playlist: &Playlist, dest: &std::path::Path) -> Result<(), String> {
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
  std::fs::write(dest, playlist_json).map_err(|e| e.to_string())
}

fn save_playlists_to_disk(playlists: &[Playlist]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let playlists_dir = db_dir.join("playlists");
  std::fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  for playlist in playlists.iter() {
    let filename = format!("{}.json", normalize_playlist_filename(&playlist.name));
    let file_path = playlists_dir.join(filename);
    save_playlist_file(playlist, &file_path)?;
  }

  Ok(())
}

fn ensure_all_songs_playlist(playlists: &mut Vec<Playlist>, songs: &[SongInfo]) {
  let all_songs = build_all_songs_playlist_from_songs(songs);
  if let Some(existing) = playlists.iter_mut().find(|playlist| playlist.name == "All songs") {
    *existing = all_songs;
  } else {
    playlists.push(all_songs);
  }
}

fn playlist_filename(name: &str) -> String {
  name
    .split(|c: char| !c.is_ascii_alphanumeric())
    .filter(|part| !part.is_empty())
    .map(|part| {
      let mut chars = part.chars();
      match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
      }
    })
    .collect()
}

fn normalize_playlist_filename(name: &str) -> String {
  let file_name = playlist_filename(name);
  if file_name.is_empty() {
    "Playlist".to_string()
  } else {
    file_name
  }
}

fn resolve_playlist(playlist: &Playlist, songs: &[SongInfo]) -> ResolvedPlaylist {
  let songs_by_id: HashMap<String, &SongInfo> = songs.iter().map(|song| (song.id.clone(), song)).collect();
  let mut songs_by_meta: HashMap<String, Vec<&SongInfo>> = HashMap::new();

  for song in songs.iter() {
    let key = metadata_key(&song.title, &song.album, &song.performer);
    if !key.is_empty() {
      songs_by_meta.entry(key).or_default().push(song);
    }
  }

  let resolved_songs: Vec<ResolvedSong> = playlist.songs.iter().map(|entry| {
    let direct_match = songs_by_id.get(&entry.lid).copied();
    let metadata_key = metadata_key(&entry.title, &entry.album, &entry.performer);
    let fallback_match = songs_by_meta.get(&metadata_key).and_then(|matches| {
      matches.iter().max_by(|a, b| if is_higher_quality(a, b) { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less }).copied()
    });

    let chosen = direct_match.or(fallback_match);
    if let Some(song) = chosen {
      ResolvedSong {
        lid: entry.lid.clone(),
        title: entry.title.clone(),
        performer: entry.performer.clone(),
        album: entry.album.clone(),
        path: song.path.clone(),
        scan: song.scan.clone(),
        exists: song.exists,
        time: song.time.clone(),
        release: song.release.clone(),
        bitrate: song.bitrate.clone(),
        sample: song.sample.clone(),
        depth: song.depth.clone(),
        format: song.format.clone(),
        rating: song.rating.clone(),
        size_bytes: song.size_bytes,
      }
    } else {
      ResolvedSong {
        lid: entry.lid.clone(),
        title: entry.title.clone(),
        performer: entry.performer.clone(),
        album: entry.album.clone(),
        path: None,
        scan: None,
        exists: false,
        time: None,
        release: None,
        bitrate: None,
        sample: None,
        depth: None,
        format: None,
        rating: None,
        size_bytes: None,
      }
    }
  }).collect();

  let queue = resolved_songs
    .iter()
    .filter(|song| song.exists && song.path.is_some())
    .cloned()
    .collect();

  ResolvedPlaylist {
    name: playlist.name.clone(),
    description: playlist.description.clone(),
    cover: playlist.cover.clone(),
    songs: resolved_songs,
    queue,
  }
}

fn save_resolved_playlist(resolved: &ResolvedPlaylist, tmp_dir: &std::path::Path) -> Result<(), String> {
  std::fs::create_dir_all(tmp_dir).map_err(|e| e.to_string())?;
  let filename = format!("{}.resolved.json", normalize_playlist_filename(&resolved.name));
  let resolved_path = tmp_dir.join(filename);
  let resolved_json = serde_json::to_string_pretty(resolved).map_err(|e| e.to_string())?;
  std::fs::write(&resolved_path, resolved_json).map_err(|e| e.to_string())
}

fn load_saved_collection_songs() -> Result<Vec<SongInfo>, String> {
  let db_dir = db_base_dir()?;
  let collection_path = db_dir.join("songs.json");
  if !collection_path.exists() {
    return Ok(Vec::new());
  }

  let raw = std::fs::read_to_string(&collection_path).map_err(|e| e.to_string())?;
  let songs: Vec<SongInfo> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(songs)
}

fn save_collection(songs: &[SongInfo]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
  let collection_path = db_dir.join("songs.json");
  let collection_json = serde_json::to_string_pretty(&songs).map_err(|e| e.to_string())?;
  std::fs::write(&collection_path, collection_json).map_err(|e| e.to_string())
}

fn validate_existing_collection(mut songs: Vec<SongInfo>) -> Vec<SongInfo> {
  for song in songs.iter_mut() {
    if song.exists {
      match &song.path {
        Some(path) => {
          if std::fs::metadata(path).is_err() {
            song.exists = false;
            song.path = None;
            song.scan = None;
          }
        }
        None => {
          song.exists = false;
          song.scan = None;
        }
      }
    }
  }
  songs
}

fn clear_tmp_dir() -> Result<(), String> {
  let save_dir = storage_base_dir()?;
  let tmp_dir = save_dir.join("tmp");
  if tmp_dir.exists() {
    std::fs::remove_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn prepare_tmp_dir() -> Result<std::path::PathBuf, String> {
  let save_dir = storage_base_dir()?;
  let tmp_dir = save_dir.join("tmp");
  if tmp_dir.exists() {
    std::fs::remove_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  }
  std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
  Ok(tmp_dir)
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

fn load_saved_paths() -> Result<Vec<String>, String> {
  let db_dir = db_base_dir()?;
  let paths_path = db_dir.join("paths.json");
  if !paths_path.exists() {
    return Ok(Vec::new());
  }
  let raw = std::fs::read_to_string(&paths_path).map_err(|e| e.to_string())?;
  let paths: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(paths)
}

fn save_saved_paths(paths: &[String]) -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let paths_path = db_dir.join("paths.json");
  let paths_json = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
  std::fs::write(&paths_path, paths_json).map_err(|e| e.to_string())
}

fn load_saved_collection_from_disk() -> Result<ScanResult, String> {
  let db_dir = db_base_dir()?;
  let collection_path = db_dir.join("songs.json");
  let playlists_dir = db_dir.join("playlists");
  let tmp_dir = prepare_tmp_dir()?;

  let songs = load_saved_collection_songs()?;
  let songs = validate_existing_collection(songs);
  save_collection(&songs)?;

  let mut playlists = load_all_playlists()?;
  if playlists.is_empty() {
    playlists.push(build_all_songs_playlist_from_songs(&songs));
  } else {
    ensure_all_songs_playlist(&mut playlists, &songs);
  }

  save_playlists_to_disk(&playlists)?;

  let mut resolved_playlists = Vec::new();
  for playlist in playlists.iter() {
    let resolved = resolve_playlist(playlist, &songs);
    save_resolved_playlist(&resolved, &tmp_dir)?;
    resolved_playlists.push(resolved);
  }

  let total = songs.len();
  Ok(ScanResult {
    songs,
    playlists,
    resolved_playlists,
    total,
    saved_file: collection_path.display().to_string(),
    saved_playlist_file: playlists_dir.join(format!("{}.json", normalize_playlist_filename("All songs"))).display().to_string(),
  })
}

fn scan_all_paths(paths: &[String]) -> Result<ScanResult, String> {
  let tmp_dir = prepare_tmp_dir()?;
  let mut song_map: HashMap<String, SongInfo> = HashMap::new();
  for path in paths {
    let file_paths = fsUtilities::findMusicFiles(path.clone())
      .map_err(|e| format!("failed to list files for {}: {}", path, e))?;

    for file_path in file_paths {
      let file = file_path.display().to_string();
      let parse_result = panic::catch_unwind(|| parse_mediainfo(&file, ""));
      let info = match parse_result {
        Ok(Ok(mut info)) => {
          info.path = Some(file.clone());
          info.scan = Some(path.clone());
          info.exists = true;
          info.id = make_song_id(&info);
          info
        }
        Ok(Err(err)) => {
          eprintln!("Skipping {}: {}", file, err);
          let mut info = SongInfo {
            id: String::new(),
            path: Some(file.clone()),
            scan: Some(path.clone()),
            exists: true,
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
            size_bytes: None,
          };
          info.id = make_song_id(&info);
          info
        }
        Err(panic_info) => {
          eprintln!("Panic parsing {}: {:?}", file, panic_info);
          let mut info = SongInfo {
            id: String::new(),
            path: Some(file.clone()),
            scan: Some(path.clone()),
            exists: true,
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
            size_bytes: None,
          };
          info.id = make_song_id(&info);
          info
        }
      };

      let dedupe_key = {
        let meta_key = metadata_key(&info.title, &info.album, &info.performer);
        if meta_key.is_empty() {
          format!("__path__{}", info.path.as_deref().unwrap_or_default())
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

  let mut songs: Vec<SongInfo> = song_map.into_iter().map(|(_key, song)| song).collect();
  let saved_songs = load_saved_collection_songs().unwrap_or_default();
  let existing_ids: HashSet<String> = songs.iter().map(|song| song.id.clone()).collect();

  for saved in saved_songs {
    if !existing_ids.contains(&saved.id) {
      let mut missing = saved.clone();
      missing.exists = false;
      missing.path = None;
      missing.scan = None;
      songs.push(missing);
    }
  }

  save_collection(&songs)?;

  let mut playlists = load_all_playlists().unwrap_or_else(|_| vec![build_all_songs_playlist_from_songs(&songs)]);
  if playlists.is_empty() {
    playlists.push(build_all_songs_playlist_from_songs(&songs));
  } else {
    ensure_all_songs_playlist(&mut playlists, &songs);
  }
  save_playlists_to_disk(&playlists)?;
  let mut resolved_playlists = Vec::new();
  for playlist in playlists.iter() {
    let resolved = resolve_playlist(playlist, &songs);
    save_resolved_playlist(&resolved, &tmp_dir)?;
    resolved_playlists.push(resolved);
  }

  let db_dir = db_base_dir()?;
  let playlist_path = db_dir.join("playlists").join(format!("{}.json", normalize_playlist_filename("All songs")));

  Ok(ScanResult {
    total: songs.len(),
    songs: songs.clone(),
    playlists,
    resolved_playlists,
    saved_file: db_dir.join("songs.json").display().to_string(),
    saved_playlist_file: playlist_path.display().to_string(),
  })
}

fn storage_base_dir() -> Result<std::path::PathBuf, String> {
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

fn ensure_default_save_files() -> Result<(), String> {
  let db_dir = db_base_dir()?;
  let playlists_dir = db_dir.join("playlists");
  std::fs::create_dir_all(&playlists_dir).map_err(|e| e.to_string())?;

  let paths_path = db_dir.join("paths.json");
  if !paths_path.exists() {
    let empty_paths: Vec<String> = Vec::new();
    let paths_json = serde_json::to_string_pretty(&empty_paths).map_err(|e| e.to_string())?;
    std::fs::write(&paths_path, paths_json).map_err(|e| e.to_string())?;
  }

  let collection_path = db_dir.join("songs.json");
  if !collection_path.exists() {
    let empty_collection: Vec<SongInfo> = Vec::new();
    let collection_json = serde_json::to_string_pretty(&empty_collection).map_err(|e| e.to_string())?;
    std::fs::write(&collection_path, collection_json).map_err(|e| e.to_string())?;
  }

  let playlist_path = playlists_dir.join(format!("{}.json", normalize_playlist_filename("All songs")));

  let legacy_files = [
    playlists_dir.join("AllSong.json"),
    playlists_dir.join("All_songs.json"),
  ];
  for legacy in legacy_files.iter() {
    if legacy.exists() && legacy != &playlist_path {
      let _ = std::fs::remove_file(legacy);
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
  let size_bytes = std::fs::metadata(path).ok().map(|meta| meta.len());

  Ok(SongInfo {
    id: song_id.to_string(),
    path: Some(path.to_string()),
    scan: None,
    exists: true,
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
    size_bytes,
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
    if saved_paths.is_empty() {
      let songs: Vec<SongInfo> = Vec::new();
      save_collection(&songs)?;
      let playlists = vec![build_all_songs_playlist_from_songs(&songs)];
      let tmp_dir = prepare_tmp_dir()?;
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
        saved_file: storage_base_dir()?.join("db").join("songs.json").display().to_string(),
        saved_playlist_file: storage_base_dir()?.join("db").join("playlists").join(format!("{}.json", normalize_playlist_filename("All songs"))).display().to_string(),
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

#[tauri::command]
fn load_saved_collection() -> Result<ScanResult, String> {
  panic::catch_unwind(|| load_saved_collection_from_disk())
    .map_err(|panic_info| {
      eprintln!("load_saved_collection panic: {:?}", panic_info);
      "Internal load error".to_string()
    })?
}

#[tauri::command]
fn sync_saved_paths() -> Result<ScanResult, String> {
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
fn play_track(path: String, volume: f32, state: tauri::State<AudioController>, app_handle: tauri::AppHandle) -> Result<(), String> {
  state.0
    .send(AudioCommand::Play { path, volume, app_handle })
    .map_err(|e| format!("Failed to send audio play command: {}", e))
}

#[tauri::command]
fn seek_playback(seconds: u64, state: tauri::State<AudioController>, app_handle: tauri::AppHandle) -> Result<(), String> {
  state.0
    .send(AudioCommand::Seek { seconds, app_handle })
    .map_err(|e| format!("Failed to send audio seek command: {}", e))
}

#[tauri::command]
fn pause_playback(state: tauri::State<AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Pause)
    .map_err(|e| format!("Failed to send audio pause command: {}", e))
}

#[tauri::command]
fn resume_playback(state: tauri::State<AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Resume)
    .map_err(|e| format!("Failed to send audio resume command: {}", e))
}

#[tauri::command]
fn stop_playback(state: tauri::State<AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::Stop)
    .map_err(|e| format!("Failed to send audio stop command: {}", e))
}

#[tauri::command]
fn set_playback_volume(volume: f32, state: tauri::State<AudioController>) -> Result<(), String> {
  state.0
    .send(AudioCommand::SetVolume(volume))
    .map_err(|e| format!("Failed to send volume command: {}", e))
}

#[tauri::command]
fn save_playlist(playlist: Playlist, old_name: Option<String>) -> Result<ResolvedPlaylist, String> {
  panic::catch_unwind(|| {
    let mut playlists = load_all_playlists().unwrap_or_else(|_| Vec::new());
    if let Some(old) = old_name.as_ref() {
      if old != &playlist.name {
        let db_dir = db_base_dir()?;
        let old_path = db_dir.join("playlists").join(format!("{}.json", normalize_playlist_filename(old)));
        if old_path.exists() {
          let _ = std::fs::remove_file(&old_path);
        }
        let tmp_dir = prepare_tmp_dir()?;
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

    save_playlists_to_disk(&playlists)?;

    let songs = load_saved_collection_songs()?;
    let validated_songs = validate_existing_collection(songs);
    let resolved = resolve_playlist(&playlist, &validated_songs);
    let save_dir = storage_base_dir()?;
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
fn delete_playlist(name: String) -> Result<(), String> {
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

    let tmp_dir = prepare_tmp_dir()?;
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
//-------------------------------------------------------


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

  tauri::Builder::default()
    .manage(audio_controller)
    .menu(tauri::Menu::os_default(&context.package_info().name))
    .invoke_handler(tauri::generate_handler![scan_music_files, get_saved_paths, remove_saved_path, load_saved_collection, sync_saved_paths, play_track, seek_playback, pause_playback, resume_playback, stop_playback, set_playback_volume, save_playlist, delete_playlist])
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
