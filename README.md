# Markdown Editor

A modern, feature-rich markdown editor built with React, TypeScript, and CodeMirror 6.

## Features

- **Two-Pane Layout**: Edit markdown on the left, see live preview on the right
- **Synchronized Scrolling**: Both panes scroll together for seamless editing
- **Rich Toolbar**: Format text with bold, italic, strikethrough, lists, blockquotes, code blocks, links, and images
- **Undo/Redo**: Full history support with undo and redo functionality
- **File Operations**: Save your markdown files locally or open existing files
- **Syntax Highlighting**: Code blocks are syntax highlighted for better readability
- **Dark Theme**: Beautiful dark theme for the editor pane

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open your browser to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Toolbar Actions

- **Undo/Redo**: Click the arrow buttons to undo or redo changes
- **Bold/Italic/Strikethrough**: Click the formatting buttons to insert markdown syntax
- **Lists**: Insert bulleted or numbered lists
- **Blockquote**: Insert a blockquote
- **Code Block**: Insert a code block with syntax highlighting
- **Link**: Insert a markdown link (prompts for URL and text)
- **Image**: Insert an image (prompts for URL and alt text)
- **Open**: Open a `.md` file from your computer
- **Save**: Download the current markdown as a `.md` file

### Keyboard Shortcuts

- `Ctrl+Z` / `Cmd+Z`: Undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`: Redo
- Standard CodeMirror shortcuts are supported

## Technology Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **CodeMirror 6**: Code editor
- **React Markdown**: Markdown rendering
- **React Syntax Highlighter**: Code syntax highlighting
- **Vite**: Build tool and dev server

## Project Structure

```
src/
  components/
    Editor.tsx      # CodeMirror editor component
    Preview.tsx     # Markdown preview component
    Toolbar.tsx     # Toolbar with formatting buttons
  App.tsx           # Main application component
  main.tsx          # Application entry point
```

## License

MIT
