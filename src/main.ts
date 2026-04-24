import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'

let pathsContainerEl: HTMLElement;
let addPathBtnEl: HTMLElement;
let playlistsContainerEl: HTMLElement;
let addPlaylistBtnEl: HTMLElement;
let toastEl: HTMLElement;
const selectedPaths = new Set<string>()
let currentPlaylists: Playlist[] = []

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

function createPlaylistItem(playlist: Playlist, fixed = false): HTMLElement {
  const playlistItem = document.createElement('div');
  playlistItem.className = 'playlist-item';
  if (fixed) playlistItem.classList.add('fixed-playlist');

  const text = document.createElement('span');
  text.textContent = playlist.name;

  playlistItem.appendChild(text);
  playlistItem.addEventListener('click', () => {
    handlePlaylistClick(playlist)
  });

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

  const fixedPlaylistEl = document.querySelector('.fixed-playlist') as HTMLElement

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
      handlePlaylistClick(playlist)
    } else {
      console.log('All songs playlist selected')
      showToast('All songs selected')
    }
  })

  await loadSavedPaths()
  console.log('RetroTunes app initialized')
})
