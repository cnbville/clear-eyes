import { useMemo, useState } from 'react'
import GlossaryTerm from '../shared/GlossaryTerm.jsx'
import {
  calculateRestDiscipline,
  calculateVolume,
  getPrDisplayLabel,
  normalizePrType,
} from '../../lib/calculations.js'

const MOOD_OPTIONS = [
  { value: 1, emoji: '😵', label: 'Cooked' },
  { value: 2, emoji: '😬', label: 'Rough' },
  { value: 3, emoji: '😐', label: 'Solid' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😤', label: 'Locked in' },
]

function formatDate(value) {
  const date = value ? new Date(value) : new Date()

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return '--'
  }

  const durationSeconds = Math.max(
    Math.floor((Number(completedAt) - Number(startedAt)) / 1000),
    0,
  )
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}h`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getPlannedSets(session) {
  return (session?.day?.exercises ?? []).reduce((total, exercise) => {
    return total + (Number(exercise?.warmup_sets) || 0) + (Number(exercise?.working_sets) || 0)
  }, 0)
}

function formatVolume(sets) {
  const volume = calculateVolume(sets)

  if (!volume) {
    return '0 kg'
  }

  return `${Math.round(volume)} kg`
}

function formatRestDiscipline(sets) {
  const score = calculateRestDiscipline(sets)

  if (!score) {
    return '0%'
  }

  return `${Math.round(score)}%`
}

function getWorstRestOverrun(sets = []) {
  return sets.reduce((worst, set) => {
    const prescribed = Number(set?.rest_prescribed_seconds ?? set?.restPrescribedSeconds)
    const actual = Number(set?.rest_taken_seconds ?? set?.restTakenSeconds)
    const overrun = Number.isFinite(prescribed) && Number.isFinite(actual) ? actual - prescribed : 0

    if (overrun > worst.overrunSeconds) {
      return {
        overrunSeconds: overrun,
        exerciseName: set?.exercise_name ?? 'this lift',
      }
    }

    return worst
  }, { overrunSeconds: 0, exerciseName: null })
}

function getGuidanceId(guidance) {
  return [
    guidance?.phaseNumber,
    guidance?.dayNumber,
    guidance?.displayOrder,
    guidance?.exerciseId,
  ].join(':')
}

function formatGuidanceAction(value) {
  if (!value) {
    return 'Hold'
  }

  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function getReadinessTone(readinessBand) {
  if (readinessBand === 'green') {
    return 'border-mint/20 bg-mint/[0.08] text-zinc-200'
  }

  if (readinessBand === 'yellow') {
    return 'border-gold/20 bg-gold/[0.08] text-zinc-200'
  }

  if (readinessBand === 'red') {
    return 'border-coral/20 bg-coral/[0.08] text-zinc-200'
  }

  return 'border-white/[0.04] bg-iron-950/70 text-zinc-300'
}

function getPrCards(session) {
  if (Array.isArray(session?.prs) && session.prs.length) {
    return session.prs
  }

  return (session?.loggedSets ?? [])
      .filter((set) => set?.is_pr || set?.pr_type)
      .map((set, index) => ({
        id: set?.id ?? `${set?.exercise_name ?? 'pr'}-${set?.pr_type ?? index}`,
        title: getPrDisplayLabel(set?.pr_type ?? 'New PR'),
        subtitle: set?.exercise_name ?? 'Exercise',
        value:
          normalizePrType(set?.pr_type) === 'session_volume'
            ? `${Math.round(Number(set?.value) || Number(set?.session_volume) || 0)}kg`
            : set?.weight && set?.reps
          ? `${set.weight}kg × ${set.reps}`
          : set?.weight
            ? `${set.weight}kg`
            : set?.reps
              ? `${set.reps} reps`
              : 'Logged this session',
    }))
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl bg-iron-800 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-3 text-[24px] font-bold text-zinc-100 font-mono">{value}</p>
    </div>
  )
}

function SessionSummary({ session, phaseInfo, onClose }) {
  const [mood, setMood] = useState(session?.mood_rating ?? null)
  const [sessionRpe, setSessionRpe] = useState(session?.session_rpe ?? null)
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [acceptedGuidanceIds, setAcceptedGuidanceIds] = useState(() =>
    new Set((session?.progressionSuggestions ?? []).map((guidance) => getGuidanceId(guidance))),
  )

  const loggedSets = useMemo(() => session?.loggedSets ?? [], [session])
  const prCards = useMemo(() => getPrCards(session), [session])
  const plannedSets = useMemo(() => getPlannedSets(session), [session])
  const worstRestOverrun = useMemo(() => getWorstRestOverrun(loggedSets), [loggedSets])
  const progressionSuggestions = session?.progressionSuggestions ?? []
  const acceptedGuidance = progressionSuggestions.filter((guidance) =>
    acceptedGuidanceIds.has(getGuidanceId(guidance)),
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-iron-900">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <header className="rounded-[30px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-gold">
            Session Complete
          </p>
          <h1 className="mt-3 text-[32px] font-bold tracking-[-0.05em] text-zinc-50 sm:text-[40px]">
            {session?.day?.name ?? session?.dayName ?? 'Workout'}
          </h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            {formatDate(session?.completedAt)}
            {phaseInfo?.name ? ` · ${phaseInfo.name}` : ''}
          </p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard value={formatDuration(session?.startedAt, session?.completedAt)} label="Duration" />
          <StatCard value={formatVolume(loggedSets)} label={<GlossaryTerm term="volume">Volume</GlossaryTerm>} />
          <StatCard value={`${loggedSets.length}/${plannedSets}`} label="Sets" />
          <StatCard
            value={formatRestDiscipline(loggedSets)}
            label={<GlossaryTerm term="rest_discipline">Rest Discipline</GlossaryTerm>}
          />
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            {worstRestOverrun.overrunSeconds > 30 ? (
              <section className="rounded-[28px] border border-coral/30 bg-coral/10 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">
                  <GlossaryTerm term="overrun">Rest Overrun</GlossaryTerm> Warning
                </p>
                <p className="mt-2 text-[13px] leading-6 text-zinc-200">
                  Longest overrun was +{worstRestOverrun.overrunSeconds}s before{' '}
                  {worstRestOverrun.exerciseName ?? 'your next set'}.
                </p>
              </section>
            ) : null}

            {session?.readiness?.guidance ? (
              <section
                className={`rounded-[28px] border p-5 text-[13px] leading-6 ${getReadinessTone(
                  session.readiness.readiness_band,
                )}`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
                  {session.readiness.readiness_band === 'skipped'
                    ? 'Readiness Skipped'
                    : `Readiness · ${session.readiness.readiness_band ?? 'unknown'}`}
                </p>
                <p className="mt-2">{session.readiness.guidance}</p>
              </section>
            ) : null}

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <GlossaryTerm term="pr">PRs</GlossaryTerm>
              </p>

              {prCards.length ? (
                <div className="mt-4 space-y-3">
                  {prCards.map((prCard, index) => (
                    <div
                      key={prCard.id ?? `${prCard.title}-${index + 1}`}
                      className="rounded-[22px] border border-gold/40 bg-iron-950/70 p-4"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
                        {prCard.title ?? 'New PR'}
                      </p>
                      <p className="mt-2 text-[16px] font-semibold text-zinc-100">
                        {prCard.subtitle ?? 'Exercise'}
                      </p>
                      <p className="mt-1 font-mono text-[13px] text-zinc-400">
                        {prCard.value ?? 'Logged this session'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[22px] bg-iron-950/70 p-4 text-[13px] text-zinc-500">
                  No new PRs
                </div>
              )}
            </section>

            {progressionSuggestions.length ? (
              <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  Next-Session Guidance
                </p>

                <div className="mt-4 space-y-3">
                  {progressionSuggestions.map((guidance) => {
                    const guidanceId = getGuidanceId(guidance)
                    const isAccepted = acceptedGuidanceIds.has(guidanceId)

                    return (
                      <div
                        key={guidanceId}
                        className="rounded-[22px] border border-white/[0.04] bg-iron-950/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[14px] font-semibold text-zinc-100">
                              {guidance.exerciseName ?? 'Exercise'}
                            </p>
                            <p className="mt-1 text-[12px] text-zinc-500">
                              {formatGuidanceAction(guidance.guidance_action)}
                              {guidance.target_weight !== null && guidance.target_weight !== undefined
                                ? ` to ${guidance.target_weight}kg next exposure`
                                : ' next exposure'}
                            </p>
                          </div>

                          <button
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                              isAccepted
                                ? 'border-gold bg-gold/10 text-gold'
                                : 'border-white/[0.06] bg-iron-900 text-zinc-400 hover:border-gold/30 hover:text-zinc-100'
                            }`}
                            onClick={() =>
                              setAcceptedGuidanceIds((current) => {
                                const next = new Set(current)

                                if (next.has(guidanceId)) {
                                  next.delete(guidanceId)
                                } else {
                                  next.add(guidanceId)
                                }

                                return next
                              })
                            }
                          >
                            {isAccepted ? 'Will Save' : 'Skip'}
                          </button>
                        </div>

                        <p className="mt-3 text-[12px] leading-6 text-zinc-500">
                          {guidance.reason ?? 'Stored as personal load guidance for the next time this slot appears.'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Post-Workout
            </p>

            <div className="mt-4">
              <p className="text-[12px] font-medium text-zinc-300">Mood</p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {MOOD_OPTIONS.map((option) => {
                  const isSelected = mood === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-xl border px-2 py-3 text-center transition ${
                        isSelected
                          ? 'border-gold bg-gold/10'
                          : 'border-white/[0.04] bg-iron-900 text-zinc-500'
                      }`}
                      onClick={() => setMood(option.value)}
                    >
                      <div className="text-xl">{option.emoji}</div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                        {option.label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[12px] font-medium text-zinc-300">
                <GlossaryTerm term="session_rpe">Session RPE</GlossaryTerm>
              </p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
                  const isSelected = sessionRpe === value

                  return (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-xl border py-3 text-[13px] font-semibold transition ${
                        isSelected
                          ? 'border-gold bg-gold text-iron-900'
                          : 'border-white/[0.04] bg-iron-900 text-zinc-500'
                      }`}
                      onClick={() => setSessionRpe(value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[12px] font-medium text-zinc-300">Notes</p>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="How did the session feel?"
                className="mt-3 min-h-[160px] w-full rounded-xl border border-white/[0.04] bg-iron-900 px-3 py-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
              />
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-gold px-5 py-4 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition hover:bg-gold-light"
              onClick={() =>
                onClose?.({
                  mood_rating: mood,
                  session_rpe: sessionRpe,
                  notes,
                  acceptedGuidance,
                })
              }
            >
              Done
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SessionSummary
