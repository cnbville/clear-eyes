import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import GlossaryTerm from '../components/shared/GlossaryTerm.jsx'
import { getDemoHistorySessions, isDemoModeEnabled } from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

function formatMonthLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatSessionDate(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function getDateKey(value) {
  return value.toISOString().slice(0, 10)
}

function getCalendarCells(currentMonth) {
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
  const leadingEmptyCells = (startOfMonth.getDay() + 6) % 7
  const daysInMonth = endOfMonth.getDate()
  const cells = []

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push(null)
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber))
  }

  return cells
}

function getSessionMap(sessions) {
  return sessions.reduce((map, session) => {
    const key = session.date
    const currentSessions = map.get(key) ?? []
    currentSessions.push(session)
    map.set(key, currentSessions)
    return map
  }, new Map())
}

function groupSetsByExercise(sets = []) {
  return sets.reduce((map, set) => {
    const key = set?.exercise_name ?? 'Exercise'
    const currentSets = map.get(key) ?? []
    currentSets.push(set)
    map.set(key, currentSets)
    return map
  }, new Map())
}

// Bound the history payload so the calendar doesn't load the user's entire
// training history (every set ever logged with nested exercise objects) into
// RAM. 18 months covers the visible calendar + meaningful recent context; the
// hard limit is a backstop for extremely active users.
const HISTORY_LOOKBACK_MONTHS = 18
const HISTORY_SESSION_LIMIT = 500

function getHistoryLookbackDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - HISTORY_LOOKBACK_MONTHS)
  return date.toISOString().slice(0, 10)
}

async function fetchSessions(programId) {
  if (isDemoModeEnabled()) {
    return getDemoHistorySessions(programId)
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      `
        id,
        date,
        status,
        duration_minutes,
        total_volume,
        prs_hit,
        notes,
        program_days!inner (
          name,
          day_number,
          program_weeks!inner (
            program_phases!inner (
              program_id
            )
          )
        ),
        logged_sets (
          id,
          set_number,
          weight,
          reps,
          rest_prescribed_seconds,
          rest_taken_seconds,
          exercises (
            name
          )
        )
      `,
    )
    .eq('program_days.program_weeks.program_phases.program_id', programId)
    .gte('date', getHistoryLookbackDate())
    .order('date', { ascending: false })
    .limit(HISTORY_SESSION_LIMIT)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((session) => ({
    ...session,
    logged_sets: [...(session.logged_sets ?? [])]
      .map((set) => ({
        ...set,
        exercise_name: set?.exercises?.name ?? 'Exercise',
      }))
      .sort((left, right) => (left.set_number ?? 0) - (right.set_number ?? 0)),
  }))
}

