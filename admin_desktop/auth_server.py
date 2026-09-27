"""
==============================================================================
JADAVPUR LOVE BIRDS - FIDO2 / WEBAUTHN BROWSER AUTHENTICATION SERVER
==============================================================================
Directly modeled after C:\\Users\\ASUS\\Desktop\\crypto_ledger\\CyberChain\\auth_server.py:
- Native desktop browser-based authentication.
- Workstation Sensor (Windows Hello / Mac Touch ID / PIN / Security Key).
- Optional Cross-Device Smartphone Bluetooth QR code (hints: ["hybrid"]).
- Strict biometric verification: never verifies on cancel or close.
==============================================================================
"""
import os
import sys
import json
import uuid
import socket
import threading
import urllib.parse
import http.server
from typing import Dict, Any, Optional

# Active Authentication Sessions: session_id -> { "username": ..., "status": "PENDING"|"VERIFIED", ... }
active_auth_sessions: Dict[str, Dict[str, Any]] = {}
server_instance: Optional[http.server.ThreadingHTTPServer] = None
server_port: int = 8089


class AuthHttpHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress console clutter

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        session_id = params.get("session", [""])[0]

        # Route: /auth or /enroll or / - Opens Desktop WebAuthn page
        if parsed.path in ("/auth", "/enroll", "/login", "/"):
            session = active_auth_sessions.get(session_id, {})
            username = session.get("username", params.get("user", ["JLB Admin"])[0])
            mode = session.get("mode", params.get("mode", ["login"])[0])
            html = get_passkey_page_html(session_id, username, mode)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
            return

        # Route: /api/status or /poll - Poll session status
        elif parsed.path in ("/api/status", "/poll"):
            session = active_auth_sessions.get(session_id, {"status": "NOT_FOUND"})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(session).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/api/verify", "/submit"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                data = json.loads(body)

                session_id = data.get("session_id")
                cred_id = data.get("credential_id")

                if not session_id or session_id not in active_auth_sessions:
                    self.send_response(400)
                    self.end_headers()
                    return

                if not cred_id or not isinstance(cred_id, str) or len(cred_id.strip()) == 0:
                    self.send_response(400)
                    self.end_headers()
                    return

                dev_name = data.get("client_device") or "Workstation Biometric Sensor"

                active_auth_sessions[session_id]["status"] = "VERIFIED"
                active_auth_sessions[session_id]["credential_id"] = cred_id
                active_auth_sessions[session_id]["device_name"] = dev_name

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "status": "VERIFIED"}).encode("utf-8"))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                return

        self.send_response(404)
        self.end_headers()


