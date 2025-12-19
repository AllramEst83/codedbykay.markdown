import { useEffect, useRef, memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../contexts/ThemeContext'
import { getImageUrlForRendering } from '../utils/imageStorage'
import type { PreviewProps } from '../types/components'
import './Preview.css'

// Component to handle image URL conversion
const MarkdownImage = ({ src, alt, ...props }: { src?: string; alt?: string; [key: string]: any }) => {
  const [imageSrc, setImageSrc] = useState<string>(src || '')
  const [imageUrlCache] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (src && src.startsWith('md-editor-image://')) {
      // Check cache first
      const cached = imageUrlCache.get(src)
      if (cached) {
        setImageSrc(cached)
        return
      }
      
      // Convert custom URL to object URL
      getImageUrlForRendering(src).then((url) => {
        if (url) {
          imageUrlCache.set(src, url)
          setImageSrc(url)
        }
      }).catch(() => {
        // If image not found, keep original URL (will show broken image)
        setImageSrc(src)
      })
    } else {
      // For blob URLs, data URLs, or regular URLs, use as-is
      setImageSrc(src || '')
    }
  }, [src, imageUrlCache])
  
  return (
    <img 
      src={imageSrc} 
      alt={alt || ''} 
      {...props}
      style={{
        maxWidth: '100%',
        height: 'auto',
      }}
    />
  )
}

const PreviewComponent = ({ markdown, onScroll }: PreviewProps) => {
  const { previewTheme, theme } = useTheme()
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !onScroll) return

    const handleScroll = () => {
      onScroll(preview.scrollTop, preview.scrollHeight, preview.clientHeight)
    }

    preview.addEventListener('scroll', handleScroll)
    return () => {
      preview.removeEventListener('scroll', handleScroll)
    }
  }, [onScroll])

  const codeStyle = theme === 'dark' ? vscDarkPlus : oneLight

  // Ensure markdown is always a string
  const markdownString = typeof markdown === 'string' ? markdown : ''

  // Memoize remark plugins to avoid recreating on every render
  const remarkPlugins = useMemo(() => [remarkGfm, remarkBreaks], [])

  // Memoize components to avoid recreating on every render
  const components = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match
      
      // Ensure children is always a string
      const codeString = Array.isArray(children) 
        ? children.join('') 
        : typeof children === 'string' 
        ? children 
        : String(children || '')
      
      return !isInline && match ? (
        <SyntaxHighlighter
          style={codeStyle as { [key: string]: React.CSSProperties } | undefined}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {codeString.replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code 
          className={className} 
          style={{
            backgroundColor: previewTheme.codeBackground,
            color: previewTheme.codeTextColor,
          }}
          {...props}
        >
          {codeString}
        </code>
      )
    },
    img: MarkdownImage
  }), [codeStyle, previewTheme.codeBackground, previewTheme.codeTextColor])

  // Memoize urlTransform to avoid recreating on every render
  const urlTransform = useMemo(() => (url: string) => url, [])

  return (
    <div 
      ref={previewRef}
      className="preview-container"
      style={{
        backgroundColor: previewTheme.backgroundColor,
        color: previewTheme.textColor,
        '--preview-border-color': previewTheme.borderColor,
        '--preview-link-color': previewTheme.linkColor,
        '--preview-blockquote-color': previewTheme.blockquoteColor,
        '--preview-blockquote-border': previewTheme.blockquoteBorder,
        '--preview-table-border': previewTheme.tableBorder,
        '--preview-table-header-bg': previewTheme.tableHeaderBg,
        '--preview-code-bg': previewTheme.codeBackground,
        '--preview-code-color': previewTheme.codeTextColor,
        '--preview-h1-color': previewTheme.h1Color,
        '--preview-h2-color': previewTheme.h2Color,
        '--preview-h3-color': previewTheme.h3Color,
        '--preview-h4-color': previewTheme.h4Color,
      } as React.CSSProperties}
    >
      <div className="preview-content">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          urlTransform={urlTransform}
          components={components}
        >
          {markdownString}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// Memoize Preview to prevent unnecessary re-renders when markdown hasn't changed
const Preview = memo(PreviewComponent, (prevProps, nextProps) => {
  // Only re-render if markdown content changes (ignore onScroll reference changes)
  return prevProps.markdown === nextProps.markdown
})

Preview.displayName = 'Preview'

export default Preview
