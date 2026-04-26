import { useEffect } from 'react'
import { useCommandRegistry } from '../../hooks/useCommandRegistry.js'
import Kbd from './Kbd.jsx'

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName?.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function eventMatchesShortcut(event, shortcut) {
  if (!shortcut) {
    return false
  }

  const tokens = shortcut.split('+')
  const normalizedKey = event.key.length === 1 ? event.key.toUpperCase() : event.key
  let keyToken = null

  for (const token of tokens) {
    if (token === 'Mod') {
      if (!(event.metaKey || event.ctrlKey)) {
        return false
      }
    } else if (token === 'Shift') {
      if (!event.shiftKey) {
        return false
      }
    } else if (token === 'Alt') {
      if (!event.altKey) {
        return false
      }
    } else {
      keyToken = token
    }
  }

  if (!keyToken) {
    return false
  }

  if (keyToken === 'Space') {
    return event.code === 'Space' || event.key === ' '
  }

  return normalizedKey === keyToken || event.code === keyToken
}

function FooterBar({ bottomOffsetClassName = 'bottom-0' }) {
  const { footerActions, isCommandBarOpen } = useCommandRegistry()

  useEffect(() => {
    function handleKeyDown(event) {
      if (isCommandBarOpen) {
        return
      }

      const matchingAction = footerActions.find((action) => {
        if (!action?.shortcut || action.disabled) {
          return false
        }

        if (shortcutIsSearch(action.shortcut)) {
          return false
        }

        if (isTypingTarget(event.target) && !action.allowInInput) {
          return false
        }

        return eventMatchesShortcut(event, action.shortcut)
      })

      if (!matchingAction) {
        return
      }

      event.preventDefault()
      matchingAction.action?.()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [footerActions, isCommandBarOpen])

  if (!footerActions.length) {
    return null
  }

  return (
    <div className={`fixed inset-x-0 z-[55] ${bottomOffsetClassName}`}>
      <div className="border-t border-[var(--border)] bg-[rgba(9,9,11,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {footerActions.map((action) => (
            <div
              key={action.id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(12,12,14,0.72)] px-3 py-2 text-[12px] text-zinc-300"
            >
              <Kbd>{action.displayShortcut ?? action.shortcut}</Kbd>
              <span className="whitespace-nowrap">{action.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function shortcutIsSearch(shortcut) {
  return shortcut === 'Mod+K'
}

export default FooterBar
