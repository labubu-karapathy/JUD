/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) - GITHUB AUTO-UPDATE SERVICE
 * ==============================================================================
 * Standard fleet updates pulled directly from the official GitHub JUD repository:
 * https://github.com/labubu-karapathy/JUD
 * ==============================================================================
 */

export const CURRENT_APP_VERSION = '2.4.1'
export const CURRENT_BUILD_HASH = 'jlb-build-2026-09-28-v2.4.1'

export interface UpdateNotice {
  version: string
  buildHash: string
  message: string
  source: 'github_jud'
  applied: boolean
}

type UpdateListener = (notice: UpdateNotice) => void
const updateListeners: Set<UpdateListener> = new Set()

export function onOTAUpdateNotification(listener: UpdateListener): () => void {
  updateListeners.add(listener)
  return () => {
    updateListeners.delete(listener)
  }
}

export function notifyUpdate(notice: UpdateNotice): void {
  updateListeners.forEach((l) => {
    try {
      l(notice)
    } catch (e) {
      console.error('[GitHub Updater] Listener error:', e)
    }
  })
}

export function getLocalBuildHash(): string {
  try {
    return localStorage.getItem('jlb_local_build_hash') || CURRENT_BUILD_HASH
  } catch {
    return CURRENT_BUILD_HASH
  }
}

export function setLocalBuildHash(hash: string): void {
  try {
    localStorage.setItem('jlb_local_build_hash', hash)
  } catch (e) {
    console.warn('[GitHub Updater] Could not save build hash to localStorage:', e)
  }
}

/**
 * Applies update from GitHub and reloads safely preserving IndexedDB
 */
export async function applyGitHubUpdate(
  buildHash: string,
  version: string,
  message: string
): Promise<void> {
  const localHash = getLocalBuildHash()
  if (buildHash === localHash) return

  setLocalBuildHash(buildHash)

  // Update Service Worker if present
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.update()
      }
    } catch (e) {
      console.warn('[GitHub Updater] Service worker update check notice:', e)
    }
  }

  notifyUpdate({
    version,
    buildHash,
    message,
    source: 'github_jud',
    applied: true,
  })

  // Refresh WebView after notification
  setTimeout(() => {
    window.location.reload()
  }, 2200)
}
