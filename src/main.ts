import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/api/dialog'
import { readBinaryFile } from '@tauri-apps/api/fs'

let pathsContainerEl: HTMLElement;
let addPathBtnEl: HTMLElement;
let playlistsContainerEl: HTMLElement;
let addPlaylistBtnEl: HTMLElement;
let toastEl: HTMLElement;
let playlistCoverEl: HTMLImageElement;
let playlistTitleEl: HTMLElement;
let playlistDescriptionEl: HTMLElement;
let playButtonEl: HTMLButtonElement;
let searchInputEl: HTMLInputElement;
let searchButtonEl: HTMLElement;
let bottomBarTextEl: HTMLElement;
let fixedPlaylistEl: HTMLElement;
const selectedPaths = new Set<string>()
let currentPlaylists: Playlist[] = []
let currentResolvedPlaylists: Record<string, ResolvedPlaylist> = {}
let selectedPlaylistName: string | null = null
let currentSearchQuery = ''
let currentSongsById: Record<string, SongInfo> = {}
let currentSongsByMetadata: Record<string, SongInfo[]> = {}
let currentSongsByTitlePerformer: Record<string, SongInfo[]> = {}
let currentSongsByTitle: Record<string, SongInfo[]> = {}
interface QueuedSong extends SongInfo {
  lid: string
}

let playbackQueue: QueuedSong[] = []
let currentPlaybackIndex = 0
let currentPlaybackPlaylistName: string | null = null
let shuffleEnabled = false
let repeatMode: 'off' | 'playlist' | 'single' = 'off'
let currentVolume = 0.75
let isPlaying = false
let isPaused = false
let playToggleButtonEl: HTMLButtonElement
let shuffleButtonEl: HTMLButtonElement
let prevButtonEl: HTMLButtonElement
let nextButtonEl: HTMLButtonElement
let repeatButtonEl: HTMLButtonElement
let volumeSliderEl: HTMLInputElement
let trackTitleEl: HTMLElement
let trackPerformerEl: HTMLElement
let timeStartEl: HTMLElement
let timeEndEl: HTMLElement
let timeBarTrackEl: HTMLElement
let timeBarFillEl: HTMLElement
let timeBarThumbEl: HTMLElement
let isTimeBarScrubbing = false
let playbackProgressInterval: number | null = null
let playbackElapsedSeconds = 0
let playbackDurationSeconds = 0
let loadingOverlayEl: HTMLElement
let playlistModalEl: HTMLElement
let playlistNameInputEl: HTMLInputElement
let playlistDescriptionInputEl: HTMLTextAreaElement
let playlistCoverInputEl: HTMLInputElement
let playlistCoverPreviewEl: HTMLImageElement
let playlistCoverData: string | null = null
let playlistModalTitleEl: HTMLElement
let playlistModalSaveButtonEl: HTMLButtonElement
let playlistModalDeleteButtonEl: HTMLButtonElement
let playlistEditButtonEl: HTMLButtonElement
let playlistModalMode: 'create' | 'edit' = 'create'
let playlistOriginalName: string | null = null
let contextMenuEl: HTMLElement
let contextMenuPlaylistName: string | null = null

interface SongInfo {
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
}

interface PlaylistSong {
  lid: string
  title?: string
  performer?: string
  album?: string
}

interface Playlist {
  name: string
  description: string
  cover: string
  songs: PlaylistSong[]
}

interface ResolvedSongInfo extends SongInfo {
  lid: string
}

interface ResolvedPlaylist {
  name: string
  description: string
  cover: string
  songs: ResolvedSongInfo[]
  queue: ResolvedSongInfo[]
}

interface ScanResult {
  songs: SongInfo[]
  playlists: Playlist[]
  resolved_playlists: ResolvedPlaylist[]
  total: number
  saved_file: string
  saved_playlist_file: string
}

function showToast(message: string) {
  toastEl.textContent = message
  toastEl.classList.add('toast-visible')

  setTimeout(() => {
    toastEl.classList.remove('toast-visible')
  }, 3000)
}

function showSyncOverlay(message: string) {
  if (!loadingOverlayEl) return
  loadingOverlayEl.classList.remove('hidden')
  loadingOverlayEl.querySelector('.sync-overlay-text')!.textContent = message
}

function hideSyncOverlay() {
  if (!loadingOverlayEl) return
  loadingOverlayEl.classList.add('hidden')
}

function openCreatePlaylistModal() {
  playlistModalMode = 'create'
  playlistOriginalName = null
  playlistModalTitleEl.textContent = 'Create Playlist'
  playlistModalSaveButtonEl.textContent = 'Create'
  playlistModalDeleteButtonEl.classList.add('hidden')
  playlistNameInputEl.value = ''
  playlistDescriptionInputEl.value = ''
  playlistCoverData = null
  playlistCoverPreviewEl.src = ''
  playlistCoverPreviewEl.classList.add('hidden')
  playlistCoverInputEl.value = ''
  playlistModalEl.classList.remove('hidden')
}

function openEditPlaylistModal() {
  if (!selectedPlaylistName || selectedPlaylistName === 'All songs') {
    showToast('Cannot edit All songs playlist')
    return
  }

  const playlist = currentPlaylists.find((pl) => pl.name === selectedPlaylistName)
  if (!playlist) {
    showToast('Playlist not found')
    return
  }

  playlistModalMode = 'edit'
  playlistOriginalName = playlist.name
  playlistModalTitleEl.textContent = 'Edit Playlist'
  playlistModalSaveButtonEl.textContent = 'Save'
  playlistModalDeleteButtonEl.classList.remove('hidden')

  playlistNameInputEl.value = playlist.name
  playlistDescriptionInputEl.value = playlist.description
  playlistCoverData = playlist.cover || null
  if (playlistCoverData) {
    playlistCoverPreviewEl.src = playlistCoverData
    playlistCoverPreviewEl.classList.remove('hidden')
  } else {
    playlistCoverPreviewEl.src = ''
    playlistCoverPreviewEl.classList.add('hidden')
  }
  playlistCoverInputEl.value = ''
  playlistModalEl.classList.remove('hidden')
}

function closeCreatePlaylistModal() {
  playlistModalEl.classList.add('hidden')
}

function setPlaylistCoverPreview(dataUrl: string) {
  playlistCoverData = dataUrl
  playlistCoverPreviewEl.src = dataUrl
  playlistCoverPreviewEl.classList.remove('hidden')
}

function handleCoverFileChange() {
  const file = playlistCoverInputEl.files?.[0]
  if (!file) {
    playlistCoverData = null
    playlistCoverPreviewEl.classList.add('hidden')
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result
    if (typeof result === 'string') {
      setPlaylistCoverPreview(result)
    }
  }
  reader.readAsDataURL(file)
}

