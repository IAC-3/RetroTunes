import { invoke } from '@tauri-apps/api/tauri'
import { showToast, formatSecondsToTime, parseDurationToSeconds, updateMediaSession, shuffleArray } from './utils'
import { playToggleButtonEl, playButtonEl, shuffleButtonEl, repeatButtonEl, volumeSliderEl, timeStartEl, timeEndEl, timeBarTrackEl, timeBarFillEl, timeBarThumbEl, queuePopupEl } from './dom'
import { appState, buildQueuedSong, resolvePlaylistSongToQueuedSong, findSongInfoForPlaylistSong } from './state'
import { Playlist, PlaylistSong, SongInfo, QueuedSong } from './models'
import { updateSongTable, updatePlayingSongHighlight, updateBottomBar, renderQueuePopup } from './ui'

export async function playCurrentQueueTrack() {
  if (appState.currentPlaybackIndex >= appState.playbackQueue.length) {
    playToggleButtonEl.disabled = false
    playToggleButtonEl.classList.remove('playing')
    showToast('Playlist finished')
    return
  }

  const song = appState.playbackQueue[appState.currentPlaybackIndex]

  if (!song || !song.path) {
    console.warn('Invalid track in playback queue', song)
    appState.currentPlaybackIndex += 1
    await playCurrentQueueTrack()
    return
  }

  try {
    await invoke('play_track', { path: song.path, volume: appState.currentVolume })
    appState.isPlaying = true
    appState.isPaused = false
    setTrackInfo(song)
    const durationSeconds = parseDurationToSeconds(song.time)
    if (durationSeconds > 0) {
      if (appState.playbackElapsedSeconds > 0) {
        await invoke('seek_playback', { seconds: appState.playbackElapsedSeconds })
      }
      startPlaybackProgress(durationSeconds, appState.playbackElapsedSeconds)
    } else {
      clearPlaybackProgressInterval()
      updatePlaybackProgress(0, 0)
    }
    updateControlPanelState()
    updatePlayingSongHighlight()
    renderQueuePopup()
    showToast(`Playing ${song.title ?? 'track'} (${appState.currentPlaybackIndex + 1}/${appState.playbackQueue.length})`)
  } catch (playError) {
    console.error('Audio playback failed', playError)
    showToast(`Playback failed for ${song.title ?? 'track'}, skipping`)
    appState.currentPlaybackIndex += 1
    appState.playbackElapsedSeconds = 0
    await playCurrentQueueTrack()
    return
  }
}

export async function handlePlaybackEnded() {
  if (!appState.isPlaying) return

  if (appState.repeatMode === 'single' && appState.playbackQueue.length > 0) {
    appState.playbackElapsedSeconds = 0
    await playCurrentQueueTrack()
    return
  }

  if (appState.currentPlaybackIndex < appState.playbackQueue.length - 1) {
    appState.currentPlaybackIndex += 1
    appState.playbackElapsedSeconds = 0
    await playCurrentQueueTrack()
    return
  }

  if (appState.repeatMode === 'playlist' && appState.playbackQueue.length > 0) {
    appState.currentPlaybackIndex = 0
    appState.playbackElapsedSeconds = 0
    await playCurrentQueueTrack()
    return
  }

  appState.isPlaying = false
  appState.isPaused = false
  clearPlaybackProgressInterval()
  playToggleButtonEl.disabled = false
  playToggleButtonEl.classList.remove('playing')
  resetTrackInfo()
  updateControlPanelState()
  showToast('Playback finished')
}

export function buildPlaylistQueueFromEntry(playlistName: string, entry: PlaylistSong) {
  const playlist = appState.currentPlaylists.find((pl) => pl.name === playlistName)
  if (!playlist) return []

  const queue = preparePlaylistQueue(playlist, '')
  const entryIndex = queue.findIndex((song) => song.lid === entry.lid)
  if (entryIndex <= 0) return queue

  return [...queue.slice(entryIndex), ...queue.slice(0, entryIndex)]
}

export async function playPlaylistSongDirectly(entry: PlaylistSong, playlistName: string) {
  const queue = buildPlaylistQueueFromEntry(playlistName, entry)
  if (queue.length === 0) {
    showToast('Cannot play missing song')
    return
  }

  appState.playbackQueue = queue
  appState.currentPlaybackPlaylistName = playlistName
  appState.currentPlaybackIndex = 0
  appState.isPlaying = true
  appState.isPaused = false
  updatePlayingSongHighlight()
  updateControlPanelState()
  renderQueuePopup()
  await playCurrentQueueTrack()
}

