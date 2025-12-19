export interface TabData {
  id: string
  title: string
  content: string
  lastSaved?: number
}

export interface TabMetadata {
  tabIds: string[]
  activeTabId: string | null
}

