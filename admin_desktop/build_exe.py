"""
Jadavpur Love Birds - PyInstaller One-Click Executable Builder
Compiles admin_desktop/admin_station.py into a standalone JLB_Admin_Station.exe.
"""
import os
import sys
import shutil
import PyInstaller.__main__

ADMIN_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(ADMIN_DIR)

app_script = os.path.join(ADMIN_DIR, "admin_station.py")
icon_path = os.path.join(ADMIN_DIR, "app_icon.ico")
dist_dir = os.path.join(ADMIN_DIR, "dist")
build_dir = os.path.join(ADMIN_DIR, "build")

args = [
    app_script,
    "--name=JLB_Admin_Station",
    "--onefile",
    "--windowed",
    f"--distpath={dist_dir}",
    f"--workpath={build_dir}",
    f"--icon={icon_path}",
    f"--add-data={icon_path};.",
    f"--paths={PROJECT_ROOT}",
    f"--paths={ADMIN_DIR}",
    "--hidden-import=PyQt6",
    "--hidden-import=PyQt6.QtCore",
    "--hidden-import=PyQt6.QtGui",
    "--hidden-import=PyQt6.QtWidgets",
    "--hidden-import=psycopg2",
    "--hidden-import=psycopg2.extras",
    "--hidden-import=psycopg2._psycopg",
    "--hidden-import=qrcode",
    "--hidden-import=qrcode.image.pil",
    "--hidden-import=PIL",
    "--hidden-import=PIL.Image",
    "--hidden-import=admin_desktop",
    "--hidden-import=admin_desktop.db",
    "--hidden-import=admin_desktop.config",
    "--hidden-import=admin_desktop.auth_server",
    "--clean",
    "--noconfirm",
]

print("=" * 70)
print("  BUILDING STANDALONE ONE-CLICK EXECUTABLE: JLB_Admin_Station.exe")
print("=" * 70)
PyInstaller.__main__.run(args)

# Copy final .exe to project root as well for immediate 1-click access
exe_in_dist = os.path.join(dist_dir, "JLB_Admin_Station.exe")
exe_in_root = os.path.join(PROJECT_ROOT, "JLB_Admin_Station.exe")

if os.path.exists(exe_in_dist):
    shutil.copy2(exe_in_dist, exe_in_root)
    print("\n" + "=" * 70)
    print(f" [SUCCESS] Executable generated successfully!")
    print(f"  -> Dist: {exe_in_dist}")
    print(f"  -> Root: {exe_in_root}")
    print("=" * 70 + "\n")
else:
    print("\n[ERROR] Output exe not found in dist.")
