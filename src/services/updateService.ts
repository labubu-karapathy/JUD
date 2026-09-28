/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) — ZERO-COST FLEET AUTO-UPDATER SERVICE
 * ==============================================================================
 * Architecture & Design Standards:
 * 1. ZERO-COST & NO RATE LIMITS:
 *    Fetches release manifests directly from GitHub raw CDN / Releases:
 *    https://raw.githubusercontent.com/labubu-karapathy/JUD/main/release-manifest.json
 *    Eliminates all calls to api.github.com and strips any client-side tokens.
 *
 * 2. NATIVE ANDROID PACKAGE INSTALLATION VIA FILEPROVIDER:
 *    Downloads the compiled APK into the application's external cache directory
 *    using @capacitor/filesystem, then invokes Android's native package installer:
 *    - Action: Intent.ACTION_VIEW
 *    - Data: Content URI from FileProvider (com.antigravity.datingapp.fileprovider)
 *    - Type: application/vnd.android.package-archive
 *    - Flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
 *
 * 3. 100% INDEXEDDB SANDBOX RETENTION:
 *    Updating the APK in-place preserves the internal Android app sandbox.
 *    Dexie IndexedDB ('JUDAppLocalDB') and local credentials remain untouched.
 *    IMPORTANT: Debug and release builds must use the same signing keystore
 *    (e.g., android/app/debug.keystore) so Android permits in-place package upgrades.
 *
 * 4. ZERO SCRIPT INJECTION:
 *    No eval(), dynamic <script> tag injection, or arbitrary remote code execution.
 * ==============================================================================
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Filesystem, Directory } from '@capacitor/filesystem'

export const CURRENT_APP_VERSION = '2.4.2'
export const CURRENT_BUILD_HASH = 'jlb-build-2026-09-28-v2.4.2'

export interface ReleaseManifest {
  version: string
  versionCode: number
  releaseDate: string
  mandatory: boolean
  downloadUrl: string
  commit_message?: string
  build_hash?: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  currentVersionCode: number
  remoteManifest: ReleaseManifest | null
}

export type DownloadProgressCallback = (progressPercent: number) => void

interface AppInstallerPlugin {
  installApk(options: { filePath: string }): Promise<void>
}

const AppInstaller = registerPlugin<AppInstallerPlugin>('AppInstaller')

const MANIFEST_CDN_URL = 'https://raw.githubusercontent.com/labubu-karapathy/JUD/main/release-manifest.json'

/**
 * Checks GitHub raw CDN for the latest release manifest.
 * Zero tokens, zero API rate-limits, completely public.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    let currentVersion = '2.4.2'
    let currentVersionCode = 20402

    if (Capacitor.isNativePlatform()) {
      try {
        const appInfo = await App.getInfo()
        currentVersion = appInfo.version || currentVersion
        currentVersionCode = parseInt(appInfo.build, 10) || currentVersionCode
      } catch (err) {
        console.warn('[UpdateService] Could not read native app info:', err)
      }
    }

    // Cache-busting query param ensures fresh check
    const response = await fetch(`${MANIFEST_CDN_URL}?_t=${Date.now()}`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      console.warn(`[UpdateService] Manifest fetch returned HTTP ${response.status}`)
      return { hasUpdate: false, currentVersion, currentVersionCode, remoteManifest: null }
    }

    const manifest: ReleaseManifest = await response.json()
    const remoteCode = manifest.versionCode || 0

    // Compare version code
    const hasUpdate = remoteCode > currentVersionCode || (
      manifest.version !== currentVersion &&
      manifest.build_hash !== localStorage.getItem('jlb_local_build_hash')
    )

    return {
      hasUpdate,
      currentVersion,
      currentVersionCode,
      remoteManifest: manifest,
    }
  } catch (error) {
    console.warn('[UpdateService] Update check network error:', error)
    return {
      hasUpdate: false,
      currentVersion: '2.4.2',
      currentVersionCode: 20402,
      remoteManifest: null,
    }
  }
}

/**
 * Downloads the APK into the app's cache directory and triggers the Android FileProvider installer.
 */
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  // If running in browser or PWA mode, open the download URL in a new tab
  if (!Capacitor.isNativePlatform()) {
    window.open(downloadUrl, '_blank')
    return
  }

  const fileName = 'update.apk'

  try {
    onProgress?.(10)

    // Option A: Use Filesystem.downloadFile if supported by native platform
    let apkNativePath = ''
    try {
      const downloadResult = await Filesystem.downloadFile({
        url: downloadUrl,
        path: fileName,
        directory: Directory.Cache,
        progress: true,
      })
      apkNativePath = downloadResult.path || ''
      onProgress?.(80)
    } catch {
      // Option B: Fallback to fetch + Blob write
      onProgress?.(25)
      const res = await fetch(downloadUrl)
      if (!res.ok) throw new Error(`APK download failed with status ${res.status}`)
      
      const blob = await res.blob()
      onProgress?.(60)

      const base64Data = await blobToBase64(blob)
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      })
      apkNativePath = writeResult.uri
      onProgress?.(85)
    }

    // Resolve native file URI if not absolute
    if (!apkNativePath.startsWith('file://') && !apkNativePath.startsWith('/')) {
      const uriResult = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      })
      apkNativePath = uriResult.uri
    }

    onProgress?.(100)

    // Invoke Android FileProvider package installer
    await AppInstaller.installApk({ filePath: apkNativePath })
  } catch (error: any) {
    console.error('[UpdateService] Download & install failed:', error)
    // Fallback: Launch external browser to download directly
    window.open(downloadUrl, '_system')
    throw error
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      resolve(base64)
    }
    reader.readAsDataURL(blob)
  })
}
