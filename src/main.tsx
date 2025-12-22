import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { TabsProvider } from './contexts/TabsContext.tsx'
import { ModalProvider } from './contexts/ModalContext.tsx'
import AuthBootstrap from './components/auth/AuthBootstrap.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TabsProvider>
        <ModalProvider>
          <AuthBootstrap />
          <App />
        </ModalProvider>
      </TabsProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
