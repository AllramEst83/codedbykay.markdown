import { useState, useEffect } from 'react'

/**
 * Hook to detect mobile devices and keyboard visibility
 * Returns whether device is mobile, if keyboard is visible, and keyboard offset for positioning
 */
export function useMobileKeyboard() {
  const [isMobile, setIsMobile] = useState(false)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)

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

    // Detect keyboard visibility and calculate offset for positioning toolbar
    let lastKeyboardState = false
    let lastOffset = 0

    const updateKeyboardState = () => {
      if (!window.visualViewport) {
        // Fallback: check if an input/textarea is focused
        const activeElement = document.activeElement
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true'
        )
        setIsKeyboardVisible(isInputFocused || false)
        setKeyboardOffset(0)
        return
      }

      const viewportHeight = window.visualViewport.height
      const windowHeight = window.innerHeight
      const viewportTop = window.visualViewport.offsetTop || 0
      const heightDifference = windowHeight - viewportHeight

      // Keyboard is considered visible if viewport height decreased significantly
      // (typically more than 150px on mobile devices)
      const keyboardThreshold = 150
      const keyboardVisible = heightDifference > keyboardThreshold

      // Calculate the offset: the distance from the bottom of the visual viewport to the bottom of the window
      // This tells us where to position the toolbar (above the keyboard)
      // We use heightDifference directly as it represents the keyboard height
      // On some browsers (like iOS Safari), the viewport may also scroll (offsetTop), 
      // but we position relative to the visual viewport bottom, so heightDifference is sufficient
      const offset = keyboardVisible ? heightDifference : 0

      // Only update if state actually changed to avoid unnecessary re-renders
      if (keyboardVisible !== lastKeyboardState || Math.abs(offset - lastOffset) > 1) {
        setIsKeyboardVisible(keyboardVisible)
        setKeyboardOffset(offset)
        lastKeyboardState = keyboardVisible
        lastOffset = offset
      }
    }

    // Use visualViewport API if available (better for mobile)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState)
      window.visualViewport.addEventListener('scroll', updateKeyboardState)
      // Initial check
      updateKeyboardState()
    } else {
      // Fallback for browsers without visualViewport API
      window.addEventListener('resize', updateKeyboardState)
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
          updateKeyboardState()
        }, 300)
      }
    }

    const handleBlur = () => {
      // Delay to allow keyboard to hide
      setTimeout(() => {
        updateKeyboardState()
      }, 300)
    }

    // Listen for focus/blur on all input elements
    document.addEventListener('focusin', handleFocus)
    document.addEventListener('focusout', handleBlur)

    return () => {
      window.removeEventListener('resize', checkMobile)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardState)
        window.visualViewport.removeEventListener('scroll', updateKeyboardState)
      } else {
        window.removeEventListener('resize', updateKeyboardState)
      }
      document.removeEventListener('focusin', handleFocus)
      document.removeEventListener('focusout', handleBlur)
    }
  }, [])

  return { isMobile, isKeyboardVisible, keyboardOffset }
}
