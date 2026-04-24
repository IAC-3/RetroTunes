import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'

let pathsContainerEl: HTMLElement;
let addPathBtnEl: HTMLElement;
let playlistsContainerEl: HTMLElement;
let addPlaylistBtnEl: HTMLElement;
let toastEl: HTMLElement;
let playlistCoverEl: HTMLImageElement;
let playlistTitleEl: HTMLElement;
let playlistDescriptionEl: HTMLElement;
let bottomBarTextEl: HTMLElement;
let fixedPlaylistEl: HTMLElement;
const selectedPaths = new Set<string>()
let currentPlaylists: Playlist[] = []
let selectedPlaylistName: string | null = null

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
    updateSongTable(playlist)
  }
}

function createSongTable(playlist: Playlist) {
  const container = document.createElement('div')
  container.className = 'song-table-container'

  const songs = playlist.songs.filter((entry) => entry.exists)

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
  centerSongTableRegion(container, table)
  return container
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

function updateSongTable(playlist: Playlist) {
  const appEl = document.querySelector('#app')!
  appEl.innerHTML = ''
  appEl.appendChild(createSongTable(playlist))
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