function HistoryMetric({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function HistoryPage({ program }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDateKey, setSelectedDateKey] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  useEffect(() => {
    let isCancelled = false

    async function loadSessions() {
      if ((!isConfigured && !isDemoModeEnabled()) || !program?.id) {
        if (!isCancelled) {
          setSessions([])
          setLoading(false)
        }

        return
      }

      setLoading(true)

      try {
        const nextSessions = await fetchSessions(program.id)

        if (!isCancelled) {
          setSessions(nextSessions)
          setSelectedDateKey((currentKey) => currentKey ?? nextSessions[0]?.date ?? null)
          setLoading(false)
        }
      } catch {
        if (!isCancelled) {
          setSessions([])
          setLoading(false)
        }
      }
    }

    void loadSessions()

    return () => {
      isCancelled = true
    }
  }, [program?.id])

  const sessionMap = useMemo(() => getSessionMap(sessions), [sessions])
  const selectedSessions = selectedDateKey ? sessionMap.get(selectedDateKey) ?? [] : []
  const todayKey = getDateKey(new Date())
  const sessionsThisMonth = useMemo(
    () =>
      sessions.filter((session) => {
        if (!session.date) {
          return false
        }

        const sessionDate = new Date(`${session.date}T00:00:00`)
        return (
          sessionDate.getFullYear() === currentMonth.getFullYear() &&
          sessionDate.getMonth() === currentMonth.getMonth()
        )
      }),
    [currentMonth, sessions],
  )
  const selectedVolume = selectedSessions.reduce(
    (sum, session) => sum + (Number(session.total_volume) || 0),
    0,
  )

  return (
    <section className="space-y-5 py-2 lg:py-1">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Archive
            </p>
            <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
              Review the sessions already etched into the wall.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Move through past weeks, select a date, and inspect the exact sets, rest behavior,
              volume, and PR output from that day.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start xl:self-auto">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.05] bg-black/20 text-zinc-500 transition hover:text-zinc-100"
              onClick={() =>
                setCurrentMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.7} />
            </button>

            <div className="rounded-[22px] border border-white/[0.05] bg-black/20 px-5 py-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Viewing</p>
              <p className="mt-1 text-[18px] font-semibold text-zinc-100">
                {formatMonthLabel(currentMonth)}
              </p>
            </div>

            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.05] bg-black/20 text-zinc-500 transition hover:text-zinc-100"
              onClick={() =>
                setCurrentMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.7} />
            </button>
          </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <HistoryMetric
          label="Total Sessions"
          value={sessions.length}
          hint={program?.name ?? 'Active program'}
        />
        <HistoryMetric
          label="This Month"
          value={sessionsThisMonth.length}
          hint={`${formatMonthLabel(currentMonth)}`}
        />
        <HistoryMetric
          label="Selected Volume"
          value={`${Math.round(selectedVolume)} kg`}
          hint={selectedDateKey ? formatSessionDate(selectedDateKey) : 'Pick a workout day'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Calendar Grid
              </p>
              <p className="mt-2 text-[14px] text-zinc-400">
                Gold ring marks today. Green is completed. Coral is skipped.
              </p>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-600">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {getCalendarCells(currentMonth).map((dateValue, index) => {
              if (!dateValue) {
                return (
                  <div
                    key={`empty-${index + 1}`}
                    className="flex h-12 items-center justify-center rounded-xl border border-transparent text-zinc-700"
                  >
                    ·
                  </div>
                )
              }

              const dateKey = getDateKey(dateValue)
              const daySessions = sessionMap.get(dateKey) ?? []
              const hasWorkout = daySessions.some((session) => session.status === 'completed')
              const hasSkipped = daySessions.some((session) => session.status === 'skipped')
              const isToday = dateKey === todayKey
              const isSelected = dateKey === selectedDateKey

              return (
                <button
                  key={dateKey}
                  type="button"
                  className={`flex h-12 items-center justify-center rounded-xl border text-[13px] font-medium transition ${
                    hasSkipped
                      ? 'border-coral/20 bg-coral/[0.12] text-coral'
                      : hasWorkout
                        ? 'border-mint/20 bg-mint/[0.12] text-mint'
                        : 'border-white/[0.03] bg-iron-950/60 text-zinc-500'
                  } ${isToday ? 'ring-1 ring-gold' : ''} ${isSelected ? 'border-gold/40 text-zinc-50' : ''}`}
                  onClick={() => setSelectedDateKey(dateKey)}
                >
                  {dateValue.getDate()}
                </button>
              )
            })}
          </div>
        </section>

        {loading ? (
          <div className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-5">
            <div className="h-40 animate-pulse rounded-2xl bg-iron-900/60" />
          </div>
        ) : !sessions.length ? (
          <div className="rounded-[28px] border border-white/[0.05] bg-iron-800 p-6 text-[13px] text-zinc-500">
            No workout history yet.
          </div>
        ) : selectedSessions.length ? (
          <section className="space-y-4">
            {selectedSessions.map((session) => {
              const groupedSets = groupSetsByExercise(session.logged_sets)

              return (
                <article
                  key={session.id}
                  className="rounded-[28px] border border-white/[0.05] bg-iron-900/70 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        {formatSessionDate(session.date)}
                      </p>
                      <h2 className="mt-2 truncate text-[24px] font-bold tracking-[-0.04em] text-zinc-100">
                        {session.program_days?.name ?? 'Workout'}
                      </h2>
                      <p className="mt-2 text-[13px] text-zinc-500">
                        Day {session.program_days?.day_number ?? '--'} · {session.status ?? 'logged'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <HistoryMetric
                        label="Duration"
                        value={session.duration_minutes ? `${session.duration_minutes}m` : '--'}
                        hint="Elapsed"
                      />
                      <HistoryMetric
                        label={<GlossaryTerm term="volume">Volume</GlossaryTerm>}
                        value={`${Math.round(Number(session.total_volume) || 0)} kg`}
                        hint="Total load moved"
                      />
                      <HistoryMetric
                        label={<GlossaryTerm term="pr">PRs</GlossaryTerm>}
                        value={session.prs_hit ?? 0}
                        hint="New records"
                      />
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {Array.from(groupedSets.entries()).map(([exerciseName, sets]) => (
                      <details
                        key={`${session.id}-${exerciseName}`}
                        className="overflow-hidden rounded-[22px] border border-white/[0.04] bg-iron-950/60"
                      >
                        <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-zinc-200">
                          {exerciseName}
                        </summary>

                        <div className="border-t border-white/[0.04] px-4 py-3">
                          <div className="space-y-2">
                            {sets.map((set) => {
                              const prescribed = Number(set.rest_prescribed_seconds)
                              const actual = Number(set.rest_taken_seconds)
                              const isOverrun =
                                Number.isFinite(prescribed) &&
                                Number.isFinite(actual) &&
                                actual > prescribed

                              return (
                                <div
                                  key={set.id}
                                  className={`grid gap-2 rounded-xl px-3 py-2 text-[12px] lg:grid-cols-[0.7fr_1fr_1fr] ${
                                    isOverrun
                                      ? 'bg-coral/10 text-coral'
                                      : 'bg-iron-900 text-zinc-400'
                                  }`}
                                >
                                  <span className="font-mono">Set {set.set_number}</span>
                                  <span className="font-mono">
                                    {set.weight ?? '--'}kg × {set.reps ?? '--'}
                                  </span>
                                  <span className="lg:text-right">
                                    {isOverrun ? (
                                      <GlossaryTerm term="overrun">
                                        +{actual - prescribed}s rest
                                      </GlossaryTerm>
                                    ) : (
                                      'On target'
                                    )}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </article>
              )
            })}
          </section>
        ) : (
          <div className="rounded-[28px] border border-white/[0.05] bg-iron-800 p-6 text-[13px] text-zinc-500">
            Select a marked date to view session details.
          </div>
        )}
      </div>
    </section>
  )
}

export default HistoryPage
