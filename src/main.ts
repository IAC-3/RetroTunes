import { invoke } from '@tauri-apps/api/tauri'
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
let selectedPlaylistName: string | null = null
let currentSearchQuery = ''
let currentSongsById: Record<string, SongInfo> = {}
let playbackQueue: SongInfo[] = []
let currentPlaybackIndex = 0
let audioPlayer: HTMLAudioElement | null = null

interface SongInfo {
  id: string
  path: string
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
  id: string
  exists: boolean
  metadata: {
    title?: string
    album?: string
    performer?: string
    time?: string
    release?: string
    bitrate?: string
    sample?: string
    depth?: string
    format?: string
    rating?: string
    size_bytes?: number
  }
}

interface Playlist {
  name: string
  description: string
  cover: string
  songs: PlaylistSong[]
}

interface ScanResult {
  songs: SongInfo[]
  playlists: Playlist[]
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
  const missingSongs = playlist.songs
    .filter((entry) => !entry.exists)
    .map((entry) => {
      const title = entry.metadata.title ?? 'unknown title'
      const performer = entry.metadata.performer ?? 'unknown performer'
      return `${title} - ${performer}`
    })

  if (missingSongs.length > 0) {
    showToast(`some file missing: ${missingSongs.join(', ')}`)
    console.log('Missing playlist songs:', missingSongs)
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
    entry.metadata.title,
    entry.metadata.album,
    entry.metadata.performer,
    entry.metadata.release,
    entry.metadata.bitrate,
    entry.metadata.sample,
    entry.metadata.depth,
    entry.metadata.format,
    entry.metadata.rating,
    entry.metadata.time,
  ]
  return fields.some((value) => value?.toLowerCase().includes(lowerQuery))
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() || ''
}

function findSongInfoForPlaylistSong(entry: PlaylistSong) {
  const direct = currentSongsById[entry.id]
  if (direct) return direct

  const normalizedTitle = normalizeText(entry.metadata.title)
  const normalizedAlbum = normalizeText(entry.metadata.album)
  const normalizedPerformer = normalizeText(entry.metadata.performer)

  return Object.values(currentSongsById).find((song) => {
    return (
      normalizeText(song.title) === normalizedTitle &&
      normalizeText(song.album) === normalizedAlbum &&
      normalizeText(song.performer) === normalizedPerformer
    )
  })
}

function searchCurrentPlaylist() {
  currentSearchQuery = searchInputEl.value.trim()
  if (!selectedPlaylistName) return
  const playlist = currentPlaylists.find((pl) => pl.name === selectedPlaylistName)
  if (playlist) {
    updateSongTable(playlist, currentSearchQuery)
  }
}

function preparePlaylistQueue(playlist: Playlist, query = '') {
  const songs = playlist.songs
    .filter((entry) => entry.exists)
    .filter((entry) => songMatchesQuery(entry, query))
    .map((entry) => findSongInfoForPlaylistSong(entry))
    .filter((song): song is SongInfo => Boolean(song?.path))

  return songs
}

function getAudioMimeType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() || ''
  switch (extension) {
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'flac': return 'audio/flac'
    case 'm4a': return 'audio/mp4'
    case 'aac': return 'audio/aac'
    case 'ogg': return 'audio/ogg'
    case 'webm': return 'audio/webm'
    case 'opus': return 'audio/opus'
    case 'oga': return 'audio/ogg'
    default: return 'audio/*'
  }
}

async function loadAudioSourceFromPath(path: string) {
  try {
    const fileData = await readBinaryFile(path)
    const blob = new Blob([fileData], { type: getAudioMimeType(path) })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('Failed to load audio file', path, error)
    return null
  }
}

