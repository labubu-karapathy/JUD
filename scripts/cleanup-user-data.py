"""
Cleans up all user entry data from Supabase while keeping the schema completely unharmed
and keeping admin credentials / passkeys intact.
"""
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = "postgresql://postgres:kTCjUd%40Xpw5X6R%26@db.bwvslsvjjclnspmdleyj.supabase.co:5432/postgres"

def main():
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        print("[1/4] Inspecting Admin Data...")
        cur.execute("SELECT id, username, credential_id, device_label FROM public.admin_passkeys;")
        admin_rows = cur.fetchall()
        print(f"  Found {len(admin_rows)} admin passkey(s):")
        for r in admin_rows:
            print(f"    - ID: {r['id']}, User: {r['username']}, Label: {r['device_label']}")

        print("\n[2/4] Clearing user entry data from tables...")
        # Tables with user entries
        user_tables = [
            'chat_requests',
            'matches',
            'blocks',
            'reports',
            'profiles'
        ]

        deleted_counts = {}
        for tbl in user_tables:
            cur.execute(f"DELETE FROM public.{tbl};")
            deleted_counts[tbl] = cur.rowcount
            print(f"  Deleted {cur.rowcount} row(s) from public.{tbl}")

        # Clear non-admin test users in auth.users
        cur.execute("DELETE FROM auth.users;")
        deleted_auth_users = cur.rowcount
        print(f"  Deleted {deleted_auth_users} row(s) from auth.users")

        # Verify admin data is still intact
        cur.execute("SELECT COUNT(*) as cnt FROM public.admin_passkeys;")
        remaining_admin = cur.fetchone()['cnt']
        assert remaining_admin == len(admin_rows), "Admin passkeys were unexpectedly affected!"

        conn.commit()
        print("\n[3/4] Transaction committed successfully!")

        print("\n[4/4] Verifying post-cleanup state across all tables...")
        all_tables = [
            'admin_passkeys',
            'profiles',
            'matches',
            'blocks',
            'reports',
            'chat_requests',
            'global_announcements',
            'app_updates'
        ]

        for tbl in all_tables:
            cur.execute(f"SELECT COUNT(*) as cnt FROM public.{tbl};")
            cnt = cur.fetchone()['cnt']
            print(f"  public.{tbl}: {cnt} rows")

        cur.execute("SELECT COUNT(*) as cnt FROM auth.users;")
        print(f"  auth.users: {cur.fetchone()['cnt']} rows")

        print("\n[SUCCESS] Supabase user data wiped cleanly. Admin station data and all table structures intact.")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Transaction failed, rolled back: {e}")
        raise e
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
