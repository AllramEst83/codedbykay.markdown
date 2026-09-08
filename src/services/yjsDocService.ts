/**
 * Yjs Doc Service
 *
 * Single source of truth for per-note Y.Doc instances. This is the ONLY place
 * `new Y.Doc()` should ever be called - both the editor (Editor.tsx, via
 * TabsContext) and the background sync layer (syncService.ts) must go through
 * this registry so they always share the same live doc for a given tab id and
 * never race each other into creating two independent docs for the same note.
 *
 * IMPORTANT - undo-history safety: Y.UndoManager tracks transactions whose
 * origin is `null` by default (Yjs default: `trackedOrigins = new Set([null])`),
 * and y-codemirror.next's yCollab plugin additionally tracks its own internal
 * sync-config origin for local CodeMirror edits. Any transaction applied here
 * programmatically (a remote merge, or seeding legacy plaintext) MUST use an
 * explicit non-null origin that is NOT one of those tracked origins, or it
 * would incorrectly become undoable via Ctrl+Z. Do not omit the origin
 * argument on `doc.transact(...)` / `Y.applyUpdate(...)` calls in this file.
 */
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

const DOC_NAME_PREFIX = 'y-note-'
const CONTENT_TEXT_NAME = 'content'
const META_MAP_NAME = 'meta'
const TITLE_KEY = 'title'

/** Origin used for Y.Doc transactions that apply a remote (cloud) update. Never tracked by undo. */
export const REMOTE_UPDATE_ORIGIN = 'remote'
/** Origin used when seeding a doc from legacy plaintext on first open. Never tracked by undo. */
const SEED_ORIGIN = 'seed'
/** Origin used for local metadata writes (e.g. title) made outside the editor. Never tracked by undo. */
const META_WRITE_ORIGIN = 'meta-write'

export interface NoteDocHandle {
  doc: Y.Doc
  ytext: Y.Text
  ymeta: Y.Map<string>
  persistence: IndexeddbPersistence
  /** Resolves once this doc's local IndexedDB history has finished loading. */
  whenSynced: Promise<void>
}

const registry = new Map<string, NoteDocHandle>()

function createHandle(tabId: string): NoteDocHandle {
  const doc = new Y.Doc()
  const ytext = doc.getText(CONTENT_TEXT_NAME)
  const ymeta = doc.getMap<string>(META_MAP_NAME)
  const persistence = new IndexeddbPersistence(`${DOC_NAME_PREFIX}${tabId}`, doc)

  const handle: NoteDocHandle = {
    doc,
    ytext,
    ymeta,
    persistence,
    whenSynced: persistence.whenSynced.then(() => undefined),
  }
  registry.set(tabId, handle)
  return handle
}

/** Returns the note's Y.Doc handle, creating (and starting IndexedDB load for) it if needed. */
export function getOrCreateNoteDoc(tabId: string): NoteDocHandle {
  return registry.get(tabId) ?? createHandle(tabId)
}

export function getNoteDocIfExists(tabId: string): NoteDocHandle | undefined {
  return registry.get(tabId)
}

/**
 * Seeds a note's doc from legacy plain-markdown content. No-ops if the doc
 * already has content or a title (never clobbers real data). Waits for the
 * local IndexedDB load to finish first - inserting into `ytext` before that
 * completes would race with the persisted history load and duplicate content,
 * since two concurrent Y.Text inserts at the same position both survive
 * (CRDTs don't overwrite, they merge).
 */
export async function seedFromPlainText(tabId: string, content: string, title: string): Promise<void> {
  const handle = getOrCreateNoteDoc(tabId)
  await handle.whenSynced

  if (handle.ytext.length > 0 || handle.ymeta.get(TITLE_KEY) !== undefined) {
    return
  }

  handle.doc.transact(() => {
    if (content) {
      handle.ytext.insert(0, content)
    }
    handle.ymeta.set(TITLE_KEY, title)
  }, SEED_ORIGIN)
}

/** Initializes a brand-new note's doc with initial content/title. Only call for genuinely new notes. */
export function seedNewNote(tabId: string, content: string, title: string): NoteDocHandle {
  const handle = getOrCreateNoteDoc(tabId)
  handle.doc.transact(() => {
    if (content) {
      handle.ytext.insert(0, content)
    }
    handle.ymeta.set(TITLE_KEY, title)
  }, SEED_ORIGIN)
  return handle
}

/**
 * Unconditionally replaces this note's content/title - used only to finish a
 * same-device legacy-note migration when further plain-mode edits landed while an
 * earlier `seedFromPlainText` call was still awaiting IndexedDB load (see
 * TabsContext's migration-to-Yjs flow). Safe ONLY because nothing else has ever
 * seen this doc yet at that point - on any doc with real remote history this would
 * look like a delete of someone else's concurrent edits.
 */
