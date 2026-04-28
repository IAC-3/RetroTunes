import { Playlist, PlaylistSong, ResolvedPlaylist, SongInfo } from './models'
import { appState, buildQueuedSong, findSongInfoForPlaylistSong, resolvePlaylistSongToQueuedSong } from './state'
import {
  playlistCoverEl,
  playlistTitleEl,
  playlistDescriptionEl,
  playlistsContainerEl,
  playButtonEl,
  fixedPlaylistEl,
  queuePopupEl,
  bottomBarTextEl,
  showMissingSongsToggleButtonEl,
} from './dom'
import { showToast } from './utils'
import { parseDurationToSeconds, formatBytesToMB } from './utils'

export function handlePlaylistClick(playlist: Playlist) {
  const resolvedPlaylist = appState.currentResolvedPlaylists[playlist.name]
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

export function updatePlaylistBar(playlist: Playlist) {
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

export function songMatchesQuery(entry: PlaylistSong, query: string) {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const fields = [entry.title, entry.album, entry.performer]
  return fields.some((value) => value?.toLowerCase().includes(lowerQuery))
}

export function createSongTable(playlist: Playlist, query = '') {
  const container = document.createElement('div')
  container.className = 'song-table-container'

  const resolvedPlaylist = appState.currentResolvedPlaylists[playlist.name]
  const songs = playlist.songs
    .filter((entry) => songMatchesQuery(entry, query))
    .filter((entry) => {
      const resolvedSong = resolvedPlaylist?.songs.find((song) => song.lid === entry.lid) || findSongInfoForPlaylistSong(entry)
      const isMissing = !resolvedSong || !resolvedSong.exists
      return appState.showMissingSongs ? true : !isMissing
    })

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

export function addEmptyRowsIfNeeded(container: HTMLElement, table: HTMLTableElement) {
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

export function centerSongTableRegion(container: HTMLElement, table: HTMLTableElement) {
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

export function updateSongTable(playlist: Playlist, query = '') {
  const appEl = document.querySelector('#app')!
  appEl.textContent = ''
  const container = createSongTable(playlist, query)
  appEl.appendChild(container)
  updatePlayingSongHighlight()
}

export function updatePlayingSongHighlight() {
  const rows = document.querySelectorAll('.song-table tbody tr')
  const currentSong = appState.playbackQueue[appState.currentPlaybackIndex] as SongInfo & { lid?: string }
  const isSamePlaylist = appState.selectedPlaylistName && appState.currentPlaybackPlaylistName === appState.selectedPlaylistName

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

export function createPlaylistItem(playlist: Playlist, fixed = false): HTMLElement {
  const playlistItem = document.createElement('div')
  playlistItem.className = 'playlist-item'
  playlistItem.dataset.playlistName = playlist.name
  if (fixed) playlistItem.classList.add('fixed-playlist')

  const text = document.createElement('span')
  text.textContent = playlist.name

  playlistItem.appendChild(text)
  playlistItem.addEventListener('click', () => {
    setSelectedPlaylist(playlist.name)
    handlePlaylistClick(playlist)
  })

  if (playlist.name === appState.selectedPlaylistName) {
    playlistItem.classList.add('selected')
  }

  return playlistItem
}

export function displayPlaylists(playlists: Playlist[]) {
  const existing = playlistsContainerEl.querySelectorAll('.playlist-item:not(.fixed-playlist)')
  existing.forEach((item) => item.remove())

  playlists
    .filter((playlist) => playlist.name !== 'All songs')
    .forEach((playlist) => {
      playlistsContainerEl.appendChild(createPlaylistItem(playlist))
    })
}

export function updateBottomBar(playlist: Playlist) {
  const resolvedPlaylist = appState.currentResolvedPlaylists[playlist.name]
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
  renderQueuePopup()
}

export function toggleQueuePopup() {
  appState.isQueuePopupOpen = !appState.isQueuePopupOpen
  queuePopupEl.classList.toggle('hidden', !appState.isQueuePopupOpen)
  if (appState.isQueuePopupOpen) {
    renderQueuePopup()
  }
}

export function toggleShowMissingSongs() {
  appState.showMissingSongs = !appState.showMissingSongs
  showMissingSongsToggleButtonEl.classList.toggle('active', appState.showMissingSongs)
  showMissingSongsToggleButtonEl.textContent = appState.showMissingSongs ? 'Hide missing' : 'Show missing'
  if (appState.selectedPlaylistName) {
    const playlist = appState.currentPlaylists.find((pl) => pl.name === appState.selectedPlaylistName)
    if (playlist) {
      updateSongTable(playlist, appState.currentSearchQuery)
    }
  }
}

export function closeQueuePopup() {
  if (appState.isQueuePopupOpen) {
    queuePopupEl.classList.add('hidden')
    appState.isQueuePopupOpen = false
  }
}

export function renderQueuePopup() {
  queuePopupEl.textContent = ''
  const title = document.createElement('div')
  title.className = 'queue-popup-title'
  title.textContent = appState.currentPlaybackPlaylistName
    ? `Queue — ${appState.currentPlaybackPlaylistName}`
    : 'Current queue'
  queuePopupEl.appendChild(title)

  if (appState.playbackQueue.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'queue-popup-item'
    empty.textContent = 'Queue is empty'
    queuePopupEl.appendChild(empty)
    return
  }

  appState.playbackQueue.forEach((song, index) => {
    const item = document.createElement('div')
    item.className = 'queue-popup-item'
    if (index === appState.currentPlaybackIndex) {
      item.classList.add('current')
    }
    const titleText = song.title || song.path || `Track ${index + 1}`
    item.textContent = `${index + 1}. ${titleText}`
    queuePopupEl.appendChild(item)
  })
}

export function setSelectedPlaylist(name: string) {
  const playlistExists = appState.currentPlaylists.some((pl) => pl.name === name)
  const selectedName = playlistExists
    ? name
    : appState.currentPlaylists.find((pl) => pl.name === 'All songs')?.name || appState.currentPlaylists[0]?.name || name

  appState.selectedPlaylistName = selectedName

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

  if (playButtonEl) {
    playButtonEl.textContent = appState.isPlaying && !appState.isPaused ? '❚❚' : '▶'
  }

  const playlist = appState.currentPlaylists.find((pl) => pl.name === selectedName)
  if (playlist) {
    updatePlaylistBar(playlist)
    updateBottomBar(playlist)
    updateSongTable(playlist, appState.currentSearchQuery)
  }
}