async function savePlaylistModal() {
  const name = playlistNameInputEl.value.trim()
  const description = playlistDescriptionInputEl.value.trim()
  if (!name) {
    showToast('Playlist name cannot be empty')
    return
  }

  const isEditing = playlistModalMode === 'edit'
  const originalName = playlistOriginalName

  if (isEditing) {
    const duplicate = currentPlaylists.find((pl) => pl.name.toLowerCase() === name.toLowerCase())
    if (duplicate && duplicate.name !== originalName) {
      showToast('Playlist name already exists')
      return
    }
  } else {
    if (currentPlaylists.some((pl) => pl.name.toLowerCase() === name.toLowerCase())) {
      showToast('Playlist name already exists')
      return
    }
  }

  const existingSongs = currentPlaylists.find((pl) => pl.name === originalName)?.songs || []
  const playlist: Playlist = {
    name,
    description,
    cover: playlistCoverData || 'assets/AllSongs/CoverArt/cover.png',
    songs: existingSongs,
  }

  try {
    const result = await invoke<ResolvedPlaylist>('save_playlist', {
      playlist,
      old_name: originalName,
    })

    if (isEditing && originalName) {
      currentPlaylists = currentPlaylists.map((pl) =>
        pl.name === originalName ? playlist : pl
      )
      if (originalName !== name) {
        delete currentResolvedPlaylists[originalName]
      }
    } else {
      currentPlaylists.push(playlist)
    }

    currentResolvedPlaylists[result.name] = result
    displayPlaylists(currentPlaylists)
    setSelectedPlaylist(result.name)
    closeCreatePlaylistModal()
    showToast(isEditing ? `Playlist updated` : `Playlist ${name} created`)
  } catch (error) {
    console.error('Save playlist error:', error)
    showToast('Unable to save playlist')
  }
}

async function deletePlaylistFromModal() {
  if (!playlistOriginalName) {
    showToast('No playlist selected')
    return
  }

  if (playlistOriginalName === 'All songs') {
    showToast('Cannot delete All songs playlist')
    return
  }

  const confirmed = confirm(`Delete playlist "${playlistOriginalName}"?`)
  if (!confirmed) {
    return
  }

  try {
    const result = await withSyncing('Syncing playlists after playlist delete...', async () => {
      await invoke('delete_playlist', { name: playlistOriginalName })
      return await invoke<ScanResult>('load_saved_collection')
    })

    currentResolvedPlaylists = {}
    result.resolved_playlists?.forEach((playlist) => {
      currentResolvedPlaylists[playlist.name] = playlist
    })
    currentPlaylists = result.playlists
    setCurrentSongs(result.songs)
    displayPlaylists(result.playlists)

    const defaultPlaylist = result.playlists.find((pl) => pl.name === 'All songs') || result.playlists[0]
    if (defaultPlaylist) {
      setSelectedPlaylist(defaultPlaylist.name)
    }

    closeCreatePlaylistModal()
    showToast(`Playlist ${playlistOriginalName} deleted`)
  } catch (error) {
    console.error('Delete playlist error:', error)
    showToast('Unable to delete playlist')
  }
}

function closeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.classList.add('hidden')
  }
}

function openContextMenu(event: MouseEvent, playlistName: string, entry: PlaylistSong) {
  event.preventDefault()
  event.stopPropagation()

  contextMenuPlaylistName = playlistName
  contextMenuEl.textContent = ''

  const label = document.createElement('div')
  label.className = 'context-menu-label'
  label.textContent = 'Add to playlist'
  contextMenuEl.appendChild(label)

  const destinationPlaylists = currentPlaylists.filter((pl) => pl.name !== playlistName && pl.name !== 'All songs')
  if (destinationPlaylists.length === 0) {
    const emptyItem = document.createElement('div')
    emptyItem.className = 'context-menu-item disabled'
    emptyItem.textContent = 'No playlists available'
    contextMenuEl.appendChild(emptyItem)
  } else {
    destinationPlaylists.forEach((target) => {
      const item = document.createElement('div')
      item.className = 'context-menu-item'
      item.textContent = target.name
      item.addEventListener('click', async () => {
        closeContextMenu()
        await addSongToPlaylist(entry, target.name)
      })
      contextMenuEl.appendChild(item)
    })
  }

  contextMenuEl.style.left = `${event.clientX}px`
  contextMenuEl.style.top = `${event.clientY}px`
  contextMenuEl.classList.remove('hidden')
}

async function addSongToPlaylist(entry: PlaylistSong, targetPlaylistName: string) {
  const targetPlaylist = currentPlaylists.find((pl) => pl.name === targetPlaylistName)
  if (!targetPlaylist) {
    showToast('Playlist not found')
    return
  }

  const existsAlready = targetPlaylist.songs.some((song) => song.lid === entry.lid)
  if (existsAlready) {
    showToast('Song already in playlist')
    return
  }

  const updatedPlaylist: Playlist = {
    ...targetPlaylist,
    songs: [...targetPlaylist.songs, entry],
  }

  try {
    const result = await invoke<ResolvedPlaylist>('save_playlist', { playlist: updatedPlaylist })
    currentPlaylists = currentPlaylists.map((pl) => pl.name === targetPlaylistName ? updatedPlaylist : pl)
    currentResolvedPlaylists[result.name] = result
    showToast(`Added to ${targetPlaylistName}`)
  } catch (error) {
    console.error('Add song error:', error)
    showToast('Unable to add song to playlist')
  }
}

async function withSyncing<T>(message: string, action: () => Promise<T>): Promise<T> {
  showSyncOverlay(message)
  try {
    return await action()
  } finally {
    hideSyncOverlay()
  }
}

function createPathEntry(path: string) {
  const pathDisplayEl = document.createElement('div');
  pathDisplayEl.className = 'path-display';

  const pathText = document.createElement('span');
  pathText.className = 'path-text';
  pathText.textContent = path;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-path-btn';
  removeBtn.textContent = 'REMOVE';
  removeBtn.addEventListener('click', () => {
    removePath(pathDisplayEl, path)
  });

  pathDisplayEl.appendChild(pathText);
  pathDisplayEl.appendChild(removeBtn);
  pathsContainerEl.appendChild(pathDisplayEl);
}

