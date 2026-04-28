import { Playlist, PlaylistSong, QueuedSong, SongInfo, SessionQueueSong, ResolvedPlaylist } from './models'

export interface AppState {
  selectedPaths: Set<string>
  currentPlaylists: Playlist[]
  currentResolvedPlaylists: Record<string, ResolvedPlaylist>
  selectedPlaylistName: string | null
  currentSearchQuery: string
  currentSongsById: Record<string, SongInfo>
  currentSongsByMetadata: Record<string, SongInfo[]>
  currentSongsByTitlePerformer: Record<string, SongInfo[]>
  currentSongsByTitle: Record<string, SongInfo[]>
  playlistModalPendingSongs: PlaylistSong[]
  playbackQueue: QueuedSong[]
  currentPlaybackIndex: number
  currentPlaybackPlaylistName: string | null
  shuffleEnabled: boolean
  repeatMode: 'off' | 'playlist' | 'single'
  currentVolume: number
  isPlaying: boolean
  isPaused: boolean
  playbackElapsedSeconds: number
  playbackDurationSeconds: number
  isTimeBarScrubbing: boolean
  seekPlaybackFrame: number | null
  playbackProgressInterval: number | null
}

export const appState: AppState = {
  selectedPaths: new Set<string>(),
  currentPlaylists: [],
  currentResolvedPlaylists: {},
  selectedPlaylistName: null,
  currentSearchQuery: '',
  currentSongsById: {},
  currentSongsByMetadata: {},
  currentSongsByTitlePerformer: {},
  currentSongsByTitle: {},
  playlistModalPendingSongs: [],
  playbackQueue: [],
  currentPlaybackIndex: 0,
  currentPlaybackPlaylistName: null,
  shuffleEnabled: false,
  repeatMode: 'off',
  currentVolume: 0.75,
  isPlaying: false,
  isPaused: false,
  playbackElapsedSeconds: 0,
  playbackDurationSeconds: 0,
  isTimeBarScrubbing: false,
  seekPlaybackFrame: null,
  playbackProgressInterval: null,
  isQueuePopupOpen: false,
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() || ''
}

export function getSongMetadataKey(song: { title?: string; album?: string; performer?: string }) {
  const title = normalizeText(song.title)
  const album = normalizeText(song.album)
  const performer = normalizeText(song.performer)
  if (!title && !album && !performer) return ''
  return `${title}|${album}|${performer}`
}

export function getSongTitlePerformerKey(song: { title?: string; performer?: string }) {
  const title = normalizeText(song.title)
  const performer = normalizeText(song.performer)
  if (!title || !performer) return ''
  return `${title}|${performer}`
}

export function getSongTitleKey(song: { title?: string }) {
  return normalizeText(song.title)
}

export function setCurrentSongs(songs: SongInfo[]) {
  appState.currentSongsById = {}
  appState.currentSongsByMetadata = {}
  appState.currentSongsByTitlePerformer = {}
  appState.currentSongsByTitle = {}

  songs.forEach((song) => {
    appState.currentSongsById[song.id] = song

    const metaKey = getSongMetadataKey(song)
    if (metaKey) {
      if (!appState.currentSongsByMetadata[metaKey]) appState.currentSongsByMetadata[metaKey] = []
      appState.currentSongsByMetadata[metaKey].push(song)
    }

    const titlePerformerKey = getSongTitlePerformerKey(song)
    if (titlePerformerKey) {
      if (!appState.currentSongsByTitlePerformer[titlePerformerKey]) appState.currentSongsByTitlePerformer[titlePerformerKey] = []
      appState.currentSongsByTitlePerformer[titlePerformerKey].push(song)
    }

    const titleKey = getSongTitleKey(song)
    if (titleKey) {
      if (!appState.currentSongsByTitle[titleKey]) appState.currentSongsByTitle[titleKey] = []
      appState.currentSongsByTitle[titleKey].push(song)
    }
  })
}

export function buildQueuedSong(song: SongInfo, lid: string): QueuedSong {
  return {
    ...song,
    lid,
  }
}

export function buildSessionQueueSong(song: QueuedSong): SessionQueueSong {
  return {
    id: song.id,
    lid: song.lid,
    title: song.title,
    performer: song.performer,
    album: song.album,
    path: song.path,
  }
}

export function resolveSessionSongToQueuedSong(entry: SessionQueueSong): QueuedSong | null {
  if (entry.id) {
    const direct = appState.currentSongsById[entry.id]
    if (direct && direct.path && direct.exists) {
      return buildQueuedSong(direct, entry.lid)
    }
  }

  if (entry.path) {
    const pathMatch = Object.values(appState.currentSongsById).find(
      (song) => song.path === entry.path && song.exists,
    )
    if (pathMatch) {
      return buildQueuedSong(pathMatch, entry.lid)
    }
  }

  const playlistSong: PlaylistSong = {
    lid: entry.lid,
    title: entry.title,
    performer: entry.performer,
    album: entry.album,
  }
  const resolved = findSongInfoForPlaylistSong(playlistSong)
  if (!resolved || !resolved.path || !resolved.exists) {
    return null
  }
  return buildQueuedSong(resolved, entry.lid)
}

export function resolvePlaylistSongToQueuedSong(entry: PlaylistSong): QueuedSong | null {
  const song = findSongInfoForPlaylistSong(entry)
  if (!song || !song.path) return null
  return buildQueuedSong(song, entry.lid)
}

export function findSongInfoForPlaylistSong(entry: PlaylistSong) {
  const direct = appState.currentSongsById[entry.lid]
  if (direct) {
    return direct
  }

  const entryMeta = {
    title: entry.title,
    album: entry.album,
    performer: entry.performer,
  }

  const metadataKey = getSongMetadataKey(entryMeta)
  if (metadataKey && appState.currentSongsByMetadata[metadataKey]?.length === 1) {
    return appState.currentSongsByMetadata[metadataKey][0]
  }

  const titlePerformerKey = getSongTitlePerformerKey(entryMeta)
  if (titlePerformerKey && appState.currentSongsByTitlePerformer[titlePerformerKey]?.length === 1) {
    return appState.currentSongsByTitlePerformer[titlePerformerKey][0]
  }

  const titleKey = getSongTitleKey(entryMeta)
  if (titleKey && appState.currentSongsByTitle[titleKey]?.length === 1) {
    return appState.currentSongsByTitle[titleKey][0]
  }

  return appState.currentSongsByMetadata[metadataKey]?.[0]
    || appState.currentSongsByTitlePerformer[titlePerformerKey]?.[0]
    || appState.currentSongsByTitle[titleKey]?.[0]
}
