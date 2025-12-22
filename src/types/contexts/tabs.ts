import { TabData, SyncState } from '../services'

export interface TabsContextType {
  tabs: TabData[]
  activeTabId: string | null
  addTab: (initialContent?: string, initialTitle?: string) => string
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
  updateTabTitle: (tabId: string, title: string) => void
  saveTab: (tabId: string) => void
  saveState: Map<string, 'saving' | 'saved' | 'idle'>
  syncState: SyncState
}

export interface TabsProviderProps {
  children: React.ReactNode
}

