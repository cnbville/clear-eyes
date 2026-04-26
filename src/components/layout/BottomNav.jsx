import { memo } from 'react'
import {
  BarChart3,
  Calendar,
  Dumbbell,
  Home,
  Settings,
} from 'lucide-react'
const tabs = [
  { id: 'home', label: 'Modes', icon: Home },
  { id: 'program', label: 'Program', icon: Calendar },
  { id: 'custom', label: 'My Workouts', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function BottomNav({ activePage, onNavigate, onCommandOpen }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 lg:hidden">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between rounded-[22px] border border-white/[0.05] bg-[rgba(13,13,16,0.94)] px-2 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
        {tabs.map((tab) => {
          const isActive = activePage === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={`flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 transition ${
                isActive
                  ? 'bg-gold/[0.08] text-gold'
                  : 'text-zinc-500 hover:bg-iron-800/80 hover:text-zinc-300'
              }`}
              onClick={() => onNavigate?.(tab.id)}
              aria-label={tab.label}
              title={onCommandOpen && tab.id === activePage ? 'Use the page header or command bar for search.' : tab.label}
            >
              <tab.icon size={20} strokeWidth={1.5} />
              <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default memo(BottomNav)
