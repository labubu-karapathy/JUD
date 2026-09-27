"""
Jadavpur Love Birds - Admin Desktop Database Operations
High-performance PostgreSQL interface with thread-local connection persistence,
auto-reconnect, and fast batch dashboard retrieval.
"""
import uuid
import json
import threading
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
import base64
import time
import urllib.request
import urllib.error
from typing import List, Dict, Optional, Any
from .config import SUPABASE_DB_URL, GITHUB_PAT, GITHUB_REPO_UPDATES

_thread_local = threading.local()

def get_connection():
    """Returns a persistent, alive PostgreSQL connection for the calling thread."""
    conn = getattr(_thread_local, "conn", None)
    if conn is not None:
        try:
            if conn.closed == 0:
                return conn
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
        _thread_local.conn = None

    new_conn = psycopg2.connect(SUPABASE_DB_URL, connect_timeout=8)
    _thread_local.conn = new_conn
    return new_conn

@contextmanager
def db_cursor(commit: bool = False):
    """Context manager yielding a RealDictCursor on the thread's persistent connection."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        if commit:
            conn.commit()
    except Exception as e:
        if commit:
            try:
                conn.rollback()
            except Exception:
                pass
        # If connection is broken or closed, clear thread-local reference so next call reconnects
        try:
            if conn.closed != 0:
                _thread_local.conn = None
        except Exception:
            _thread_local.conn = None
        raise e

def test_connection() -> Dict[str, Any]:
    """Tests the database connection and returns latency/status."""
    try:
        with db_cursor() as cur:
            cur.execute("SELECT 1;")
            return {"success": True, "message": "Connected to Supabase PostgreSQL"}
    except Exception as e:
        return {"success": False, "message": str(e)}

# ==============================================================================
# FAST CONSOLIDATED DASHBOARD DATA LOADER (SINGLE SSL CONNECTION, 3 QUERIES)
# ==============================================================================
def get_all_dashboard_data() -> Dict[str, Any]:
    """
    Executes 3 targeted queries over a single persistent connection and constructs
    all KPIs, directories, pending queues, deactivated lists, announcements, and passkeys.
    Completes in under ~0.5 - 1.0s total without blocking.
    """
    with db_cursor() as cur:
        # 1. All Profiles
        cur.execute("""
            SELECT 
                id, full_name, gender, target_gender, age, bio,
                insta_handle, library_card_hash, photo_urls,
                is_verified, report_count, block_count, department,
                grad_year, is_approved, approval_comment, is_deactivated,
                deactivation_reason, active_chat_count, created_at, updated_at
            FROM public.profiles
            ORDER BY created_at DESC;
        """)
        all_profiles = cur.fetchall() or []

        # 2. Global Announcements
        cur.execute("""
            SELECT id, content, type, created_at
            FROM public.global_announcements
            ORDER BY created_at DESC
            LIMIT 30;
        """)
        announcements = cur.fetchall() or []

        # 3. Admin Passkeys
        cur.execute("""
            SELECT id, COALESCE(username, 'admin') as username, credential_id, public_key, counter, device_label, created_at
            FROM public.admin_passkeys
            ORDER BY created_at DESC;
        """)
        passkeys = cur.fetchall() or []

        # 4. Over-The-Air (OTA) App Updates
        cur.execute("""
            SELECT id, version, build_hash, commit_message, bundle_size, is_active, created_at
            FROM public.app_updates
            ORDER BY created_at DESC
            LIMIT 25;
        """)
        app_updates = cur.fetchall() or []

    # Process and split in memory (sub-millisecond speed)
    females = []
    males = []
    pending_approvals = []
    deactivated = []
    total_active_chats = 0
    approved_count = 0

    for p in all_profiles:
        g = (p.get("gender") or "").lower()
        is_appr = bool(p.get("is_approved"))
        is_deact = bool(p.get("is_deactivated"))
        chats = int(p.get("active_chat_count") or 0)
        total_active_chats += chats

        if is_appr:
            approved_count += 1

        if g == "female":
            females.append(p)
        elif g == "male":
            males.append(p)

        if not is_appr and not is_deact:
            pending_approvals.append(p)

        if is_deact:
            deactivated.append(p)

    kpi_stats = {
        "total_profiles": len(all_profiles),
        "females": len(females),
        "males": len(males),
        "approved": approved_count,
        "pending_approvals": len(pending_approvals),
        "deactivated": len(deactivated),
        "total_active_chats": total_active_chats,
        "announcements_count": len(announcements),
        "passkeys_count": len(passkeys),
        "app_updates_count": len(app_updates),
    }

    return {
        "kpi_stats": kpi_stats,
        "all_profiles": all_profiles,
        "female_profiles": females,
        "male_profiles": males,
        "pending_approvals": pending_approvals,
        "deactivated_profiles": deactivated,
        "announcements": announcements,
        "passkeys": passkeys,
        "app_updates": app_updates,
    }

# ==============================================================================
# INDIVIDUAL QUERIES (REUSING PERSISTENT CONNECTION)
# ==============================================================================
def get_kpi_stats() -> Dict[str, int]:
    """Retrieves high-level platform statistics for admin KPI dashboard."""
    query = """
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE gender = 'female') as females,
            COUNT(*) FILTER (WHERE gender = 'male') as males,
            COUNT(*) FILTER (WHERE is_approved = true) as approved,
            COUNT(*) FILTER (WHERE is_approved = false AND is_deactivated = false) as pending,
            COUNT(*) FILTER (WHERE is_deactivated = true) as deactivated,
            COALESCE(SUM(active_chat_count), 0) as total_active_chats
        FROM public.profiles;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query)
            row = cur.fetchone()
            
            cur.execute("SELECT COUNT(*) as count FROM public.global_announcements;")
            announcements_count = cur.fetchone()["count"]
            
            cur.execute("SELECT COUNT(*) as count FROM public.admin_passkeys;")
            passkeys_count = cur.fetchone()["count"]

            return {
                "total_profiles": row["total"] or 0,
                "females": row["females"] or 0,
                "males": row["males"] or 0,
                "approved": row["approved"] or 0,
                "pending_approvals": row["pending"] or 0,
                "deactivated": row["deactivated"] or 0,
                "total_active_chats": int(row["total_active_chats"] or 0),
                "announcements_count": announcements_count,
                "passkeys_count": passkeys_count,
            }
    except Exception as e:
        print(f"[DB Error in get_kpi_stats]: {e}")
        return {
            "total_profiles": 0, "females": 0, "males": 0, "approved": 0,
            "pending_approvals": 0, "deactivated": 0, "total_active_chats": 0,
            "announcements_count": 0, "passkeys_count": 0
        }