export function resetToPlainText(tabId: string, content: string, title: string): void {
  const handle = getOrCreateNoteDoc(tabId)
  handle.doc.transact(() => {
    if (handle.ytext.length > 0) {
      handle.ytext.delete(0, handle.ytext.length)
    }
    if (content) {
      handle.ytext.insert(0, content)
    }
    handle.ymeta.set(TITLE_KEY, title)
  }, SEED_ORIGIN)
}

/** Merges a remote Yjs update (base64-encoded) into the note's local doc. */
export function applyRemoteUpdate(tabId: string, base64: string): void {
  const handle = getOrCreateNoteDoc(tabId)
  Y.applyUpdate(handle.doc, base64ToBytes(base64), REMOTE_UPDATE_ORIGIN)
}

/** Encodes the note's full current doc state for upload, once local history has loaded. */
export async function encodeStateBase64(tabId: string): Promise<string> {
  const handle = getOrCreateNoteDoc(tabId)
  await handle.whenSynced
  return bytesToBase64(Y.encodeStateAsUpdate(handle.doc))
}

/** Best-effort current text - does not wait for IndexedDB load, safe for reactive UI mirrors only. */
export function getText(tabId: string): string {
  return getOrCreateNoteDoc(tabId).ytext.toString()
}

/** Best-effort current title - does not wait for IndexedDB load, safe for reactive UI mirrors only. */
export function getTitle(tabId: string): string | undefined {
  return getOrCreateNoteDoc(tabId).ymeta.get(TITLE_KEY)
}

/**
 * Writes the title into the doc's meta map. Safe to call before IndexedDB load
 * finishes - Y.Map keys use last-writer-wins by clock, not insert-order, so
 * there's no duplication hazard the way there is for Y.Text inserts.
 */
export function setTitle(tabId: string, title: string): void {
  const handle = getOrCreateNoteDoc(tabId)
  if (handle.ymeta.get(TITLE_KEY) === title) {
    return
  }
  handle.doc.transact(() => {
    handle.ymeta.set(TITLE_KEY, title)
  }, META_WRITE_ORIGIN)
}

/**
 * Notifies when the title changes due to a remote merge (not a local setTitle
 * call), so callers can reconcile UI state that mirrors the title outside the doc.
 */
export function onTitleChange(tabId: string, callback: (title: string) => void): () => void {
  const handle = getOrCreateNoteDoc(tabId)
  const observer = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
    if (transaction.origin === REMOTE_UPDATE_ORIGIN && event.keysChanged.has(TITLE_KEY)) {
      callback(handle.ymeta.get(TITLE_KEY) ?? '')
    }
  }
  handle.ymeta.observe(observer)
  return () => handle.ymeta.unobserve(observer)
}

function decodeVector(sv: Uint8Array): Map<number, number> {
  return Y.decodeStateVector(sv)
}

/** True if every client clock in `b` is already present (>=) in `a`. */
function dominates(a: Map<number, number>, b: Map<number, number>): boolean {
  for (const [client, clock] of b) {
    if ((a.get(client) ?? 0) < clock) {
      return false
    }
  }
  return true
}

async function getVectors(
  tabId: string,
  remoteBase64: string
): Promise<{ localSV: Map<number, number>; remoteSV: Map<number, number> }> {
  const handle = getOrCreateNoteDoc(tabId)
  await handle.whenSynced
  const remoteBytes = base64ToBytes(remoteBase64)
  return {
    localSV: decodeVector(Y.encodeStateVector(handle.doc)),
    remoteSV: decodeVector(Y.encodeStateVectorFromUpdate(remoteBytes)),
  }
}

/**
 * True if the remote update contains changes this doc doesn't have yet (i.e.
 * applying it would actually change local state). Never compare full encoded
 * states by byte-equality - two docs with identical logical content can still
 * serialize differently, so this compares state vectors instead.
 */
export async function hasNewRemoteState(tabId: string, remoteBase64: string): Promise<boolean> {
  const { localSV, remoteSV } = await getVectors(tabId, remoteBase64)
  return !dominates(localSV, remoteSV)
}

/** True if this doc has local changes the given remote state doesn't have yet (upload needed). */
export async function hasNewLocalState(tabId: string, remoteBase64: string): Promise<boolean> {
  const { localSV, remoteSV } = await getVectors(tabId, remoteBase64)
  return !dominates(remoteSV, localSV)
}

/** Frees the in-memory doc and destroys its IndexedDB store. Only call when the note is actually deleted. */
export function disposeNoteDoc(tabId: string): void {
  const handle = registry.get(tabId)
  if (!handle) {
    return
  }
  registry.delete(tabId)
  handle.persistence.destroy().catch((error) => {
    console.error('Failed to destroy note persistence:', tabId, error)
  })
  handle.doc.destroy()
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