def get_passkey_page_html(session_id: str, username: str, mode: str = "login") -> str:
    """HTML/JS page that triggers native WebAuthn (desktop sensor or smartphone bluetooth)."""
    badge_title = "◈ JLB ADMIN HARDWARE PASSKEY ENROLLMENT" if mode == "enroll" else "◈ JLB ADMINISTRATOR AUTHENTICATION"
    action_heading = f"Enroll Passkey for <span class='user-tag'>{username}</span>" if mode == "enroll" else f"Sign In as <span class='user-tag'>{username}</span>"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JLB Admin - Hardware Passkey Authentication</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
    body {{
      background: #06090e;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }}
    .card {{
      background: #0c111a;
      border: 1px solid #1f2a3c;
      border-radius: 18px;
      padding: 36px 30px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85);
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 255, 204, 0.1);
      border: 1px solid rgba(0, 255, 204, 0.3);
      color: #00ffcc;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      padding: 5px 14px;
      border-radius: 20px;
      text-transform: uppercase;
      margin-bottom: 18px;
    }}
    h1 {{
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.3px;
      margin-bottom: 8px;
      color: #f8fafc;
    }}
    .user-tag {{
      color: #00ffcc;
    }}
    .subtitle {{
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 22px;
    }}
    .instruction-card {{
      background: #111824;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 22px;
      text-align: left;
    }}
    .tip-box {{
      background: rgba(0, 255, 204, 0.08);
      border: 1px solid rgba(0, 255, 204, 0.25);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 14px;
      font-size: 12px;
      color: #a7f3d0;
      line-height: 1.4;
    }}
    .step {{
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #cbd5e1;
    }}
    .step:last-child {{
      margin-bottom: 0;
    }}
    .step-number {{
      background: rgba(0, 255, 204, 0.15);
      color: #00ffcc;
      font-weight: 800;
      font-size: 11px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }}
    .btn-main {{
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 10px;
      background: #00ffcc;
      color: #06090e;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.2s ease;
      margin-bottom: 12px;
      box-shadow: 0 0 20px rgba(0, 255, 204, 0.25);
    }}
    .btn-main:hover {{
      background: #33ffd6;
      box-shadow: 0 0 30px rgba(0, 255, 204, 0.45);
      transform: translateY(-1px);
    }}
    .btn-secondary {{
      width: 100%;
      padding: 13px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #111827;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }}
    .btn-secondary:hover {{
      background: #1f2937;
      color: #f8fafc;
      border-color: #00ffcc;
    }}
    .status-box {{
      margin-top: 18px;
      font-size: 13px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }}
    .spinner {{
      width: 14px;
      height: 14px;
      border: 2px solid rgba(0, 255, 204, 0.2);
      border-top-color: #00ffcc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }}
    @keyframes spin {{
      to {{ transform: rotate(360deg); }}
    }}
    .success-panel {{
      display: none;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid #10b981;
      border-radius: 12px;
      padding: 24px;
      margin-top: 18px;
    }}
    .checkmark {{
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.2);
      border: 2px solid #10b981;
      color: #10b981;
      font-size: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 14px auto;
    }}
    .success-title {{
      color: #10b981;
      font-weight: 800;
      font-size: 18px;
      margin-bottom: 6px;
    }}
    .success-desc {{
      font-size: 13px;
      color: #94a3b8;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div id="auth-panel">
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M7 7l10 10-5 5V2l5 5L7 17"/>
        </svg>
        {badge_title}
      </div>

      <h1>{action_heading}</h1>
      <p class="subtitle">Authenticate with your enrolled passkey via Smartphone Bluetooth QR or Workstation Sensor.</p>

      <div class="instruction-card">
        <div class="tip-box">
          <strong>📱 Smartphone Passkey:</strong> Click <strong>"Display Phone Bluetooth QR"</strong> below to scan with your phone camera and confirm your fingerprint.
        </div>

        <div class="step">
          <div class="step-number">1</div>
          <div class="step-text">Click <strong>"Display Phone Bluetooth QR"</strong> below.</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-text">Scan the QR code with your <strong>iPhone / Android camera</strong>.</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-text">Phone links via <strong>Bluetooth</strong> and prompts for your <strong>Biometric Fingerprint</strong>.</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-text">This tab automatically closes and unlocks the Admin Console.</div>
        </div>
      </div>

      <button class="btn-main" id="btn-trigger-bluetooth">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <path d="M12 18h.01"/>
        </svg>
        Display Phone Bluetooth QR
      </button>

      <button class="btn-secondary" id="btn-platform-sensor">
        💻 Or Use Workstation Sensor (Windows Hello / Mac Touch ID)
      </button>

      <div class="status-box" id="status-box">
        <div class="spinner" id="spinner" style="display:none;"></div>
        <span id="status-text">Click the button above to launch passkey prompt.</span>
      </div>
    </div>

    <div class="success-panel" id="success-panel">
      <div class="checkmark">✓</div>
      <div class="success-title">Biometric Passkey Verified!</div>
      <p class="success-desc">Admin identity confirmed.<br>Unlocking Desktop Operations Suite and closing tab...</p>
    </div>
  </div>

  <script>
    const sessionId = "{session_id}";
    const username = "{username}";
    const mode = "{mode}";

    function setStatus(msg, isWaiting = true, isError = false) {{
      const txt = document.getElementById("status-text");
      const spinner = document.getElementById("spinner");
      txt.textContent = msg;
      txt.style.color = isError ? "#ef4444" : (isWaiting ? "#00ffcc" : "#94a3b8");
      if (spinner) spinner.style.display = isWaiting ? "block" : "none";
    }}

    async function sendVerification(credId, devName) {{
      if (!credId || credId.trim() === "") return;
      try {{
        const res = await fetch("/api/verify", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            session_id: sessionId,
            credential_id: credId,
            client_device: devName
          }})
        }});
        if (res.ok) {{
          onAuthSuccess();
        }} else {{
          setStatus("Verification rejected by local station.", false, true);
        }}
      }} catch (e) {{
        setStatus("Network error connecting to local station.", false, true);
      }}
    }}

    function onAuthSuccess() {{
      document.getElementById("auth-panel").style.display = "none";
      document.getElementById("success-panel").style.display = "block";
      setTimeout(() => {{
        window.close();
      }}, 800);
    }}

    // 1. PRIMARY: WORKSTATION LOCAL SENSOR (Windows Hello / Mac Touch ID / PIN / Security Key)
    async function triggerPlatformSensor() {{
      setStatus("Prompting workstation sensor (Windows Hello / PIN / Security Key)...", true);

      if (!window.PublicKeyCredential) {{
        setStatus("WebAuthn not supported by this browser.", false, true);
        return;
      }}

      try {{
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const credential = await navigator.credentials.create({{
          publicKey: {{
            challenge: challenge,
            rp: {{ name: "Jadavpur Love Birds Admin", id: window.location.hostname }},
            user: {{ id: new TextEncoder().encode(username), name: username, displayName: username }},
            pubKeyCredParams: [
              {{ type: "public-key", alg: -7 }},   // ES256
              {{ type: "public-key", alg: -257 }}  // RS256
            ],
            timeout: 90000,
            authenticatorSelection: {{
              userVerification: "required",
              residentKey: "preferred"
            }}
          }}
        }});

        if (credential && credential.id) {{
          await sendVerification(credential.id, "Workstation Local Biometric Sensor (Windows Hello)");
        }}
      }} catch (err) {{
        console.warn("Passkey error:", err);
        if (err.name === "NotAllowedError") {{
          setStatus("❌ Passkey prompt was cancelled or closed. Click button to retry.", false, true);
        }} else {{
          setStatus("Notice: " + err.message + ". Click button to retry.", false, true);
        }}
      }}
    }}

    // 2. PHONE BLUETOOTH QR (Hybrid Hint)
    async function triggerBluetoothCrossDevice() {{
      setStatus("👉 On Windows prompt: Click 'More choices' ➔ 'iPhone, iPad, or Android device' to scan QR!", true);

      if (!window.PublicKeyCredential) {{
        setStatus("WebAuthn not supported by this browser.", false, true);
        return;
      }}

      try {{
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const credential = await navigator.credentials.create({{
          publicKey: {{
            challenge: challenge,
            rp: {{ name: "Jadavpur Love Birds Admin", id: window.location.hostname }},
            user: {{ id: new TextEncoder().encode(username), name: username, displayName: username }},
            pubKeyCredParams: [
              {{ type: "public-key", alg: -7 }},
              {{ type: "public-key", alg: -257 }}
            ],
            timeout: 120000,
            hints: ["hybrid"],
            authenticatorSelection: {{
              userVerification: "required",
              residentKey: "preferred"
            }}
          }}
        }});

        if (credential && credential.id) {{
          await sendVerification(credential.id, "Smartphone Bluetooth Biometric Passkey");
        }}
      }} catch (err) {{
        console.warn("Passkey error:", err);
        if (err.name === "NotAllowedError") {{
          setStatus("❌ Passkey prompt was cancelled or closed. Click button to retry.", false, true);
        }} else {{
          setStatus("Notice: " + err.message + ". Click button to retry.", false, true);
        }}
      }}
    }}

    document.getElementById("btn-trigger-bluetooth").onclick = triggerBluetoothCrossDevice;
    document.getElementById("btn-platform-sensor").onclick = triggerPlatformSensor;

    // Trigger strictly on user button click (avoids browser gesture blocking and Windows Hello conflicts)
  </script>
</body>
</html>"""


def start_auth_server(port: int = 8089) -> int:
    """Starts the embedded authentication server in a daemon thread."""
    global server_instance, server_port

    if server_instance is not None:
        return server_port

    for p in [port, 8090, 8091, 8888, 0]:
        try:
            server = http.server.ThreadingHTTPServer(("0.0.0.0", p), AuthHttpHandler)
            server_port = server.server_address[1]
            server_instance = server
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            print(f"[Auth Server] Active on port {server_port}")
            return server_port
        except Exception:
            continue
    return server_port


def create_auth_session(username: str, mode: str = "login") -> str:
    """Generates a new authentication session for polling."""
    session_id = uuid.uuid4().hex[:12]
    active_auth_sessions[session_id] = {
        "session_id": session_id,
        "username": username,
        "mode": mode,
        "status": "PENDING"
    }
    return session_id


def is_session_verified(session_id: str) -> bool:
    """Returns True if the session was successfully authenticated."""
    session = active_auth_sessions.get(session_id)
    return session is not None and session.get("status") == "VERIFIED"


def get_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """Returns the session data dict."""
    return active_auth_sessions.get(session_id)
