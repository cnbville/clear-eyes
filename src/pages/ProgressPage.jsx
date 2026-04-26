import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import GlossaryTerm from '../components/shared/GlossaryTerm.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { useProgressDetail } from '../hooks/useProgressDetail.js'
import { useProgressSummary } from '../hooks/useProgressSummary.js'
import { estimateOneRepMax } from '../lib/calculations.js'
import { SOURCE_FILTERS } from '../lib/customWorkouts.js'

function formatShortDate(value) {
  if (!value) {
    return '--'
  }

  const date = value instanceof Date ? value : new Date(value)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatWeight(value, decimals = 1) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(decimals)}kg` : '--'
}

function getCoachToneClassName(tone) {
  if (tone === 'green') {
    return 'border-mint/20 bg-mint/[0.08]'
  }

  if (tone === 'amber') {
    return 'border-gold/20 bg-gold/[0.08]'
  }

  if (tone === 'coral') {
    return 'border-coral/20 bg-coral/[0.08]'
  }

  if (tone === 'sky') {
    return 'border-sky/20 bg-sky/[0.08]'
  }

  if (tone === 'gold') {
    return 'border-gold/20 bg-gold/[0.08]'
  }

  return 'border-white/[0.04] bg-iron-800'
}

function getDataQualityPresentation(dataQuality, sessionCount) {
  if (dataQuality === 'strong') {
    return {
      dotClassName: 'bg-accent-green',
      text: 'Summary is reliable',
    }
  }

  if (dataQuality === 'moderate') {
    return {
      dotClassName: 'bg-amber-400',
      text: 'Summary is directional — more data improves it',
    }
  }

  return {
    dotClassName: 'bg-accent-red',
    text: `Need ${Math.max(6 - sessionCount, 0)} more sessions for a stronger coaching read`,
  }
}

function SectionHeader({ children }) {
  return <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-600">{children}</p>
}

function ChartCard({ title, children, heightClassName = 'h-56' }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-white/[0.04] bg-iron-800 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-600">{title}</p>
      <div className={`mt-4 ${heightClassName}`}>{children}</div>
    </section>
  )
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/65 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] leading-6 text-zinc-500">{hint}</p>
    </div>
  )
}

function CoachCard({ card }) {
  return (
    <article className={`rounded-[26px] border p-5 ${getCoachToneClassName(card?.tone)}`}>
      <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-600">{card?.label}</p>
      <h3 className="mt-3 text-[18px] font-bold tracking-[-0.04em] text-zinc-50">
        {card?.title}
      </h3>
      <p className="mt-3 text-[13px] leading-6 text-zinc-300">{card?.body}</p>
    </article>
  )
}

function getProgramExercises(program) {
  const exercises = new Map()

  ;(program?.phases ?? []).forEach((phase) => {
    ;(phase?.weeks ?? []).forEach((week) => {
      ;(week?.days ?? []).forEach((day) => {
        ;(day?.exercises ?? []).forEach((exercise) => {
          const exerciseId = exercise?.effective_exercise_id ?? exercise?.exercise_id

          if (!exerciseId || exercises.has(exerciseId)) {
            return
          }

          exercises.set(exerciseId, {
            exerciseId,
            name: exercise?.name ?? 'Exercise',
          })
        })
      })
    })
  })

  return Array.from(exercises.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function buildFocusExerciseSeries(sessions = [], exerciseId, recoverySessions = []) {
  if (!exerciseId) {
    return []
  }

  const recoveryBySessionId = new Map(
    (recoverySessions ?? []).map((entry) => [entry.sessionId, entry]),
  )

  return sessions
    .map((session) => {
      const matchingSets = (session?.logged_sets ?? []).filter(
        (set) =>
          set?.exercise_id === exerciseId &&
          (set?.set_type ?? 'working') === 'working',
      )

      if (!matchingSets.length) {
        return null
      }

      const recoveryEntry = recoveryBySessionId.get(session.id) ?? null

      return {
        sessionId: session.id,
        date: session.date,
        label: formatShortDate(session.date),
        source: session.source ?? 'program',
        weight: Math.max(...matchingSets.map((set) => Number(set.weight) || 0)),
        volume: matchingSets.reduce(
          (sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0),
          0,
        ),
        estimatedOneRepMax: Math.max(
          ...matchingSets.map((set) => estimateOneRepMax(set.weight, set.reps)),
        ),
        readinessScore: recoveryEntry?.readinessScore ?? null,
        readinessBand: recoveryEntry?.readinessBand ?? null,
        bodyweightKg: recoveryEntry?.bodyweightKg ?? null,
      }
    })
    .filter(Boolean)
    .sort((left, right) => `${left.date}`.localeCompare(`${right.date}`))
}

function buildTopMarks(sessions = [], exerciseId) {
  if (!exerciseId) {
    return []
  }

  return sessions
    .flatMap((session) =>
      (session?.logged_sets ?? [])
        .filter(
          (set) =>
            set?.exercise_id === exerciseId &&
            (set?.set_type ?? 'working') === 'working',
        )
        .map((set) => ({
          id: set.id,
          date: session.date,
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
          e1RM: estimateOneRepMax(set.weight, set.reps),
        })),
    )
    .sort((left, right) => right.e1RM - left.e1RM || right.weight - left.weight)
    .slice(0, 5)
}

function ProgressPage({ program, progress, onNavigate }) {
  const [sourceFilter, setSourceFilter] = useState('all')
  const [overlayMode, setOverlayMode] = useState('Combined')
  const [phaseLens, setPhaseLens] = useState('Strength')
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const summary = useProgressSummary(program, progress, sourceFilter)
  const exerciseOptions = useMemo(() => getProgramExercises(program), [program])
  const resolvedSelectedExerciseId =
    selectedExerciseId && exerciseOptions.some((exercise) => exercise.exerciseId === selectedExerciseId)
      ? selectedExerciseId
      : exerciseOptions[0]?.exerciseId ?? ''
  const detail = useProgressDetail(program?.id ?? null, resolvedSelectedExerciseId, sourceFilter)
  const selectedExercise = useMemo(
    () =>
      exerciseOptions.find((exercise) => exercise.exerciseId === resolvedSelectedExerciseId) ??
      exerciseOptions[0] ??
      null,
    [exerciseOptions, resolvedSelectedExerciseId],
  )
  const focusSeries = useMemo(
    () => buildFocusExerciseSeries(detail.sessions, resolvedSelectedExerciseId, summary.recoverySeries?.sessions),
    [detail.sessions, resolvedSelectedExerciseId, summary.recoverySeries?.sessions],
  )
  const topMarks = useMemo(
    () => buildTopMarks(detail.sessions, resolvedSelectedExerciseId),
    [detail.sessions, resolvedSelectedExerciseId],
  )
  const phaseLensSeries = summary.longTermLenses?.[phaseLens] ?? []
  const qualityPresentation = getDataQualityPresentation(summary.dataQuality, summary.sessionCount)
  const adherenceQuota = summary.adherenceSummary?.weeklyQuota?.activeWeek?.completed ?? 0
  const adherenceTarget =
    summary.adherenceSummary?.weeklyQuota?.effectiveTarget ??
    program?.days_per_week ??
    0
  const latestReadinessBand = summary.readinessSummary?.latestBand ?? 'none'

  useInteractionContext('progress', {
    breadcrumbSegments: ['IRON', 'Progress', selectedExercise?.name ?? 'Summary'],
    footerActions: [
      {
        action: () => onNavigate?.('home'),
        displayShortcut: '←',
        id: 'progress-dashboard',
        label: 'Dashboard',
        shortcut: 'ArrowLeft',
      },
    ],
  })

  if (summary.loading) {
    return (
      <section className="space-y-4 py-3">
        <div className="h-24 animate-pulse rounded-[26px] bg-iron-800/70" />
        <div className="h-64 animate-pulse rounded-[26px] bg-iron-800/70" />
        <div className="h-64 animate-pulse rounded-[26px] bg-iron-800/70" />
      </section>
    )
  }

  if (!summary.sessionCount && !summary.isSampleData) {
    return (
      <section className="py-6">
        <div className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-8 text-center">
          <p className="text-[18px] font-bold text-zinc-200">
            {sourceFilter === 'all'
              ? 'Complete your first workout to start generating analytics.'
              : `No ${sourceFilter} sessions match this filter yet.`}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5 py-2">
      <header className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[13px] text-zinc-500">
              Generated from {summary.sessionCount} sessions · {summary.weekCount} weeks
            </p>
            <div className="mt-3">
              <SectionHeader>Performance Analytics</SectionHeader>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px] text-zinc-400">
              <span className={`h-2.5 w-2.5 rounded-full ${qualityPresentation.dotClassName}`} />
              <span>{qualityPresentation.text}</span>
            </div>
          </div>

          {summary.isSampleData ? (
            <div className="rounded-2xl border border-gold/20 bg-gold/[0.08] px-4 py-3 text-[12px] text-zinc-200">
              Showing sample data while you build your own training history.
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                sourceFilter === option.value
                  ? 'bg-gold text-iron-900'
                  : 'bg-iron-900 text-zinc-400 hover:text-zinc-100'
              }`}
              onClick={() => setSourceFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {summary.error ? (
          <div className="mt-4 rounded-2xl border border-accent-red/20 bg-accent-red/[0.08] px-4 py-3 text-[12px] text-zinc-400">
            Report note: {summary.error}
          </div>
        ) : null}
      </header>

      <section className="space-y-3">
        <SectionHeader>Coach Summary</SectionHeader>
        <div className="grid gap-3 xl:grid-cols-2">
          {(summary.coachSummary ?? []).map((card) => (
            <CoachCard key={card.label} card={card} />
          ))}
        </div>
      </section>

      <section className="section-frame px-5 py-5">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionHeader>Program Adherence</SectionHeader>
            <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-zinc-50">
              {adherenceQuota}/{adherenceTarget || 0} slots resolved this week
            </h2>
            <p className="mt-2 text-[13px] leading-7 text-zinc-500">
              This panel stays program-only. Performance analytics below still respect the source filter.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCard
              label="Carryovers"
              value={summary.adherenceSummary?.carryovers ?? 0}
              hint="Unresolved slots pulled forward"
            />
            <MetricCard
              label="Late Finishes"
              value={summary.adherenceSummary?.recoveredLate ?? 0}
              hint="Recovered after carryover"
            />
            <MetricCard
              label="Skipped"
              value={summary.adherenceSummary?.skippedSlots ?? 0}
              hint="Intentional program skips"
            />
            <MetricCard
              label="Readiness"
              value={latestReadinessBand.toUpperCase()}
              hint={
                summary.readinessSummary?.recentLogs?.length
                  ? `${summary.readinessSummary.greenCount} green · ${summary.readinessSummary.yellowCount} yellow · ${summary.readinessSummary.redCount} red`
                  : 'No readiness logs yet'
              }
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="section-frame px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionHeader>Focus Lift</SectionHeader>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-zinc-50">
                Drill into one lift at a time
              </h2>
              <p className="mt-2 text-[13px] leading-7 text-zinc-500">
                The page only loads set-level history for the lift you choose here.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {['Training', 'Recovery', 'Combined'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                    overlayMode === mode
                      ? 'bg-gold text-iron-900'
                      : 'bg-iron-900 text-zinc-400 hover:text-zinc-100'
                  }`}
                  onClick={() => setOverlayMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <select
              value={resolvedSelectedExerciseId}
              onChange={(event) => setSelectedExerciseId(event.target.value)}
              className="w-full rounded-2xl border border-white/[0.05] bg-iron-950/70 px-4 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
            >
              {exerciseOptions.map((exercise) => (
                <option key={exercise.exerciseId} value={exercise.exerciseId}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </div>

          {detail.loading ? (
            <div className="mt-4 rounded-[22px] bg-iron-950/60 px-4 py-4 text-[13px] text-zinc-500">
              Loading focus-lift detail…
            </div>
          ) : null}

          {!detail.loading && detail.error ? (
            <div className="mt-4 rounded-[22px] border border-red-500/20 bg-red-500/[0.06] px-4 py-4 text-[13px] text-zinc-300">
              {detail.error}
            </div>
          ) : null}

          {!detail.loading && !focusSeries.length ? (
            <div className="mt-4 rounded-[22px] bg-iron-950/60 px-4 py-4 text-[13px] text-zinc-500">
              No completed working-set history for this lift in the current filter.
            </div>
          ) : null}

          {!detail.loading && focusSeries.length ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <ChartCard title="Lift Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={focusSeries} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(10,10,11,0.96)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '18px',
                      }}
                    />
                    {overlayMode !== 'Recovery' ? (
                      <>
                        <Line type="monotone" dataKey="weight" stroke="#d1ab4f" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="estimatedOneRepMax" stroke="#3ecf8e" strokeWidth={2} dot={false} />
                      </>
                    ) : null}
                    {overlayMode !== 'Training' ? (
                      <>
                        <Line type="monotone" dataKey="readinessScore" stroke="#60a5fa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="bodyweightKg" stroke="#f97316" strokeWidth={2} dot={false} />
                      </>
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <section className="space-y-3">
                <MetricCard
                  label="Exposures"
                  value={focusSeries.length}
                  hint="Completed sessions for this lift in the active window"
                />
                <MetricCard
                  label="Current e1RM"
                  value={detail.projection ? formatWeight(detail.projection.currentE1RM) : '--'}
                  hint={
                    detail.projection
                      ? `${detail.projection.ratePerWeek >= 0 ? '+' : ''}${detail.projection.ratePerWeek}kg/week`
                      : 'Need more detail points'
                  }
                />
                <MetricCard
                  label="Best Mark"
                  value={topMarks[0] ? `${topMarks[0].weight}kg × ${topMarks[0].reps}` : '--'}
                  hint={topMarks[0] ? formatShortDate(topMarks[0].date) : 'No top mark yet'}
                />
              </section>
            </div>
          ) : null}

          {!detail.loading && topMarks.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {topMarks.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    {formatShortDate(entry.date)}
                  </p>
                  <p className="mt-2 text-[15px] font-semibold text-zinc-100">
                    {entry.weight}kg × {entry.reps}
                  </p>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    <GlossaryTerm term="estimated_1rm">e1RM</GlossaryTerm> {formatWeight(entry.e1RM)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <ChartCard title="Recovery Overview">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.recoverySeries?.weeks ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,11,0.96)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '18px',
                  }}
                />
                {overlayMode !== 'Training' ? (
                  <>
                    <Line type="monotone" dataKey="avgReadinessScore" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="avgBodyweightKg" stroke="#f97316" strokeWidth={2} dot={false} />
                  </>
                ) : null}
                {overlayMode !== 'Recovery' ? (
                  <>
                    <Line type="monotone" dataKey="avgSessionRpe" stroke="#d1ab4f" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="avgRestDiscipline" stroke="#3ecf8e" strokeWidth={2} dot={false} />
                  </>
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Sessions"
              value={summary.sessionCount}
              hint={`${summary.weekCount} tracked weeks in the current window`}
            />
            <MetricCard
              label="Volume Trend"
              value={`${summary.volumeTrend?.rateOfChange ?? 0}%`}
              hint={summary.volumeTrend?.label ?? 'volume still forming'}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="section-frame px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionHeader>Across Phases</SectionHeader>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                Long-term view stays aggregated by phase to keep memory bounded.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {['Strength', 'Workload', 'Recovery'].map((lens) => (
                <button
                  key={lens}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                    phaseLens === lens
                      ? 'bg-gold text-iron-900'
                      : 'bg-iron-900 text-zinc-400 hover:text-zinc-100'
                  }`}
                  onClick={() => setPhaseLens(lens)}
                >
                  {lens}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phaseLensSeries} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,11,0.96)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '18px',
                  }}
                />
                <Bar dataKey="value" fill="#d1ab4f" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="section-frame px-5 py-5">
          <SectionHeader>PR Breakdown</SectionHeader>
          <div className="mt-4 space-y-3">
            {summary.prBreakdown.length ? (
              summary.prBreakdown.map((entry) => (
                <div
                  key={entry.prType}
                  className="flex items-center justify-between gap-3 rounded-[22px] bg-iron-950/60 px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-100">{entry.label}</p>
                    <p className="mt-1 text-[12px] text-zinc-500">
                      Latest {entry.latestAchievedAt ? formatShortDate(entry.latestAchievedAt) : '--'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[18px] font-semibold text-zinc-50">{entry.count}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">records</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] bg-iron-950/60 px-4 py-4 text-[13px] text-zinc-500">
                No PR history yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="section-frame px-5 py-5">
        <SectionHeader>Recent Sessions</SectionHeader>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {summary.sessions.slice(-8).reverse().map((session) => (
            <article
              key={session.id}
              className="rounded-[22px] border border-white/[0.05] bg-iron-950/60 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-zinc-100">
                    {session?.program_days?.name ?? 'Workout'}
                  </p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {formatShortDate(session.date)} · {(session.source ?? 'program') === 'program' ? 'Program' : 'Custom'}
                  </p>
                </div>
                <p className="text-[12px] text-zinc-500">
                  {session.duration_minutes ?? '--'} min
                </p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Volume</p>
                  <p className="mt-1 text-[13px] font-semibold text-zinc-100">
                    {formatWeight(session.total_volume ?? 0, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Sets</p>
                  <p className="mt-1 text-[13px] font-semibold text-zinc-100">
                    {session.total_sets ?? '--'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">PRs</p>
                  <p className="mt-1 text-[13px] font-semibold text-zinc-100">
                    {session.prs_hit ?? 0}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

export default ProgressPage