def get_profiles(
    gender: Optional[str] = None,
    department: Optional[str] = None,
    grad_year: Optional[int] = None,
    search: Optional[str] = None,
    is_approved: Optional[bool] = None,
    is_deactivated: Optional[bool] = None
) -> List[Dict[str, Any]]:
    """Retrieves filtered list of user profiles."""
    query = """
        SELECT 
            id, full_name, gender, target_gender, age, bio,
            insta_handle, library_card_hash, photo_urls,
            is_verified, report_count, block_count, department,
            grad_year, is_approved, approval_comment, is_deactivated,
            deactivation_reason, active_chat_count, created_at, updated_at
        FROM public.profiles
        WHERE 1=1
    """
    params = []

    if gender:
        query += " AND gender = %s"
        params.append(gender.lower())

    if department and department != "All Departments":
        query += " AND department = %s"
        params.append(department)

    if grad_year and grad_year != "All Years":
        try:
            year_int = int(grad_year)
            query += " AND grad_year = %s"
            params.append(year_int)
        except (ValueError, TypeError):
            pass

    if is_approved is not None:
        query += " AND is_approved = %s"
        params.append(is_approved)

    if is_deactivated is not None:
        query += " AND is_deactivated = %s"
        params.append(is_deactivated)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query += " AND (LOWER(full_name) LIKE %s OR LOWER(library_card_hash) LIKE %s OR LOWER(COALESCE(department, '')) LIKE %s)"
        params.extend([term, term, term])

    query += " ORDER BY created_at DESC;"

    try:
        with db_cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.fetchall() or []
    except Exception as e:
        print(f"[DB Error in get_profiles]: {e}")
        return []

def get_pending_approvals() -> List[Dict[str, Any]]:
    """Fetches all users awaiting admin identity verification."""
    query = """
        SELECT 
            id, full_name, gender, age, bio, department, grad_year,
            library_card_hash, photo_urls, is_approved, approval_comment,
            created_at
        FROM public.profiles
        WHERE is_approved = FALSE AND is_deactivated = FALSE
        ORDER BY created_at ASC;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query)
            return cur.fetchall() or []
    except Exception as e:
        print(f"[DB Error in get_pending_approvals]: {e}")
        return []

def approve_profile(profile_id: str, comment: str = "Verified and approved by Campus Admin") -> bool:
    """Approves a student's profile for matching."""
    query = """
        UPDATE public.profiles
        SET is_approved = TRUE,
            approval_comment = %s,
            updated_at = NOW()
        WHERE id = %s;
    """
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (comment, profile_id))
            return cur.rowcount > 0
    except Exception as e:
        print(f"[DB Error in approve_profile]: {e}")
        return False