async function playCurrentQueueTrack() {
  if (currentPlaybackIndex >= playbackQueue.length) {
    playButtonEl.disabled = false
    playButtonEl.classList.remove('playing')
    showToast('Playlist finished')
    return
  }

  const song = playbackQueue[currentPlaybackIndex]
  const directSrc = encodeURI(`file://${song.path}`)

  if (audioPlayer) {
    audioPlayer.pause()
    audioPlayer.src = ''
  }

  audioPlayer = new Audio(directSrc)
  audioPlayer.autoplay = true
  audioPlayer.onended = () => {
    currentPlaybackIndex += 1
    playCurrentQueueTrack()
  }

  let fallbackAttempted = false
  const fallbackToBlob = async () => {
    if (fallbackAttempted) return false
    fallbackAttempted = true

    const blobSrc = await loadAudioSourceFromPath(song.path)
    if (!blobSrc) {
      currentPlaybackIndex += 1
      showToast(`Unable to load ${song.title ?? 'track'}, skipping`)
      await playCurrentQueueTrack()
      return false
    }

    if (audioPlayer) {
      audioPlayer.pause()
      audioPlayer.src = blobSrc
    }

    try {
      await audioPlayer?.play()
      return true
    } catch (playError) {
      console.error('Blob playback failed', playError)
      currentPlaybackIndex += 1
      showToast(`Playback failed for ${song.title ?? 'track'}, skipping to next`)
      await playCurrentQueueTrack()
      return false
    }
  }

  let startedPlayback = false

  audioPlayer.onerror = async () => {
    await fallbackToBlob()
  }

  const playSource = async (source: string) => {
    if (!audioPlayer) return false
    audioPlayer.src = source
    try {
      await audioPlayer.play()
      return true
    } catch (playError) {
      console.warn('Audio play() rejected for source', source, playError)
      return false
    }
  }

  startedPlayback = await playSource(directSrc)
  if (!startedPlayback) {
    console.warn('Direct file playback failed, trying blob fallback')
    startedPlayback = await fallbackToBlob()
  }

  if (!startedPlayback) {
    return
  }

  showToast(`Playing ${song.title ?? 'track'} (${currentPlaybackIndex + 1}/${playbackQueue.length})`)
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
  const playableSongs = playlist.songs
    .filter((entry) => entry.exists)
    .map((entry) => findSongInfoForPlaylistSong(entry))
    .filter((song): song is SongInfo => Boolean(song?.path))

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

  playbackQueue = preparePlaylistQueue(playlist, '')
  currentPlaybackIndex = 0

  if (playbackQueue.length === 0) {
    showToast('No playable songs available')
    return
  }

  playButtonEl.disabled = true
  playButtonEl.classList.add('playing')
  playCurrentQueueTrack()
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
  const existingSongs = playlist.songs.filter((entry) => entry.exists)
  const itemCount = existingSongs.length
  const totalSeconds = existingSongs.reduce((sum, entry) => {
    return sum + parseDurationToSeconds(entry.metadata.time)
  }, 0)
  const totalMinutes = Math.round(totalSeconds / 60)
  const totalMB = existingSongs.reduce((sum, entry) => {
    return sum + (entry.metadata.size_bytes ?? 0)
  }, 0)

  bottomBarTextEl.textContent = `${itemCount} items, ${totalMinutes} minutes, ${formatBytesToMB(totalMB)} MB`
}

function setSelectedPlaylist(name: string) {
  selectedPlaylistName = name

  const items = playlistsContainerEl.querySelectorAll('.playlist-item')
  items.forEach((item) => {
    if (item.dataset.playlistName === name) {
      item.classList.add('selected')
    } else {
      item.classList.remove('selected')
    }
  })

  if (fixedPlaylistEl) {
    if (name === 'All songs') {
      fixedPlaylistEl.classList.add('selected')
    } else {
      fixedPlaylistEl.classList.remove('selected')
    }
  }

  const playlist = currentPlaylists.find((pl) => pl.name === name)
  if (playlist) {
    updatePlaylistBar(playlist)
    updateBottomBar(playlist)
    updateSongTable(playlist, currentSearchQuery)
  }
}

