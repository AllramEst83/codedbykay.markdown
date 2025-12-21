## Implement Supabase Auth

> Supabase Auth is only necessary for synching notes between devices.

- [x] Set up Supabase in the project
- [ ] Set up Supabase Auth in the project
  - [ ] Move Auth service from LLM project to this project (src\contexts\AuthContext.ts. Improve and refine fro this project.)
  - [ ] Login
  - [ ] Register
  - [ ] Logout
  - [ ] Forgot Password
  - [ ] Reset Password
  - [ ] Verify Email
- [ ] Setup Supabase realtime for synching notes between devices.
  - [ ] Create a new table for notes and enable realtime synchronization.
  - [ ] Encrypt/decrypt notes using "supabase_shared\crypto.ts" on the backend.
- [ ] Use Zustand for state management for Auth.
- [ ] UI for Auth components
  - [ ] Login form
  - [ ] Register form
  - [ ] Logout button
  - [ ] Login button
  - [ ] Forgot Password form
  - [ ] User profile button
    - [ ] Delete account button
    - [ ] Change password button

---

#### User experience

- The app can be used without requiring the use to signup or login.
- If the user does not login all tabs and content is stored locally in the browser.
- If the user logs in, all tabs and content is synced to the cloud and stored in the database.
- The storage hierarchy is as follows:

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
CREATE INDEX idx_notes_local_id ON notes(local_id) WHERE local_id IS NOT NULL;**2. Supabase Storage for Images:**

- **Bucket**: `user-images` (private, user-scoped)
- **Path structure**: `{user_id}/{image_id}.{ext}`
- **Storage policies**: Users can only access their own images
- **Migration**: Upload existing IndexedDB images to Supabase Storage on first login

---

#### Sync Implementation Plan

**Phase 1: Database Setup**

- [ ] Create `notes` table migration
- [ ] Set up Row Level Security (RLS) policies
- [ ] Enable Realtime subscriptions on `notes` table
- [ ] Create Supabase Storage bucket `user-images`
- [ ] Set up Storage policies for user-scoped access
- [ ] Create Edge Function for encryption/decryption (`supabase/functions/encrypt-note/`)

**Phase 2: Sync Service Architecture**

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
- [ ] Download images from Supabase Storage when syncing notes
- [ ] Update markdown image references to use Supabase Storage URLs
- [ ] Handle image deletion across devices
- [ ] Clean up unused images (orphaned images not referenced in any note)

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
7. Update markdown content to reference Supabase Storage URLs
8. Enable realtime subscription

**On Subsequent Logins:**

1. Quick sync: Only sync notes modified since last sync (`last_synced_at`)
2. Full sync: If `last_synced_at` is too old (> 7 days) or missing

---

#### Security Considerations

- [ ] Encrypt note content on backend (Edge Function)
- [ ] Use Supabase RLS to ensure users only access their own notes
- [ ] Encrypt images in Supabase Storage (optional, but recommended)
- [ ] Store encryption keys securely (Supabase Vault or environment variables)
- [ ] Implement rate limiting on sync operations
- [ ] Validate note content before saving (prevent XSS, size limits)

---

#### Performance Optimizations

- [ ] Batch sync operations (upload multiple notes in single transaction)
- [ ] Implement incremental sync (only sync changed notes)
- [ ] Use Supabase Storage CDN for image delivery
- [ ] Compress note content before upload (if large)
- [ ] Implement pagination for users with many notes
- [ ] Cache frequently accessed notes locally
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

#### Testing Checklist

- [ ] Test login with existing local notes
- [ ] Test login with existing cloud notes
- [ ] Test login with conflicting notes (same note, different content)
- [ ] Test realtime sync (open app on two devices, edit on one)
- [ ] Test offline mode (make changes offline, sync when online)
- [ ] Test image sync (upload image on one device, verify on another)
- [ ] Test note deletion sync
- [ ] Test large note sync (notes with many images, large content)
- [ ] Test concurrent edits (edit same note on two devices simultaneously)
- [ ] Test logout and re-login (verify data persists)

```

## Summary

**Storage approach:**
- Use Supabase `notes` table for note content (encrypted on backend)
- Use Supabase Storage for images (better performance than base64 in DB)
- Keep local cache for offline access and performance

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
