import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { TabsProvider } from './contexts/TabsContext.tsx'
import { ModalProvider } from './contexts/ModalContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TabsProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </TabsProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
