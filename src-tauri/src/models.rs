use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct SongInfo {
  pub id: String,
  pub path: Option<String>,
  pub scan: Option<String>,
  pub exists: bool,
  pub cover: Option<bool>,
  pub title: Option<String>,
  pub time: Option<String>,
  pub performer: Option<String>,
  pub album: Option<String>,
  pub release: Option<String>,
  pub bitrate: Option<String>,
  pub sample: Option<String>,
  pub depth: Option<String>,
  pub format: Option<String>,
  pub rating: Option<String>,
  pub lyrics: Option<String>,
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

fn default_current_volume() -> f32 {
  1.0
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionQueueSong {
  pub id: Option<String>,
  pub lid: String,
  pub title: Option<String>,
  pub performer: Option<String>,
  pub album: Option<String>,
  pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
  pub queue: Vec<SessionQueueSong>,
  pub current_index: usize,
  pub current_position_seconds: u64,
  #[serde(default = "default_current_volume")]
  pub current_volume: f32,
  pub repeat_mode: String,
  pub shuffle_enabled: bool,
  pub is_playing: bool,
  pub is_paused: bool,
}

#[derive(Serialize)]
pub struct ScanResult {
  pub songs: Vec<SongInfo>,
  pub playlists: Vec<Playlist>,
  pub resolved_playlists: Vec<ResolvedPlaylist>,
  pub total: usize,
  pub saved_file: String,
  pub saved_playlist_file: String,
}
