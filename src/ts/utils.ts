import { toastEl, loadingOverlayEl } from './dom'

export function showToast(message: string) {
  toastEl.textContent = message
  toastEl.classList.add('toast-visible')

  setTimeout(() => {
    toastEl.classList.remove('toast-visible')
  }, 3000)
}

export function showSyncOverlay(message: string) {
  if (!loadingOverlayEl) return
  loadingOverlayEl.classList.remove('hidden')
  loadingOverlayEl.querySelector('.sync-overlay-text')!.textContent = message
}

export function hideSyncOverlay() {
  if (!loadingOverlayEl) return
  loadingOverlayEl.classList.add('hidden')
}

export function sanitizePlaylistIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeText(value?: string) {
  return value?.trim().toLowerCase() || ''
}

export function formatSecondsToTime(seconds: number): string {
  if (seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function parseDurationToSeconds(duration?: string): number {
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

export function formatBytesToMB(bytes: number): number {
  return bytes > 0 ? Number((bytes / 1_000_000).toFixed(1)) : 0
}

export function shuffleArray<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

export async function withSyncing<T>(message: string, action: () => Promise<T>): Promise<T> {
  showSyncOverlay(message)
  try {
    return await action()
  } finally {
    hideSyncOverlay()
  }
}

export function updateMediaSession(
  song?: { title?: string; performer?: string },
  currentPlaybackPlaylistName?: string | null,
  isPlaying = false,
  isPaused = false,
) {
  if (!('mediaSession' in navigator)) return

  const metadata = new MediaMetadata({
    title: song?.title ?? 'RetroTunes',
    artist: song?.performer ?? '',
    album: currentPlaybackPlaylistName ?? '',
  })

  navigator.mediaSession.metadata = metadata
  navigator.mediaSession.playbackState = isPlaying && !isPaused ? 'playing' : isPaused ? 'paused' : 'none'
}

export function configureMediaSessionHandlers(
  togglePlayPause: () => void,
  prevTrack: () => void,
  nextTrack: () => void,
) {
  if (!('mediaSession' in navigator)) return

  navigator.mediaSession.setActionHandler('play', () => togglePlayPause())
  navigator.mediaSession.setActionHandler('pause', () => togglePlayPause())
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
}