export function insertPlaylistSongNext(entry: PlaylistSong) {
  const queuedSong = resolvePlaylistSongToQueuedSong(entry)
  if (!queuedSong) {
    showToast('Cannot add missing song to queue')
    return
  }

  if (appState.playbackQueue.length === 0) {
    appState.playbackQueue = [queuedSong]
    appState.currentPlaybackIndex = 0
    appState.currentPlaybackPlaylistName = appState.selectedPlaylistName || appState.currentPlaybackPlaylistName
    showToast('Added song to queue')
    renderQueuePopup()
    return
  }

  const insertIndex = Math.min(appState.currentPlaybackIndex + 1, appState.playbackQueue.length)
  appState.playbackQueue.splice(insertIndex, 0, queuedSong)
  showToast('Added next in queue')
}

export function preparePlaylistQueue(playlist: Playlist, query = '') {
  const resolvedPlaylist = appState.currentResolvedPlaylists[playlist.name]
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

function songMatchesQuery(entry: { title?: string; album?: string; performer?: string }, query: string) {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  return [entry.title, entry.album, entry.performer].some((value) => value?.toLowerCase().includes(lowerQuery))
}

export function playPlaylistHighQuality() {
  if (!appState.selectedPlaylistName) return
  if (!playButtonEl) return

  const playlist = appState.currentPlaylists.find((pl) => pl.name === appState.selectedPlaylistName)
  if (!playlist) {
    showToast('No playlist selected')
    return
  }

  console.log('Starting playlist playback for', playlist.name)
  appState.playbackQueue = preparePlaylistQueue(playlist, '')
  if (appState.shuffleEnabled) {
    shufflePlaybackQueue()
  }
  appState.currentPlaybackPlaylistName = playlist.name
  appState.currentPlaybackIndex = 0
  console.log('Playback queue built with', appState.playbackQueue.length, 'tracks')
  console.log('Playback queue paths', appState.playbackQueue.map((song) => song.path))

  if (appState.playbackQueue.length === 0) {
    showToast('No playable songs available')
    return
  }

  appState.isPlaying = true
  appState.isPaused = false
  updatePlayingSongHighlight()
  updateControlPanelState()
  showToast('Starting playback...')
  playCurrentQueueTrack()
}

export function shufflePlaybackQueue() {
  if (appState.playbackQueue.length <= 1) return
  const current = appState.playbackQueue[appState.currentPlaybackIndex]
  const rest = appState.playbackQueue.filter((_, index) => index !== appState.currentPlaybackIndex)
  shuffleArray(rest)
  appState.playbackQueue = [current, ...rest]
  appState.currentPlaybackIndex = 0
  updatePlayingSongHighlight()
}

export function toggleShuffle() {
  appState.shuffleEnabled = !appState.shuffleEnabled
  updateControlPanelState()
  if (appState.shuffleEnabled && appState.playbackQueue.length > 0) {
    shufflePlaybackQueue()
  }
}

export function toggleRepeat() {
  if (appState.repeatMode === 'off') {
    appState.repeatMode = 'playlist'
    showToast('Repeat playlist enabled')
  } else if (appState.repeatMode === 'playlist') {
    appState.repeatMode = 'single'
    showToast('Repeat single track enabled')
  } else {
    appState.repeatMode = 'off'
    showToast('Repeat disabled')
  }
  updateControlPanelState()
}

export function togglePlayPause() {
  if (appState.isPlaying && !appState.isPaused) {
    pausePlayback()
    return
  }

  if (appState.playbackQueue.length > 0 && (!appState.isPlaying || appState.isPaused)) {
    resumePlayback()
    return
  }

  showToast('Nessuna riproduzione attiva')
}

export function pausePlayback() {
  if (!appState.isPlaying) return
  invoke('pause_playback').catch((error) => console.error('Pause playback failed', error))
  appState.isPaused = true
  playToggleButtonEl.classList.remove('playing')
  clearPlaybackProgressInterval()
  updateControlPanelState()
  showToast('Playback paused')
}

export function resumePlayback() {
  if (!appState.isPlaying) {
    if (appState.playbackQueue.length > 0) {
      playCurrentQueueTrack()
      return
    }
    playPlaylistHighQuality()
    return
  }

  invoke('resume_playback').catch((error) => console.error('Resume playback failed', error))
  appState.isPaused = false
  if (appState.playbackDurationSeconds > 0) {
    startPlaybackProgress(appState.playbackDurationSeconds, appState.playbackElapsedSeconds)
  }
  updateControlPanelState()
  showToast('Playback resumed')
}

export function prevTrack() {
  if (appState.currentPlaybackIndex > 0) {
    appState.currentPlaybackIndex -= 1
    appState.playbackElapsedSeconds = 0
    updatePlayingSongHighlight()
    playCurrentQueueTrack()
    return
  }

  if (appState.repeatMode === 'playlist' && appState.playbackQueue.length > 0) {
    appState.currentPlaybackIndex = appState.playbackQueue.length - 1
    appState.playbackElapsedSeconds = 0
    playCurrentQueueTrack()
    return
  }

  showToast('Already at first track')
}

export function nextTrack() {
  if (appState.currentPlaybackIndex < appState.playbackQueue.length - 1) {
    appState.currentPlaybackIndex += 1
    appState.playbackElapsedSeconds = 0
    playCurrentQueueTrack()
    return
  }

  if (appState.repeatMode === 'playlist' && appState.playbackQueue.length > 0) {
    appState.currentPlaybackIndex = 0
    appState.playbackElapsedSeconds = 0
    playCurrentQueueTrack()
    return
  }

  showToast('End of queue')
}

export function setVolume(value: number) {
  appState.currentVolume = value
  invoke('set_playback_volume', { volume: appState.currentVolume }).catch((error) => console.error('Set volume failed', error))
  updateControlPanelState()
}

export function handleVolumeChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  setVolume(value)
}

