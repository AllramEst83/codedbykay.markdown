export interface TabData {
  id: string
  title: string
  content: string
  lastSaved?: number
  lastSavedServerTime?: boolean
  cloudId?: string
  cloudUpdatedAt?: string
}

export interface TabMetadata {
  tabIds: string[]
  activeTabId: string | null
}

