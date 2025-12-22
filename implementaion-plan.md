## Implement Supabase Auth

> Supabase Auth is only necessary for synching notes between devices.

- [x] Set up Supabase in the project
- [ ] Set up Supabase Auth in the project
  - [ ] Login
  - [ ] Register
  - [ ] Logout
  - [ ] Forgot Password
  - [ ] Reset Password
  - [ ] Verify Email
- [ ] Setup Supabase realtime for synching notes between devices.
  - [ ] Create a new table for notes and enable realtime synchronization.
  - [ ] Encrypt/decrypt notes using "supabase/functions/\_shared/crypto.ts" on the backend.
  - [ ] Create CRUD endpoints/functions for all operations on the notes table and images storage. Realtime subscription has to be on the client side. These operations use the user token with the Supabase client on the server side.
- [ ] Use Zustand for state management (Auth state should persist across browser tabs and page refreshes).
- [ ] UI for Auth components
  - [ ] Login form
  - [ ] Register form
  - [ ] Login button
  - [ ] Forgot Password form
  - [ ] User profile button/icon
    - [ ] Logout button
    - [ ] Change password button
    - [ ] Delete account button (In red color and requires user to enter its email to confirm the action)

---

#### Register flow

- Once the user has registered the user is automatically signed in.

#### User experience

- The app can be used without requiring the use to signup or login.
- If the user does not login all tabs and content is stored locally in the browser with localstorage and IndexedDB.
- If the user logs in, all tabs and content is synced to the cloud and stored in the database.
- The storage hierarchy is as follows:

---

#### Architecture Guidelines

**⚠️ IMPORTANT: Supabase Client Usage**

- **ALWAYS** use the Supabase client (`supabase/client.ts`) to invoke Edge Functions
- **NEVER** use ordinary REST requests (fetch, axios, etc.) to call Supabase functions
- The Supabase client handles authentication, error handling, and proper request formatting automatically
- Example: Use `supabase.functions.invoke('function-name', { body: {...} })` instead of direct HTTP calls

---

#### Storage Hierarchy & Data Flow

**Priority Order (when user logs in with existing local notes):**

1. **Timestamp-based resolution**: Most recent `updated_at` wins for conflicts
2. **Merge strategy**: If same timestamp, merge unique content (append non-duplicate sections)
3. **Device priority**: If still conflicted, use device with most recent `last_synced_at`
4. **Silent merge**: No user notifications - automatic resolution happens in background

**Storage Locations:**

- **Local (unauthenticated)**: localStorage (tabs) + IndexedDB (images)
- **Cloud (authenticated)**: Supabase `notes` table + Supabase Storage bucket `user-images/{user_id}/`
- **Hybrid (authenticated)**: Local cache + Cloud sync with realtime updates

---

#### Database Schema Design