def deactivate_profile(profile_id: str, reason: str) -> bool:
    """Forces immediate deactivation of a student's account with a mandatory reason."""
    if not reason or not reason.strip():
        raise ValueError("A mandatory deactivation reason must be provided.")

    query = """
        UPDATE public.profiles
        SET is_deactivated = TRUE,
            deactivation_reason = %s,
            active_chat_count = 0,
            updated_at = NOW()
        WHERE id = %s;
    """
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (reason.strip(), profile_id))
            return cur.rowcount > 0
    except Exception as e:
        print(f"[DB Error in deactivate_profile]: {e}")
        return False

def reactivate_profile(profile_id: str) -> bool:
    """Restores an account after re-authentication or clearance."""
    query = """
        UPDATE public.profiles
        SET is_deactivated = FALSE,
            deactivation_reason = NULL,
            updated_at = NOW()
        WHERE id = %s;
    """
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (profile_id,))
            return cur.rowcount > 0
    except Exception as e:
        print(f"[DB Error in reactivate_profile]: {e}")
        return False

def delete_profile(profile_id: str) -> bool:
    """Permanently purges a profile and dependent associations."""
    try:
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM public.chat_requests WHERE sender_id = %s OR receiver_id = %s;", (profile_id, profile_id))
            cur.execute("DELETE FROM public.matches WHERE user_a = %s OR user_b = %s;", (profile_id, profile_id))
            cur.execute("DELETE FROM public.blocks WHERE blocker_id = %s OR blocked_id = %s;", (profile_id, profile_id))
            cur.execute("DELETE FROM public.reports WHERE reporter_id = %s OR reported_id = %s;", (profile_id, profile_id))
            cur.execute("DELETE FROM public.profiles WHERE id = %s;", (profile_id,))
            return True
    except Exception as e:
        print(f"[DB Error in delete_profile]: {e}")
        return False

# ==============================================================================
# ADMIN PASSKEYS (FIDO2 / WEBAUTHN)
# ==============================================================================
def get_admin_passkeys() -> List[Dict[str, Any]]:
    """Returns all enrolled admin hardware and smartphone passkeys."""
    query = """
        SELECT id, COALESCE(username, 'admin') as username, credential_id, public_key, counter, device_label, created_at
        FROM public.admin_passkeys
        ORDER BY created_at DESC;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query)
            return cur.fetchall() or []
    except Exception as e:
        print(f"[DB Error in get_admin_passkeys]: {e}")
        return []

def get_admin_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Checks if an admin user exists with enrolled passkeys."""
    query = """
        SELECT id, COALESCE(username, 'admin') as username, credential_id, device_label, created_at
        FROM public.admin_passkeys
        WHERE LOWER(COALESCE(username, 'admin')) = LOWER(%s)
        LIMIT 1;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query, (username.strip(),))
            return cur.fetchone()
    except Exception as e:
        print(f"[DB Error in get_admin_by_username]: {e}")
        return None

def register_admin_passkey(username: str, credential_id: str, device_label: str = "Hardware Biometric Passkey", public_key: str = "") -> Dict[str, Any]:
    """Inserts a verified passkey into public.admin_passkeys."""
    query = """
        INSERT INTO public.admin_passkeys (id, username, credential_id, public_key, counter, device_label, created_at)
        VALUES (%s, %s, %s, %s, 0, %s, NOW())
        RETURNING id, username, credential_id, device_label, created_at;
    """
    passkey_id = str(uuid.uuid4())
    clean_username = username.strip() if username and username.strip() else "admin"
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (passkey_id, clean_username, credential_id, public_key, device_label))
            return cur.fetchone()
    except Exception as e:
        print(f"[DB Error in register_admin_passkey]: {e}")
        raise e

# ==============================================================================
# GLOBAL ANNOUNCEMENTS
# ==============================================================================
def get_announcements(limit: int = 30) -> List[Dict[str, Any]]:
    """Returns recent platform announcements."""
    query = """
        SELECT id, content, type, created_at
        FROM public.global_announcements
        ORDER BY created_at DESC
        LIMIT %s;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query, (limit,))
            return cur.fetchall() or []
    except Exception as e:
        print(f"[DB Error in get_announcements]: {e}")
        return []

