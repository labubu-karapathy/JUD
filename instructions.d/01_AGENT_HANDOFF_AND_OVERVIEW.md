# 01 - Agent Handoff & Project Overview

## 1. Project Identity & Purpose
- **Application Name**: Jadavpur Love Birds (JLB)
- **Classification**: Mobile-First Campus P2P Dating Application
- **Target OS / Environment**: Windows 11 (Development & Packaging) / Cross-Platform (Android APK + iOS PWA)
- **Primary Goals**:
  1. Campus-Gated Student Verification (physical library card barcode scan hashed with SHA-256).
  2. Zero-Cloud Chat Storage (no chat messages or media ever touch a server; stored solely in client-side IndexedDB via Dexie.js).
  3. Direct WebRTC P2P DataChannel Communication with WhatsApp-style delivery ticks (sent, delivered, read).
  4. Female-First Security Controls (female client initiates signaling; master media sharing permission toggle).
  5. Public Safety Transparency Counters (atomic database triggers for report and block counts displayed on all cards).
  6. Universal Zero-Cost Deployment (free Android APK via Capacitor + free iOS PWA via Vercel/Netlify + free GitHub Actions CI/CD).

## 2. Technology Stack & Key Libraries
- **Node.js**: v20+ recommended (works on Node 18, 20, 22)
- **Bundler & Tooling**: Vite 6+ with `@vitejs/plugin-react`
- **Frontend Core**: React 19 + TypeScript 5/6
- **Styling**: Tailwind CSS 3.4.17 with PostCSS and Autoprefixer
- **UI & Animation**: Lucide React Icons (`lucide-react`) + Framer Motion (`framer-motion`)
- **Class Utilities**: `clsx` + `tailwind-merge`
- **Local Storage Engine**: `dexie` (v4 IndexedDB wrapper)
- **Backend / Database**: `@supabase/supabase-js` v2 (PostgreSQL + Ephemeral Broadcast Realtime)
- **Barcode Engine**: `@zxing/library` (client-side optical recognition for library cards)
- **PWA Tooling**: `vite-plugin-pwa` (Workbox Service Worker generator)
- **Mobile Container**: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` v8

## 3. Directory Structure Summary
```
.
├── .github/workflows/build-apk.yml   # Remote GitHub Actions automated APK build
├── android/                          # Native Android Studio / Gradle project
├── instructions.d/                   # Modular documentation for agents & engineers
├── public/                           # Static icons (192, 512, apple-touch, favicon)
├── src/
│   ├── assets/                       # Images & SVGs
│   ├── components/                   # LockScreen, SecurityLock, ProfileCard, ReportModal, etc.
│   ├── db/index.ts                   # Dexie.js local-first database
│   ├── pages/                        # Auth, Discover, Matches, ChatRoom, ProfileView
│   ├── services/                     # p2pChat.ts (WebRTC) & supabase.ts (Database API)
│   ├── utils/crypto.ts               # SHA-256 hashing, WebAuthn biometrics, vibration
│   ├── App.tsx                       # Smartphone viewport container & router
│   ├── index.css                     # Tailwind directives & mobile resets
│   └── main.tsx                      # App entry point
├── supabase/migrations/              # PostgreSQL schema & RLS policies
├── build-apk.bat                     # Windows 11 Command Prompt one-click APK builder
├── build-apk.ps1                     # Windows 11 PowerShell one-click APK builder
├── build-apk.sh                      # Linux/macOS bash one-click APK builder
├── capacitor.config.ts               # Capacitor Android runtime config
├── index.html                        # PWA meta tags & viewport lock
├── package.json                      # Scripts & dependencies
├── tailwind.config.js                # Tailwind theme extensions
└── vite.config.ts                    # Vite config with VitePWA and @ alias
```
