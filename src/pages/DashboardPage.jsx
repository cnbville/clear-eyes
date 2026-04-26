import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  Play,
  RotateCcw,
  SkipForward,
  Waves,
} from 'lucide-react'
import Kbd from '../components/shared/Kbd.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { getDemoRecentSessions, isDemoModeEnabled } from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

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

function formatShortDate(value) {
  if (!value) {
    return '--'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatTime(value) {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchRecentSessions(programId) {
  if (isDemoModeEnabled()) {
    return getDemoRecentSessions(programId, 5)
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      `
        id,
        date,
        duration_minutes,
        prs_hit,
        total_volume,
        program_days!inner (
          day_number,
          name,
          program_weeks!inner (
            program_phases!inner (
              program_id
            )
          )
        )
      `,
    )
    .eq('status', 'completed')
    .eq('program_days.program_weeks.program_phases.program_id', programId)
    .order('date', { ascending: false })
    .limit(5)

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

function StackMetric({ label, value, hint }) {
  return (
    <div className="border-t border-white/[0.06] py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function DashboardPage({
  program,
  progress,
  currentSlot = null,
  activeSession = null,
  weeklyQuota = null,
  recoveryRecommendation = null,
  overdueSlots = [],
  onSkipOverdue = null,
  onStartWorkout,
  onNavigate,
  contextId = 'program',
}) {
  const [recentSessions, setRecentSessions] = useState([])
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(true)
  const launchSlot = activeSession?.slot ?? currentSlot
  const launchDay = activeSession?.day ?? currentSlot?.day ?? null
  const phaseNumber = launchSlot?.phase_number ?? progress?.current_phase ?? 1
  const weekNumber = launchSlot?.week_number ?? progress?.current_week ?? 1
  const dayNumber = launchSlot?.day_number ?? progress?.current_day ?? 1
  const estimatedMinutes = estimateSessionMinutes(launchDay)
  const firstMainLift = launchDay?.exercises?.[0]?.name ?? 'No main lift loaded'
  const quotaCompleted = weeklyQuota?.activeWeek?.completed ?? progress?.weekly_completed ?? 0
  const quotaTarget =
    weeklyQuota?.effectiveTarget ??
    progress?.weekly_target ??
    program?.days_per_week ??
    0
  const actionLabel = activeSession?.id ? 'Resume Workout' : 'Start Workout'

  const startWorkoutAction = useMemo(() => {
    if (!launchDay) {
      return null
    }

    return () =>
      onStartWorkout?.(
        launchDay,
        {
          phase_number: phaseNumber,
          week: weekNumber,
          name: launchSlot?.phase_name ?? `Phase ${phaseNumber}`,
          phaseColor: '#d1ab4f',
        },
        launchSlot ? { slot: launchSlot } : {},
      )
  }, [launchDay, launchSlot, onStartWorkout, phaseNumber, weekNumber])

  const footerActions = useMemo(
    () => [
      {
        action: startWorkoutAction,
        disabled: !startWorkoutAction,
        displayShortcut: '↵',
        id: 'dashboard-start-session',
        label: actionLabel,
        shortcut: 'Enter',
      },
      {
        action: () => onNavigate?.('progress'),
        displayShortcut: '⌘G',
        id: 'dashboard-progress',
        label: 'Progress',
        shortcut: 'Mod+G',
      },
      {
        action: () => onNavigate?.('custom'),
        displayShortcut: '⌘W',
        id: 'dashboard-custom',
        label: 'My Workouts',
        shortcut: 'Mod+W',
      },
    ],
    [actionLabel, onNavigate, startWorkoutAction],
  )

  useInteractionContext(contextId, {
    breadcrumbSegments: ['IRON', 'Program', 'Today'],
    footerActions,
  })

  useEffect(() => {
    let isCancelled = false

    async function loadRecentSessions() {
      if (!program?.id || (!isConfigured && !isDemoModeEnabled())) {
        if (!isCancelled) {
          setRecentSessions([])
          setRecentSessionsLoading(false)
        }

        return
      }

      setRecentSessionsLoading(true)

      try {
        const sessions = await fetchRecentSessions(program.id)

        if (!isCancelled) {
          setRecentSessions(sessions)
          setRecentSessionsLoading(false)
        }
      } catch {
        if (!isCancelled) {
          setRecentSessions([])
          setRecentSessionsLoading(false)
        }
      }
    }

    void loadRecentSessions()

    return () => {
      isCancelled = true
    }
  }, [program?.id])

  return (
    <section className="space-y-5 py-2 lg:py-1">
      <header className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-4 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Program Mode
            </p>
            <h1 className="mt-3 text-[28px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[44px]">
              Follow the hardcoded plan with full-phase discipline.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              This side is the structured engine: phased progression, today&apos;s prescription,
              and recent program execution. Custom workouts still live as an equal mode, not a hidden extra.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="soft-pill">Phase {phaseNumber}</span>
              <span className="soft-pill">Week {weekNumber}</span>
              <span className="soft-pill">Day {dayNumber}</span>
              {activeSession?.id ? (
                <span className="soft-pill border-sky/20 bg-sky/10 text-sky">
                  Draft synced {activeSession?.draftUpdatedAt ? formatTime(activeSession.draftUpdatedAt) : 'now'}
                </span>
              ) : null}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-full bg-gold px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={startWorkoutAction}
                disabled={!startWorkoutAction}
              >
                {activeSession?.id ? <RotateCcw className="h-4 w-4" strokeWidth={2.2} /> : <Play className="h-4 w-4" strokeWidth={2.2} />}
                <span>{actionLabel}</span>
                <Kbd className="border-black/10 bg-black/10 text-iron-900">↵</Kbd>
              </button>

              <button
                type="button"
                className="soft-pill min-h-[48px] justify-center transition hover:border-gold/25 hover:text-zinc-100"
                onClick={() => onNavigate?.('progress')}
              >
                <span>Open performance analytics</span>
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-5">
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                Preflight
              </p>
              <div className="mt-4 grid gap-1 rounded-[24px] border border-white/[0.05] bg-iron-950/40 px-4 md:grid-cols-2">
                <StackMetric
                  label="First Main Lift"
                  value={firstMainLift}
                  hint="Top working pattern for today"
                />
                <StackMetric
                  label="Estimated Duration"
                  value={estimatedMinutes ? `${estimatedMinutes}m` : '--'}
                  hint="Calculated from planned set count"
                />
                <StackMetric
                  label="Weekly Quota"
                  value={`${quotaCompleted}/${quotaTarget || program?.days_per_week || 0}`}
                  hint="Resolved program slots this week"
                />
                <StackMetric
                  label="Carryovers"
                  value={overdueSlots.length}
                  hint="Slots waiting to be cleaned up"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {recoveryRecommendation ? (
        <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-6">
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-gold">
                Recovery Prompt
              </p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.05em] text-zinc-50">
                {recoveryRecommendation.headline}
              </h2>
              <p className="mt-3 max-w-3xl text-[13px] leading-7 text-zinc-400">
                {recoveryRecommendation.body}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {recoveryRecommendation.action === 'skip' ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-coral/30 bg-coral/10 px-4 py-3 text-[12px] font-semibold text-coral transition hover:border-coral/50"
                  onClick={() => onSkipOverdue?.(recoveryRecommendation.overdueSlots?.[0])}
                >
                  <SkipForward className="h-4 w-4" strokeWidth={2} />
                  Skip oldest carryover
                </button>
              ) : null}

              <button
                type="button"
                className="soft-pill transition hover:border-gold/25 hover:text-zinc-100"
                onClick={startWorkoutAction}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} />
                <span>Make up next</span>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-6">
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
              Program State
            </p>
            <div className="mt-4 grid gap-1 rounded-[24px] border border-white/[0.05] bg-iron-950/40 px-4 sm:grid-cols-2">
              <StackMetric
                label="Sessions"
                value={progress?.total_sessions ?? 0}
                hint="Lifetime logged program sessions"
              />
              <StackMetric
                label="Streak"
                value={progress?.session_streak ?? 0}
                hint="Current consistency run"
              />
              <StackMetric
                label="Quota-Hit Weeks"
                value={weeklyQuota?.consecutiveQuotaHitWeeks ?? 0}
                hint="Weeks at or above target"
              />
              <StackMetric
                label="Draft Status"
                value={activeSession?.id ? 'Resume' : 'Fresh'}
                hint={activeSession?.draftUpdatedAt ? `Last sync ${formatTime(activeSession.draftUpdatedAt)}` : 'No in-progress session'}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-6">
          <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                  Recent Program Sessions
                </p>
                <p className="mt-3 text-[28px] font-semibold tracking-[-0.05em] text-zinc-50">
                  The last few exposures, without the noise.
                </p>
              </div>
              <button
                type="button"
                className="soft-pill transition hover:border-gold/25 hover:text-zinc-100"
                onClick={() => onNavigate?.('history')}
              >
                <span>Open archive</span>
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {recentSessionsLoading ? (
                <div className="rounded-[24px] border border-white/[0.05] bg-iron-950/60 px-5 py-5 text-[13px] text-zinc-500">
                  Loading recent sessions...
                </div>
              ) : recentSessions.length ? (
                recentSessions.map((session, index) => (
                  <div
                    key={session.id}
                    className={`rounded-[24px] border px-5 py-4 ${
                      index === 0
                        ? 'border-gold/20 bg-gold/[0.06]'
                        : 'border-white/[0.05] bg-iron-950/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-[15px] font-semibold text-zinc-100">
                          {session?.program_days?.name ?? 'Workout'}
                        </p>
                        <p className="mt-2 text-[12px] text-zinc-500">
                          Day {session?.program_days?.day_number ?? '--'} · {formatShortDate(session?.date)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-mono text-[14px] text-zinc-100">
                          {Math.round(Number(session?.total_volume) || 0)}kg
                        </p>
                        <p className="mt-2 text-[12px] text-zinc-500">
                          {session?.duration_minutes ?? '--'} min · {session?.prs_hit ?? 0} PRs
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/[0.05] bg-iron-950/60 px-5 py-5 text-[13px] text-zinc-500">
                  No completed program sessions yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-6">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
              Program Mode
            </p>
            <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.05em] text-zinc-50">
              Enter the next programmed slot with maximum context and minimum friction.
            </h2>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-iron-900/60 px-4 py-2 text-[12px] text-zinc-400">
            <Waves className="h-3.5 w-3.5 text-sky" strokeWidth={1.8} />
            <span>Ready to train, not ready to browse.</span>
          </div>
        </div>
      </section>
    </section>
  )
}

export default DashboardPage
