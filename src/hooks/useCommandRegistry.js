import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'

const CommandRegistryContext = createContext(null)

function removeKey(record, keyToRemove) {
  const nextRecord = { ...record }
  delete nextRecord[keyToRemove]
  return nextRecord
}

export function CommandRegistryProvider({ children }) {
  const [itemsBySource, setItemsBySource] = useState({})
  const [footerActionsByContext, setFooterActionsByContext] = useState({})
  const [currentContext, setCurrentContext] = useState('home')
  const [breadcrumbSegments, setBreadcrumbSegments] = useState(['IRON'])
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false)

  const registerItems = useCallback((sourceId, items) => {
    setItemsBySource((currentItemsBySource) => ({
      ...currentItemsBySource,
      [sourceId]: Array.isArray(items) ? items : [],
    }))

    return () => {
      setItemsBySource((currentItemsBySource) => removeKey(currentItemsBySource, sourceId))
    }
  }, [])

  const registerFooterActions = useCallback((contextId, actions) => {
    setFooterActionsByContext((currentActionsByContext) => ({
      ...currentActionsByContext,
      [contextId]: Array.isArray(actions) ? actions : [],
    }))

    return () => {
      setFooterActionsByContext((currentActionsByContext) =>
        removeKey(currentActionsByContext, contextId),
      )
    }
  }, [])

  const commandItems = useMemo(
    () => Object.values(itemsBySource).flat().filter(Boolean),
    [itemsBySource],
  )

  const footerActions = useMemo(
    () => footerActionsByContext[currentContext] ?? [],
    [currentContext, footerActionsByContext],
  )

  const value = useMemo(
    () => ({
      breadcrumbSegments,
      closeCommandBar: () => setIsCommandBarOpen(false),
      commandItems,
      currentContext,
      footerActions,
      isCommandBarOpen,
      openCommandBar: () => setIsCommandBarOpen(true),
      registerFooterActions,
      registerItems,
      setBreadcrumbSegments,
      setCurrentContext,
      toggleCommandBar: () => setIsCommandBarOpen((currentValue) => !currentValue),
    }),
    [
      breadcrumbSegments,
      commandItems,
      currentContext,
      footerActions,
      isCommandBarOpen,
      registerFooterActions,
      registerItems,
    ],
  )

  return createElement(CommandRegistryContext.Provider, { value }, children)
}

export function useCommandRegistry() {
  const context = useContext(CommandRegistryContext)

  if (!context) {
    throw new Error('useCommandRegistry must be used within a CommandRegistryProvider.')
  }

  return context
}

export function useRegisterCommandItems(sourceId, items) {
  const { registerItems } = useCommandRegistry()
  const latestItemsRef = useRef(items)
  const normalizedItems = useMemo(() => (Array.isArray(items) ? items : []), [items])
  useEffect(() => {
    latestItemsRef.current = normalizedItems
  }, [normalizedItems])
  const registerLatestItems = useEffectEvent(() => registerItems(sourceId, latestItemsRef.current))
  const itemsSignature = useMemo(
    () =>
      normalizedItems
        .map((item) =>
          [
            item?.id ?? '',
            item?.label ?? '',
            item?.subtitle ?? '',
            item?.category ?? '',
            Array.isArray(item?.keywords) ? item.keywords.join(',') : '',
            item?.shortcut ?? '',
          ].join('|'),
        )
        .join('::'),
    [normalizedItems],
  )

  useEffect(() => registerLatestItems(), [itemsSignature, sourceId])
}

export function useInteractionContext(contextId, { breadcrumbSegments, footerActions }) {
  const { registerFooterActions, setBreadcrumbSegments } = useCommandRegistry()
  const normalizedFooterActions = useMemo(
    () => (Array.isArray(footerActions) ? footerActions : []),
    [footerActions],
  )
  const normalizedBreadcrumbSegments = useMemo(
    () => (Array.isArray(breadcrumbSegments) ? breadcrumbSegments : []),
    [breadcrumbSegments],
  )
  const latestFooterActionsRef = useRef(footerActions)
  const latestBreadcrumbSegmentsRef = useRef(breadcrumbSegments)
  useEffect(() => {
    latestFooterActionsRef.current = normalizedFooterActions
  }, [normalizedFooterActions])
  useEffect(() => {
    latestBreadcrumbSegmentsRef.current = normalizedBreadcrumbSegments
  }, [normalizedBreadcrumbSegments])

  const footerActionsSignature = useMemo(
    () =>
      normalizedFooterActions
        .map((action) =>
          [
            action?.id ?? '',
            action?.label ?? '',
            action?.disabled ? '1' : '0',
            action?.shortcut ?? '',
            action?.displayShortcut ?? '',
            action?.allowInInput ? '1' : '0',
          ].join('|'),
        )
        .join('::'),
    [normalizedFooterActions],
  )
  const breadcrumbSignature = useMemo(
    () => normalizedBreadcrumbSegments.join('::'),
    [normalizedBreadcrumbSegments],
  )
  const registerLatestFooterActions = useEffectEvent(() =>
    registerFooterActions(
      contextId,
      (latestFooterActionsRef.current ?? []).map((action, index) => ({
        ...action,
        action: (...args) => latestFooterActionsRef.current?.[index]?.action?.(...args),
      })),
    ),
  )
  const applyLatestBreadcrumbs = useEffectEvent(() => {
    if (latestBreadcrumbSegmentsRef.current?.length) {
      setBreadcrumbSegments(latestBreadcrumbSegmentsRef.current)
    }
  })

  useEffect(() => registerLatestFooterActions(), [contextId, footerActionsSignature])

  useEffect(() => {
    applyLatestBreadcrumbs()
  }, [breadcrumbSignature])
}
