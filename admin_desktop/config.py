"""
Jadavpur Love Birds - Admin Desktop Configuration
Direct connection to Supabase PostgreSQL & API endpoints.
"""
import os
import sys
from pathlib import Path

# Base Paths
if getattr(sys, "frozen", False):
    ADMIN_DIR = Path(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
    PROJECT_ROOT = Path(os.path.dirname(sys.executable))
else:
    ADMIN_DIR = Path(__file__).resolve().parent
    PROJECT_ROOT = ADMIN_DIR.parent

# Supabase Credentials (Direct DB URL for lightning-fast, real-time administrative access)
SUPABASE_DB_URL = os.environ.get(
    "SUPABASE_DB_URL",
    "postgresql://postgres:kTCjUd%40Xpw5X6R%26@db.bwvslsvjjclnspmdleyj.supabase.co:5432/postgres"
)
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://bwvslsvjjclnspmdleyj.supabase.co")
SUPABASE_ANON_KEY = os.environ.get(
    "VITE_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnNsc3ZqamNsbnNwbWRsZXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MTM3MzQsImV4cCI6MjEwNjA4OTczNH0.Wq7RqKJMCVzX5CisjZga2SpTk6EfAh20aTfRS9k1vPY"
)

# Server Port for Local Biometric WebAuthn Handshake
AUTH_SERVER_PORT = 8089

# Jadavpur University Official 29 Departments
JADAVPUR_DEPARTMENTS = [
    "Computer Science & Engineering",
    "Electronics & Telecommunication Engineering",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Metallurgical & Material Engineering",
    "Production Engineering",
    "Information Technology",
    "Power Engineering",
    "Instrumentation & Electronics Engineering",
    "Printing Engineering",
    "Construction Engineering",
    "Food Technology & Biochemical Engineering",
    "Pharmaceutical Technology",
    "Architecture",
    "Comparative Literature",
    "English",
    "Bengali",
    "History",
    "Economics",
    "International Relations",
    "Philosophy",
    "Sociology",
    "Physics",
    "Chemistry",
    "Mathematics",
    "Geological Sciences",
    "Life Science & Biotechnology"
]

GRAD_YEARS = [2024, 2025, 2026, 2027, 2028, 2029]

# GitHub Relay & OTA Fleet Repository Configuration
GITHUB_PAT = os.environ.get("GITHUB_PAT", "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")
GITHUB_REPO_UPDATES = "labubu-karapathy/JUD"
GITHUB_REPO_BACKEND = "labubu-karapathy/backend"