**1. `notes` table:**
CREATE TABLE notes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
title TEXT NOT NULL,
content TEXT NOT NULL, -- Encrypted on backend via Edge Function
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
last_synced_at TIMESTAMPTZ,
device_id TEXT, -- For tracking which device last modified
local_id TEXT, -- Maps to local tab ID for initial sync
CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own notes
CREATE POLICY "Users can view own notes" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON notes FOR DELETE USING (auth.uid() = user_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- Indexes for performance
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX idx_notes_local_id ON notes(local_id) WHERE local_id IS NOT NULL;
**2. Supabase Storage for Images:**

- **Bucket**: `user-images` (private, user-scoped)
- **Path structure**: `{user_id}/{image_id}.{ext}`
- **Storage policies**: Users can only access their own images
- **Migration**: Upload existing IndexedDB images to Supabase Storage on first login

---

#### Sync Implementation Plan

**Phase 1: Database Setup**

- [ ] Create `notes` table migration in `supabase/migrations/` directory
  - [ ] Migration file should include table creation, RLS policies, indexes, and realtime enablement
  - [ ] Use proper migration naming convention (e.g., `YYYYMMDDHHMMSS_create_notes_table.sql`)
- [ ] Set up Row Level Security (RLS) policies (included in migration)
- [ ] Enable Realtime subscriptions on `notes` table (included in migration)
- [ ] Create Supabase Storage bucket `user-images`
- [ ] Set up Storage policies for user-scoped access
- [ ] Create Edge Functions for CRUD operations on notes table and images storage
  - [ ] Encrypt/decrypt notes using `supabase/functions/_shared/crypto.ts` on the backend
  - [ ] Create CRUD endpoints/functions for all operations on the notes table and images storage
  - [ ] Realtime subscription has to be on the client side
  - [ ] These DB and Storage operations use the user token with the Supabase client for RLS and Storage policies on the server side
  - [ ] **IMPORTANT**: Always invoke these functions using `supabase.functions.invoke()` from `src/supabase/client.ts`, never use direct REST requests

**Phase 2: Sync Service Architecture**

- [ ] Install and configure Zustand for state management
- [ ] Create `src/services/syncService.ts` - Main sync orchestration
- [ ] Create `src/services/cloudStorageService.ts` - Supabase operations
- [ ] Create `src/services/conflictResolver.ts` - Conflict resolution logic
- [ ] Create `src/services/imageSyncService.ts` - Image upload/download
- [ ] Update `localStorageService.ts` to work with sync service
- [ ] Create device ID generation/storage utility

**Phase 3: Initial Sync (Login Flow)**

- [ ] Detect existing local notes on login
- [ ] Fetch all user notes from Supabase
- [ ] Compare local vs cloud notes:
  - [ ] Identify local-only notes (upload to cloud)
  - [ ] Identify cloud-only notes (download to local)
  - [ ] Identify conflicts (same note exists in both)
- [ ] Resolve conflicts using timestamp-based strategy
- [ ] Map local tab IDs to cloud note IDs
- [ ] Update local storage with synced data
- [ ] Upload IndexedDB images to Supabase Storage

**Phase 4: Realtime Sync**

- [ ] Subscribe to `notes` table changes for current user
- [ ] Handle INSERT events (new note from another device)
- [ ] Handle UPDATE events (note modified on another device)
- [ ] Handle DELETE events (note deleted on another device)
- [ ] Apply changes to local storage automatically
- [ ] Update UI reactively when remote changes occur

**Phase 5: Bidirectional Sync**

- [ ] Intercept local save operations
- [ ] Push local changes to Supabase (with debouncing)
- [ ] Handle offline scenarios (queue changes, sync when online)
- [ ] Implement sync status indicator in UI
- [ ] Handle sync errors gracefully

**Phase 6: Image Sync**

- [ ] Upload images to Supabase Storage on note save
- [ ] Update markdown content to reference Supabase Storage URLs (not IndexedDB references)
- [ ] Implement local image caching layer:
  - [ ] Cache images in IndexedDB keyed by Supabase Storage URL
  - [ ] On image load: Check IndexedDB cache first, then fetch from Supabase Storage if not cached
  - [ ] Background prefetch: Cache images when syncing notes
  - [ ] Cache invalidation: Update/delete cache when images are modified/deleted
- [ ] Handle image deletion across devices (delete from Supabase Storage, clear local cache)
- [ ] Clean up unused images (orphaned images not referenced in any note)
- [ ] Handle offline image access (serve from IndexedDB cache when offline)

---

#### Conflict Resolution Algorithm

**When same note exists locally and in cloud:**

1. **Compare timestamps:**

   - If `local.updated_at > cloud.updated_at`: Local wins, upload to cloud
   - If `cloud.updated_at > local.updated_at`: Cloud wins, update local
   - If timestamps are equal: Proceed to step 2

2. **Compare content hash:**

   - If content is identical: No action needed
   - If content differs: Proceed to step 3

3. **Merge strategy:**

   - Compare content line-by-line or section-by-section
   - Keep unique content from both versions
   - Append merged content (local changes + cloud changes)
   - Update both local and cloud with merged version
   - Use most recent timestamp + 1ms to ensure sync

4. **Device priority (last resort):**
   - If still conflicted, use device with most recent `last_synced_at`
   - If no sync history, use local version (assume current device is primary)

**Implementation:**

```typescript
function resolveConflict(localNote: TabData, cloudNote: CloudNote): TabData {
if (localNote.lastSaved > cloudNote.updated_at) {
return localNote;
}
if (cloudNote.updated_at > localNote.lastSaved) {
return cloudNote;
}
if (localNote.updated_at === cloudNote.updated_at) {
    return mergeContent(localNote, cloudNote);
}
```

#### Data Migration Strategy

**On First Login:**

1. Generate unique device ID and store in localStorage
2. Load all local notes from localStorage
3. Load all cloud notes from Supabase
4. For each local note:
   - Check if exists in cloud (by `local_id` mapping or content hash)
   - If not exists: Create new cloud note with `local_id` field
   - If exists: Resolve conflict using algorithm above
5. For each cloud note:
   - Check if exists locally (by `local_id` or cloud note ID)
   - If not exists: Create new local tab
   - If exists: Already handled in step 4
6. Upload all IndexedDB images to Supabase Storage
7. Update markdown content to reference Supabase Storage URLs (recommended approach)
   - **Why Supabase Storage URLs instead of local IndexedDB references:**
     - Single source of truth: No sync conflicts or duplication
     - Smaller note content: URLs are much smaller than base64 or large references
     - Better sync performance: Only URLs need syncing, not binary data
     - CDN benefits: Supabase Storage provides fast global delivery
     - Simpler conflict resolution: Only note content needs merging, not images
   - **Local caching strategy:**
     - Cache images in IndexedDB for offline access (keyed by Supabase Storage URL)
     - On image load: Check IndexedDB cache first, fallback to Supabase Storage
     - Background sync: Prefetch and cache images when online
     - Cache invalidation: Update cache when image is modified/deleted
8. Enable realtime subscription

**On Subsequent Logins:**

1. Quick sync: Only sync notes modified since last sync (`last_synced_at`)
2. Full sync: If `last_synced_at` is too old (> 7 days) or missing

---

#### Security Considerations

- [ ] Always enable JWT token true in supabase/config.toml for all functions except for register and login functions.
- [ ] Encrypt note content on backend (supabase/functions/\_shared/crypto.ts)
- [ ] Use Supabase RLS to ensure users only access their own notes (This requires the supabase client to be using the user auth token to communicate with supabase DB and RLS policies to be enabled on the notes table)
- [ ] Encrypt images in Supabase Storage (optional, but recommended)
- [ ] Store encryption keys securely (Supabase Vault or environment variables)
- [ ] Implement rate limiting on sync operations
- [ ] Validate note content before saving (prevent XSS, size limits)

---

#### Performance Optimizations

- [ ] Batch sync operations (upload multiple notes in single transaction)
- [ ] Implement incremental sync (only sync changed notes. This is vital for performance and scalability.)
- [ ] Use Supabase Storage CDN for image delivery
- [ ] Compress note content before upload (if large)
- [ ] Debounce realtime updates to prevent UI flicker

---

#### Error Handling

- [ ] Handle network failures gracefully
- [ ] Queue failed sync operations for retry
- [ ] Show sync status in UI (syncing, synced, error)
- [ ] Implement exponential backoff for retries
- [ ] Log sync errors for debugging
- [ ] Handle Supabase quota limits
- [ ] Handle storage quota limits (localStorage, IndexedDB, Supabase)

---

#### Testing Strategy

- [ ] **Auth**: Login, Register, Logout, Session persistence
- [ ] **Sync**:
  - [ ] Login with existing local notes (should merge)
  - [ ] Login with existing cloud notes (should download)
  - [ ] Realtime updates across devices
  - [ ] Conflict resolution (same note edited on two devices)
- [ ] **Offline**:
  - [ ] View notes/images offline (from cache)
  - [ ] Edit offline -> Sync on reconnect
- [ ] **Images**:
  - [ ] Upload/Download
  - [ ] Cache hits (verify no network request for cached images)

---

## Summary

**Storage approach:**

- Use Supabase `notes` table for note content (encrypted on backend)
- Use Supabase Storage for images (better performance than base64 in DB)
- Keep local cache for offline access and performance (localStorage + IndexedDB)

**Conflict resolution:**

- Timestamp-based (most recent wins)
- Automatic merge for same-timestamp conflicts
- Silent resolution (no user notifications)

**Sync strategy:**

- Initial sync on login (merge local + cloud)
- Realtime sync for ongoing changes
- Bidirectional sync (local ↔ cloud)
- Offline queue for when network is unavailable

This plan supports automatic, silent syncing across devices without user intervention.

```

```
