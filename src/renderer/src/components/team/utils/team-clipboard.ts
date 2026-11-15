export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false
  }

  if (typeof window !== 'undefined' && window.api?.ui?.writeClipboardText) {
    try {
      await window.api.ui.writeClipboardText(text)
      return true
    } catch {
      // Fall through to browser clipboard APIs below
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to execCommand fallback below
    }
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      const copied =
        typeof document.execCommand === 'function' ? document.execCommand('copy') : false
      return copied
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }

  return false
}
