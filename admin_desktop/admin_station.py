#!/usr/bin/env python3
"""
==============================================================================
JADAVPUR LOVE BIRDS (JLB) - ADMIN OPERATIONS WORKSTATION
==============================================================================
Directly modeled after C:\\Users\\ASUS\\Desktop\\crypto_ledger\\CyberChain\\admin_app.py:
- Desktop browser-based WebAuthn passkey authentication (Windows Hello / Mac Touch ID / PIN / Security Key).
- Compact initial login card (580 x 640), expanding to 1180 x 780 upon authentication.
- Zero backdoor / emergency passcodes: strictly genuine biometric passkeys.
- Direct PostgreSQL connection to Supabase (bwvslsvjjclnspmdleyj).
- Raw campus library card formatting (e.g. SL-4762, CS-4819).
==============================================================================
"""

import os
import sys
import uuid
import time
import json
import subprocess
import urllib.request
import webbrowser
from pathlib import Path
from typing import Dict, Any, List, Optional

# PyQt6 Core Imports
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QGroupBox, QFrame, QComboBox, QTabWidget,
    QStackedWidget, QTextEdit, QDialog, QStatusBar
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QThread, QRect
from PyQt6.QtGui import QColor, QFont, QPixmap, QImage, QIcon

# Ensure local module imports work
if getattr(sys, "frozen", False):
    ADMIN_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    PROJECT_ROOT = os.path.dirname(sys.executable)
else:
    ADMIN_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(ADMIN_DIR)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if ADMIN_DIR not in sys.path:
    sys.path.insert(0, ADMIN_DIR)

from admin_desktop import db
from admin_desktop import auth_server
from admin_desktop.config import JADAVPUR_DEPARTMENTS, GRAD_YEARS

# Global image cache to avoid redundant network downloads
IMAGE_CACHE: Dict[str, QPixmap] = {}


# ==============================================================================
# UI STYLESHEET (CLEAN DARK CYBER-SLATE THEME)
# ==============================================================================
DARK_THEME_QSS = """
QMainWindow, QWidget {
    background-color: #070a10;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 13px;
}
QLabel {
    background: transparent;
    border: none;
    padding: 0px;
    color: #e2e8f0;
}
QGroupBox {
    border: 1px solid #1e293b;
    border-radius: 8px;
    margin-top: 14px;
    font-weight: 700;
    color: #00ffcc;
    padding-top: 18px;
    padding-bottom: 12px;
    padding-left: 14px;
    padding-right: 14px;
    background-color: #0b101b;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 14px;
    padding: 0 8px;
    background-color: #0b101b;
    color: #00ffcc;
}
QLineEdit, QTextEdit, QComboBox {
    background-color: #111827;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 13px;
    selection-background-color: #00ffcc;
    selection-color: #080c14;
}
QLineEdit:focus, QTextEdit:focus, QComboBox:focus {
    border: 1px solid #00ffcc;
    background-color: #131e33;
}
QPushButton {
    background-color: #2563eb;
    color: #ffffff;
    font-weight: 700;
    border: none;
    border-radius: 6px;
    padding: 10px 18px;
    font-size: 13px;
}
QPushButton:hover {
    background-color: #1d4ed8;
}
QPushButton:pressed {
    background-color: #1e40af;
}
QPushButton#cyanBtn {
    background-color: #00ffcc;
    color: #06090e;
    font-weight: 800;
    font-size: 14px;
    padding: 12px 20px;
}
QPushButton#cyanBtn:hover {
    background-color: #33ffd6;
}
QPushButton#successBtn {
    background-color: #059669;
    color: #ffffff;
    font-weight: 700;
}
QPushButton#successBtn:hover {
    background-color: #047857;
}
QPushButton#dangerBtn {
    background-color: #dc2626;
    color: #ffffff;
    font-weight: 700;
}
QPushButton#dangerBtn:hover {
    background-color: #b91c1c;
}
QPushButton#secondaryBtn {
    background-color: #1e293b;
    color: #cbd5e1;
    border: 1px solid #334155;
    font-weight: 600;
}
QPushButton#secondaryBtn:hover {
    background-color: #334155;
    color: #ffffff;
}
QTableWidget {
    background-color: #090e18;
    alternate-background-color: #0d1424;
    border: 1px solid #1e293b;
    border-radius: 8px;
    gridline-color: #162032;
    color: #e2e8f0;
    selection-background-color: #1e293b;
    font-size: 12px;
}
QHeaderView::section {
    background-color: #101726;
    color: #94a3b8;
    padding: 10px;
    border: none;
    border-bottom: 2px solid #1e293b;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
}
QTabWidget::pane {
    border: 1px solid #1e293b;
    border-radius: 8px;
    background-color: #080c14;
    padding: 10px;
}
QTabBar::tab {
    background: #0f172a;
    color: #94a3b8;
    padding: 8px 14px;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    font-weight: 600;
    margin-right: 4px;
}
QTabBar::tab:selected {
    background: #1e293b;
    color: #00ffcc;
    border-bottom: 2px solid #00ffcc;
}
QScrollBar:vertical {
    border: none;
    background: #080c14;
    width: 10px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: #334155;
    min-height: 20px;
    border-radius: 5px;
}
QScrollBar::handle:vertical:hover {
    background: #475569;
}
"""


# ==============================================================================
# DIALOGS & MODALS
# ==============================================================================

class DeactivateUserDialog(QDialog):
    """Mandatory reason modal for force-deactivating bad actors."""
    def __init__(self, user_name: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"Force Deactivate Student: {user_name}")
        self.setStyleSheet(DARK_THEME_QSS)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        self.reason_text = ""

        # Centering & responsive sizing
        DLG_W, DLG_H = 480, 320
        self.resize(DLG_W, DLG_H)
        self.setMinimumWidth(460)

        if parent:
            p_geo = parent.geometry()
            screen = parent.screen() or QApplication.primaryScreen()
            s_geo = screen.availableGeometry() if screen else QRect(0, 0, 1920, 1080)
            cx = p_geo.x() + (p_geo.width() - DLG_W) // 2
            cy = p_geo.y() + (p_geo.height() - DLG_H) // 2
            self.move(
                max(s_geo.x() + 20, min(cx, s_geo.x() + s_geo.width() - DLG_W - 20)),
                max(s_geo.y() + 40, min(cy, s_geo.y() + s_geo.height() - DLG_H - 40))
            )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(14)

        lbl_alert = QLabel("⚠️ ACCOUNT DEACTIVATION PROTOCOL")
        lbl_alert.setStyleSheet("color: #ef4444; font-weight: bold; font-size: 14px;")
        layout.addWidget(lbl_alert)

        desc = QLabel(f"You are about to force-deactivate '{user_name}'. They will be banned from campus P2P matching and all active chats will be terminated immediately. A mandatory reason is required for university compliance logs.")
        desc.setWordWrap(True)
        desc.setStyleSheet("color: #94a3b8; font-size: 12px; line-height: 1.4;")
        layout.addWidget(desc)

        layout.addWidget(QLabel("Mandatory Deactivation Reason:"))
        self.edit_reason = QTextEdit()
        self.edit_reason.setPlaceholderText("e.g. Inappropriate conduct reported in P2P chat, library barcode validation failure, impersonation...")
        self.edit_reason.setMaximumHeight(100)
        layout.addWidget(self.edit_reason)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("Cancel")
        btn_cancel.setObjectName("secondaryBtn")
        btn_cancel.clicked.connect(self.reject)

        btn_confirm = QPushButton("Confirm Force Deactivation")
        btn_confirm.setObjectName("dangerBtn")
        btn_confirm.clicked.connect(self.validate_and_accept)

        btn_row.addWidget(btn_cancel)
        btn_row.addWidget(btn_confirm)
        layout.addLayout(btn_row)

    def validate_and_accept(self):
        reason = self.edit_reason.toPlainText().strip()
        if len(reason) < 5:
            QMessageBox.warning(self, "Reason Required", "Please provide a valid explanation (minimum 5 characters).")
            return
        self.reason_text = reason
        self.accept()


