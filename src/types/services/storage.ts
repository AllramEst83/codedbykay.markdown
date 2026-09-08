export interface TabData {
  id: string
  title: string
  content: string
  lastSaved?: number
  lastSavedServerTime?: boolean
  cloudId?: string
  cloudUpdatedAt?: string
  /**
   * 'yjs' once this note's content is backed by a Yjs CRDT doc (see yjsDocService).
   * Undefined/'plain' means the legacy plain-markdown-string sync path is still in use.
   */
  contentFormat?: 'plain' | 'yjs'
}

export interface TabMetadata {
  tabIds: string[]
  activeTabId: string | null
}

