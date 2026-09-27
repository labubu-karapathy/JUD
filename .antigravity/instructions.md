# Antigravity Terminal Agent Instructions

This project is **Jadavpur Love Birds (JLB)**, a mobile-first PWA and native Android dating application built with Vite + React 19 + TypeScript + Tailwind CSS + Dexie.js + Supabase + WebRTC + Capacitor 8.

## Essential Files for Antigravity Agents
1. Master Instructions: `INSTRUCTION.md`
2. Modular Documentation: `instructions.d/*.md`
3. Architecture Specification: `ARCHITECTURE.txt`
4. Windows 11 Build Scripts: `build-apk.bat` and `build-apk.ps1`
5. Linux/macOS Build Script: `build-apk.sh`

## Commands to Run
- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Build web production bundle: `npm run build`
- Build web & sync with Android: `npm run cap:build`
- Build native Android APK (Windows): `.\build-apk.ps1` or `build-apk.bat`
- Build native Android APK (Linux): `./build-apk.sh`