function createSongTable(playlist: Playlist, query = '') {
  const container = document.createElement('div')
  container.className = 'song-table-container'

  const songs = playlist.songs
    .filter((entry) => entry.exists)
    .filter((entry) => songMatchesQuery(entry, query))

  if (songs.length === 0) {
    const placeholder = document.createElement('div')
    placeholder.className = 'song-table-placeholder'
    placeholder.textContent = 'No existing songs found in this playlist.'
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
  songs.forEach((entry) => {
    const row = document.createElement('tr')

    const coverCell = document.createElement('td')
    coverCell.className = 'song-cover-cell'
    const coverPlaceholder = document.createElement('div')
    coverPlaceholder.className = 'song-cover-placeholder'
    coverPlaceholder.textContent = 'No cover'
    coverCell.appendChild(coverPlaceholder)
    row.appendChild(coverCell)

    const titleCell = document.createElement('td')
    titleCell.innerHTML = `<span>${entry.metadata.title ?? 'Unknown title'}</span>`
    row.appendChild(titleCell)

    const timeCell = document.createElement('td')
    timeCell.innerHTML = `<span>${entry.metadata.time ?? '–'}</span>`
    row.appendChild(timeCell)

    const performerCell = document.createElement('td')
    performerCell.innerHTML = `<span>${entry.metadata.performer ?? '–'}</span>`
    row.appendChild(performerCell)

    const albumCell = document.createElement('td')
    albumCell.innerHTML = `<span>${entry.metadata.album ?? '–'}</span>`
    row.appendChild(albumCell)

    const releaseCell = document.createElement('td')
    releaseCell.innerHTML = `<span>${entry.metadata.release ?? '–'}</span>`
    row.appendChild(releaseCell)

    const bitrateCell = document.createElement('td')
    bitrateCell.innerHTML = `<span>${entry.metadata.bitrate ?? '–'}</span>`
    row.appendChild(bitrateCell)

    const sampleCell = document.createElement('td')
    sampleCell.innerHTML = `<span>${entry.metadata.sample ?? '–'}</span>`
    row.appendChild(sampleCell)

    const depthCell = document.createElement('td')
    depthCell.innerHTML = `<span>${entry.metadata.depth ?? '–'}</span>`
    row.appendChild(depthCell)

    const formatCell = document.createElement('td')
    formatCell.innerHTML = `<span>${entry.metadata.format ?? '–'}</span>`
    row.appendChild(formatCell)

    const ratingCell = document.createElement('td')
    ratingCell.innerHTML = `<span>${entry.metadata.rating ?? '–'}</span>`
    row.appendChild(ratingCell)

    tbody.appendChild(row)
  })

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
  appEl.innerHTML = ''
  const container = createSongTable(playlist, query)
  appEl.appendChild(container)
  requestAnimationFrame(() => {
    const table = container.querySelector('.song-table') as HTMLTableElement
    if (table) {
      addEmptyRowsIfNeeded(container, table)
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
    const result = await invoke<ScanResult>('remove_saved_path', { path })
    selectedPaths.delete(path)
    pathDisplayEl.remove()
    currentPlaylists = result.playlists
    currentSongsById = result.songs.reduce((map, song) => {
      map[song.id] = song
      return map
    }, {} as Record<string, SongInfo>)
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
    const savedPaths = await invoke<string[]>('get_saved_paths')
    savedPaths.forEach((path) => {
      selectedPaths.add(path)
      createPathEntry(path)
    })

    if (savedPaths.length > 0) {
      const result = await invoke<ScanResult>('scan_music_files', { path: savedPaths[0] })
      currentPlaylists = result.playlists
      currentSongsById = result.songs.reduce((map, song) => {
        map[song.id] = song
        return map
      }, {} as Record<string, SongInfo>)
      displayPlaylists(result.playlists)
      const defaultPlaylist = result.playlists.find((pl) => pl.name === 'All songs') || result.playlists[0]
      if (defaultPlaylist) {
        setSelectedPlaylist(defaultPlaylist.name)
      }
    }
  } catch (error) {
    console.error('Failed to load saved paths:', error)
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
        const result = await invoke<ScanResult>('scan_music_files', { path: selected })
        selectedPaths.add(selected)
        createPathEntry(selected)
        currentPlaylists = result.playlists
        currentSongsById = result.songs.reduce((map, song) => {
          map[song.id] = song
          return map
        }, {} as Record<string, SongInfo>)
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
  playlistCoverEl = document.querySelector('.playlist-cover') as HTMLImageElement
  playlistTitleEl = document.querySelector('.playlist-title')!
  playlistDescriptionEl = document.querySelector('.playlist-description')!
  bottomBarTextEl = document.querySelector('.bottom-bar-content')!

  searchInputEl = document.querySelector('.playlist-search-input') as HTMLInputElement
  searchButtonEl = document.querySelector('.playlist-search-button') as HTMLElement
  playButtonEl = document.querySelector('.playlist-play-button') as HTMLButtonElement
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
    console.log('Create new playlist clicked')
    showToast('Create new playlist clicked')
  })

  playButtonEl.addEventListener('click', () => {
    playPlaylistHighQuality()
  })

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

  await loadSavedPaths()
  console.log('RetroTunes app initialized')
})
