import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Plus,
  Sparkles,
  Waves,
} from 'lucide-react'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { formatRelativeTime } from '../lib/customWorkouts.js'
import { getTemplates } from '../services/templateService.js'

function estimateSessionMinutes(day) {
  const totalSets = (day?.exercises ?? []).reduce((sum, exercise) => {
    const warmupSets = Number(exercise?.warmup_sets) || 0
    const workingSets = Number(exercise?.working_sets) || 0
    return sum + warmupSets + workingSets
  }, 0)

  if (!totalSets) {
    return 0
  }

  return Math.max(25, Math.round(totalSets * 2.5))
}

function getSafeProgress(progress) {
  return {
    current_phase: progress?.current_phase ?? 1,
    current_week: progress?.current_week ?? 1,
    current_day: progress?.current_day ?? 1,
    session_streak: progress?.session_streak ?? 0,
    total_sessions: progress?.total_sessions ?? 0,
    weekly_completed: progress?.weekly_completed ?? 0,
    weekly_target: progress?.weekly_target ?? 0,
  }
}

function ModeMetric({ label, value, hint }) {
  return (
    <div className="border-t border-white/[0.06] py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function ModePanel({
  kicker,
  title,
  body,
  accentClassName,
  accentTextClassName,
  icon,
  topMeta,
  metrics,
  primaryAction,
  secondaryAction,
}) {
  const ResolvedIcon = icon

  return (
    <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-6">
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${accentClassName} ${accentTextClassName}`}
            >
              <ResolvedIcon className="h-5 w-5" strokeWidth={1.8} />
            </span>

            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.26em] ${accentTextClassName}`}>
                {kicker}
              </p>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-zinc-50">
                {title}
              </h2>
              <p className="mt-3 max-w-2xl text-[13px] leading-7 text-zinc-400">{body}</p>
            </div>
          </div>

          {topMeta ? (
            <div className="hidden rounded-full border border-white/[0.06] bg-iron-950/70 px-4 py-2 text-[11px] text-zinc-500 lg:block">
              {topMeta}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-1 rounded-[24px] border border-white/[0.05] bg-iron-950/40 px-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <ModeMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      </div>
    </section>
  )
}

function ModesPage({
  program,
  progress,
  currentSlot = null,
  weeklyQuota = null,
  overdueSlots = [],
  onNavigate,
  onStartProgramWorkout,
  onCreateCustomWorkout,
}) {
  const [templates, setTemplates] = useState([])

  const safeProgress = getSafeProgress(progress)
  const resolvedPhaseNumber = currentSlot?.phase_number ?? safeProgress.current_phase
  const resolvedWeekNumber = currentSlot?.week_number ?? safeProgress.current_week
  const resolvedDayNumber = currentSlot?.day_number ?? safeProgress.current_day
  const currentPhase =
    currentSlot?.phase ??
    program?.phases?.find((phase) => phase.phase_number === resolvedPhaseNumber) ??
    program?.phases?.[0] ??
    null
  const currentDay =
    currentSlot?.day ??
    currentPhase?.days?.find((day) => day.day_number === resolvedDayNumber) ??
    currentPhase?.days?.[0] ??
    null
  const activeTemplates = templates.filter((template) => !template.is_archived)
  const totalTemplateUses = activeTemplates.reduce(
    (sum, template) => sum + (Number(template.times_used) || 0),
    0,
  )
  const featuredTemplate = activeTemplates[0] ?? null
  const programMinutes = estimateSessionMinutes(currentDay)
  const quotaCompleted = weeklyQuota?.activeWeek?.completed ?? safeProgress.weekly_completed
  const quotaTarget =
    weeklyQuota?.effectiveTarget ??
    safeProgress.weekly_target ??
    program?.days_per_week ??
    0

  const footerActions = useMemo(
    () => [
      {
        action: program && currentDay ? onStartProgramWorkout : () => onNavigate?.('programs'),
        displayShortcut: '↵',
        id: 'modes-primary',
        label: program && currentDay ? 'Start Program' : 'Load Program',
        shortcut: 'Enter',
      },
      {
        action: () => onNavigate?.('custom'),
        displayShortcut: '⌘W',
        id: 'modes-custom',
        label: 'My Workouts',
        shortcut: 'Mod+W',
      },
      {
        action: onCreateCustomWorkout,
        displayShortcut: '⌘E',
        id: 'modes-create-custom',
        label: 'Create Workout',
        shortcut: 'Mod+E',
      },
    ],
    [currentDay, onCreateCustomWorkout, onNavigate, onStartProgramWorkout, program],
  )

  useInteractionContext('home', {
    breadcrumbSegments: ['IRON', 'Training Modes'],
    footerActions,
  })

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      try {
        const rows = await getTemplates(true)

        if (!cancelled) {
          setTemplates(rows)
        }
      } catch {
        if (!cancelled) {
          setTemplates([])
        }
      }
    }

    void loadTemplates()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-5 py-2 lg:py-1">
      <header className="relative overflow-hidden rounded-[30px] border border-white/[0.06] bg-[linear-gradient(140deg,rgba(22,22,25,0.98),rgba(9,9,11,0.96))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.42)] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,162,39,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(77,166,255,0.12),transparent_28%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Training Modes
            </p>
            <h1 className="mt-4 max-w-[14ch] text-[30px] font-black leading-[0.95] tracking-[-0.06em] text-zinc-50 sm:text-[52px]">
              Two ways to train. One shared engine.
            </h1>
            <p className="mt-4 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Structured program execution and custom-built workout chaos now sit on equal footing.
              Every session still feeds the same PRs, volume trends, exercise history, and progress wall.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Program Pace</p>
                <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">
                  {program ? `P${resolvedPhaseNumber} · W${resolvedWeekNumber}` : 'Idle'}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Custom Library</p>
                <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">
                  {activeTemplates.length} templates
                </p>
              </div>
              <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Shared Progress</p>
                <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">
                  {safeProgress.total_sessions} sessions
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.05] bg-iron-900/65 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                Shared Engine
              </p>
              <div className="mt-4 grid gap-1 rounded-[24px] border border-white/[0.05] bg-iron-950/40 px-4 md:grid-cols-2">
                <ModeMetric
                  label="Program Cursor"
                  value={program ? `P${resolvedPhaseNumber} · W${resolvedWeekNumber}` : 'Idle'}
                  hint="Current structured position"
                />
                <ModeMetric
                  label="Quota"
                  value={`${quotaCompleted}/${quotaTarget || program?.days_per_week || 0}`}
                  hint="Resolved program slots this week"
                />
                <ModeMetric
                  label="Carryovers"
                  value={overdueSlots.length}
                  hint="Slots waiting to be cleaned up"
                />
                <ModeMetric
                  label="Custom Activity"
                  value={totalTemplateUses}
                  hint="Lifetime template launches"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <ModePanel
          kicker="Program Mode"
          title={program ? currentDay?.name ?? 'Today is loaded' : 'Load a structured plan'}
          body={
            program
              ? `Phase ${resolvedPhaseNumber}, week ${resolvedWeekNumber}, day ${resolvedDayNumber}. The structured side handles adherence, carryovers, smart warm-ups, readiness, and next-session load guidance without mutating the imported program.`
              : 'Import a hardcoded plan when you want the app to manage the block, the order of exposure, and the accountability layer around it.'
          }
          accentClassName="border-gold/20 bg-gold/10"
          accentTextClassName="text-gold"
          icon={CalendarDays}
          topMeta={programMinutes ? `~${programMinutes} min` : null}
          metrics={[
            {
              label: 'Current Slot',
              value: program ? `Day ${resolvedDayNumber}` : 'Waiting',
              hint: program ? `${currentDay?.exercises?.length ?? 0} exercises queued` : 'No active program loaded',
            },
            {
              label: 'Streak',
              value: safeProgress.session_streak,
              hint: 'Current consistency run',
            },
            {
              label: 'Quota-Hit Weeks',
              value: weeklyQuota?.consecutiveQuotaHitWeeks ?? 0,
              hint: 'Weeks at or above target',
            },
          ]}
          primaryAction={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light"
              onClick={() => (program && currentDay ? onStartProgramWorkout?.() : onNavigate?.('programs'))}
            >
              <span>{program && currentDay ? 'Enter Program Mode' : 'Import Program'}</span>
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          }
          secondaryAction={
            <button
              type="button"
              className="soft-pill transition hover:border-gold/25 hover:text-zinc-100"
              onClick={() => onNavigate?.('program')}
            >
              <span>Open Program Workspace</span>
            </button>
          }
        />

        <ModePanel
          kicker="Custom Mode"
          title={featuredTemplate?.name ?? 'Build your own training floor'}
          body={
            featuredTemplate
              ? `Your custom workspace is active. Open saved templates, duplicate proven sessions, or spin up a fresh builder without leaving the same logging and progress engine the program side uses.`
              : 'Create reusable workouts, run them instantly, and keep every logged set tied back to the same exercise IDs, PR logic, notes, and progress reporting.'
          }
          accentClassName="border-sky/20 bg-sky/10"
          accentTextClassName="text-sky"
          icon={Dumbbell}
          topMeta={
            featuredTemplate?.last_used_at
              ? `Last used ${formatRelativeTime(featuredTemplate.last_used_at)}`
              : 'Builder ready'
          }
          metrics={[
            {
              label: 'Templates',
              value: activeTemplates.length,
              hint: 'Active reusable workouts',
            },
            {
              label: 'Total Uses',
              value: totalTemplateUses,
              hint: 'Launches across the library',
            },
            {
              label: 'Featured',
              value: featuredTemplate?.estimated_duration ? `~${featuredTemplate.estimated_duration} min` : 'Fresh',
              hint: featuredTemplate ? `${featuredTemplate.total_sets} sets ready` : 'No saved template yet',
            },
          ]}
          primaryAction={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-sky px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-[#9dd0ee]"
              onClick={() => onNavigate?.('custom')}
            >
              <span>Open Custom Mode</span>
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          }
          secondaryAction={
            <button
              type="button"
              className="soft-pill transition hover:border-sky/25 hover:text-zinc-100"
              onClick={() => onCreateCustomWorkout?.()}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              <span>Create Workout</span>
            </button>
          }
        />
      </div>

      <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-6">
        <div className="relative">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                Shared Engine
              </p>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-zinc-50">
                One data spine. Two very different moods.
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-iron-900/60 px-4 py-2 text-[12px] text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
              <span>Custom sessions still contribute to analytics and lift memory.</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Exercise Identity', 'Both modes resolve through the same exercise IDs, swaps, and note history.'],
              ['Session Logging', 'Warm-ups, working sets, PRs, rest behavior, and readiness live on one runtime.'],
              ['Progress Intelligence', 'Volume trends, projections, and phase-level charts read from the same underlying logbook.'],
              ['Template Memory', 'Custom templates stay reusable without becoming a second-class subsystem.'],
            ].map(([label, body], index) => (
              <div key={label} className="rounded-[24px] border border-white/[0.05] bg-iron-950/65 px-5 py-5">
                <div className="flex items-center gap-3">
                  {index === 1 ? (
                    <Waves className="h-4 w-4 text-sky" strokeWidth={1.8} />
                  ) : (
                    <Sparkles className="h-4 w-4 text-gold" strokeWidth={1.8} />
                  )}
                  <p className="text-[13px] font-semibold text-zinc-100">{label}</p>
                </div>
                <p className="mt-3 text-[13px] leading-7 text-zinc-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  )
}

export default ModesPage
