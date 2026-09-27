# 04 - Database, Supabase & Offline Cache Architecture

## 1. Zero Server Chat Storage Principle
A core requirement of Jadavpur Love Birds is that **no chat message, text, or photo attachment is EVER stored on any cloud server**.
All chat communication exists strictly:
- In transit: End-to-end encrypted across WebRTC DataChannels between peers.
- At rest: Stored exclusively in the user's browser IndexedDB via Dexie.js (`local_messages` table).

---

## 2. Supabase PostgreSQL Cloud Schema
File: `supabase/migrations/001_initial_schema.sql`

The cloud database only maintains authenticated student accounts, discovery profiles, match associations, reports, and blocks.

### Tables Overview:
1. `public.profiles`:
   - `id`: UUID (references `auth.users`)
   - `full_name`: Student full name
   - `gender` & `target_gender`: Filters ('male', 'female', 'other', 'all')
   - `age`: Verified integer (>= 18)
   - `bio`: Short biography
   - `insta_handle`: Unique handle (`@username`)
   - `library_card_hash`: SHA-256 client hash of the student's physical card barcode
   - `photo_urls`: Array of image URLs
   - `report_count`: Public safety counter (incremented automatically on report)
   - `block_count`: Public safety counter (incremented automatically on block)

2. `public.matches`:
   - `id`: UUID
   - `female_id` & `male_id`: Profile UUIDs (unique compound index)
   - `has_female_initiated`: Boolean (starts `false`; only female client can update)
   - `media_allowed`: Boolean (starts `false`; female toggle for media sharing)

3. `public.blocks` & `public.reports`:
   - Store relational records with blocker/reporter IDs and reasons.

### Atomic Triggers:
```sql
CREATE TRIGGER trigger_on_block
AFTER INSERT ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.handle_new_block();

CREATE TRIGGER trigger_on_report
AFTER INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.handle_new_report();
```
Both functions run with `SECURITY DEFINER` privileges, ensuring public safety counts are incremented atomically without allowing clients to directly tamper with counter values.

---

## 3. Client-Side Dexie.js (IndexedDB) Architecture
File: `src/db/index.ts`

Database Name: `JUDAppLocalDB` (Version: 1)

### Tables:
- `cached_profiles`: Indexes: `id, full_name, gender, age, insta_handle, report_count, block_count, updated_at`.
  Allows the app to display cached candidate profiles instantly even when completely offline.
- `local_messages`: Indexes: `id, matchId, senderId, status, timestamp, [matchId+timestamp]`.
  Stores all local chat history. When a peer is blocked, `db.deleteMessagesForMatch(matchId)` immediately purges the chat history from the device.

---

## 4. Zero-Friction Demo Mode (Works Out-Of-The-Box Without Supabase)
In `src/services/supabase.ts`, if `VITE_SUPABASE_URL` is not provided in `.env`, the app seamlessly activates the built-in offline simulation layer:
- Pre-seeded campus profiles (Elena, Sophia, Alex, Marcus).
- Local storage state management for matches, blocks, and reports.
- Emulated WebRTC signaling across browser tabs using the HTML5 `BroadcastChannel` API (`jud_p2p_channel_${matchId}`).

### Connecting Live Supabase:
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Run `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor. The app will immediately switch to live cloud synchronization!