def create_announcement(content: str, announcement_type: str = "info") -> Dict[str, Any]:
    """Broadcasts a new global announcement to all students."""
    if not content or not content.strip():
        raise ValueError("Announcement content cannot be empty.")

    query = """
        INSERT INTO public.global_announcements (id, content, type, created_at)
        VALUES (%s, %s, %s, NOW())
        RETURNING id, content, type, created_at;
    """
    announcement_id = str(uuid.uuid4())
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (announcement_id, content.strip(), announcement_type))
            return cur.fetchone()
    except Exception as e:
        print(f"[DB Error in create_announcement]: {e}")
        raise e

def delete_announcement(announcement_id: str) -> bool:
    """Removes an announcement."""
    query = "DELETE FROM public.global_announcements WHERE id = %s;"
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (announcement_id,))
            return cur.rowcount > 0
    except Exception as e:
        print(f"[DB Error in delete_announcement]: {e}")
        return False

# ==============================================================================
# OVER-THE-AIR (OTA) AUTO-UPDATES
# ==============================================================================
def get_app_updates(limit: int = 25) -> List[Dict[str, Any]]:
    """Fetches recent OTA updates published for campus fleet."""
    query = """
        SELECT id, version, build_hash, commit_message, bundle_size, is_active, created_at
        FROM public.app_updates
        ORDER BY created_at DESC
        LIMIT %s;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query, (limit,))
            return cur.fetchall() or []
    except Exception as e:
        print(f"[DB Error in get_app_updates]: {e}")
        return []

def get_latest_app_update() -> Optional[Dict[str, Any]]:
    """Returns the most recent active OTA update."""
    query = """
        SELECT id, version, build_hash, commit_message, patch_bundle, bundle_size, is_active, created_at
        FROM public.app_updates
        WHERE is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1;
    """
    try:
        with db_cursor() as cur:
            cur.execute(query)
            return cur.fetchone()
    except Exception as e:
        print(f"[DB Error in get_latest_app_update]: {e}")
        return None

def publish_app_update(
    version: str,
    build_hash: str,
    commit_message: str,
    patch_bundle: dict,
    bundle_size: int = 0
) -> Dict[str, Any]:
    """Publishes a new OTA update record to public.app_updates in Supabase."""
    query = """
        INSERT INTO public.app_updates (id, version, build_hash, commit_message, patch_bundle, bundle_size, is_active, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW())
        RETURNING id, version, build_hash, commit_message, bundle_size, is_active, created_at;
    """
    update_id = str(uuid.uuid4())
    bundle_json = json.dumps(patch_bundle)
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(query, (
                update_id,
                version.strip(),
                build_hash.strip(),
                commit_message.strip(),
                bundle_json,
                bundle_size
            ))
            return cur.fetchone()
    except Exception as e:
        print(f"[DB Error in publish_app_update]: {e}")
        raise e


def publish_update_to_github(
    version: str,
    build_hash: str,
    commit_message: str,
    patch_bundle: Optional[dict] = None
) -> Dict[str, Any]:
    """
    Pushes an OTA code release manifest and bundle directly to labubu-karapathy/JUD.
    Mobile student apps check this repository periodically or upon admin broadcast
    to hot-sync code changes without losing any local Dexie IndexedDB chat data.
    """
    if not GITHUB_PAT:
        raise ValueError("GitHub PAT not configured.")

    headers = {
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "JLB-Admin-Station",
        "Content-Type": "application/json"
    }

    manifest_data = {
        "version": version.strip(),
        "build_hash": build_hash.strip(),
        "commit_message": commit_message.strip(),
        "timestamp": int(time.time()),
        "patch_bundle": patch_bundle
    }

    manifest_json = json.dumps(manifest_data, indent=2)
    manifest_b64 = base64.b64encode(manifest_json.encode("utf-8")).decode("ascii")

    manifest_url = f"https://api.github.com/repos/{GITHUB_REPO_UPDATES}/contents/release-manifest.json"

    # Get existing SHA if file already exists
    existing_sha = None
    try:
        req = urllib.request.Request(manifest_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            existing_sha = data.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    payload = {
        "message": f"Release v{version} ({build_hash}): {commit_message}",
        "content": manifest_b64
    }
    if existing_sha:
        payload["sha"] = existing_sha

    put_req = urllib.request.Request(
        manifest_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="PUT"
    )

    with urllib.request.urlopen(put_req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        commit_sha = result.get("commit", {}).get("sha", "")
        return {
            "success": True,
            "version": version,
            "build_hash": build_hash,
            "commit_sha": commit_sha,
            "repo": GITHUB_REPO_UPDATES
        }