function handlePlaylistClick(playlist: Playlist) {
  const resolvedPlaylist = currentResolvedPlaylists[playlist.name]
  const missingSongs = resolvedPlaylist
    ? resolvedPlaylist.songs.filter((song) => !song.exists)
    : playlist.songs
        .map((entry) => ({ entry, song: findSongInfoForPlaylistSong(entry) }))
        .filter(({ song }) => !song || !song.exists)
        .map(({ entry }) => entry)

  if (missingSongs.length > 0) {
    const missingLabels = missingSongs.map((entry) => {
      const title = entry.title ?? 'unknown title'
      const performer = entry.performer ?? 'unknown performer'
      return `${title} - ${performer}`
    })
    showToast(`some file missing: ${missingLabels.join(', ')}`)
    console.log('Missing playlist songs:', missingLabels)
  } else {
    showToast('No missing songs')
    console.log('Playlist has no missing songs')
  }
}

function updatePlaylistBar(playlist: Playlist) {
  playlistTitleEl.textContent = playlist.name
  playlistDescriptionEl.textContent = playlist.description
  if (playlist.cover) {
    playlistCoverEl.src = playlist.cover
    playlistCoverEl.alt = `${playlist.name} cover`
  } else {
    playlistCoverEl.src = ''
    playlistCoverEl.alt = 'No cover available'
  }
}

function songMatchesQuery(entry: PlaylistSong, query: string) {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const fields = [
    entry.title,
    entry.album,
    entry.performer,
  ]
  return fields.some((value) => value?.toLowerCase().includes(lowerQuery))
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() || ''
}

function getSongMetadataKey(song: { title?: string; album?: string; performer?: string }) {
  const title = normalizeText(song.title)
  const album = normalizeText(song.album)
  const performer = normalizeText(song.performer)
  if (!title && !album && !performer) return ''
  return `${title}|${album}|${performer}`
}

function getSongTitlePerformerKey(song: { title?: string; performer?: string }) {
  const title = normalizeText(song.title)
  const performer = normalizeText(song.performer)
  if (!title || !performer) return ''
  return `${title}|${performer}`
}

function getSongTitleKey(song: { title?: string }) {
  return normalizeText(song.title)
}

function setCurrentSongs(songs: SongInfo[]) {
  currentSongsById = {}
  currentSongsByMetadata = {}
  currentSongsByTitlePerformer = {}
  currentSongsByTitle = {}

  songs.forEach((song) => {
    currentSongsById[song.id] = song

    const metaKey = getSongMetadataKey(song)
    if (metaKey) {
      if (!currentSongsByMetadata[metaKey]) currentSongsByMetadata[metaKey] = []
      currentSongsByMetadata[metaKey].push(song)
    }

    const titlePerformerKey = getSongTitlePerformerKey(song)
    if (titlePerformerKey) {
      if (!currentSongsByTitlePerformer[titlePerformerKey]) currentSongsByTitlePerformer[titlePerformerKey] = []
      currentSongsByTitlePerformer[titlePerformerKey].push(song)
    }

    const titleKey = getSongTitleKey(song)
    if (titleKey) {
      if (!currentSongsByTitle[titleKey]) currentSongsByTitle[titleKey] = []
      currentSongsByTitle[titleKey].push(song)
    }
  })
}

function buildQueuedSong(song: SongInfo, lid: string): QueuedSong {
  return {
    ...song,
    lid,
  }
}

function findSongInfoForPlaylistSong(entry: PlaylistSong) {
  const direct = currentSongsById[entry.lid]
  if (direct) {
    return direct
  }

  const entryMeta = {
    title: entry.title,
    album: entry.album,
    performer: entry.performer,
  }

  const metadataKey = getSongMetadataKey(entryMeta)
  if (metadataKey && currentSongsByMetadata[metadataKey]?.length === 1) {
    return currentSongsByMetadata[metadataKey][0]
  }

  const titlePerformerKey = getSongTitlePerformerKey(entryMeta)
  if (titlePerformerKey && currentSongsByTitlePerformer[titlePerformerKey]?.length === 1) {
    return currentSongsByTitlePerformer[titlePerformerKey][0]
  }

  const titleKey = getSongTitleKey(entryMeta)
  if (titleKey && currentSongsByTitle[titleKey]?.length === 1) {
    return currentSongsByTitle[titleKey][0]
  }

  return currentSongsByMetadata[metadataKey]?.[0]
    || currentSongsByTitlePerformer[titlePerformerKey]?.[0]
    || currentSongsByTitle[titleKey]?.[0]
}

function searchCurrentPlaylist() {
  currentSearchQuery = searchInputEl.value.trim()
  if (!selectedPlaylistName) return
  const playlist = currentPlaylists.find((pl) => pl.name === selectedPlaylistName)
  if (playlist) {
    updateSongTable(playlist, currentSearchQuery)
  }
}

function preparePlaylistQueue(playlist: Playlist, query = ''): QueuedSong[] {
  const resolvedPlaylist = currentResolvedPlaylists[playlist.name]
  if (resolvedPlaylist) {
    return resolvedPlaylist.queue
      .filter((song) => songMatchesQuery(song, query))
      .filter((song): song is QueuedSong => Boolean(song.path && song.exists))
      .map((song) => buildQueuedSong(song, song.lid))
  }

  return playlist.songs
    .filter((entry) => songMatchesQuery(entry, query))
    .map((entry) => {
      const song = findSongInfoForPlaylistSong(entry)
      return song ? buildQueuedSong(song, entry.lid) : null
    })
    .filter((song): song is QueuedSong => Boolean(song?.path && song.exists))
}

async function playCurrentQueueTrack() {
  if (currentPlaybackIndex >= playbackQueue.length) {
    playButtonEl.disabled = false
    playButtonEl.classList.remove('playing')
    showToast('Playlist finished')
    return
  }

  const song = playbackQueue[currentPlaybackIndex]

  if (!song || !song.path) {
    console.warn('Invalid track in playback queue', song)
    currentPlaybackIndex += 1
    await playCurrentQueueTrack()
    return
  }

  try {
    await invoke('play_track', { path: song.path, volume: currentVolume })
    isPlaying = true
    isPaused = false
    setTrackInfo(song)
    const durationSeconds = parseDurationToSeconds(song.time)
    if (durationSeconds > 0) {
      startPlaybackProgress(durationSeconds)
    } else {
      clearPlaybackProgressInterval()
      updatePlaybackProgress(0, 0)
    }
    updateControlPanelState()
    updatePlayingSongHighlight()
    showToast(`Playing ${song.title ?? 'track'} (${currentPlaybackIndex + 1}/${playbackQueue.length})`)
  } catch (playError) {
    console.error('Audio playback failed', playError)
    showToast(`Playback failed for ${song.title ?? 'track'}, skipping`)
    currentPlaybackIndex += 1
    await playCurrentQueueTrack()
    return
  }
}

