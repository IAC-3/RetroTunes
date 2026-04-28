use std::collections::{HashMap, HashSet};
use std::panic;
use std::path::Path;
use serde_json::Value;
use rsmediainfo::MediaInfo;
use crate::fsUtilities;
use crate::models::{Playlist, PlaylistSong, ResolvedPlaylist, ResolvedSong, ScanResult, SongInfo};
use crate::storage::{db_base_dir, load_saved_collection_songs, save_collection, prepare_tmp_dir, save_playlists_to_disk};
use crate::utils::{metadata_key, make_song_id, parse_duration_string, get_string_field, get_int_field, parse_playlist_song, parse_playlist_song_from_map, normalize_playlist_filename};

pub fn parse_playlist_file(path: &Path) -> Result<Playlist, String> {
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

pub fn load_all_playlists() -> Result<Vec<Playlist>, String> {
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

pub fn build_all_songs_playlist_from_songs(songs: &[SongInfo]) -> Playlist {
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

pub fn ensure_all_songs_playlist(playlists: &mut Vec<Playlist>, songs: &[SongInfo]) {
  let all_songs = build_all_songs_playlist_from_songs(songs);
  if let Some(existing) = playlists.iter_mut().find(|playlist| playlist.name == "All songs") {
    *existing = all_songs;
  } else {
    playlists.push(all_songs);
  }
}

pub fn song_info_from_playlist_song(entry: &PlaylistSong) -> SongInfo {
  let mut info = SongInfo {
    id: String::new(),
    path: None,
    scan: None,
    exists: false,
    cover: None,
    title: entry.title.clone(),
    time: None,
    performer: entry.performer.clone(),
    album: entry.album.clone(),
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

pub fn add_missing_playlist_songs_to_collection(playlist: &Playlist, songs: &mut Vec<SongInfo>) {
  let existing_ids: HashSet<String> = songs.iter().map(|song| song.id.clone()).collect();
  for entry in playlist.songs.iter() {
    let song_info = song_info_from_playlist_song(entry);
    if existing_ids.contains(&song_info.id) {
      continue;
    }
    songs.push(song_info);
  }
}

pub fn resolve_playlist(playlist: &Playlist, songs: &[SongInfo]) -> ResolvedPlaylist {
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

pub fn save_resolved_playlist(resolved: &ResolvedPlaylist, tmp_dir: &Path) -> Result<(), String> {
  std::fs::create_dir_all(tmp_dir).map_err(|e| e.to_string())?;
  let filename = format!("{}.resolved.json", normalize_playlist_filename(&resolved.name));
  let resolved_path = tmp_dir.join(filename);
  let resolved_json = serde_json::to_string_pretty(resolved).map_err(|e| e.to_string())?;
  std::fs::write(&resolved_path, resolved_json).map_err(|e| e.to_string())
}

pub fn validate_existing_collection(mut songs: Vec<SongInfo>) -> Vec<SongInfo> {
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

pub fn load_saved_collection_from_disk() -> Result<ScanResult, String> {
  let db_dir = db_base_dir()?;
  let collection_path = db_dir.join("songs.json");
  let playlists_dir = db_dir.join("playlists");
  let tmp_dir = prepare_tmp_dir()?;

  let songs = load_saved_collection_songs()?;
  let songs = validate_existing_collection(songs);
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

pub fn scan_all_paths(paths: &[String]) -> Result<ScanResult, String> {
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

fn parse_int_value(value: &Option<String>) -> i64 {
  value
    .as_ref()
    .and_then(|s| s.split_whitespace().next()?.parse::<i64>().ok())
    .unwrap_or(0)
}
