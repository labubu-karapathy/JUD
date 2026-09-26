import React, { useState, useEffect } from 'react'
import { Share, PlusSquare, X, Smartphone } from 'lucide-react'

export const InstallPwaBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState<boolean>(false)

  useEffect(() => {
    // Check if running on iOS (iPhone / iPad / iPod)
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream

    // Check if already in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    // Check if user dismissed it in this session
    const isDismissed = sessionStorage.getItem('jud_pwa_ios_dismissed')

    if (isIos && !isStandalone && !isDismissed) {
      setShowBanner(true)
    }
  }, [])

  const handleDismiss = () => {
    sessionStorage.setItem('jud_pwa_ios_dismissed', 'true')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-16 inset-x-3 z-50 animate-slide-up max-w-sm mx-auto">
      <div className="bg-slate-900/95 border border-rose-500/40 backdrop-blur-xl rounded-2xl p-4 shadow-2xl text-white space-y-3 relative">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">Install Jadavpur Love Birds on iOS</h4>
            <p className="text-[10px] text-slate-400">Get the full native mobile experience</p>
          </div>
        </div>

        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800 space-y-2 text-xs text-slate-300">
          <p className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-rose-400 shrink-0">1</span>
            <span>Tap the <strong className="text-white">Share</strong> button <Share className="w-3.5 h-3.5 inline text-blue-400 mx-0.5" /> in Safari toolbar below</span>
          </p>
          <p className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-rose-400 shrink-0">2</span>
            <span>Scroll down and select <strong className="text-white">"Add to Home Screen"</strong> <PlusSquare className="w-3.5 h-3.5 inline text-slate-300 mx-0.5" /></span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default InstallPwaBanner
