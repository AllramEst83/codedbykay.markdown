import type { Text as YText } from 'yjs'
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
  reorderTabs: (fromIndex: number, toIndex: number) => void
  isTabDirty: (tabId: string) => boolean
  hasPendingIncomingChange: (tabId: string) => boolean
  /** Returns the Yjs text type backing a tab's content, or undefined for legacy ('plain') tabs. */
  getYText: (tabId: string) => YText | undefined
  saveState: Map<string, 'saving' | 'saved' | 'idle'>
  syncState: SyncState
}

export interface TabsProviderProps {
  children: React.ReactNode
}

