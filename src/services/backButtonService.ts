/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) — ANDROID HARDWARE & GESTURE BACK BUTTON SERVICE
 * ==============================================================================
 * Provides unified, priority-based back navigation across the app:
 * 1. Modals & Overlays (Highest priority: Lightbox, ProfileModal, Drawers, Pickers)
 * 2. Active Chat Subscreen (Exits ChatRoom back to Matches list)
 * 3. Tab Navigation History (Returns to previously visited tabs, e.g. Profile -> Matches -> Discover)
 * 4. App Root Exit (Double-tap within 2s to exit app gracefully)
 * ==============================================================================
 */

import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

export type BackHandler = () => boolean | Promise<boolean>

interface HandlerEntry {
  id: string
  priority: number // Higher number executes first
  handler: BackHandler
}

class BackButtonService {
  private handlers: HandlerEntry[] = []
  private isInitialized = false
  private lastBackTime = 0
  private onExitToastCallback: ((show: boolean) => void) | null = null
  private toastTimer: any = null

  public init(onExitToast?: (show: boolean) => void) {
    if (onExitToast) {
      this.onExitToastCallback = onExitToast
    }

    if (this.isInitialized) return
    this.isInitialized = true

    if (Capacitor.isNativePlatform()) {
      try {
        CapApp.addListener('backButton', async () => {
          await this.dispatchBack()
        })
      } catch (err) {
        console.warn('[BackButtonService] Failed to bind native backButton listener:', err)
      }
    }

    // Support browser / PWA back button via popstate
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', async () => {
        await this.dispatchBack()
      })
    }
  }

  public setExitToastCallback(cb: (show: boolean) => void) {
    this.onExitToastCallback = cb
  }

  /**
   * Registers a back action with priority:
   * 100 = Modals, Lightbox, Drawers, Dropdowns
   * 50  = Active Chat View
   * 20  = Tab Navigation History
   * 0   = Root App Exit
   */
  public register(id: string, priority: number, handler: BackHandler): () => void {
    this.handlers = this.handlers.filter((h) => h.id !== id)
    this.handlers.push({ id, priority, handler })
    this.handlers.sort((a, b) => b.priority - a.priority)

    return () => {
      this.unregister(id)
    }
  }

  public unregister(id: string) {
    this.handlers = this.handlers.filter((h) => h.id !== id)
  }

  public async dispatchBack(): Promise<boolean> {
    for (const entry of this.handlers) {
      try {
        const handled = await entry.handler()
        if (handled) {
          // If handled, clear exit toast if it was visible
          if (this.onExitToastCallback) {
            this.onExitToastCallback(false)
          }
          return true
        }
      } catch (err) {
        console.error(`[BackButtonService] Error executing handler '${entry.id}':`, err)
      }
    }

    // Fallback: If nothing handled, apply double-tap back to exit
    this.handleRootExit()
    return true
  }

  public handleRootExit() {
    const now = Date.now()
    if (now - this.lastBackTime < 2000) {
      if (this.toastTimer) clearTimeout(this.toastTimer)
      if (this.onExitToastCallback) this.onExitToastCallback(false)
      if (Capacitor.isNativePlatform()) {
        CapApp.exitApp()
      }
    } else {
      this.lastBackTime = now
      if (this.onExitToastCallback) {
        this.onExitToastCallback(true)
        if (this.toastTimer) clearTimeout(this.toastTimer)
        this.toastTimer = setTimeout(() => {
          if (this.onExitToastCallback) this.onExitToastCallback(false)
        }, 2000)
      }
    }
  }
}

export const backButtonService = new BackButtonService()
