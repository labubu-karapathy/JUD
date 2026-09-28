/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) — ZERO-COST FLEET AUTO-UPDATER SERVICE
 * ==============================================================================
 * Architecture & Design Standards:
 * 1. ZERO-COST OVER-THE-AIR (OTA) DYNAMIC WEB BUNDLE UPDATES:
 *    - 99% of app updates are web code changes (HTML/CSS/JS in dist/).
 *    - Instead of repeatedly downloading a 16MB APK and prompting the user with
 *      the Android package installer, the app downloads a ~1MB web-dist.zip
 *      from GitHub CDN in under 2 seconds.
 *    - Unzips into internal app storage and updates Capacitor's serverBasePath.
 *    - Instant seamless reload without touching Android package installer or losing
 *      any IndexedDB ('JUDAppLocalDB') data.
 *
 * 2. NATIVE ANDROID PACKAGE UPGRADES (FALLBACK FOR NATIVE CHANGES):
 *    - When an update actually requires native Android changes (new permissions,
 *      native plugins in AndroidManifest.xml), minNativeVersionCode triggers
 *      the native APK download and Android FileProvider installer.
 *
 * 3. 100% FREE TIER / ZERO SERVER STORAGE:
 *    - All assets are served via raw.githubusercontent.com CDN (unlimited bandwidth).
 *    - Zero tokens, zero API rate-limits, completely zero-cost.
 * ==============================================================================
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Filesystem, Directory } from '@capacitor/filesystem'

export const CURRENT_APP_VERSION = '2.4.6'
export const CURRENT_BUILD_HASH = 'jlb-build-2026-09-29-v2.4.6'

export interface ReleaseManifest {
  version: string
  versionCode: number
  releaseDate: string
  mandatory: boolean
  downloadUrl: string // APK download URL
  webBundleUrl?: string // OTA zip download URL
  minNativeVersionCode?: number // Minimum native binary required for OTA
  commit_message?: string
  build_hash?: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  isOtaAvailable: boolean
  currentVersion: string
  currentVersionCode: number
  remoteManifest: ReleaseManifest | null
}

export type DownloadProgressCallback = (progressPercent: number) => void

interface AppInstallerPlugin {
  installApk(options: { filePath: string }): Promise<void>
}

interface OtaUpdaterPlugin {
  downloadAndApply(options: { url: string; version: string }): Promise<{ success: boolean; version: string }>
  getActiveVersion(): Promise<{ version: string; path: string }>
  resetToDefault(): Promise<void>
}

const AppInstaller = registerPlugin<AppInstallerPlugin>('AppInstaller')
const OtaUpdater = registerPlugin<OtaUpdaterPlugin>('OtaUpdater')

const MANIFEST_CDN_URL = 'https://raw.githubusercontent.com/labubu-karapathy/JUD/main/release-manifest.json'

/**
 * Checks GitHub raw CDN for the latest release manifest.
 * Zero tokens, zero API rate-limits, completely public.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    let currentVersion = CURRENT_APP_VERSION
    let currentVersionCode = 20404

    if (Capacitor.isNativePlatform()) {
      try {
        const appInfo = await App.getInfo()
        currentVersion = appInfo.version || currentVersion
        currentVersionCode = parseInt(appInfo.build, 10) || currentVersionCode

        // Check if there is an active OTA version running
        const otaInfo = await OtaUpdater.getActiveVersion()
        if (otaInfo && otaInfo.version && otaInfo.version !== 'bundled') {
          currentVersion = otaInfo.version
        }
      } catch (err) {
        console.warn('[UpdateService] Could not read native app/OTA info:', err)
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
      return { hasUpdate: false, isOtaAvailable: false, currentVersion, currentVersionCode, remoteManifest: null }
    }

    const manifest: ReleaseManifest = await response.json()
    const remoteCode = manifest.versionCode || 0

    // Check if OTA is possible:
    // Requires webBundleUrl and installed native binary version >= minNativeVersionCode
    const minNative = manifest.minNativeVersionCode || 0
    const isOtaAvailable = Boolean(manifest.webBundleUrl && currentVersionCode >= minNative)

    // Check if an update is available
    const hasUpdate = isOtaAvailable
      ? (manifest.version !== currentVersion && manifest.build_hash !== localStorage.getItem('jlb_local_build_hash'))
      : remoteCode > currentVersionCode

    return {
      hasUpdate,
      isOtaAvailable,
      currentVersion,
      currentVersionCode,
      remoteManifest: manifest,
    }
  } catch (error) {
    console.warn('[UpdateService] Update check network error:', error)
    return {
      hasUpdate: false,
      isOtaAvailable: false,
      currentVersion: CURRENT_APP_VERSION,
      currentVersionCode: 20403,
      remoteManifest: null,
    }
  }
}

/**
 * Downloads and applies a lightweight Over-The-Air (OTA) web bundle update.
 * Unzips in app storage and reloads WebView instantly without Android installer prompts.
 */
export async function applyOtaUpdate(
  webBundleUrl: string,
  version: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.reload()
    return
  }

  const result = await OtaUpdater.downloadAndApply({ url: webBundleUrl, version })
  if (result.success) {
    localStorage.setItem('jlb_local_build_hash', `jlb-ota-${version}`)
  }
}

/**
 * Downloads the APK into the app's cache directory and triggers the Android FileProvider installer.
 * (Used only when an update requires new native Java/permissions).
 */
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(downloadUrl, '_blank')
    return
  }

  const fileName = 'update.apk'

  try {
    onProgress?.(10)

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