class StudentDetailDialog(QDialog):
    """Modal inspecting student details with side-by-side photo verification and raw library card ID."""
    def __init__(self, profile: Dict[str, Any], parent=None):
        super().__init__(parent)
        self.profile = profile
        self.setWindowTitle(f"Student Profile Audit: {profile.get('full_name', 'Student')}")
        self.setStyleSheet(DARK_THEME_QSS)

        # Remove '?' context help button
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        # Landscape side-by-side dimensions (avoids vertical overflow and screen clipping)
        DLG_WIDTH = 760
        DLG_HEIGHT = 480
        self.resize(DLG_WIDTH, DLG_HEIGHT)
        self.setMinimumSize(720, 450)

        # Centering relative to parent window with strict screen boundary padding
        if parent:
            p_geo = parent.geometry()
            screen = parent.screen() or QApplication.primaryScreen()
            s_geo = screen.availableGeometry() if screen else QRect(0, 0, 1920, 1080)

            cx = p_geo.x() + (p_geo.width() - DLG_WIDTH) // 2
            cy = p_geo.y() + (p_geo.height() - DLG_HEIGHT) // 2

            # Ensure minimum 40px top clearance so header is NEVER clipped or pushed under titlebar
            final_x = max(s_geo.x() + 20, min(cx, s_geo.x() + s_geo.width() - DLG_WIDTH - 20))
            final_y = max(s_geo.y() + 40, min(cy, s_geo.y() + s_geo.height() - DLG_HEIGHT - 40))
            self.move(final_x, final_y)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(20, 16, 20, 16)
        main_layout.setSpacing(12)

        # 1. Top Header Bar: Student Name, Department, and Status Badge
        top_bar = QHBoxLayout()
        vbox_name = QVBoxLayout()
        vbox_name.setSpacing(2)
        lbl_name = QLabel(profile.get("full_name") or "Unknown Student")
        lbl_name.setStyleSheet("font-size: 20px; font-weight: 800; color: #ffffff;")

        dept_str = f"📚 {profile.get('department') or 'Undeclared'}  •  Grad Year: {profile.get('grad_year') or 'N/A'}"
        lbl_dept = QLabel(dept_str)
        lbl_dept.setStyleSheet("color: #00ffcc; font-weight: 600; font-size: 12px;")
        vbox_name.addWidget(lbl_name)
        vbox_name.addWidget(lbl_dept)
        top_bar.addLayout(vbox_name)

        top_bar.addStretch()

        is_approved = profile.get("is_approved", False)
        is_deactivated = profile.get("is_deactivated", False)
        badge = QLabel("DEACTIVATED" if is_deactivated else ("APPROVED" if is_approved else "PENDING APPROVAL"))
        badge_color = "#ef4444" if is_deactivated else ("#10b981" if is_approved else "#f59e0b")
        badge.setStyleSheet(f"background: {badge_color}22; border: 1px solid {badge_color}; color: {badge_color}; font-weight: bold; padding: 6px 14px; border-radius: 12px; font-size: 11px;")
        badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top_bar.addWidget(badge)
        main_layout.addLayout(top_bar)

        # 2. Side-by-side content layout: Left = Photo Preview, Right = Student Details & Credentials
        content_row = QHBoxLayout()
        content_row.setSpacing(16)

        # Left: Photo Verification Preview
        photo_box = QGroupBox("Campus Photo Verification")
        photo_box.setFixedWidth(270)
        photo_layout = QVBoxLayout(photo_box)
        photo_layout.setContentsMargins(8, 12, 8, 8)
        self.lbl_photo = QLabel("Fetching high-resolution student photo...")
        self.lbl_photo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_photo.setFixedSize(250, 260)
        self.lbl_photo.setStyleSheet("background: #0b101b; border-radius: 8px; border: 1px dashed #334155; color: #64748b; font-size: 11px;")
        photo_layout.addWidget(self.lbl_photo)
        content_row.addWidget(photo_box)

        # Right: Identity Credentials & Bio
        vbox_right = QVBoxLayout()
        vbox_right.setSpacing(8)

        # Credentials Box
        id_box = QGroupBox("Auditable Credentials & Identity")
        id_layout = QVBoxLayout(id_box)
        id_layout.setContentsMargins(12, 8, 12, 8)
        id_layout.setSpacing(6)

        raw_insta = profile.get("insta_handle") or "Not provided"
        lbl_insta = QLabel(f"📸 Instagram: {raw_insta}")
        lbl_insta.setStyleSheet("color: #f472b6; font-size: 13px; font-weight: bold; font-family: monospace;")
        lbl_insta.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        id_layout.addWidget(lbl_insta)

        raw_card = profile.get("library_card_hash") or "N/A"
        lbl_card = QLabel(f"💳 Library Card ID: {raw_card}")
        lbl_card.setStyleSheet("color: #38bdf8; font-family: monospace; font-size: 13px; font-weight: bold;")
        lbl_card.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        id_layout.addWidget(lbl_card)

        gender_str = (profile.get("gender") or "N/A").title()
        age_str = str(profile.get("age") or "N/A")
        target_str = (profile.get("target_gender") or "all").title()
        lbl_ga = QLabel(f"👤 Gender: {gender_str}  •  Age: {age_str}  •  Interested in: {target_str}")
        lbl_ga.setStyleSheet("color: #94a3b8; font-size: 12px;")
        id_layout.addWidget(lbl_ga)
        vbox_right.addWidget(id_box)

        # Bio Box
        bio_box = QGroupBox("Student Bio")
        bio_layout = QVBoxLayout(bio_box)
        bio_layout.setContentsMargins(12, 8, 12, 8)
        bio_text = profile.get("bio") or "No bio provided."
        lbl_bio = QLabel(f"“{bio_text}”")
        lbl_bio.setWordWrap(True)
        lbl_bio.setStyleSheet("color: #cbd5e1; font-style: italic; font-size: 12px;")
        bio_layout.addWidget(lbl_bio)
        vbox_right.addWidget(bio_box)

        # Activity stats
        meta_info = QLabel(f"💬 Active Chats: {profile.get('active_chat_count', 0)}   |   ⚠️ Reports: {profile.get('report_count', 0)}   |   🚫 Blocks: {profile.get('block_count', 0)}")
        meta_info.setStyleSheet("color: #64748b; font-size: 11px; padding-left: 2px;")
        vbox_right.addWidget(meta_info)

        vbox_right.addStretch()
        content_row.addLayout(vbox_right)
        main_layout.addLayout(content_row)

        # 3. Action Buttons Row
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        btn_close = QPushButton("Close")
        btn_close.setObjectName("secondaryBtn")
        btn_close.setFixedHeight(38)
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)

        if not is_approved and not is_deactivated:
            btn_appr = QPushButton("✅ Approve Student Profile")
            btn_appr.setObjectName("successBtn")
            btn_appr.setFixedHeight(38)
            btn_appr.clicked.connect(self.handle_approve)
            btn_row.addWidget(btn_appr)

        if not is_deactivated:
            btn_deact = QPushButton("🚫 Force Deactivate")
            btn_deact.setObjectName("dangerBtn")
            btn_deact.setFixedHeight(38)
            btn_deact.clicked.connect(self.handle_deactivate)
            btn_row.addWidget(btn_deact)
        else:
            btn_react = QPushButton("🔄 Re-Activate Student")
            btn_react.setObjectName("successBtn")
            btn_react.setFixedHeight(38)
            btn_react.clicked.connect(self.handle_reactivate)
            btn_row.addWidget(btn_react)

        main_layout.addLayout(btn_row)

        # Load photo
        photos = profile.get("photo_urls") or []
        if photos and isinstance(photos, list) and len(photos) > 0:
            first_url = photos[0]
            self.load_image_async(first_url)
        else:
            self.lbl_photo.setText("No photo uploaded")

    def load_image_async(self, url: str):
        if url in IMAGE_CACHE:
            self.lbl_photo.setPixmap(IMAGE_CACHE[url].scaled(250, 260, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            return

        def fetch():
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                data = urllib.request.urlopen(req, timeout=4).read()
                qimg = QImage.fromData(data)
                pix = QPixmap.fromImage(qimg)
                IMAGE_CACHE[url] = pix
                self.lbl_photo.setPixmap(pix.scaled(250, 260, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            except Exception as e:
                self.lbl_photo.setText("Photo unavailable or preview timed out")

        QTimer.singleShot(50, fetch)

    def handle_approve(self):
        pid = self.profile.get("id")
        if db.approve_profile(pid):
            QMessageBox.information(self, "Approved", f"Student profile '{self.profile.get('full_name')}' has been approved!")
            self.accept()
        else:
            QMessageBox.critical(self, "Error", "Failed to approve profile in database.")

    def handle_deactivate(self):
        diag = DeactivateUserDialog(self.profile.get("full_name", "Student"), self)
        if diag.exec() == QDialog.DialogCode.Accepted:
            if db.deactivate_profile(self.profile.get("id"), diag.reason_text):
                QMessageBox.information(self, "Deactivated", "Student has been force deactivated.")
                self.accept()
            else:
                QMessageBox.critical(self, "Error", "Failed to update profile.")

    def handle_reactivate(self):
        pid = self.profile.get("id")
        name = self.profile.get("full_name", "Student")
        if db.reactivate_profile(pid):
            QMessageBox.information(self, "Re-Activated", f"Student profile '{name}' has been restored and re-activated.")
            self.accept()
        else:
            QMessageBox.critical(self, "Error", "Failed to reactivate profile.")


# ==============================================================================
# ASYNCHRONOUS DATABASE WORKER (PREVENTS ANY GUI FREEZE OR NOT-RESPONDING STATE)
# ==============================================================================
class DataLoaderWorker(QThread):
    data_loaded = pyqtSignal(dict)
    load_failed = pyqtSignal(str)

    def run(self):
        try:
            data = db.get_all_dashboard_data()
            self.data_loaded.emit(data)
        except Exception as e:
            self.load_failed.emit(str(e))


# ==============================================================================
# MAIN APPLICATION WINDOW (MODELED DIRECTLY AFTER CYBERCHAIN/ADMIN_APP.PY)
# ==============================================================================
class AdminStationWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("JLB Admin Console - Hardware Passkey Authentication")
        self.setMinimumSize(560, 620)
        self.resize(580, 640)
        self.setStyleSheet(DARK_THEME_QSS)

        # Set window icon if available
        icon_path = os.path.join(ADMIN_DIR, "app_icon.ico")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        self.current_auth_session_id = None
        self.auth_poll_timer = QTimer(self)
        self.auth_poll_timer.timeout.connect(self.check_auth_status)

        # Data cache for instant UI rendering and non-blocking search
        self.cached_kpis = {}
        self.cached_all_profiles = []
        self.cached_female_profiles = []
        self.cached_male_profiles = []
        self.cached_pending_approvals = []
        self.cached_deactivated_profiles = []
        self.cached_announcements = []
        self.cached_passkeys = []
        self.is_loading_data = False
        self.data_loader = None

        # Use QStackedWidget to guarantee zero overlapping between login and dashboard
        self.stack = QStackedWidget(self)
        self.setCentralWidget(self.stack)

        # 1. Login Page
        self.login_page = QWidget()
        self.setup_login_page()
        self.stack.addWidget(self.login_page)

        # 2. Dashboard Operations Page
        self.dashboard_page = QWidget()
        self.setup_dashboard_page()
        self.stack.addWidget(self.dashboard_page)

        # Start in Login View
        self.show_login_interface()

    # --------------------------------------------------------------------------
    # 1. LOGIN PAGE (CYBERCHAIN ADMIN_APP.PY ARCHITECTURE)
    # --------------------------------------------------------------------------
    def setup_login_page(self):
        page_layout = QVBoxLayout(self.login_page)
        page_layout.setContentsMargins(28, 28, 28, 28)
        page_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        card = QFrame()
        card.setObjectName("loginCard")
        card.setFixedWidth(480)
        card.setStyleSheet("""
            #loginCard {
                background-color: #0d131d;
                border: 1px solid #1f293d;
                border-radius: 16px;
            }
            #loginCard QLabel {
                background: transparent;
                border: none;
                padding: 0px;
            }
        """)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(36, 36, 36, 36)
        card_layout.setSpacing(16)

        lbl_badge = QLabel("◈ JADAVPUR LOVE BIRDS • ADMINISTRATOR AUTHENTICATION")
        lbl_badge.setStyleSheet("color: #00ffcc; font-size: 11px; font-weight: bold; letter-spacing: 1.5px;")
        lbl_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(lbl_badge)

        lbl_title = QLabel("Admin Console Login")
        lbl_title.setStyleSheet("font-size: 24px; font-weight: 800; color: #ffffff;")
        lbl_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(lbl_title)

        lbl_sub = QLabel("FIDO2 / Hardware Biometric Passkey System")
        lbl_sub.setStyleSheet("font-size: 13px; color: #64748b; margin-bottom: 8px;")
        lbl_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(lbl_sub)

        lbl_user = QLabel("Administrator Name / Call-Sign:")
        lbl_user.setStyleSheet("font-weight: 600; font-size: 13px; color: #cbd5e1;")
        card_layout.addWidget(lbl_user)

        self.txt_username = QLineEdit()
        self.txt_username.setPlaceholderText("Enter Admin Name (e.g. JLB_Chief or admin)")
        self.txt_username.returnPressed.connect(self.on_enter_passkey_clicked)
        card_layout.addWidget(self.txt_username)

        self.btn_passkey = QPushButton("Enter Passkey")
        self.btn_passkey.setObjectName("cyanBtn")
        self.btn_passkey.setFixedHeight(46)
        self.btn_passkey.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_passkey.clicked.connect(self.on_enter_passkey_clicked)
        card_layout.addWidget(self.btn_passkey)

        self.lbl_auth_status = QLabel("Ready for admin passkey authentication")
        self.lbl_auth_status.setStyleSheet("font-size: 12px; color: #64748b; margin-top: 6px;")
        self.lbl_auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self.lbl_auth_status)

        tip_lbl = QLabel("A desktop browser window will open to verify your Windows Hello, Mac Touch ID, PIN, or USB Security Key.")
        tip_lbl.setStyleSheet("color: #475569; font-size: 11px; text-align: center; margin-top: 10px; line-height: 1.4;")
        tip_lbl.setWordWrap(True)
        tip_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(tip_lbl)

        page_layout.addWidget(card)

    def show_login_interface(self):
        self.auth_poll_timer.stop()
        self.current_auth_session_id = None
        self.lbl_auth_status.setText("Ready for admin passkey authentication")
        self.lbl_auth_status.setStyleSheet("font-size: 12px; color: #64748b; margin-top: 6px;")
        self.btn_passkey.setEnabled(True)
        self.txt_username.clear()

        self.stack.setCurrentWidget(self.login_page)
        self.setWindowTitle("JLB Admin Console - Hardware Passkey Authentication")
        self.setMinimumSize(560, 620)
        self.resize(580, 640)
        try:
            screen_geometry = self.screen().availableGeometry()
            x = (screen_geometry.width() - 580) // 2
            y = (screen_geometry.height() - 640) // 2
            self.move(max(0, x), max(0, y))
        except Exception:
            pass

    def on_enter_passkey_clicked(self):
        username = self.txt_username.text().strip()
        if not username:
            QMessageBox.warning(self, "Input Required", "Please enter your Admin Name.")
            return

        port = auth_server.start_auth_server()
        self.current_auth_session_id = auth_server.create_auth_session(username, mode="login")

        url = f"http://localhost:{port}/auth?session={self.current_auth_session_id}&user={username}&mode=login"
        try:
            webbrowser.open(url)
        except Exception as e:
            QMessageBox.critical(self, "Browser Error", f"Could not launch browser: {e}")
            return

        self.lbl_auth_status.setText("Browser opened. Confirm passkey via phone QR or sensor...")
        self.lbl_auth_status.setStyleSheet("font-size: 12px; color: #00ffcc; font-weight: bold; margin-top: 6px;")
        self.btn_passkey.setEnabled(False)
        self.auth_poll_timer.start(400)

    def check_auth_status(self):
        if not self.current_auth_session_id:
            return

        if auth_server.is_session_verified(self.current_auth_session_id):
            self.auth_poll_timer.stop()
            username = self.txt_username.text().strip()

            # Verify admin user in database (instantaneous on persistent connection)
            all_passkeys = db.get_admin_passkeys()
            if len(all_passkeys) > 0:
                admin_user = db.get_admin_by_username(username)
                if not admin_user:
                    self.lbl_auth_status.setText("Admin user not enrolled.")
                    self.lbl_auth_status.setStyleSheet("font-size: 12px; color: #ef4444; font-weight: bold; margin-top: 6px;")
                    QMessageBox.critical(
                        self,
                        "Access Denied",
                        f"Administrator '{username}' is not enrolled in Supabase.\n\nPlease open the Admin Ingestion Station to register this admin credential first."
                    )
                    self.btn_passkey.setEnabled(True)
                    return

            self.lbl_auth_status.setText("Admin Passkey verified! Loading console...")
            self.lbl_auth_status.setStyleSheet("font-size: 12px; color: #00ffcc; font-weight: bold; margin-top: 6px;")
            QTimer.singleShot(200, lambda: self.show_admin_interface(username))

    # --------------------------------------------------------------------------
    # 2. FULL ADMIN OPERATIONS CONSOLE (DASHBOARD PAGE)
    # --------------------------------------------------------------------------
    def create_kpi_card(self, title: str, default_val: str, accent_color: str) -> QLabel:
        frame = QFrame()
        frame.setObjectName("kpiCard")
        frame.setStyleSheet(f"""
            QFrame#kpiCard {{
                background-color: #0b101b;
                border: 1px solid #1e293b;
                border-top: 3px solid {accent_color};
                border-radius: 8px;
                padding: 10px;
            }}
            QFrame#kpiCard QLabel {{
                border: none;
                background: transparent;
                padding: 0;
            }}
        """)
        vbox = QVBoxLayout(frame)
        vbox.setSpacing(4)
        vbox.setContentsMargins(8, 8, 8, 8)

        lbl_t = QLabel(title)
        lbl_t.setStyleSheet("font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px;")
        lbl_v = QLabel(default_val)
        lbl_v.setStyleSheet(f"font-size: 22px; font-weight: 800; color: {accent_color};")

        vbox.addWidget(lbl_t)
        vbox.addWidget(lbl_v)
        self.kpi_layout.addWidget(frame)
        return lbl_v

    def setup_dashboard_page(self):
        dash_layout = QVBoxLayout(self.dashboard_page)
        dash_layout.setContentsMargins(28, 28, 28, 28)
        dash_layout.setSpacing(18)

        # 1. Top Navigation Bar
        nav_bar = QHBoxLayout()
        vbox_branding = QVBoxLayout()
        lbl_brand = QLabel("🌸 JADAVPUR LOVE BIRDS — ADMIN OPERATIONS STATION")
        lbl_brand.setStyleSheet("font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;")
        
        lbl_sub = QLabel("⚡ Live Supabase Gateway • Zero-Cloud Chat Storage • Campus P2P Protocol")
        lbl_sub.setStyleSheet("color: #00ffcc; font-size: 11px; font-weight: 600;")
        vbox_branding.addWidget(lbl_brand)
        vbox_branding.addWidget(lbl_sub)
        nav_bar.addLayout(vbox_branding)

        nav_bar.addStretch()

        self.lbl_admin_badge = QLabel("🛡️ Admin: ADMIN")
        self.lbl_admin_badge.setStyleSheet("background: #0f172a; border: 1px solid #334155; padding: 6px 14px; border-radius: 6px; font-weight: 600; color: #a7f3d0;")
        nav_bar.addWidget(self.lbl_admin_badge)

        btn_refresh = QPushButton("🔄 Refresh Data")
        btn_refresh.setObjectName("secondaryBtn")
        btn_refresh.clicked.connect(self.refresh_all_data)
        nav_bar.addWidget(btn_refresh)

        btn_lock = QPushButton("🔒 Lock Station")
        btn_lock.setObjectName("dangerBtn")
        btn_lock.clicked.connect(self.show_login_interface)
        nav_bar.addWidget(btn_lock)

        dash_layout.addLayout(nav_bar)

        # 2. KPI Metrics Ribbon
        self.kpi_layout = QHBoxLayout()
        self.kpi_layout.setSpacing(12)
        self.lbl_kpi_total = self.create_kpi_card("TOTAL REGISTERED", "0", "#38bdf8")
        self.lbl_kpi_female = self.create_kpi_card("FEMALE DIRECTORY", "0", "#ec4899")
        self.lbl_kpi_male = self.create_kpi_card("MALE DIRECTORY", "0", "#6366f1")
        self.lbl_kpi_pending = self.create_kpi_card("PENDING APPROVALS", "0", "#f59e0b")
        self.lbl_kpi_deact = self.create_kpi_card("DEACTIVATED", "0", "#ef4444")
        self.lbl_kpi_chats = self.create_kpi_card("ACTIVE CHATS", "0", "#10b981")
        dash_layout.addLayout(self.kpi_layout)

        # 3. Primary Tab Widget
        self.tabs = QTabWidget()

        # Tab 1: Female Directory
        self.tab_female = QWidget()
        self.setup_female_tab()
        self.tabs.addTab(self.tab_female, "🌸 Female Directory")

        # Tab 2: Male Directory
        self.tab_male = QWidget()
        self.setup_male_tab()
        self.tabs.addTab(self.tab_male, "⚡ Male Directory")

        # Tab 3: Pending Approvals
        self.tab_approvals = QWidget()
        self.setup_approvals_tab()
        self.tabs.addTab(self.tab_approvals, "⏳ Approvals Queue")

        # Tab 4: Deactivated & Re-Auth
        self.tab_deact = QWidget()
        self.setup_deactivated_tab()
        self.tabs.addTab(self.tab_deact, "🚫 Deactivated Panel")

        # Tab 5: Campus Announcements
        self.tab_announce = QWidget()
        self.setup_announcements_tab()
        self.tabs.addTab(self.tab_announce, "📢 Announcements")

        # Tab 6: Hardware Passkeys
        self.tab_passkeys = QWidget()
        self.setup_passkeys_tab()
        self.tabs.addTab(self.tab_passkeys, "🔐 Admin Passkeys")

        dash_layout.addWidget(self.tabs)

        # 4. Status Bar
        self.status_bar = QStatusBar()
        self.status_bar.showMessage("Station connected to Supabase PostgreSQL.")
        dash_layout.addWidget(self.status_bar)

    def show_admin_interface(self, admin_name: str):
        self.admin_name = admin_name
        self.lbl_admin_badge.setText(f"🛡️ Admin: {admin_name}")
        self.setWindowTitle(f"Jadavpur Love Birds Admin Workstation — {admin_name}")
        self.setMinimumSize(1140, 760)
        self.resize(1180, 780)

        # Center on screen
        try:
            screen_geometry = self.screen().availableGeometry()
            x = (screen_geometry.width() - 1180) // 2
            y = (screen_geometry.height() - 780) // 2
            self.move(max(0, x), max(0, y))
        except Exception:
            pass

        self.stack.setCurrentWidget(self.dashboard_page)
        self.refresh_all_data()

    # --------------------------------------------------------------------------
    # TAB 1: FEMALE DIRECTORY (RAW LIBRARY CARD: e.g. SL-4762)
    # --------------------------------------------------------------------------
    def setup_female_tab(self):
        layout = QVBoxLayout(self.tab_female)
        layout.setSpacing(10)

        filter_box = QHBoxLayout()
        filter_box.setSpacing(10)

        lbl_dept = QLabel("Department:")
        lbl_dept.setStyleSheet("font-weight: 600; color: #94a3b8; font-size: 12px;")
        filter_box.addWidget(lbl_dept)

        self.combo_dept_female = QComboBox()
        self.combo_dept_female.setFixedWidth(240)
        self.combo_dept_female.addItem("All Departments")
        for d in JADAVPUR_DEPARTMENTS:
            self.combo_dept_female.addItem(d)
        self.combo_dept_female.currentTextChanged.connect(self.render_female_table)
        filter_box.addWidget(self.combo_dept_female)

        lbl_year = QLabel("Grad Year:")
        lbl_year.setStyleSheet("font-weight: 600; color: #94a3b8; font-size: 12px;")
        filter_box.addWidget(lbl_year)

        self.combo_year_female = QComboBox()
        self.combo_year_female.setFixedWidth(120)
        self.combo_year_female.addItem("All Years")
        for y in GRAD_YEARS:
            self.combo_year_female.addItem(str(y))
        self.combo_year_female.currentTextChanged.connect(self.render_female_table)
        filter_box.addWidget(self.combo_year_female)

        self.edit_search_female = QLineEdit()
        self.edit_search_female.setPlaceholderText("Search female students by name or library card ID (e.g. SL-4762)...")
        self.edit_search_female.textChanged.connect(self.render_female_table)
        filter_box.addWidget(self.edit_search_female)

        layout.addLayout(filter_box)

        self.table_female = QTableWidget(0, 8)
        self.table_female.setHorizontalHeaderLabels([
            "Full Name", "Instagram ID", "Department", "Grad Year", "Library Card ID",
            "Approved?", "Active Chats", "Actions"
        ])
        self.table_female.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_female.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        self.table_female.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.Fixed)
        self.table_female.setColumnWidth(7, 110)
        self.table_female.verticalHeader().setDefaultSectionSize(38)
        self.table_female.cellDoubleClicked.connect(self.on_female_row_double_click)
        layout.addWidget(self.table_female)

    def render_female_table(self):
        dept = self.combo_dept_female.currentText()
        year = self.combo_year_female.currentText()
        search = self.edit_search_female.text().strip().lower()

        filtered = []
        for p in self.cached_female_profiles:
            if dept != "All Departments" and (p.get("department") or "") != dept:
                continue
            if year != "All Years":
                try:
                    if int(p.get("grad_year") or 0) != int(year):
                        continue
                except Exception:
                    continue
            if search:
                name = (p.get("full_name") or "").lower()
                card = (p.get("library_card_hash") or "").lower()
                insta = (p.get("insta_handle") or "").lower()
                p_dept = (p.get("department") or "").lower()
                if search not in name and search not in card and search not in insta and search not in p_dept:
                    continue
            filtered.append(p)

        self._female_data_cache = filtered
        self.table_female.setRowCount(len(filtered))

        for i, p in enumerate(filtered):
            self.table_female.setItem(i, 0, QTableWidgetItem(p.get("full_name") or "Unnamed"))

            # Instagram ID
            insta_item = QTableWidgetItem(p.get("insta_handle") or "—")
            insta_item.setForeground(QColor("#f472b6"))
            insta_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            self.table_female.setItem(i, 1, insta_item)

            self.table_female.setItem(i, 2, QTableWidgetItem(p.get("department") or "Undeclared"))
            self.table_female.setItem(i, 3, QTableWidgetItem(str(p.get("grad_year") or "—")))

            # RAW LIBRARY CARD (e.g. SL-4762)
            raw_card = p.get("library_card_hash") or "—"
            card_item = QTableWidgetItem(raw_card)
            card_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            card_item.setForeground(QColor("#38bdf8"))
            self.table_female.setItem(i, 4, card_item)

            appr_str = "APPROVED" if p.get("is_approved") else "PENDING"
            appr_item = QTableWidgetItem(appr_str)
            appr_item.setForeground(QColor("#10b981" if p.get("is_approved") else "#f59e0b"))
            self.table_female.setItem(i, 5, appr_item)

            self.table_female.setItem(i, 6, QTableWidgetItem(str(p.get("active_chat_count", 0))))

            w = QWidget()
            h = QHBoxLayout(w)
            h.setContentsMargins(6, 2, 6, 2)
            btn_inspect = QPushButton("Inspect")
            btn_inspect.setObjectName("secondaryBtn")
            btn_inspect.clicked.connect(lambda checked, prof=p: self.inspect_student(prof))
            h.addWidget(btn_inspect)
            self.table_female.setCellWidget(i, 7, w)

    def on_female_row_double_click(self, row, col):
        if hasattr(self, "_female_data_cache") and 0 <= row < len(self._female_data_cache):
            self.inspect_student(self._female_data_cache[row])

    # --------------------------------------------------------------------------
    # TAB 2: MALE DIRECTORY & CHAT SLOTS (RAW LIBRARY CARD)
    # --------------------------------------------------------------------------
    def setup_male_tab(self):
        layout = QVBoxLayout(self.tab_male)
        layout.setSpacing(10)

        filter_box = QHBoxLayout()
        filter_box.setSpacing(10)

        lbl_dept = QLabel("Department:")
        lbl_dept.setStyleSheet("font-weight: 600; color: #94a3b8; font-size: 12px;")
        filter_box.addWidget(lbl_dept)

        self.combo_dept_male = QComboBox()
        self.combo_dept_male.setFixedWidth(240)
        self.combo_dept_male.addItem("All Departments")
        for d in JADAVPUR_DEPARTMENTS:
            self.combo_dept_male.addItem(d)
        self.combo_dept_male.currentTextChanged.connect(self.render_male_table)
        filter_box.addWidget(self.combo_dept_male)

        lbl_year = QLabel("Grad Year:")
        lbl_year.setStyleSheet("font-weight: 600; color: #94a3b8; font-size: 12px;")
        filter_box.addWidget(lbl_year)

        self.combo_year_male = QComboBox()
        self.combo_year_male.setFixedWidth(120)
        self.combo_year_male.addItem("All Years")
        for y in GRAD_YEARS:
            self.combo_year_male.addItem(str(y))
        self.combo_year_male.currentTextChanged.connect(self.render_male_table)
        filter_box.addWidget(self.combo_year_male)

        self.edit_search_male = QLineEdit()
        self.edit_search_male.setPlaceholderText("Search male students by name or library card ID (e.g. SL-4762)...")
        self.edit_search_male.textChanged.connect(self.render_male_table)
        filter_box.addWidget(self.edit_search_male)

        layout.addLayout(filter_box)

        self.table_male = QTableWidget(0, 8)
        self.table_male.setHorizontalHeaderLabels([
            "Full Name", "Instagram ID", "Department", "Grad Year", "Library Card ID",
            "Active Chats (Unlimited)", "Status", "Actions"
        ])
        self.table_male.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_male.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        self.table_male.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.Fixed)
        self.table_male.setColumnWidth(7, 110)
        self.table_male.verticalHeader().setDefaultSectionSize(38)
        self.table_male.cellDoubleClicked.connect(self.on_male_row_double_click)
        layout.addWidget(self.table_male)

    def render_male_table(self):
        dept = self.combo_dept_male.currentText()
        year = self.combo_year_male.currentText()
        search = self.edit_search_male.text().strip().lower()

        filtered = []
        for p in self.cached_male_profiles:
            if dept != "All Departments" and (p.get("department") or "") != dept:
                continue
            if year != "All Years":
                try:
                    if int(p.get("grad_year") or 0) != int(year):
                        continue
                except Exception:
                    continue
            if search:
                name = (p.get("full_name") or "").lower()
                card = (p.get("library_card_hash") or "").lower()
                insta = (p.get("insta_handle") or "").lower()
                p_dept = (p.get("department") or "").lower()
                if search not in name and search not in card and search not in insta and search not in p_dept:
                    continue
            filtered.append(p)

        self._male_data_cache = filtered
        self.table_male.setRowCount(len(filtered))

        for i, p in enumerate(filtered):
            self.table_male.setItem(i, 0, QTableWidgetItem(p.get("full_name") or "Unnamed"))

            # Instagram ID
            insta_item = QTableWidgetItem(p.get("insta_handle") or "—")
            insta_item.setForeground(QColor("#f472b6"))
            insta_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            self.table_male.setItem(i, 1, insta_item)

            self.table_male.setItem(i, 2, QTableWidgetItem(p.get("department") or "Undeclared"))
            self.table_male.setItem(i, 3, QTableWidgetItem(str(p.get("grad_year") or "—")))

            # RAW LIBRARY CARD (e.g. ET-3104)
            raw_card = p.get("library_card_hash") or "—"
            card_item = QTableWidgetItem(raw_card)
            card_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            card_item.setForeground(QColor("#38bdf8"))
            self.table_male.setItem(i, 4, card_item)

            count = p.get("active_chat_count", 0)
            slot_str = f"{count} active"
            slot_item = QTableWidgetItem(slot_str)
            if count > 0:
                slot_item.setForeground(QColor("#38bdf8"))
            else:
                slot_item.setForeground(QColor("#10b981"))
            self.table_male.setItem(i, 5, slot_item)

            is_deact = p.get("is_deactivated", False)
            status_item = QTableWidgetItem("DEACTIVATED" if is_deact else "ACTIVE")
            status_item.setForeground(QColor("#ef4444" if is_deact else "#10b981"))
            self.table_male.setItem(i, 6, status_item)

            w = QWidget()
            h = QHBoxLayout(w)
            h.setContentsMargins(6, 2, 6, 2)
            btn_inspect = QPushButton("Inspect")
            btn_inspect.setObjectName("secondaryBtn")
            btn_inspect.clicked.connect(lambda checked, prof=p: self.inspect_student(prof))
            h.addWidget(btn_inspect)
            self.table_male.setCellWidget(i, 7, w)

    def on_male_row_double_click(self, row, col):
        if hasattr(self, "_male_data_cache") and 0 <= row < len(self._male_data_cache):
            self.inspect_student(self._male_data_cache[row])

    # --------------------------------------------------------------------------
    # TAB 3: PENDING APPROVALS QUEUE (RAW LIBRARY CARD)
    # --------------------------------------------------------------------------
    def setup_approvals_tab(self):
        layout = QVBoxLayout(self.tab_approvals)
        layout.setSpacing(10)

        lbl_info = QLabel("⏳ The queue displays student profiles requiring identity validation before accessing campus matching.")
        lbl_info.setStyleSheet("color: #94a3b8; font-size: 12px; margin-bottom: 4px;")
        layout.addWidget(lbl_info)

        self.table_approvals = QTableWidget(0, 7)
        self.table_approvals.setHorizontalHeaderLabels([
            "Full Name", "Instagram ID", "Gender", "Department", "Grad Year", "Library Card ID", "Actions"
        ])
        self.table_approvals.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_approvals.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_approvals.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table_approvals.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.table_approvals.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_approvals.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.table_approvals.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.Fixed)
        self.table_approvals.setColumnWidth(6, 170)
        self.table_approvals.verticalHeader().setDefaultSectionSize(38)
        layout.addWidget(self.table_approvals)

    def render_approvals_table(self):
        approvals = self.cached_pending_approvals
        self.table_approvals.setRowCount(len(approvals))

        for i, p in enumerate(approvals):
            self.table_approvals.setItem(i, 0, QTableWidgetItem(p.get("full_name") or "Unnamed"))

            # Instagram ID
            insta_item = QTableWidgetItem(p.get("insta_handle") or "—")
            insta_item.setForeground(QColor("#f472b6"))
            insta_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            self.table_approvals.setItem(i, 1, insta_item)

            self.table_approvals.setItem(i, 2, QTableWidgetItem((p.get("gender") or "").upper()))
            self.table_approvals.setItem(i, 3, QTableWidgetItem(p.get("department") or "Undeclared"))
            self.table_approvals.setItem(i, 4, QTableWidgetItem(str(p.get("grad_year") or "—")))

            # RAW LIBRARY CARD (e.g. PH-5521)
            raw_card = p.get("library_card_hash") or "—"
            c_item = QTableWidgetItem(raw_card)
            c_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            c_item.setForeground(QColor("#38bdf8"))
            self.table_approvals.setItem(i, 5, c_item)

            w = QWidget()
            h = QHBoxLayout(w)
            h.setContentsMargins(4, 2, 4, 2)
            h.setSpacing(6)

            btn_view = QPushButton("Inspect")
            btn_view.setObjectName("secondaryBtn")
            btn_view.clicked.connect(lambda checked, prof=p: self.inspect_student(prof))
            h.addWidget(btn_view)

            btn_appr = QPushButton("Approve")
            btn_appr.setObjectName("successBtn")
            btn_appr.clicked.connect(lambda checked, pid=p.get("id"), name=p.get("full_name"): self.handle_quick_approve(pid, name))
            h.addWidget(btn_appr)

            self.table_approvals.setCellWidget(i, 6, w)

    def handle_quick_approve(self, profile_id: str, name: str):
        if db.approve_profile(profile_id):
            self.status_bar.showMessage(f"Profile '{name}' successfully approved.", 4000)
            self.refresh_all_data()
        else:
            QMessageBox.critical(self, "Error", f"Failed to approve profile '{name}'.")

    # --------------------------------------------------------------------------
    # TAB 4: DEACTIVATED ACCOUNTS & RE-AUTH
    # --------------------------------------------------------------------------
    def setup_deactivated_tab(self):
        layout = QVBoxLayout(self.tab_deact)
        layout.setSpacing(10)

        lbl_info = QLabel("🚫 Deactivated bad actors are barred from P2P networking until re-authentication is granted.")
        lbl_info.setStyleSheet("color: #94a3b8; font-size: 12px;")
        layout.addWidget(lbl_info)

        self.table_deact = QTableWidget(0, 6)
        self.table_deact.setHorizontalHeaderLabels([
            "Full Name", "Gender", "Department", "Deactivation Reason", "Deactivated At", "Actions"
        ])
        self.table_deact.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_deact.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_deact.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table_deact.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.table_deact.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_deact.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.Fixed)
        self.table_deact.setColumnWidth(5, 130)
        self.table_deact.verticalHeader().setDefaultSectionSize(38)
        layout.addWidget(self.table_deact)

    def render_deactivated_table(self):
        deacts = self.cached_deactivated_profiles
        self.table_deact.setRowCount(len(deacts))

        for i, p in enumerate(deacts):
            self.table_deact.setItem(i, 0, QTableWidgetItem(p.get("full_name") or "Unnamed"))
            self.table_deact.setItem(i, 1, QTableWidgetItem((p.get("gender") or "").upper()))
            self.table_deact.setItem(i, 2, QTableWidgetItem(p.get("department") or "Undeclared"))

            reason_item = QTableWidgetItem(p.get("deactivation_reason") or "No reason specified")
            reason_item.setForeground(QColor("#f43f5e"))
            self.table_deact.setItem(i, 3, reason_item)

            time_str = str(p.get("updated_at") or p.get("created_at") or "")[:19]
            self.table_deact.setItem(i, 4, QTableWidgetItem(time_str))

            btn_reactivate = QPushButton("Re-Activate")
            btn_reactivate.setObjectName("successBtn")
            btn_reactivate.clicked.connect(lambda checked, pid=p.get("id"), name=p.get("full_name"): self.handle_reactivate(pid, name))
            self.table_deact.setCellWidget(i, 5, btn_reactivate)

    def handle_reactivate(self, profile_id: str, name: str):
        confirm = QMessageBox.question(
            self, "Confirm Re-Activation",
            f"Are you sure you want to restore '{name}' and re-enable campus P2P access?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if confirm == QMessageBox.StandardButton.Yes:
            if db.reactivate_profile(profile_id):
                self.status_bar.showMessage(f"Profile '{name}' has been restored and re-activated.", 4000)
                self.refresh_all_data()
            else:
                QMessageBox.critical(self, "Error", f"Failed to reactivate '{name}'.")

    # --------------------------------------------------------------------------
    # TAB 5: GLOBAL CAMPUS ANNOUNCEMENTS
    # --------------------------------------------------------------------------
    def setup_announcements_tab(self):
        layout = QVBoxLayout(self.tab_announce)
        layout.setSpacing(10)

        form_box = QGroupBox("📢 Broadcast Real-Time Platform Announcement")
        form_layout = QVBoxLayout(form_box)

        self.edit_announcement = QTextEdit()
        self.edit_announcement.setPlaceholderText("Compose message for all campus students (e.g. Server maintenance, campus safety advisory, event update)...")
        self.edit_announcement.setMaximumHeight(80)
        form_layout.addWidget(self.edit_announcement)

        row_meta = QHBoxLayout()
        row_meta.addWidget(QLabel("Announcement Priority:"))
        self.combo_ann_type = QComboBox()
        self.combo_ann_type.addItem("ℹ️ INFO (General Update)", "info")
        self.combo_ann_type.addItem("⚠️ WARNING (Safety Advisory)", "warning")
        self.combo_ann_type.addItem("🚨 EMERGENCY (Immediate Action)", "emergency")
        row_meta.addWidget(self.combo_ann_type)

        btn_broadcast = QPushButton("🚀 Broadcast Announcement to Supabase")
        btn_broadcast.setObjectName("cyanBtn")
        btn_broadcast.clicked.connect(self.handle_broadcast_announcement)
        row_meta.addWidget(btn_broadcast)
        form_layout.addLayout(row_meta)

        layout.addWidget(form_box)

        lbl_list = QLabel("Past Broadcasts")
        lbl_list.setStyleSheet("font-weight: 700; color: #00ffcc; margin-top: 10px;")
        layout.addWidget(lbl_list)

        self.table_announcements = QTableWidget(0, 4)
        self.table_announcements.setHorizontalHeaderLabels(["Timestamp", "Type", "Content", "Actions"])
        self.table_announcements.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_announcements.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_announcements.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_announcements.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table_announcements.setColumnWidth(3, 90)
        self.table_announcements.verticalHeader().setDefaultSectionSize(38)
        layout.addWidget(self.table_announcements)

    def render_announcements_table(self):
        anns = self.cached_announcements
        self.table_announcements.setRowCount(len(anns))

        for i, a in enumerate(anns):
            time_str = str(a.get("created_at") or "")[:19]
            self.table_announcements.setItem(i, 0, QTableWidgetItem(time_str))

            t_str = (a.get("type") or "info").upper()
            t_item = QTableWidgetItem(t_str)
            if t_str == "EMERGENCY":
                t_item.setForeground(QColor("#f43f5e"))
            elif t_str == "WARNING":
                t_item.setForeground(QColor("#f59e0b"))
            else:
                t_item.setForeground(QColor("#38bdf8"))
            self.table_announcements.setItem(i, 1, t_item)

            self.table_announcements.setItem(i, 2, QTableWidgetItem(a.get("content") or ""))

            w = QWidget()
            h = QHBoxLayout(w)
            h.setContentsMargins(6, 2, 6, 2)
            btn_del = QPushButton("Delete")
            btn_del.setObjectName("dangerBtn")
            btn_del.clicked.connect(lambda checked, aid=a.get("id"): self.handle_delete_announcement(aid))
            h.addWidget(btn_del)
            self.table_announcements.setCellWidget(i, 3, w)

    def handle_broadcast_announcement(self):
        content = self.edit_announcement.toPlainText().strip()
        if not content:
            QMessageBox.warning(self, "Empty Message", "Please enter message content before broadcasting.")
            return

        ann_type = self.combo_ann_type.currentData() or "info"
        try:
            db.create_announcement(content, ann_type)
            self.edit_announcement.clear()
            self.status_bar.showMessage("Announcement broadcasted successfully to all students!", 4000)
            self.refresh_all_data()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to post announcement: {e}")

    def handle_delete_announcement(self, ann_id: str):
        if db.delete_announcement(ann_id):
            self.refresh_all_data()

    # --------------------------------------------------------------------------
    # TAB 6: PASSKEYS STATION
    # --------------------------------------------------------------------------
    def setup_passkeys_tab(self):
        layout = QVBoxLayout(self.tab_passkeys)
        layout.setSpacing(10)

        lbl_desc = QLabel("🔐 Enrolled Hardware & Biometric Passkeys (public.admin_passkeys). Immutable hardware credentials — once registered and pushed to Supabase, passkeys cannot be revoked.")
        lbl_desc.setStyleSheet("color: #94a3b8; font-size: 12px; margin-bottom: 4px;")
        layout.addWidget(lbl_desc)

        self.table_passkeys = QTableWidget(0, 4)
        self.table_passkeys.setHorizontalHeaderLabels([
            "Admin Name", "Credential ID", "Sensor / Hardware Authenticator", "Enrolled Date"
        ])
        self.table_passkeys.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_passkeys.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table_passkeys.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table_passkeys.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_passkeys.verticalHeader().setDefaultSectionSize(38)
        layout.addWidget(self.table_passkeys)

    def render_passkeys_table(self):
        keys = self.cached_passkeys
        self.table_passkeys.setRowCount(len(keys))

        for i, k in enumerate(keys):
            name_item = QTableWidgetItem(k.get("username") or "admin")
            name_item.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
            self.table_passkeys.setItem(i, 0, name_item)
            
            cred_str = k.get("credential_id") or "—"
            c_item = QTableWidgetItem(cred_str)
            c_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            c_item.setForeground(QColor("#00ffcc"))
            self.table_passkeys.setItem(i, 1, c_item)

            dev_str = k.get("device_label") or "Hardware Biometric Sensor"
            dev_item = QTableWidgetItem(f"🛡️ {dev_str}")
            dev_item.setForeground(QColor("#a7f3d0"))
            self.table_passkeys.setItem(i, 2, dev_item)

            time_str = str(k.get("created_at") or "")[:19]
            self.table_passkeys.setItem(i, 3, QTableWidgetItem(time_str))

    # --------------------------------------------------------------------------
    # COMMON METHODS & REFRESH (ASYNCHRONOUS NON-BLOCKING QTHREAD LOADER)
    # --------------------------------------------------------------------------
    def inspect_student(self, profile: Dict[str, Any]):
        dialog = StudentDetailDialog(profile, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.refresh_all_data()

    def refresh_all_data(self):
        if self.is_loading_data:
            return
        self.is_loading_data = True
        self.status_bar.showMessage("⚡ Synchronizing live campus database with Supabase...")

        self.data_loader = DataLoaderWorker()
        self.data_loader.data_loaded.connect(self.on_dashboard_data_loaded)
        self.data_loader.load_failed.connect(self.on_dashboard_data_failed)
        self.data_loader.start()

    def on_dashboard_data_loaded(self, data: dict):
        self.is_loading_data = False
        self.cached_kpis = data.get("kpi_stats", {})
        self.cached_all_profiles = data.get("all_profiles", [])
        self.cached_female_profiles = data.get("female_profiles", [])
        self.cached_male_profiles = data.get("male_profiles", [])
        self.cached_pending_approvals = data.get("pending_approvals", [])
        self.cached_deactivated_profiles = data.get("deactivated_profiles", [])
        self.cached_announcements = data.get("announcements", [])
        self.cached_passkeys = data.get("passkeys", [])

        # Update KPIs instantly
        self.lbl_kpi_total.setText(str(self.cached_kpis.get("total_profiles", 0)))
        self.lbl_kpi_female.setText(str(self.cached_kpis.get("females", 0)))
        self.lbl_kpi_male.setText(str(self.cached_kpis.get("males", 0)))
        self.lbl_kpi_pending.setText(str(self.cached_kpis.get("pending_approvals", 0)))
        self.lbl_kpi_deact.setText(str(self.cached_kpis.get("deactivated", 0)))
        self.lbl_kpi_chats.setText(str(self.cached_kpis.get("total_active_chats", 0)))

        # Render all tables from cache (sub-millisecond)
        self.render_female_table()
        self.render_male_table()
        self.render_approvals_table()
        self.render_deactivated_table()
        self.render_announcements_table()
        self.render_passkeys_table()

        self.status_bar.showMessage(f"✅ Supabase Live Gateway Synchronized ({time.strftime('%H:%M:%S')}).", 4000)

    def on_dashboard_data_failed(self, err_msg: str):
        self.is_loading_data = False
        self.status_bar.showMessage(f"⚠️ Synchronization notice: {err_msg}", 5000)


def main():
    auth_server.start_auth_server()
    app = QApplication(sys.argv)
    window = AdminStationWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
