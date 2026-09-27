# INSTRUCTION FOR NEXT AGENT & TERMINAL (WINDOWS 11 / CROSS-PLATFORM)

Welcome to **Jadavpur Love Birds (JLB)**.
This document provides complete instructions for any AI assistant, Antigravity terminal, or human engineer continuing work on this codebase in a Windows 11 (or Linux/macOS) environment.

---

## 1. Quick Start on Windows 11

### Step 1: Install Dependencies
Open PowerShell or Command Prompt in this folder:
```powershell
npm install
```
*(This ensures all platform-specific binaries for Rollup and native plugins are cleanly installed for Windows x64).*

### Step 2: Start Development Server
```powershell
npm run dev
```
Open `http://localhost:5173`. Press `F12` and toggle mobile device simulation (iPhone 14 Pro or Pixel 7).

### Step 3: Compile Web Bundle & Verify Build
```powershell
npm run build
```
Runs `tsc -b && vite build`. All path aliases (`@/*` -> `src/*`) are configured cross-platform and resolve without error on Windows.

---

## 2. Generating the Android APK on Windows 11

### Option A: One-Click PowerShell Script
```powershell
.\build-apk.ps1
```

### Option B: One-Click Command Prompt / Batch
Double-click `build-apk.bat` in File Explorer, or run:
```cmd
build-apk.bat
```

Both scripts automatically:
1. Rebuild web assets (`npm run build`).
2. Sync assets with Capacitor Android (`npx cap sync android`).
3. Compile debug APK using `android\gradlew.bat assembleDebug`.
4. Copy the compiled APK to `.\JadavpurLoveBirds.apk` in the root folder, ready to send over WhatsApp!

---

## 3. Remote Cloud CI/CD (GitHub Actions)
If Android SDK or Java 17 is not installed locally on Windows 11:
1. Push this repository to GitHub.
2. Go to the **Actions** tab -> **Build & Package Android APK** -> click **Run workflow**.
3. Download `JadavpurLoveBirds-APK` directly from the workflow run artifacts summary.

---

## 4. Free iOS Deployment (Progressive Web App)
1. Import repository into [Vercel](https://vercel.com) (free tier).
2. Framework: **Vite**, Build command: `npm run build`, Output directory: `dist`.
3. Share the Vercel URL with iPhone users.
4. When opened in iOS Safari, the built-in `InstallPwaBanner` prompts users to tap **Share ⎋ -> Add to Home Screen** for the full native, fullscreen app experience.

---

## 5. Architectural Map & Modular Documentation
For deep technical specifications, refer to the `instructions.d/` directory:
- [`instructions.d/01_AGENT_HANDOFF_AND_OVERVIEW.md`](instructions.d/01_AGENT_HANDOFF_AND_OVERVIEW.md): Stack, versions, directory tree.
- [`instructions.d/02_WINDOWS_11_SETUP_AND_DEPENDENCIES.md`](instructions.d/02_WINDOWS_11_SETUP_AND_DEPENDENCIES.md): Windows 11 tools, winget commands, path handling.
- [`instructions.d/03_BUILD_SCRIPTS_AND_APK_GENERATION.md`](instructions.d/03_BUILD_SCRIPTS_AND_APK_GENERATION.md): Detailed build script mechanics.
- [`instructions.d/04_DATABASE_SUPABASE_AND_OFFLINE_CACHE.md`](instructions.d/04_DATABASE_SUPABASE_AND_OFFLINE_CACHE.md): PostgreSQL schema, RLS, Dexie.js offline cache.
- [`instructions.d/05_WEBRTC_ENGINE_AND_WHATSAPP_TICKS.md`](instructions.d/05_WEBRTC_ENGINE_AND_WHATSAPP_TICKS.md): P2P DataChannel packet protocol, WhatsApp ticks lifecycle, female-first gating, media guard.
- [`instructions.d/06_SECURITY_BIOMETRICS_AND_PRIVACY.md`](instructions.d/06_SECURITY_BIOMETRICS_AND_PRIVACY.md): Card barcode hashing (SHA-256), WebAuthn biometrics, auto-lock on blur/background.
- [`ARCHITECTURE.txt`](ARCHITECTURE.txt): Master system architecture text specification for AI model review.

---

## 6. Key Code Locations for Quick Navigation

| Feature | Primary File | Key Functions / Classes |
|---|---|---|
| **App Layout & Router** | `src/App.tsx` | `App` component, unread badge counter |
| **P2P WebRTC Engine** | `src/services/p2pChat.ts` | `P2PChatEngine`, `P2PPacket`, `sendMessage` |
| **Database & API** | `src/services/supabase.ts` | `api.upsertProfile`, `api.createMatch`, `api.createSignalChannel` |
| **Local IndexedDB** | `src/db/index.ts` | `AppLocalDatabase`, `local_messages`, `cached_profiles` |
| **Barcode & PIN Auth** | `src/pages/Auth.tsx` | Barcode scanning, SHA-256 card hash, 4-digit PIN setup |
| **WhatsApp Chat Room** | `src/pages/ChatRoom.tsx` | Media attachment, connection indicator, delivery ticks |
| **Discover Feed** | `src/pages/Discover.tsx` | Offline-first Dexie queue, report & block actions |
| **Connections List** | `src/pages/Matches.tsx` | Matches feed, female-first initiation tags |
| **Biometric Lock** | `src/components/LockScreen.tsx` | 4-digit PIN pad, WebAuthn biometrics, vibration |
| **Auto-Lock Wrapper** | `src/components/SecurityLock.tsx` | `visibilitychange` & `window.blur` listeners |
| **PostgreSQL Schema** | `supabase/migrations/001_initial_schema.sql` | Tables, atomic counter triggers, RLS policies |
| **Android Native** | `android/` & `capacitor.config.ts` | Capacitor Android bridge & adaptive icons |
