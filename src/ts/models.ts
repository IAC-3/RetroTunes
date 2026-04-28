export type RepeatMode = 'off' | 'playlist' | 'single'

export interface QueuedSong {
  id: string
  lid: string
  title?: string
  performer?: string
  album?: string
  path?: string
  scan?: string
  exists: boolean
  cover?: boolean
  time?: string
  release?: string
  bitrate?: string
  sample?: string
  depth?: string
  format?: string
  rating?: string
  lyrics?: string
  size_bytes?: number
}

export interface SessionQueueSong {
  id?: string
  lid: string
  title?: string
  performer?: string
  album?: string
  path?: string
}

export interface SessionState {
  queue: SessionQueueSong[]
  currentIndex: number
  currentPositionSeconds: number
  playlistName: string | null
  currentVolume: number
  repeatMode: RepeatMode
  shuffleEnabled: boolean
  isPlaying: boolean
  isPaused: boolean
}

export interface SongInfo {
  id: string
  path?: string
  scan?: string
  exists: boolean
  cover?: boolean
  title?: string
  time?: string
  performer?: string
  album?: string
  release?: string
  bitrate?: string
  sample?: string
  depth?: string
  format?: string
  rating?: string
  lyrics?: string
  size_bytes?: number
}

export interface PlaylistSong {
  lid: string
  title?: string
  performer?: string
  album?: string
}

export interface Playlist {
  name: string
  description: string
  cover: string
  songs: PlaylistSong[]
}

export interface ResolvedSongInfo extends SongInfo {
  lid: string
}

export interface ResolvedPlaylist {
  name: string
  description: string
  cover: string
  songs: ResolvedSongInfo[]
  queue: ResolvedSongInfo[]
}

export interface ScanResult {
  songs: SongInfo[]
  playlists: Playlist[]
  resolved_playlists: ResolvedPlaylist[]
  total: number
  saved_file: string
  saved_playlist_file: string
}
