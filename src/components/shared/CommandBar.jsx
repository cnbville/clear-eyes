import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useCommandRegistry } from '../../hooks/useCommandRegistry.js'
import Kbd from './Kbd.jsx'

function buildSearchValue(item) {
  const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ') : item.keywords ?? ''
  return `${item.label ?? ''} ${item.subtitle ?? ''} ${item.category ?? ''} ${keywords}`.toLowerCase()
}

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

function CommandBar() {
  const {
    closeCommandBar,
    commandItems,
    isCommandBarOpen,
    openCommandBar,
  } = useCommandRegistry()
  const inputRef = useRef(null)
  const selectedItemRef = useRef(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const handleCloseCommandBar = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    closeCommandBar()
  }, [closeCommandBar])

  // Skip filter/group work entirely while the bar is closed — this component
  // is mounted globally, so any render work here runs on every app re-render.
  const filteredItems = useMemo(() => {
    if (!isCommandBarOpen) {
      return []
    }

    const trimmedQuery = query.trim().toLowerCase()

    if (!trimmedQuery) {
      return commandItems
    }

    return commandItems.filter((item) => buildSearchValue(item).includes(trimmedQuery))
  }, [commandItems, isCommandBarOpen, query])

  const groupedItems = useMemo(() => {
    if (!isCommandBarOpen) {
      return new Map()
    }

    return filteredItems.reduce((groups, item, index) => {
      const category = item.category ?? 'Other'
      const currentGroup = groups.get(category) ?? []
      currentGroup.push({
        ...item,
        resultIndex: index,
      })
      groups.set(category, currentGroup)
      return groups
    }, new Map())
  }, [filteredItems, isCommandBarOpen])

  // Keep the latest interactive-state bits on a ref so the global keydown
  // listener can read them without re-subscribing on every render.
  const filteredItemsRef = useRef(filteredItems)
  const selectedIndexRef = useRef(selectedIndex)
  const isCommandBarOpenRef = useRef(isCommandBarOpen)
  const closeCommandBarRef = useRef(handleCloseCommandBar)
  const openCommandBarRef = useRef(openCommandBar)

  useEffect(() => {
    filteredItemsRef.current = filteredItems
  }, [filteredItems])

  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  useEffect(() => {
    isCommandBarOpenRef.current = isCommandBarOpen
  }, [isCommandBarOpen])

  useEffect(() => {
    closeCommandBarRef.current = handleCloseCommandBar
  }, [handleCloseCommandBar])

  useEffect(() => {
    openCommandBarRef.current = openCommandBar
  }, [openCommandBar])

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCommandBarRef.current?.()
        return
      }

      if (!isCommandBarOpenRef.current) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeCommandBarRef.current?.()
        return
      }

      const items = filteredItemsRef.current

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((currentIndex) =>
          items.length ? (currentIndex + 1) % items.length : 0,
        )
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((currentIndex) =>
          items.length ? (currentIndex - 1 + items.length) % items.length : 0,
        )
        return
      }

      if (event.key === 'Enter') {
        const selectedItem = items[selectedIndexRef.current]

        if (!selectedItem) {
          return
        }

        event.preventDefault()
        selectedItem.action?.()
        closeCommandBarRef.current?.()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isCommandBarOpen) {
      return
    }

    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [isCommandBarOpen])

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
      })
    }
  }, [selectedIndex])

  if (!isCommandBarOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 px-4 py-[12vh] backdrop-blur-md">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close command bar"
        onClick={handleCloseCommandBar}
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_30px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl transition-all duration-100 ease-out">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <Search className="h-4 w-4 text-[var(--muted-2)]" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(event) => {
              if (isTypingTarget(event.target) && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault()
              }
            }}
            placeholder="Search exercises, views, and actions..."
            className="w-full border-none bg-transparent text-[15px] text-zinc-100 outline-none placeholder:text-[var(--muted-2)]"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
          {filteredItems.length ? (
            Array.from(groupedItems.entries()).map(([category, items]) => (
              <div key={category} className="mb-3 last:mb-0">
                <p className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted-2)]">
                  {category}
                </p>

                <div className="space-y-1">
                  {items.map((item) => {
                    const isActive = item.resultIndex === selectedIndex

                    return (
                      <button
                        key={item.id}
                        ref={isActive ? selectedItemRef : null}
                        type="button"
                        className={`flex w-full items-center justify-between gap-4 rounded-[18px] border px-3 py-3 text-left transition duration-100 ${
                          isActive
                            ? 'border-gold/30 bg-gold/[0.08]'
                            : 'border-transparent bg-[rgba(9,9,11,0.32)] hover:border-[var(--border)]'
                        }`}
                        onMouseEnter={() => setSelectedIndex(item.resultIndex)}
                        onClick={() => {
                          item.action?.()
                          closeCommandBar()
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-zinc-100">
                            {item.label}
                          </span>
                          {item.subtitle ? (
                            <span className="mt-1 block truncate text-[12px] text-[var(--muted-2)]">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </span>

                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(9,9,11,0.4)] px-4 py-6 text-center text-[13px] text-[var(--muted-2)]">
              No matching results.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CommandBar
