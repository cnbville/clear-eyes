import { memo } from 'react'
import {
  BarChart3,
  BookOpenText,
  Calendar,
  Dumbbell,
  FolderOpen,
  Home,
  Shield,
  Sparkles,
} from 'lucide-react'
import Kbd from '../shared/Kbd.jsx'

const navigationItems = [
  { id: 'home', label: 'Modes', icon: Home },
  { id: 'program', label: 'Program', icon: Calendar },
  { id: 'custom', label: 'My Workouts', icon: Dumbbell },
  { id: 'progress', label: 'Progress Grid', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Shield },
  { id: 'history', label: 'Archive', icon: Calendar },
  { id: 'programs', label: 'Programs', icon: FolderOpen },
  { id: 'library', label: 'Library', icon: Dumbbell },
  { id: 'glossary', label: 'Glossary', icon: BookOpenText },
]

function formatLevel(value) {
  if (!value) {
    return 'Lv. 1'
  }

  return `Lv. ${value}`
}

function DesktopSidebar({ activePage, onNavigate, onCommandOpen, program, progress }) {
  const statusCards = [
    {
      label: 'Streak',
      value: progress?.session_streak ?? 0,
    },
    {
      label: 'Weekly',
      value: `${progress?.weekly_completed ?? 0}/${progress?.weekly_target ?? program?.days_per_week ?? 5}`,
    },
    {
      label: 'Sessions',
      value: progress?.total_sessions ?? 0,
    },
    {
      label: 'Level',
      value: formatLevel(progress?.level ?? 1),
    },
  ]

  return (
    <aside className="sticky top-6 flex h-[calc(100vh-3rem)] flex-col overflow-y-auto rounded-[32px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(16,16,18,0.98),rgba(8,8,9,0.92))] p-4 pr-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] [scrollbar-color:#27272a_transparent] [scrollbar-width:thin]">
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-iron-900 px-5 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,162,39,0.16),transparent_50%)]" />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
          IRON
        </p>
        <h1 className="relative mt-3 text-[24px] font-black tracking-[-0.05em] text-zinc-50">
          Workout OS
        </h1>
        <p className="relative mt-2 max-w-[16rem] text-[12px] leading-5 text-zinc-500">
          Matte-black command space for structured program work and custom-built training days.
        </p>

        <button
          type="button"
          className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-iron-950/80 px-3 py-2 text-[12px] text-zinc-400 transition hover:border-gold/30 hover:text-zinc-100"
          onClick={() => onCommandOpen?.()}
        >
          <span>Search IRON</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="mt-4 space-y-2">
        {navigationItems.map((item) => {
          const isActive = activePage === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
              className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isActive
                  ? 'border-gold/30 bg-gold/[0.08] text-zinc-50'
                  : 'border-transparent bg-iron-900/50 text-zinc-500 hover:border-white/[0.04] hover:bg-iron-900 hover:text-zinc-200'
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  isActive
                    ? 'border-gold/30 bg-gold/10 text-gold'
                    : 'border-white/[0.04] bg-iron-800 text-zinc-600 group-hover:text-zinc-300'
                }`}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>

              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                  {item.id}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-5 rounded-[24px] border border-white/[0.06] bg-iron-900/70 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
          <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
          Training Modes
        </div>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => onNavigate?.('program')}
            className="flex w-full items-center justify-between rounded-2xl border border-gold/15 bg-gold/[0.06] px-4 py-3 text-left transition hover:border-gold/30"
          >
            <span>
              <span className="block text-[12px] font-semibold text-zinc-100">Program Mode</span>
              <span className="mt-1 block text-[11px] text-zinc-500">
                {program?.name
                  ? `${program.name} · P${progress?.current_phase ?? 1}`
                  : 'Import a structured plan'}
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-gold">Open</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('custom')}
            className="flex w-full items-center justify-between rounded-2xl border border-sky/15 bg-sky/10 px-4 py-3 text-left transition hover:border-sky/30"
          >
            <span>
              <span className="block text-[12px] font-semibold text-zinc-100">Custom Mode</span>
              <span className="mt-1 block text-[11px] text-zinc-500">
                Builder, templates, and free-form training
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-sky">Open</span>
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-[24px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(18,18,20,0.9),rgba(10,10,11,0.95))] p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
          <Shield className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.8} />
          System Status
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {statusCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/[0.05] bg-iron-950/70 px-3 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                {card.label}
              </p>
              <p className="mt-2 text-[18px] font-bold tracking-[-0.04em] text-zinc-50">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

export default memo(DesktopSidebar)
