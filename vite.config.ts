import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate React and React DOM
          'react-vendor': ['react', 'react-dom'],
          // CodeMirror packages
          'codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/lang-markdown',
            '@codemirror/theme-one-dark'
          ],
          // Markdown processing libraries
          'markdown': [
            'react-markdown',
            'remark-gfm',
            'remark-breaks'
          ],
          // Syntax highlighter (large library)
          'syntax-highlighter': ['react-syntax-highlighter'],
          // Icons library
          'icons': ['lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase limit to 1MB for better visibility
  }
})
