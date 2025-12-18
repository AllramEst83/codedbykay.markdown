import { useState, useEffect } from 'react'

/**
 * Hook to detect mobile devices and keyboard visibility
 * Returns whether device is mobile and if keyboard is visible
 */
export function useMobileKeyboard() {
  const [isMobile, setIsMobile] = useState(false)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768
      setIsMobile(isMobileDevice)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    // Detect keyboard visibility on mobile
    // This works by comparing viewport height changes
    let lastKeyboardState = false

    const handleViewportChange = () => {
      if (!window.visualViewport) {
        // Fallback: check if an input/textarea is focused
        const activeElement = document.activeElement
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true'
        )
        setIsKeyboardVisible(isInputFocused || false)
        return
      }

      const currentHeight = window.visualViewport.height
      const windowHeight = window.innerHeight
      const heightDifference = windowHeight - currentHeight

      // Keyboard is considered visible if viewport height decreased significantly
      // (typically more than 150px on mobile devices)
      const keyboardThreshold = 150
      const keyboardVisible = heightDifference > keyboardThreshold

      // Only update if state actually changed to avoid unnecessary re-renders
      if (keyboardVisible !== lastKeyboardState) {
        setIsKeyboardVisible(keyboardVisible)
        lastKeyboardState = keyboardVisible
      }
    }

    // Use visualViewport API if available (better for mobile)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange)
      window.visualViewport.addEventListener('scroll', handleViewportChange)
    } else {
      // Fallback for browsers without visualViewport API
      window.addEventListener('resize', handleViewportChange)
    }

    // Also listen for focus events on input/textarea elements
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      // Only handle focus for contenteditable elements (CodeMirror editor)
      if (target && (
        target.getAttribute('contenteditable') === 'true' ||
        target.closest('[contenteditable="true"]')
      )) {
        // Small delay to allow keyboard to appear
        setTimeout(() => {
          if (window.visualViewport) {
            const currentHeight = window.visualViewport.height
            const windowHeight = window.innerHeight
            const heightDifference = windowHeight - currentHeight
            setIsKeyboardVisible(heightDifference > 150)
            lastKeyboardState = heightDifference > 150
          } else {
            setIsKeyboardVisible(true)
            lastKeyboardState = true
          }
        }, 300)
      }
    }

    const handleBlur = () => {
      // Delay to allow keyboard to hide
      setTimeout(() => {
        setIsKeyboardVisible(false)
        lastKeyboardState = false
      }, 300)
    }

    // Listen for focus/blur on all input elements
    document.addEventListener('focusin', handleFocus)
    document.addEventListener('focusout', handleBlur)

    return () => {
      window.removeEventListener('resize', checkMobile)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange)
        window.visualViewport.removeEventListener('scroll', handleViewportChange)
      } else {
        window.removeEventListener('resize', handleViewportChange)
      }
      document.removeEventListener('focusin', handleFocus)
      document.removeEventListener('focusout', handleBlur)
    }
  }, [])

  return { isMobile, isKeyboardVisible }
}