export function updateControlPanelState() {
  if (shuffleButtonEl) {
    shuffleButtonEl.classList.toggle('active', appState.shuffleEnabled)
  }
  if (repeatButtonEl) {
    repeatButtonEl.classList.toggle('active', appState.repeatMode !== 'off')
    const repeatOneIndicator = repeatButtonEl.querySelector('.repeat-one-indicator')
    if (repeatOneIndicator) {
      repeatOneIndicator.classList.toggle('hidden', appState.repeatMode !== 'single')
    }
  }
  if (playToggleButtonEl) {
    playToggleButtonEl.textContent = appState.isPlaying && !appState.isPaused ? '❚❚' : '▶'
  }
  if (volumeSliderEl) {
    volumeSliderEl.value = String(appState.currentVolume)
  }
}

export function clearPlaybackProgressInterval() {
  if (appState.playbackProgressInterval !== null) {
    window.clearInterval(appState.playbackProgressInterval)
    appState.playbackProgressInterval = null
  }
}

export function updatePlaybackProgress(seconds: number, duration: number) {
  appState.playbackElapsedSeconds = Math.min(Math.max(seconds, 0), duration)
  if (timeStartEl) {
    timeStartEl.textContent = formatSecondsToTime(appState.playbackElapsedSeconds)
  }
  if (timeEndEl) {
    timeEndEl.textContent = formatSecondsToTime(duration)
  }
  if (timeBarFillEl) {
    const percent = duration > 0 ? (appState.playbackElapsedSeconds / duration) * 100 : 0
    timeBarFillEl.style.width = `${percent}%`
  }
  if (timeBarThumbEl) {
    const percent = duration > 0 ? (appState.playbackElapsedSeconds / duration) * 100 : 0
    timeBarThumbEl.style.left = `${percent}%`
  }
}

function getTimeBarSecondsFromPointer(event: PointerEvent): number {
  if (!timeBarTrackEl || appState.playbackDurationSeconds <= 0) {
    return 0
  }

  const rect = timeBarTrackEl.getBoundingClientRect()
  const relativeX = event.clientX - rect.left
  const percent = Math.min(Math.max(relativeX / rect.width, 0), 1)
  return Math.round(percent * appState.playbackDurationSeconds)
}

function seekPlaybackProgressToPointer(event: PointerEvent) {
  if (appState.playbackDurationSeconds <= 0) {
    return
  }

  appState.playbackElapsedSeconds = getTimeBarSecondsFromPointer(event)
  updatePlaybackProgress(appState.playbackElapsedSeconds, appState.playbackDurationSeconds)
}

function performSeekPlayback() {
  if (!appState.isPlaying) {
    return
  }

  const seekSeconds = appState.playbackElapsedSeconds
  const shouldStayPaused = appState.isPaused

  invoke('seek_playback', { seconds: seekSeconds })
    .then(() => {
      if (shouldStayPaused) {
        invoke('pause_playback').catch((error) => console.error('Pause after seek failed', error))
      }
    })
    .catch((error) => {
      console.error('Seek playback failed', error)
    })
}

function scheduleSeekPlayback() {
  if (appState.seekPlaybackFrame !== null) {
    return
  }

  appState.seekPlaybackFrame = window.requestAnimationFrame(() => {
    appState.seekPlaybackFrame = null
    performSeekPlayback()
  })
}

function flushSeekPlayback() {
  if (appState.seekPlaybackFrame !== null) {
    window.cancelAnimationFrame(appState.seekPlaybackFrame)
    appState.seekPlaybackFrame = null
  }
  performSeekPlayback()
}

export function handleTimeBarPointerDown(event: PointerEvent) {
  if (!timeBarTrackEl || appState.playbackDurationSeconds <= 0) {
    return
  }

  event.preventDefault()
  appState.isTimeBarScrubbing = true
  clearPlaybackProgressInterval()
  timeBarTrackEl.setPointerCapture(event.pointerId)
  seekPlaybackProgressToPointer(event)
  if (appState.isPlaying) {
    scheduleSeekPlayback()
  }
}

export function handleTimeBarPointerMove(event: PointerEvent) {
  if (!appState.isTimeBarScrubbing) {
    return
  }

  seekPlaybackProgressToPointer(event)
  if (appState.isPlaying) {
    scheduleSeekPlayback()
  }
}

export function handleTimeBarPointerUp(event: PointerEvent) {
  if (!appState.isTimeBarScrubbing) {
    return
  }

  appState.isTimeBarScrubbing = false
  if (timeBarTrackEl) {
    timeBarTrackEl.releasePointerCapture(event.pointerId)
  }

  seekPlaybackProgressToPointer(event)

  if (appState.isPlaying) {
    flushSeekPlayback()
    if (appState.playbackDurationSeconds > 0 && !appState.isPaused) {
      startPlaybackProgress(appState.playbackDurationSeconds, appState.playbackElapsedSeconds)
    }
  }
}

export function startPlaybackProgress(durationSeconds: number, startSeconds = 0) {
  clearPlaybackProgressInterval()
  appState.playbackDurationSeconds = durationSeconds
  appState.playbackElapsedSeconds = Math.min(Math.max(startSeconds, 0), durationSeconds)
  updatePlaybackProgress(appState.playbackElapsedSeconds, appState.playbackDurationSeconds)

  if (durationSeconds <= 0) return

  appState.playbackProgressInterval = window.setInterval(() => {
    appState.playbackElapsedSeconds += 1
    if (appState.playbackElapsedSeconds >= appState.playbackDurationSeconds) {
      appState.playbackElapsedSeconds = appState.playbackDurationSeconds
      updatePlaybackProgress(appState.playbackElapsedSeconds, appState.playbackDurationSeconds)
      clearPlaybackProgressInterval()
      return
    }
    updatePlaybackProgress(appState.playbackElapsedSeconds, appState.playbackDurationSeconds)
  }, 1000)
}

export function setTrackInfo(song?: SongInfo) {
  if (!song) {
    resetTrackInfo()
    return
  }
  const { title, performer } = song
  const titleText = title ?? 'No track selected'
  const performerText = performer ?? 'No performer'
  if (playToggleButtonEl) {
    playToggleButtonEl.textContent = appState.isPlaying && !appState.isPaused ? '❚❚' : '▶'
  }
  document.querySelector('.track-title')!.textContent = titleText
  document.querySelector('.track-performer')!.textContent = performerText
}

export function resetTrackInfo() {
  setTrackInfo()
  updatePlaybackProgress(0, 0)
  updateMediaSession(undefined, appState.currentPlaybackPlaylistName, appState.isPlaying, appState.isPaused)
}
