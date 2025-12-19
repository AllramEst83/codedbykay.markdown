import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useTabs } from '../contexts/TabsContext'
import { useModal } from '../contexts/ModalContext'
import { getAllStoredImages, deleteImage } from '../utils/imageStorage'
import { X, Trash2, Eye, Image as ImageIcon } from 'lucide-react'
import type { ImageManagerProps, StoredImage } from '../types/components'
import './ImageManager.css'

const ImageManager = ({ isOpen, onClose }: ImageManagerProps) => {
  const { theme } = useTheme()
  const { tabs, updateTabContent } = useTabs()
  const { showModal } = useModal()
  const [images, setImages] = useState<StoredImage[]>([])
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState<StoredImage | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load images when modal opens
  useEffect(() => {
    if (isOpen) {
      loadImages()
    } else {
      // Clean up preview when closing
      setPreviewImage(null)
    }
  }, [isOpen])

  const loadImages = useCallback(async () => {
    setLoading(true)
    try {
      const storedImages = await getAllStoredImages()
      setImages(storedImages)
    } catch (error) {
      console.error('Failed to load images:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDelete = useCallback(async (imageId: string) => {
    if (deletingId) return // Prevent double deletion
    
    // Find the image to get its filename for the confirmation message
    const image = images.find(img => img.id === imageId)
    const imageName = image?.filename || 'this image'
    
    // Confirm deletion using modal
    const result = await showModal({
      type: 'confirm',
      title: 'Delete Image',
      message: `Are you sure you want to delete "${imageName}"? This will remove it from all documents.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })
    
    // If user cancelled (result is null), don't delete
    if (result === null) return

    setDeletingId(imageId)
    try {
      // Delete from IndexedDB
      await deleteImage(imageId)
      
      // Remove image references from all tabs
      const imageUrl = `md-editor-image://${imageId}`
      tabs.forEach((tab) => {
        // Remove markdown image references: ![alt](md-editor-image://id)
        const imagePattern = new RegExp(`!\\[([^\\]]*)\\]\\(${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g')
        const updatedContent = tab.content.replace(imagePattern, '')
        if (updatedContent !== tab.content) {
          updateTabContent(tab.id, updatedContent)
        }
      })
      
      // Reload images list
      await loadImages()
      
      // Close preview if this image was being previewed
      if (previewImage?.id === imageId) {
        setPreviewImage(null)
      }
    } catch (error) {
      console.error('Failed to delete image:', error)
      await showModal({
        type: 'alert',
        title: 'Error',
        message: 'Failed to delete image. Please try again.',
        confirmText: 'OK'
      })
    } finally {
      setDeletingId(null)
    }
  }, [tabs, updateTabContent, previewImage, loadImages, images, showModal])

  const handlePreview = useCallback((image: StoredImage) => {
    setPreviewImage(image)
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null)
        } else {
          onClose()
        }
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, previewImage, onClose])

  if (!isOpen) return null

  return (
    <div className="image-manager-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget && !previewImage) {
        onClose()
      }
    }}>
      <div className="image-manager-container" data-theme={theme}>
        {previewImage ? (
          <div className="image-manager-preview">
            <div className="image-manager-preview-header">
              <div className="image-manager-preview-info">
                <h3>{previewImage.filename}</h3>
                <span className="image-manager-preview-meta">
                  {formatFileSize(previewImage.size)} • {formatDate(previewImage.timestamp)}
                </span>
              </div>
              <div className="image-manager-preview-actions">
                <button
                  className="image-manager-button image-manager-button-danger"
                  onClick={() => handleDelete(previewImage.id)}
                  disabled={deletingId === previewImage.id}
                  title="Delete Image"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className="image-manager-button"
                  onClick={() => setPreviewImage(null)}
                  title="Close Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="image-manager-preview-content">
              <img 
                src={previewImage.dataUrl} 
                alt={previewImage.filename}
                className="image-manager-preview-img"
              />
            </div>
          </div>
        ) : (
          <div className="image-manager-content">
            <div className="image-manager-header">
              <h2 className="image-manager-title">Image Manager</h2>
              <button
                className="image-manager-close"
                onClick={onClose}
                title="Close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {loading ? (
              <div className="image-manager-loading">
                <ImageIcon size={32} className="image-manager-loading-icon" />
                <p>Loading images...</p>
              </div>
            ) : images.length === 0 ? (
              <div className="image-manager-empty">
                <ImageIcon size={48} className="image-manager-empty-icon" />
                <p>No images stored</p>
                <span className="image-manager-empty-hint">Add images using the image button in the toolbar</span>
              </div>
            ) : (
              <>
                <div className="image-manager-stats">
                  <span>{images.length} {images.length === 1 ? 'image' : 'images'}</span>
                </div>
                <div className="image-manager-grid">
                  {images.map((image) => (
                    <div key={image.id} className="image-manager-item">
                      <div className="image-manager-item-image-container">
                        <img
                          src={image.dataUrl}
                          alt={image.filename}
                          className="image-manager-item-image"
                          loading="lazy"
                        />
                        <div className="image-manager-item-overlay">
                          <button
                            className="image-manager-item-button"
                            onClick={() => handlePreview(image)}
                            title="View"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            className="image-manager-item-button image-manager-item-button-danger"
                            onClick={() => handleDelete(image.id)}
                            disabled={deletingId === image.id}
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="image-manager-item-info">
                        <div className="image-manager-item-filename" title={image.filename}>
                          {image.filename}
                        </div>
                        <div className="image-manager-item-meta">
                          {formatFileSize(image.size)} • {formatDate(image.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageManager

