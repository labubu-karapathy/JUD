# 02 - Windows 11 Setup & Dependency Guide

This guide ensures that any Antigravity terminal agent or developer extracting this project on Windows 11 can set up, install, run, and compile the project with ZERO broken imports or failed dependencies.

## 1. Extracting the Project Archive on Windows 11
- Windows 11 (version 23H2 and newer) natively opens and extracts `.rar` archives directly from File Explorer.
- Alternatively, use **7-Zip** or **WinRAR**:
  - Right-click `JadavpurLoveBirds-Source.rar` -> **Extract Here** (or **Extract to JadavpurLoveBirds/**).

## 2. Prerequisites on Windows 11
Ensure the following tools are installed:

### A. Node.js (v20+ LTS recommended)
Open Windows Terminal (PowerShell) and verify:
```powershell
node -v
npm -v
```
If not installed, run:
```powershell
winget install OpenJS.NodeJS.LTS
```

### B. Java Development Kit (JDK 17 LTS - Required ONLY for native APK builds)
```powershell
java -version
```
If not installed, run:
```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

### C. Android Studio / Android SDK (Required ONLY for native APK builds)
Ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set in your Windows User Environment Variables:
- Path usually: `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`

---

## 3. Flawless Dependency Installation (Preventing Import & Binary Breaks)

When transferring a project between Linux and Windows, native npm packages (like Rollup platform binaries) must be downloaded for Windows.

1. Open PowerShell or Command Prompt in the project folder:
   ```powershell
   cd "path\to\Jadavpur Love Birds"
   ```

2. Run a clean install:
   ```powershell
   npm install
   ```
   *Note*: `package-lock.json` is strictly locked. `npm install` will fetch the Windows x64 binary for Rollup and native plugins automatically.

3. Verify TypeScript build and path resolution:
   ```powershell
   npm run build
   ```
   This runs `tsc -b && vite build`. All path aliases (`@/*` pointing to `src/*`) are configured cross-platform in `vite.config.ts` using `fileURLToPath(new URL('./src', import.meta.url))`, which works natively with Windows drive letters and backslashes.

---

## 4. Running the Development Server
```powershell
npm run dev
```
Open your browser at `http://localhost:5173`.
To view in mobile emulation:
- Press `F12` in Chrome/Edge.
- Toggle Device Toolbar (`Ctrl + Shift + M`).
- Select **iPhone 14 Pro** or **Pixel 7**.
