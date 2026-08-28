import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import './Tabs.scss'

interface TabsContextValue {
  activeValue: string | undefined
  select: (value: string) => void
  baseId: string
  registerTab: (value: string) => void
  unregisterTab: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(name: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`<${name}> 은 <Tabs> 안에서 사용해야 합니다.`)
  return ctx
}

interface TabsProps {
  children: ReactNode
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
  className?: string
}

function Tabs({ children, defaultValue, value, onChange, className }: TabsProps) {
  const baseId = useId()
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string | undefined>(defaultValue)
  const [tabOrder, setTabOrder] = useState<string[]>([])

  const activeValue = isControlled ? value : (internal ?? tabOrder[0])

  const select = useCallback(
    (next: string) => {
      if (!isControlled) setInternal(next)
      onChange?.(next)
    },
    [isControlled, onChange],
  )

  const registerTab = useCallback((v: string) => {
    setTabOrder((prev) => (prev.includes(v) ? prev : [...prev, v]))
  }, [])
  const unregisterTab = useCallback((v: string) => {
    setTabOrder((prev) => prev.filter((x) => x !== v))
  }, [])

  const ctx = useMemo<TabsContextValue>(
    () => ({
      activeValue,
      select,
      baseId,
      registerTab,
      unregisterTab,
    }),
    [activeValue, select, baseId, registerTab, unregisterTab],
  )

  return (
    <div className={`tabs ${className ? ` ${className}` : ''}`}>
      <TabsContext.Provider value={ctx}>{children}</TabsContext.Provider>
    </div>
  )
}

// TabList
interface TabListProps {
  children: ReactNode
  className?: string
}

export function TabList({ children, className }: TabListProps) {
  useTabsContext('TabList')
  return <div className={`tabs-list${className ? ` ${className}` : ''}`}>{children}</div>
}

// Tab
interface TabProps {
  value: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

export function Tab({ value, children, disabled, className }: TabProps) {
  const { activeValue, select, baseId, registerTab, unregisterTab } = useTabsContext('Tab')

  useEffect(() => {
    registerTab(value)
    return () => unregisterTab(value)
  }, [value, registerTab, unregisterTab])

  const selected = activeValue === value

  return (
    <button
      type="button"
      id={`${baseId}-tab-${value}`}
      disabled={disabled}
      className={`tabs-tab${selected ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => select(value)}
    >
      {children}
    </button>
  )
}

// TabPanel
interface TabPanelProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeValue, baseId } = useTabsContext('TabPanel')
  const selected = activeValue === value

  return (
    <div
      id={`${baseId}-panel-${value}`}
      hidden={!selected}
      className={`tabs-panel${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}

export default Tabs
