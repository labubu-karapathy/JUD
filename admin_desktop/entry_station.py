#!/usr/bin/env python3
"""
==============================================================================
JADAVPUR LOVE BIRDS - DEDICATED ADMIN CREDENTIALS & PASSKEY INGESTION STATION
==============================================================================
Directly modeled after C:\\Users\\ASUS\\Desktop\\crypto_ledger\\entry\\entry_station.py:
- Dedicated temporary app for entering admin credentials and enrolling passkeys.
- Enrolls genuine FIDO2 passkeys via Desktop Browser (Windows Hello / Mac Touch ID / PIN / Security Key).
- Commits credentials to public.admin_passkeys in Supabase.
==============================================================================
"""
import os
import sys
import uuid
import time
import webbrowser
from pathlib import Path
from typing import Dict, Any

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QGroupBox, QFrame
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QColor, QFont, QIcon

# Ensure local imports
ENTRY_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ENTRY_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(ENTRY_DIR) not in sys.path:
    sys.path.insert(0, str(ENTRY_DIR))

from admin_desktop import db
from admin_desktop import auth_server


class EntryStationWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("JLB - Admin Credentials & Passkey Ingestion Station")
        self.setMinimumSize(860, 620)
        self.resize(900, 650)

        self.current_session_id = None
        self.captured_credential_id = None
        self.captured_device = None

        self.init_ui()
        self.refresh_users_table()

        self.poll_timer = QTimer(self)
        self.poll_timer.timeout.connect(self.check_session_status)

    def init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(28, 28, 28, 28)
        main_layout.setSpacing(16)

        self.setStyleSheet("""
            QMainWindow, QWidget {
                background-color: #0b0f17;
                color: #e2e8f0;
                font-family: 'Segoe UI', system-ui, sans-serif;
            }
            QLabel {
                background: transparent;
                border: none;
                padding: 0;
            }
            QGroupBox {
                border: 1px solid #1e293b;
                border-radius: 8px;
                margin-top: 10px;
                font-weight: bold;
                color: #00ffcc;
                padding-top: 16px;
                padding-left: 12px;
                padding-right: 12px;
                padding-bottom: 12px;
                background-color: #0d131d;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 14px;
                padding: 0 6px;
                background-color: #0d131d;
            }
            QLineEdit {
                background-color: #111827;
                color: #f1f5f9;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 10px 14px;
                font-size: 13px;
            }
            QLineEdit:focus {
                border: 1px solid #00ffcc;
            }
            QPushButton {
                background-color: #2563eb;
                color: #ffffff;
                font-weight: bold;
                border: none;
                border-radius: 6px;
                padding: 12px 18px;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #1d4ed8;
            }
            QPushButton#successBtn {
                background-color: #059669;
            }
            QPushButton#successBtn:hover {
                background-color: #047857;
            }
            QPushButton#cyanBtn {
                background-color: #00ffcc;
                color: #06090e;
                font-weight: 800;
            }
            QPushButton#cyanBtn:hover {
                background-color: #33ffd6;
            }
            QPushButton#secondaryBtn {
                background-color: #1e293b;
                color: #94a3b8;
                border: 1px solid #334155;
            }
            QPushButton#secondaryBtn:hover {
                background-color: #334155;
                color: #ffffff;
            }
            QTableWidget {
                background-color: #090e18;
                alternate-background-color: #0d1424;
                border: 1px solid #1e293b;
                border-radius: 6px;
                gridline-color: #1a2436;
                color: #e2e8f0;
            }
            QHeaderView::section {
                background-color: #101726;
                color: #94a3b8;
                padding: 8px;
                border: none;
                border-bottom: 2px solid #1e293b;
                font-weight: bold;
                font-size: 11px;
                text-transform: uppercase;
            }
        """)

        # Top Header
        header_box = QVBoxLayout()
        lbl_badge = QLabel("◈ JLB ADMIN IDENTITY & PASSKEY INGESTION")
        lbl_badge.setStyleSheet("color: #00ffcc; font-weight: bold; font-size: 11px; letter-spacing: 1.5px;")
        lbl_title = QLabel("Admin Credentials & Hardware Passkey Entry Station")
        lbl_title.setStyleSheet("font-size: 22px; font-weight: 800; color: #ffffff;")
        lbl_sub = QLabel("Enroll genuine FIDO2 passkeys for administrators directly into Supabase (public.admin_passkeys).")
        lbl_sub.setStyleSheet("color: #64748b; font-size: 12px;")
        header_box.addWidget(lbl_badge)
        header_box.addWidget(lbl_title)
        header_box.addWidget(lbl_sub)
        main_layout.addLayout(header_box)

        # Content Row
        content_row = QHBoxLayout()
        content_row.setSpacing(20)

        # Left Column: Ingestion Form
        left_col = QVBoxLayout()
        left_col.setSpacing(14)

        form_box = QGroupBox("1. Administrator Identity")
        form_layout = QVBoxLayout(form_box)
        form_layout.addWidget(QLabel("Admin Name / Call-Sign (Compulsory):"))
        self.input_username = QLineEdit()
        self.input_username.setPlaceholderText("e.g. Campus_Admin_01 or JLB_Chief")
        form_layout.addWidget(self.input_username)
        left_col.addWidget(form_box)

        passkey_box = QGroupBox("2. Hardware / Biometric Passkey Enrollment")
        pk_layout = QVBoxLayout(passkey_box)
        self.lbl_scan_status = QLabel("⚪ No passkey captured yet")
        self.lbl_scan_status.setStyleSheet("color: #94a3b8; font-weight: bold; font-size: 12px; margin-bottom: 6px;")
        pk_layout.addWidget(self.lbl_scan_status)

        self.btn_launch_pk = QPushButton("💻 Launch Desktop Passkey Enrollment")
        self.btn_launch_pk.setObjectName("cyanBtn")
        self.btn_launch_pk.clicked.connect(self.handle_launch_passkey)
        pk_layout.addWidget(self.btn_launch_pk)

        tip = QLabel("💡 Tip: A browser window will open. Click 'Authenticate via Workstation Sensor' to use Windows Hello, PIN, or your USB security key.")
        tip.setStyleSheet("color: #64748b; font-size: 11px; line-height: 1.4; margin-top: 6px;")
        tip.setWordWrap(True)
        pk_layout.addWidget(tip)

        left_col.addWidget(passkey_box)

        self.btn_submit = QPushButton("💾 Save Admin & Passkey to Supabase")
        self.btn_submit.setObjectName("successBtn")
        self.btn_submit.clicked.connect(self.handle_enroll)
        left_col.addWidget(self.btn_submit)

        left_col.addStretch()
        content_row.addLayout(left_col, stretch=5)

        # Right Column: Enrolled Admin Table
        right_col = QVBoxLayout()
        table_box = QGroupBox("Enrolled Administrators in Supabase (public.admin_passkeys)")
        table_layout = QVBoxLayout(table_box)
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["Admin Name", "Credential ID", "Device Sensor", "Enrolled Date"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table.verticalHeader().setDefaultSectionSize(36)
        table_layout.addWidget(self.table)

        btn_refresh = QPushButton("Refresh Table")
        btn_refresh.setObjectName("secondaryBtn")
        btn_refresh.clicked.connect(self.refresh_users_table)
        table_layout.addWidget(btn_refresh)

        right_col.addWidget(table_box)
        content_row.addLayout(right_col, stretch=5)

        main_layout.addLayout(content_row)

    def handle_launch_passkey(self):
        user = self.input_username.text().strip()
        if not user:
            QMessageBox.warning(self, "Name Required", "Please enter an Admin Name first.")
            return

        port = auth_server.start_auth_server()
        self.current_session_id = auth_server.create_auth_session(user, mode="enroll")
        self.captured_credential_id = None
        self.captured_device = None

        url = f"http://localhost:{port}/enroll?session={self.current_session_id}&user={user}&mode=enroll"
        try:
            webbrowser.open(url)
            self.lbl_scan_status.setText("🟡 Browser launched... Authenticate via Windows Hello or Security Key!")
            self.lbl_scan_status.setStyleSheet("color: #facc15; font-weight: bold; font-size: 12px;")
            self.poll_timer.start(500)
        except Exception as e:
            QMessageBox.critical(self, "Browser Error", f"Could not launch browser: {e}")

    def check_session_status(self):
        if not self.current_session_id:
            return
        if auth_server.is_session_verified(self.current_session_id):
            self.poll_timer.stop()
            data = auth_server.get_session_data(self.current_session_id)
            self.captured_credential_id = data.get("credential_id")
            self.captured_device = data.get("device_name", "Workstation Local Biometric Sensor")

            self.lbl_scan_status.setText("🟢 PASSKEY CAPTURED! Click 'Save Admin & Passkey' below.")
            self.lbl_scan_status.setStyleSheet("color: #10b981; font-weight: bold; font-size: 12px;")

    def handle_enroll(self):
        user = self.input_username.text().strip()
        if not user:
            QMessageBox.warning(self, "Name Required", "Please enter an Admin Name.")
            return

        if not self.captured_credential_id:
            QMessageBox.warning(self, "No Passkey", "Please click 'Launch Desktop Passkey Enrollment' and complete the sensor handshake first.")
            return

        try:
            res = db.register_admin_passkey(
                username=user,
                credential_id=self.captured_credential_id,
                device_label=self.captured_device or "Workstation Sensor"
            )
            QMessageBox.information(
                self, "Enrolled Successfully",
                f"Administrator '{res['username']}' and passkey successfully registered into Supabase!"
            )
            self.input_username.clear()
            self.captured_credential_id = None
            self.lbl_scan_status.setText("⚪ No passkey captured yet")
            self.lbl_scan_status.setStyleSheet("color: #94a3b8; font-weight: bold; font-size: 12px;")
            self.refresh_users_table()
        except Exception as exc:
            QMessageBox.critical(self, "Database Error", f"Failed to commit to Supabase: {exc}")

    def refresh_users_table(self):
        try:
            keys = db.get_admin_passkeys()
            self.table.setRowCount(len(keys))
            for i, k in enumerate(keys):
                u_item = QTableWidgetItem(k.get("username") or "admin")
                u_item.setForeground(QColor("#00ffcc"))
                u_item.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
                self.table.setItem(i, 0, u_item)

                cred_str = k.get("credential_id") or "—"
                if len(cred_str) > 28:
                    cred_str = cred_str[:28] + "..."
                c_item = QTableWidgetItem(cred_str)
                c_item.setFont(QFont("Consolas", 9))
                self.table.setItem(i, 1, c_item)

                self.table.setItem(i, 2, QTableWidgetItem(k.get("device_label") or "Workstation Sensor"))
                self.table.setItem(i, 3, QTableWidgetItem(str(k.get("created_at") or "")[:10]))
        except Exception as e:
            print(f"[Refresh Error]: {e}")


def main():
    auth_server.start_auth_server()
    app = QApplication(sys.argv)
    window = EntryStationWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