async function handlePlaybackEnded() {
  if (!isPlaying) return

  if (repeatMode === 'single' && playbackQueue.length > 0) {
    await playCurrentQueueTrack()
    return
  }

  if (currentPlaybackIndex < playbackQueue.length - 1) {
    currentPlaybackIndex += 1
    await playCurrentQueueTrack()
    return
  }

  if (repeatMode === 'playlist' && playbackQueue.length > 0) {
    currentPlaybackIndex = 0
    await playCurrentQueueTrack()
    return
  }

  isPlaying = false
  isPaused = false
  clearPlaybackProgressInterval()
  playButtonEl.disabled = false
  playButtonEl.classList.remove('playing')
  resetTrackInfo()
  updateControlPanelState()
  showToast('Playback finished')
}

function sortSongsByQuality(songA: SongInfo, songB: SongInfo) {
  const extractNumber = (value?: string) => {
    if (!value) return 0
    const match = value.match(/(\d+)/)
    return match ? Number(match[1]) : 0
  }

  const bitrateA = extractNumber(songA.bitrate)
  const bitrateB = extractNumber(songB.bitrate)
  if (bitrateA !== bitrateB) {
    return bitrateB - bitrateA
  }

  const sampleA = extractNumber(songA.sample)
  const sampleB = extractNumber(songB.sample)
  if (sampleA !== sampleB) {
    return sampleB - sampleA
  }

  return 0
}

function getHighestQualityPlaylistSongs(playlist: Playlist) {
  const resolvedPlaylist = currentResolvedPlaylists[playlist.name]
  const playableSongs = resolvedPlaylist
    ? resolvedPlaylist.queue
    : playlist.songs
        .map((entry) => findSongInfoForPlaylistSong(entry))
        .filter((song): song is SongInfo => Boolean(song?.path && song.exists))

  return playableSongs.sort(sortSongsByQuality)
}

function playPlaylistHighQuality() {
  if (!selectedPlaylistName) return
  if (!playButtonEl || playButtonEl.disabled) return

  const playlist = currentPlaylists.find((pl) => pl.name === selectedPlaylistName)
  if (!playlist) {
    showToast('No playlist selected')
    return
  }

  console.log('Starting playlist playback for', playlist.name)
  playbackQueue = preparePlaylistQueue(playlist, '')
  if (shuffleEnabled) {
    shufflePlaybackQueue()
  }
  currentPlaybackPlaylistName = playlist.name
  currentPlaybackIndex = 0
  console.log('Playback queue built with', playbackQueue.length, 'tracks')
  console.log('Playback queue paths', playbackQueue.map((song) => song.path))

  if (playbackQueue.length === 0) {
    showToast('No playable songs available')
    return
  }

  isPlaying = true
  isPaused = false
  updatePlayingSongHighlight()
  updateControlPanelState()
  playButtonEl.disabled = true
  playButtonEl.classList.add('playing')
  showToast('Starting playback...')
  playCurrentQueueTrack()
}

function shuffleArray<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

function shufflePlaybackQueue() {
  if (playbackQueue.length <= 1) return
  const current = playbackQueue[currentPlaybackIndex]
  const rest = playbackQueue.filter((_, index) => index !== currentPlaybackIndex)
  shuffleArray(rest)
  playbackQueue = [current, ...rest]
  currentPlaybackIndex = 0
  updatePlayingSongHighlight()
}

function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled
  updateControlPanelState()
  if (shuffleEnabled && playbackQueue.length > 0) {
    shufflePlaybackQueue()
  }
}

function toggleRepeat() {
  if (repeatMode === 'off') {
    repeatMode = 'playlist'
    showToast('Repeat playlist enabled')
  } else if (repeatMode === 'playlist') {
    repeatMode = 'single'
    showToast('Repeat single track enabled')
  } else {
    repeatMode = 'off'
    showToast('Repeat disabled')
  }
  updateControlPanelState()
}

function togglePlayPause() {
  if (isPlaying && !isPaused) {
    pausePlayback()
    return
  }

  if (isPlaying && isPaused) {
    resumePlayback()
    return
  }

  playPlaylistHighQuality()
}

function pausePlayback() {
  if (!isPlaying) return
  invoke('pause_playback').catch((error) => console.error('Pause playback failed', error))
  isPaused = true
  playButtonEl.classList.remove('playing')
  clearPlaybackProgressInterval()
  updateControlPanelState()
  showToast('Playback paused')
}

function resumePlayback() {
  if (!isPlaying) {
    playPlaylistHighQuality()
    return
  }

  invoke('resume_playback').catch((error) => console.error('Resume playback failed', error))
  isPaused = false
  if (playbackDurationSeconds > 0) {
    startPlaybackProgress(playbackDurationSeconds, playbackElapsedSeconds)
  }
  updateControlPanelState()
  showToast('Playback resumed')
}

function prevTrack() {
  if (currentPlaybackIndex > 0) {
    currentPlaybackIndex -= 1
    updatePlayingSongHighlight()
    playCurrentQueueTrack()
    return
  }

  if (repeatMode === 'playlist' && playbackQueue.length > 0) {
    currentPlaybackIndex = playbackQueue.length - 1
    updatePlayingSongHighlight()
    playCurrentQueueTrack()
    return
  }

  showToast('Already at first track')
}

function nextTrack() {
  if (currentPlaybackIndex < playbackQueue.length - 1) {
    currentPlaybackIndex += 1
    updatePlayingSongHighlight()
    playCurrentQueueTrack()
    return
  }

  if (repeatMode === 'playlist' && playbackQueue.length > 0) {
    currentPlaybackIndex = 0
    updatePlayingSongHighlight()
    playCurrentQueueTrack()
    return
  }

  showToast('End of queue')
}

function setVolume(value: number) {
  currentVolume = value
  invoke('set_playback_volume', { volume: currentVolume }).catch((error) => console.error('Set volume failed', error))
  updateControlPanelState()
}

function handleVolumeChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  setVolume(value)
}

function updateControlPanelState() {
  if (shuffleButtonEl) {
    shuffleButtonEl.classList.toggle('active', shuffleEnabled)
  }
  if (repeatButtonEl) {
    repeatButtonEl.classList.toggle('active', repeatMode !== 'off')
    const repeatOneIndicator = repeatButtonEl.querySelector('.repeat-one-indicator')
    if (repeatOneIndicator) {
      repeatOneIndicator.classList.toggle('hidden', repeatMode !== 'single')
    }
  }
  if (playToggleButtonEl) {
    playToggleButtonEl.textContent = isPlaying && !isPaused ? '❚❚' : '▶'
  }
  if (playButtonEl) {
    playButtonEl.textContent = isPlaying && !isPaused ? 'PAUSE' : 'PLAY'
  }
  if (volumeSliderEl) {
    volumeSliderEl.value = String(currentVolume)
  }
}

