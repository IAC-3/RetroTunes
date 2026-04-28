use rsmediainfo::Track;
use serde_json::{Value, json};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use crate::models::{PlaylistSong, SongInfo};

pub fn make_id(path: &str) -> String {
  let mut hasher = DefaultHasher::new();
  path.hash(&mut hasher);
  format!("{:016x}", hasher.finish())
}

pub fn normalized_metadata_value(value: &Option<String>) -> String {
  value
    .as_ref()
    .map(|s| s.trim().to_lowercase())
    .filter(|s| !s.is_empty())
    .unwrap_or_default()
}

pub fn metadata_key(title: &Option<String>, album: &Option<String>, performer: &Option<String>) -> String {
  let title = normalized_metadata_value(title);
  let album = normalized_metadata_value(album);
  let performer = normalized_metadata_value(performer);
  if title.is_empty() && album.is_empty() && performer.is_empty() {
    String::new()
  } else {
    format!("{}|{}|{}", title, album, performer)
  }
}

pub fn make_song_id(song: &SongInfo) -> String {
  let key = metadata_key(&song.title, &song.album, &song.performer);
  if !key.is_empty() {
    make_id(&key)
  } else if let Some(path) = &song.path {
    make_id(path)
  } else {
    make_id("")
  }
}

pub fn playlist_song_key(entry: &PlaylistSong) -> String {
  let key = metadata_key(&entry.title, &entry.album, &entry.performer);
  if !key.is_empty() {
    key
  } else {
    entry.lid.clone()
  }
}

pub fn playlist_song_to_json(entry: &PlaylistSong) -> Value {
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

pub fn parse_playlist_song_from_map(key: &str, item: &Value) -> Option<PlaylistSong> {
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

pub fn parse_playlist_song(item: &Value) -> Option<PlaylistSong> {
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

pub fn playlist_filename(name: &str) -> String {
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

pub fn normalize_playlist_filename(name: &str) -> String {
  let file_name = playlist_filename(name);
  if file_name.is_empty() {
    "Playlist".to_string()
  } else {
    file_name
  }
}

pub fn parse_duration_string(value: &str) -> Option<String> {
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

pub fn get_string_field(track: Option<&Track>, keys: &[&str]) -> Option<String> {
  track
    .and_then(|track| {
      keys
        .iter()
        .find_map(|key| track.get_string(key).map(String::from))
    })
}

pub fn get_int_field(track: Option<&Track>, keys: &[&str]) -> Option<i64> {
  track.and_then(|track| {
    keys
      .iter()
      .find_map(|key| track.get_int(key))
  })
}
