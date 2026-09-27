# Jadavpur Love Birds — Native PyQt6 Admin Operations Suite

This directory (`admin_desktop/`) provides the native desktop management suite for Jadavpur Love Birds (JLB). It enforces hardware/smartphone biometric WebAuthn security gates and connects directly to the Supabase PostgreSQL database (`bwvslsvjjclnspmdleyj`).

---

## 🏛️ Architecture & Reference Alignment (`crypto_ledger/entry`)

The authentication and server architecture is adapted from `C:\Users\ASUS\Desktop\crypto_ledger\entry\entry_station.py`:

```
┌────────────────────────────────┐       FIDO2 WebAuthn        ┌─────────────────────────────┐
│   PyQt6 Native Desktop Suite   │ ◄─────────────────────────► │ Smartphone / Security Key   │
│   (admin_desktop/              │     QR Scan or Bluetooth    │ (iOS FaceID / TouchID,      │
│    admin_station.py)           │                             │  Android Biometrics, Hello) │
└───────────────┬────────────────┘                             └──────────────┬──────────────┘
                │                                                             │
                │ Polling / Verification                                      │ POST /submit
                ▼                                                             ▼
┌────────────────────────────────┐                             ┌─────────────────────────────┐
│   Embedded HTTP Auth Server    │ ◄────────────────────────── │ Cross-Device HTML5 WebAuthn │
│   (auth_server.py :8089)       │                             │ Handshake (hints: [hybrid]) │
└───────────────┬────────────────┘                             └─────────────────────────────┘
                │
                ▼ Direct SQL Query (psycopg2)
┌────────────────────────────────┐
│   Supabase PostgreSQL Engine   │
│   (public.profiles,            │
│    public.admin_passkeys,      │
│    public.global_announcements)│
└────────────────────────────────┘
```

1. **Embedded Cross-Device WebAuthn Server (`auth_server.py`)**:
   - Spawns a background `http.server.ThreadingHTTPServer` on port 8089 (with dynamic port fallback).
   - Serves modern dark-mode WebAuthn challenge pages supporting FIDO2 hybrid transport (`hints: ["hybrid"]`).
   - Generates high-contrast QR codes directly displayed in the PyQt6 window using `qrcode` and `QPixmap`.
   - Admin can scan the QR code with their phone (TouchID / FaceID) or launch Windows Hello / security key.
   - Updates in-memory session states (`active_qr_sessions[session_id]["status"] = "VERIFIED"`).

2. **Desktop Browser WebAuthn Sensor Handshake**:
   - Modeled directly after CyberChain workstation authentication architecture.
   - Admin enters their Call-Sign / Name and clicks **Enter Passkey**.
   - Opens local desktop browser triggering the system's native hardware authenticator (Windows Hello / Mac Touch ID / PIN / YubiKey).
   - Alternatively offers hybrid smartphone Bluetooth passkey scanning.
   - Zero temporary backdoor passcodes permitted.

3. **Administration Console Panels**:
   - **🌸 Female Directory**: Department filter (29 Jadavpur depts), Grad Year filter (2024–2029), full search, high-res photo inspection carousel, raw library card audit (e.g. SL-4762), and approval status.
   - **⚡ Male Directory**: Department & year filters, active chat visualization (unlimited P2P connections, zero-cloud load), status badges, and force deactivation action.
   - **⏳ Identity Approvals Queue**: Live list of pending unapproved profiles (`is_approved = false`), raw library card ID, photo preview, and 1-click Approve / Reject.
   - **🚫 Deactivated Accounts & Enforcement**: Displays deactivated users with mandatory reason logs and 1-click Re-Activation. Includes manual force deactivation protocol with mandatory explanation requirements.
   - **📢 Global Announcements**: Broadcast real-time system alerts (`info`, `warning`, `emergency`) to `public.global_announcements`.
   - **🔐 Hardware Passkeys**: Audit and manage enrolled FIDO2/WebAuthn credentials in `public.admin_passkeys`.

---

## 🚀 How to Run

### Step 1: Admin Ingestion Station (Credential Enrollment)
To enroll new administrator credentials or register biometric passkeys:
- Double-click [`run_entry_station.bat`](file:///D:/PROJECTS/JadavpurLoveBirds/run_entry_station.bat) in the project root (or [`admin_desktop/entry.bat`](file:///D:/PROJECTS/JadavpurLoveBirds/admin_desktop/entry.bat)).
- Enter Administrator Call-Sign / Name.
- Click **Launch Desktop Passkey Enrollment** to register the passkey via Windows Hello or Security Key.
- Enrolled credentials will be committed directly to `public.admin_passkeys` in Supabase.

### Step 2: Main Admin Workstation (Daily Operations)
Double-click [`JLB_Admin_Station.exe`](file:///D:/PROJECTS/JadavpurLoveBirds/JLB_Admin_Station.exe) in the project root:
- Compact login card prompts for Admin Name.
- Click **Enter Passkey** -> Desktop browser opens and triggers native workstation sensor (Windows Hello / PIN / Security Key).
- Upon successful authentication, dynamically expands to the full 1180×780 Operations Console.
- Zero Python installation required for `.exe`.

### 🔨 Rebuilding the Standalone Executable:
Double-click [`build_admin_exe.bat`](file:///D:/PROJECTS/JadavpurLoveBirds/build_admin_exe.bat) in the project root to automatically recompile `JLB_Admin_Station.exe` via PyInstaller.