function formatSecondsToTime(seconds: number): string {
  if (seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function clearPlaybackProgressInterval() {
  if (playbackProgressInterval !== null) {
    window.clearInterval(playbackProgressInterval)
    playbackProgressInterval = null
  }
}

function updatePlaybackProgress(seconds: number, duration: number) {
  playbackElapsedSeconds = Math.min(Math.max(seconds, 0), duration)
  if (timeStartEl) {
    timeStartEl.textContent = formatSecondsToTime(playbackElapsedSeconds)
  }
  if (timeEndEl) {
    timeEndEl.textContent = formatSecondsToTime(duration)
  }
  if (timeBarFillEl) {
    const percent = duration > 0 ? (playbackElapsedSeconds / duration) * 100 : 0
    timeBarFillEl.style.width = `${percent}%`
  }
  if (timeBarThumbEl) {
    const percent = duration > 0 ? (playbackElapsedSeconds / duration) * 100 : 0
    timeBarThumbEl.style.left = `${percent}%`
  }
}

function getTimeBarSecondsFromPointer(event: PointerEvent): number {
  if (!timeBarTrackEl || playbackDurationSeconds <= 0) {
    return 0
  }

  const rect = timeBarTrackEl.getBoundingClientRect()
  const relativeX = event.clientX - rect.left
  const percent = Math.min(Math.max(relativeX / rect.width, 0), 1)
  return Math.round(percent * playbackDurationSeconds)
}

function seekPlaybackProgressToPointer(event: PointerEvent) {
  if (playbackDurationSeconds <= 0) {
    return
  }

  playbackElapsedSeconds = getTimeBarSecondsFromPointer(event)
  updatePlaybackProgress(playbackElapsedSeconds, playbackDurationSeconds)
}

function handleTimeBarPointerDown(event: PointerEvent) {
  if (!timeBarTrackEl || playbackDurationSeconds <= 0) {
    return
  }

  event.preventDefault()
  isTimeBarScrubbing = true
  clearPlaybackProgressInterval()
  timeBarTrackEl.setPointerCapture(event.pointerId)
  seekPlaybackProgressToPointer(event)
}

function handleTimeBarPointerMove(event: PointerEvent) {
  if (!isTimeBarScrubbing) {
    return
  }

  seekPlaybackProgressToPointer(event)
}

function handleTimeBarPointerUp(event: PointerEvent) {
  if (!isTimeBarScrubbing) {
    return
  }

  isTimeBarScrubbing = false
  if (timeBarTrackEl) {
    timeBarTrackEl.releasePointerCapture(event.pointerId)
  }

  seekPlaybackProgressToPointer(event)

  if (isPlaying) {
    const shouldStayPaused = isPaused
    invoke('seek_playback', { seconds: playbackElapsedSeconds })
      .then(() => {
        if (shouldStayPaused) {
          invoke('pause_playback').catch((error) => console.error('Pause after seek failed', error))
        } else if (playbackDurationSeconds > 0) {
          startPlaybackProgress(playbackDurationSeconds, playbackElapsedSeconds)
        }
      })
      .catch((error) => {
        console.error('Seek playback failed', error)
      })
  }
}

function startPlaybackProgress(durationSeconds: number, startSeconds = 0) {
  clearPlaybackProgressInterval()
  playbackDurationSeconds = durationSeconds
  playbackElapsedSeconds = Math.min(Math.max(startSeconds, 0), durationSeconds)
  updatePlaybackProgress(playbackElapsedSeconds, playbackDurationSeconds)

  if (durationSeconds <= 0) return

  playbackProgressInterval = window.setInterval(() => {
    playbackElapsedSeconds += 1
    if (playbackElapsedSeconds >= playbackDurationSeconds) {
      playbackElapsedSeconds = playbackDurationSeconds
      updatePlaybackProgress(playbackElapsedSeconds, playbackDurationSeconds)
      clearPlaybackProgressInterval()
      return
    }
    updatePlaybackProgress(playbackElapsedSeconds, playbackDurationSeconds)
  }, 1000)
}

function setTrackInfo(song?: SongInfo) {
  if (trackTitleEl) {
    trackTitleEl.textContent = song?.title ?? 'No track selected'
  }
  if (trackPerformerEl) {
    trackPerformerEl.textContent = song?.performer ?? 'No performer'
  }
}

function resetTrackInfo() {
  setTrackInfo()
  updatePlaybackProgress(0, 0)
  updateMediaSession()
}

function updateMediaSession(song?: SongInfo) {
  if (!('mediaSession' in navigator)) return

  const metadata = new MediaMetadata({
    title: song?.title ?? 'RetroTunes',
    artist: song?.performer ?? '',
    album: currentPlaybackPlaylistName ?? '',
  })

  navigator.mediaSession.metadata = metadata
  navigator.mediaSession.playbackState = isPlaying && !isPaused ? 'playing' : isPaused ? 'paused' : 'none'
}

function configureMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return

  navigator.mediaSession.setActionHandler('play', () => togglePlayPause())
  navigator.mediaSession.setActionHandler('pause', () => togglePlayPause())
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
}

function parseDurationToSeconds(duration?: string): number {
  if (!duration) return 0
  const parts = duration.split(':').map((part) => Number(part.trim()))
  if (parts.some((value) => Number.isNaN(value))) return 0
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return parts[0] || 0
}

function formatBytesToMB(bytes: number): number {
  return bytes > 0 ? Number((bytes / 1_000_000).toFixed(1)) : 0
}

function updateBottomBar(playlist: Playlist) {
  const resolvedPlaylist = currentResolvedPlaylists[playlist.name]
  const resolvedSongs = resolvedPlaylist
    ? resolvedPlaylist.songs.filter((song) => song.exists && song.path)
    : playlist.songs
        .map((entry) => findSongInfoForPlaylistSong(entry))
        .filter((song): song is SongInfo => Boolean(song?.path && song.exists))

  const itemCount = resolvedSongs.length
  const totalSeconds = resolvedSongs.reduce((sum, song) => {
    return sum + parseDurationToSeconds(song.time)
  }, 0)
  const totalMinutes = Math.round(totalSeconds / 60)
  const totalMB = resolvedSongs.reduce((sum, song) => {
    return sum + (song.size_bytes ?? 0)
  }, 0)

  bottomBarTextEl.textContent = `${itemCount} items, ${totalMinutes} minutes, ${formatBytesToMB(totalMB)} MB`
}

function setSelectedPlaylist(name: string) {
  const playlistExists = currentPlaylists.some((pl) => pl.name === name)
  const selectedName = playlistExists
    ? name
    : currentPlaylists.find((pl) => pl.name === 'All songs')?.name || currentPlaylists[0]?.name || name

  selectedPlaylistName = selectedName

  const items = playlistsContainerEl.querySelectorAll('.playlist-item')
  items.forEach((item) => {
    if (item.dataset.playlistName === selectedName) {
      item.classList.add('selected')
    } else {
      item.classList.remove('selected')
    }
  })

  if (fixedPlaylistEl) {
    if (selectedName === 'All songs') {
      fixedPlaylistEl.classList.add('selected')
    } else {
      fixedPlaylistEl.classList.remove('selected')
    }
  }

  if (playlistEditButtonEl) {
    playlistEditButtonEl.disabled = selectedName === 'All songs'
  }

  const playlist = currentPlaylists.find((pl) => pl.name === selectedName)
  if (playlist) {
    updatePlaylistBar(playlist)
    updateBottomBar(playlist)
    updateSongTable(playlist, currentSearchQuery)
  }
}

function createSongTable(playlist: Playlist, query = '') {
  const container = document.createElement('div')
  container.className = 'song-table-container'

  const resolvedPlaylist = currentResolvedPlaylists[playlist.name]
  const songs = playlist.songs
    .filter((entry) => songMatchesQuery(entry, query))

  if (songs.length === 0) {
    const placeholder = document.createElement('div')
    placeholder.className = 'song-table-placeholder'
    placeholder.textContent = 'No songs found in this playlist.'
    container.appendChild(placeholder)
    return container
  }

  const table = document.createElement('table')
  table.className = 'song-table'

  const headerRow = document.createElement('tr')
  const columns = [
    'Cover',
    'Title',
    'Time',
    'Performer',
    'Album',
    'Release',
    'BitRate',
    'Sample',
    'Depth',
    'Format',
    'Rating',
  ]

  columns.forEach((column) => {
    const th = document.createElement('th')
    th.textContent = column
    headerRow.appendChild(th)
  })

  const thead = document.createElement('thead')
  thead.appendChild(headerRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  const fragment = document.createDocumentFragment()

  songs.forEach((entry) => {
    const row = document.createElement('tr')
    const resolvedSong = resolvedPlaylist?.songs.find((song) => song.lid === entry.lid) || findSongInfoForPlaylistSong(entry)
    row.dataset.songId = resolvedSong?.id || ''
    row.dataset.songLid = entry.lid
    row.addEventListener('contextmenu', (event) => {
      openContextMenu(event, playlist.name, entry)
    })
    const isMissing = !resolvedSong || !resolvedSong.exists
    if (isMissing) {
      row.classList.add('song-missing')
    }

    const coverCell = document.createElement('td')
    coverCell.className = 'song-cover-cell'
    const coverPlaceholder = document.createElement('div')
    coverPlaceholder.className = 'song-cover-placeholder'
    coverPlaceholder.textContent = 'No cover'
    coverCell.appendChild(coverPlaceholder)
    row.appendChild(coverCell)

    const titleCell = document.createElement('td')
    const titleSpan = document.createElement('span')
    titleSpan.textContent = entry.title ?? 'Unknown title'
    titleCell.appendChild(titleSpan)
    row.appendChild(titleCell)

    const timeCell = document.createElement('td')
    const timeSpan = document.createElement('span')
    timeSpan.textContent = resolvedSong?.time ?? '–'
    timeCell.appendChild(timeSpan)
    row.appendChild(timeCell)

    const performerCell = document.createElement('td')
    const performerSpan = document.createElement('span')
    performerSpan.textContent = entry.performer ?? '–'
    performerCell.appendChild(performerSpan)
    row.appendChild(performerCell)

    const albumCell = document.createElement('td')
    const albumSpan = document.createElement('span')
    albumSpan.textContent = entry.album ?? '–'
    albumCell.appendChild(albumSpan)
    row.appendChild(albumCell)

    const releaseCell = document.createElement('td')
    const releaseSpan = document.createElement('span')
    releaseSpan.textContent = resolvedSong?.release ?? '–'
    releaseCell.appendChild(releaseSpan)
    row.appendChild(releaseCell)

    const bitrateCell = document.createElement('td')
    const bitrateSpan = document.createElement('span')
    bitrateSpan.textContent = resolvedSong?.bitrate ?? '–'
    bitrateCell.appendChild(bitrateSpan)
    row.appendChild(bitrateCell)

    const sampleCell = document.createElement('td')
    const sampleSpan = document.createElement('span')
    sampleSpan.textContent = resolvedSong?.sample ?? '–'
    sampleCell.appendChild(sampleSpan)
    row.appendChild(sampleCell)

    const depthCell = document.createElement('td')
    const depthSpan = document.createElement('span')
    depthSpan.textContent = resolvedSong?.depth ?? '–'
    depthCell.appendChild(depthSpan)
    row.appendChild(depthCell)

    const formatCell = document.createElement('td')
    const formatSpan = document.createElement('span')
    formatSpan.textContent = resolvedSong?.format ?? '–'
    formatCell.appendChild(formatSpan)
    row.appendChild(formatCell)

    const ratingCell = document.createElement('td')
    const ratingSpan = document.createElement('span')
    ratingSpan.textContent = resolvedSong?.rating ?? '–'
    ratingCell.appendChild(ratingSpan)
    row.appendChild(ratingCell)

    fragment.appendChild(row)
  })

  tbody.appendChild(fragment)
  table.appendChild(tbody)
  container.appendChild(table)
  return container
}

function addEmptyRowsIfNeeded(container: HTMLElement, table: HTMLTableElement) {
  const tbody = table.tBodies[0]
  const currentRows = tbody.rows.length
  const minimumRows = 50
  const extraRows = Math.max(0, minimumRows - currentRows)

  for (let i = 0; i < extraRows; i++) {
    const emptyRow = document.createElement('tr')
    for (let j = 0; j < 11; j++) {
      const emptyCell = document.createElement('td')
      emptyCell.innerHTML = '&nbsp;'
      emptyRow.appendChild(emptyCell)
    }
    tbody.appendChild(emptyRow)
  }
}

function centerSongTableRegion(container: HTMLElement, table: HTMLTableElement) {
  requestAnimationFrame(() => {
    const headers = table.querySelectorAll('th')
    if (headers.length < 5) return

    const containerRect = container.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    const coverRect = headers[0].getBoundingClientRect()
    const albumRect = headers[4].getBoundingClientRect()

    const regionStart = coverRect.left - tableRect.left
    const regionEnd = albumRect.right - tableRect.left
    const regionCenter = (regionStart + regionEnd) / 2
    const desiredScrollLeft = Math.max(0, regionCenter - container.clientWidth / 2)

    container.scrollLeft = desiredScrollLeft
  })
}

function updateSongTable(playlist: Playlist, query = '') {
  const appEl = document.querySelector('#app')!
  appEl.textContent = ''
  const container = createSongTable(playlist, query)
  appEl.appendChild(container)
  updatePlayingSongHighlight()
}

function updatePlayingSongHighlight() {
  const rows = document.querySelectorAll('.song-table tbody tr')
  const currentSong = playbackQueue[currentPlaybackIndex] as SongInfo & { lid?: string }
  const isSamePlaylist = selectedPlaylistName && currentPlaybackPlaylistName === selectedPlaylistName

  rows.forEach((row) => {
    const songId = row.dataset.songId
    const songLid = row.dataset.songLid
    const isPlaying = Boolean(
      isSamePlaylist &&
      currentSong &&
      ((songId && songId === currentSong.id) ||
        (songLid && songLid === currentSong.lid))
    )
    if (isPlaying) {
      row.classList.add('song-playing')
    } else {
      row.classList.remove('song-playing')
    }
  })
}

function createPlaylistItem(playlist: Playlist, fixed = false): HTMLElement {
  const playlistItem = document.createElement('div');
  playlistItem.className = 'playlist-item';
  playlistItem.dataset.playlistName = playlist.name
  if (fixed) playlistItem.classList.add('fixed-playlist');

  const text = document.createElement('span');
  text.textContent = playlist.name;

  playlistItem.appendChild(text);
  playlistItem.addEventListener('click', () => {
    setSelectedPlaylist(playlist.name)
    handlePlaylistClick(playlist)
  });

  if (playlist.name === selectedPlaylistName) {
    playlistItem.classList.add('selected')
  }

  return playlistItem;
}

function displayPlaylists(playlists: Playlist[]) {
  const existing = playlistsContainerEl.querySelectorAll('.playlist-item:not(.fixed-playlist)')
  existing.forEach((item) => item.remove())

  playlists
    .filter((playlist) => playlist.name !== 'All songs')
    .forEach((playlist) => {
      playlistsContainerEl.appendChild(createPlaylistItem(playlist))
    })
}

async function removePath(pathDisplayEl: HTMLElement, path: string) {
  try {
    const result = await withSyncing('Syncing playlists after path removal...', async () => {
      return await invoke<ScanResult>('remove_saved_path', { path })
    })
    selectedPaths.delete(path)
    pathDisplayEl.remove()
    currentResolvedPlaylists = {}
    result.resolved_playlists?.forEach((playlist) => {
      currentResolvedPlaylists[playlist.name] = playlist
    })
    currentPlaylists = result.playlists
    setCurrentSongs(result.songs)
    displayPlaylists(result.playlists)
    const selected = selectedPlaylistName || result.playlists.find((pl) => pl.name === 'All songs')?.name || result.playlists[0]?.name
    if (selected) {
      setSelectedPlaylist(selected)
    }
    showToast(`Path removed and rescanned: ${result.total} files`)
    console.log('Saved collection to', result.saved_file)
    console.log('Saved playlist to', result.saved_playlist_file)
  } catch (error) {
    console.error('Remove path error:', error)
    showToast('Unable to remove path')
  }
}

async function loadSavedPaths() {
  try {
    let savedPaths: string[] = []
    try {
      savedPaths = await invoke<string[]>('get_saved_paths')
    } catch (pathsError) {
      console.warn('get_saved_paths failed, continuing with saved collection load', pathsError)
    }

    savedPaths.forEach((path) => {
      selectedPaths.add(path)
      createPathEntry(path)
    })

    const result = await withSyncing('Syncing saved collection and paths...', async () => {
      try {
        if (savedPaths.length > 0) {
          return await invoke<ScanResult>('sync_saved_paths')
        }
        return await invoke<ScanResult>('load_saved_collection')
      } catch (syncError) {
        console.warn('sync_saved_paths failed, falling back to load_saved_collection', syncError)
        return await invoke<ScanResult>('load_saved_collection')
      }
    })

    currentResolvedPlaylists = {}
    result.resolved_playlists?.forEach((playlist) => {
      currentResolvedPlaylists[playlist.name] = playlist
    })
    currentPlaylists = result.playlists
    setCurrentSongs(result.songs)
    displayPlaylists(result.playlists)

    const defaultPlaylistName = result.playlists.find((pl) => pl.name === 'All songs')?.name || result.playlists[0]?.name || 'All songs'
    setSelectedPlaylist(defaultPlaylistName)
    console.log('Loaded saved collection data from', result.saved_file)
  } catch (error) {
    console.error('Failed to load saved paths:', error)
    showToast('Unable to load saved paths')
  }
}

async function selectPath() {
  try {
    console.log('Opening folder selection dialog...')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Seleziona una cartella musicale'
    }) as string | null;

    console.log('Dialog result:', selected)

    if (selected) {
      if (selectedPaths.has(selected)) {
        showToast('Path already added')
        console.warn('Duplicate path:', selected)
        return
      }

      try {
const result = await withSyncing('Syncing playlists after path add...', async () => {
        return await invoke<ScanResult>('scan_music_files', { path: selected })
      })
        selectedPaths.add(selected)
        createPathEntry(selected)
        currentResolvedPlaylists = {}
        result.resolved_playlists?.forEach((playlist) => {
          currentResolvedPlaylists[playlist.name] = playlist
        })
        currentPlaylists = result.playlists
        setCurrentSongs(result.songs)
        displayPlaylists(result.playlists)

        console.log('Path added:', selected)
        console.log('Saved collection to', result.saved_file)
        console.log('Saved playlist to', result.saved_playlist_file)

        const formatCounts: Record<string, number> = {}
        result.songs.forEach((song) => {
          const format = song.format?.toLowerCase() ?? 'unknown'
          formatCounts[format] = (formatCounts[format] ?? 0) + 1
        })

        const summary = Object.entries(formatCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([format, count]) => `${count} ${format}`)
          .join(', ')

        showToast(`${result.total} audio files found: ${summary}`)
      } catch (invokeError) {
        console.error('Scan error:', invokeError)
        const errorMessage = typeof invokeError === 'string' ? invokeError : invokeError?.toString?.() ?? 'Unknown scan error'
        showToast(`Scan failed: ${errorMessage}`)
      }
    } else {
      console.log('No path selected')
    }
  } catch (error) {
    console.error('Error selecting path:', error)
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  pathsContainerEl = document.querySelector('.paths-container')!
  addPathBtnEl = document.querySelector('.add-path-btn')!
  playlistsContainerEl = document.querySelector('.playlists-container')!
  addPlaylistBtnEl = document.querySelector('.add-playlist-btn')!
  toastEl = document.querySelector('.toast')!
  loadingOverlayEl = document.querySelector('.sync-overlay')!
  playlistModalEl = document.querySelector('.playlist-modal') as HTMLElement
  playlistModalTitleEl = document.querySelector('.playlist-modal-title') as HTMLElement
  playlistNameInputEl = document.querySelector('.playlist-name-input') as HTMLInputElement
  playlistDescriptionInputEl = document.querySelector('.playlist-description-input') as HTMLTextAreaElement
  playlistCoverInputEl = document.querySelector('.playlist-cover-input') as HTMLInputElement
  playlistCoverPreviewEl = document.querySelector('.playlist-cover-preview') as HTMLImageElement
  playlistModalSaveButtonEl = document.querySelector('.playlist-modal-save') as HTMLButtonElement
  playlistModalDeleteButtonEl = document.querySelector('.playlist-modal-delete') as HTMLButtonElement
  playlistCoverEl = document.querySelector('.playlist-cover') as HTMLImageElement
  playlistTitleEl = document.querySelector('.playlist-title')!
  playlistDescriptionEl = document.querySelector('.playlist-description')!
  bottomBarTextEl = document.querySelector('.bottom-bar-content')!

  contextMenuEl = document.querySelector('.context-menu') as HTMLElement

  searchInputEl = document.querySelector('.playlist-search-input') as HTMLInputElement
  searchButtonEl = document.querySelector('.playlist-search-button') as HTMLElement
  playButtonEl = document.querySelector('.playlist-play-button') as HTMLButtonElement
  playlistEditButtonEl = document.querySelector('.playlist-edit-button') as HTMLButtonElement
  fixedPlaylistEl = document.querySelector('.fixed-playlist') as HTMLElement

  console.log('Elements found:', {
    pathsContainer: pathsContainerEl,
    addPathBtn: addPathBtnEl,
    playlistsContainer: playlistsContainerEl,
    addPlaylistBtn: addPlaylistBtnEl,
    fixedPlaylist: fixedPlaylistEl,
    toast: toastEl
  })

  addPathBtnEl.addEventListener('click', () => {
    console.log('Add path button clicked')
    selectPath()
  })

  addPlaylistBtnEl.addEventListener('click', () => {
    openCreatePlaylistModal()
  })

  playlistEditButtonEl.addEventListener('click', () => {
    openEditPlaylistModal()
  })

  playlistCoverInputEl.addEventListener('change', handleCoverFileChange)

  playlistModalSaveButtonEl.addEventListener('click', savePlaylistModal)
  playlistModalDeleteButtonEl.addEventListener('click', deletePlaylistFromModal)

  document.addEventListener('click', (event) => {
    if (!contextMenuEl.contains(event.target as Node)) {
      closeContextMenu()
    }
  })

  document.addEventListener('scroll', () => closeContextMenu())

  playButtonEl.addEventListener('click', () => {
    togglePlayPause()
  })

  shuffleButtonEl = document.querySelector('.shuffle-button') as HTMLButtonElement
  prevButtonEl = document.querySelector('.prev-button') as HTMLButtonElement
  playToggleButtonEl = document.querySelector('.play-toggle-button') as HTMLButtonElement
  nextButtonEl = document.querySelector('.next-button') as HTMLButtonElement
  repeatButtonEl = document.querySelector('.repeat-button') as HTMLButtonElement
  volumeSliderEl = document.querySelector('.volume-slider') as HTMLInputElement
  trackTitleEl = document.querySelector('.track-title') as HTMLElement
  trackPerformerEl = document.querySelector('.track-performer') as HTMLElement
  timeStartEl = document.querySelector('.time-start') as HTMLElement
  timeEndEl = document.querySelector('.time-end') as HTMLElement
  timeBarTrackEl = document.querySelector('.time-bar-track') as HTMLElement
  timeBarFillEl = document.querySelector('.time-bar-fill') as HTMLElement
  timeBarThumbEl = document.querySelector('.time-bar-thumb') as HTMLElement

  timeBarTrackEl?.addEventListener('pointerdown', handleTimeBarPointerDown)
  document.addEventListener('pointermove', handleTimeBarPointerMove)
  document.addEventListener('pointerup', handleTimeBarPointerUp)

  shuffleButtonEl.addEventListener('click', toggleShuffle)
  prevButtonEl.addEventListener('click', prevTrack)
  playToggleButtonEl.addEventListener('click', togglePlayPause)
  nextButtonEl.addEventListener('click', nextTrack)
  repeatButtonEl.addEventListener('click', toggleRepeat)
  volumeSliderEl.addEventListener('input', handleVolumeChange)

  configureMediaSessionHandlers()

  listen('playback-ended', async () => {
    await handlePlaybackEnded()
  })

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }

    const code = event.code || ''
    const key = event.key || ''
    const isModifier = event.ctrlKey || event.metaKey

    if (code === 'Space' || key === ' ') {
      event.preventDefault()
      togglePlayPause()
      return
    }

    if (code === 'ArrowRight' || key === 'ArrowRight') {
      event.preventDefault()
      nextTrack()
      return
    }

    if (code === 'ArrowLeft' || key === 'ArrowLeft') {
      event.preventDefault()
      prevTrack()
      return
    }

    if (isModifier && (code === 'KeyS' || key.toLowerCase() === 's')) {
      event.preventDefault()
      toggleShuffle()
      return
    }

    if (isModifier && (code === 'KeyR' || key.toLowerCase() === 'r')) {
      event.preventDefault()
      toggleRepeat()
      return
    }
  })

  updateControlPanelState()
  updateMediaSession()

  searchButtonEl.addEventListener('click', () => {
    searchCurrentPlaylist()
  })

  searchInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      searchCurrentPlaylist()
    }
  })

  fixedPlaylistEl.addEventListener('click', () => {
    const playlist = currentPlaylists.find((pl) => pl.name === 'All songs')
    if (playlist) {
      setSelectedPlaylist(playlist.name)
      handlePlaylistClick(playlist)
    } else {
      console.log('All songs playlist selected')
      showToast('All songs selected')
    }
  })

  const createPlaylistCancel = document.querySelector('.playlist-modal-cancel') as HTMLButtonElement
  createPlaylistCancel.addEventListener('click', closeCreatePlaylistModal)

  await loadSavedPaths()
  console.log('RetroTunes app initialized')
})
