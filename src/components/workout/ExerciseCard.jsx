import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Check,
  ExternalLink,
  PlayCircle,
  RefreshCw,
} from 'lucide-react'
import GlossaryTerm from '../shared/GlossaryTerm.jsx'
import { formatGhostData } from '../../hooks/useGhostData.js'
import {
  buildWarmupLadder,
  getSmartRestRecommendation,
  getWarmupAnchor,
} from '../../lib/adaptiveProgram.js'
import { getTargetReps, parseReps } from '../../lib/repParser.js'
import { getYouTubeEmbedUrl, isYouTubeUrl } from '../../lib/youtube.js'

const RPE_OPTIONS = [6, 7, 8, 9, 10]

function formatPrefix(exercise) {
  if (!exercise?.group_id) {
    return null
  }

  return `${exercise.group_id}${exercise.group_order ?? ''}.`
}

function normalizeNumberInput(value) {
  if (value === '' || value === null || value === undefined) {
    return ''
  }

  return `${value}`
}

function normalizeDecimalInput(value) {
  if (value === null || value === undefined) {
    return ''
  }

  return `${value}`
    .replace(',', '.')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

function parseLoggedWeight(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const normalizedValue = `${value}`.replace(',', '.')
  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function getGhostWeight(lastSessionSets, candidates = []) {
  if (!Array.isArray(lastSessionSets) || !lastSessionSets.length) {
    return null
  }

  for (const candidate of candidates) {
    const matchedSet = lastSessionSets.find((set) => set.set_number === candidate)

    if (matchedSet?.weight !== undefined && matchedSet?.weight !== null) {
      return normalizeNumberInput(matchedSet.weight)
    }
  }

  return null
}

function formatAnchorSource(source) {
  if (source === 'load_guidance') {
    return 'accepted guidance'
  }

  if (source === 'last_completed') {
    return 'last completed working set'
  }

  if (source === 'current_input') {
    return 'current first-set input'
  }

  return 'percentage-only ramp'
}

function formatRestSeconds(seconds) {
  const normalizedSeconds = Math.max(Number(seconds) || 0, 0)
  const minutes = Math.floor(normalizedSeconds / 60)
  const remainderSeconds = normalizedSeconds % 60

  if (!minutes) {
    return `${remainderSeconds}s`
  }

  if (!remainderSeconds) {
    return `${minutes}m`
  }

  return `${minutes}m ${remainderSeconds}s`
}

function SetRow({
  label,
  weight,
  reps,
  checked,
  highlighted,
  onWeightChange,
  onRepsChange,
  onToggle,
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[20px] border px-3 py-3 transition ${
        highlighted
          ? 'border-gold/25 bg-gold/[0.08] shadow-[0_12px_30px_rgba(209,171,79,0.08)]'
          : 'border-white/[0.04] bg-iron-950/45'
      }`}
    >
      <span className="w-9 shrink-0 font-mono text-[12px] font-semibold uppercase text-zinc-500">
        {label}
      </span>

      <input
        type="text"
        inputMode="decimal"
        value={weight}
        onChange={(event) => onWeightChange(normalizeDecimalInput(event.target.value))}
        className="w-16 rounded-xl border border-white/[0.05] bg-black/30 py-2 text-center font-mono text-[15px] text-zinc-100 focus:border-gold focus:outline-none"
        placeholder="0.0"
      />
      <span className="text-[12px] text-zinc-500">kg</span>

      <input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(event) => onRepsChange(event.target.value)}
        className="w-14 rounded-xl border border-white/[0.05] bg-black/30 py-2 text-center font-mono text-[15px] text-zinc-100 focus:border-gold focus:outline-none"
      />

      <button
        type="button"
        className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
          checked
            ? 'border-gold bg-gold text-iron-900'
            : 'border-white/[0.05] bg-black/30 text-zinc-500 hover:border-gold/40 hover:text-zinc-200'
        }`}
        onClick={onToggle}
      >
        <Check className="h-4 w-4" strokeWidth={2.4} />
      </button>
    </div>
  )
}

function createWarmupRows(warmupCount, lastSessionSets, warmupPlan = [], initialRows = null) {
  if (Array.isArray(initialRows) && initialRows.length === warmupCount) {
    return initialRows.map((row) => ({
      weight: normalizeNumberInput(row?.weight),
      reps: normalizeNumberInput(row?.reps),
      checked: Boolean(row?.checked),
    }))
  }

  return Array.from({ length: warmupCount }, (_, index) => ({
    weight:
      warmupPlan[index]?.weight !== null && warmupPlan[index]?.weight !== undefined
        ? normalizeNumberInput(warmupPlan[index].weight)
        : getGhostWeight(lastSessionSets, [index + 1]) ?? '',
    reps:
      warmupPlan[index]?.reps !== null && warmupPlan[index]?.reps !== undefined
        ? normalizeNumberInput(warmupPlan[index].reps)
        : '',
    checked: false,
  }))
}

function createWorkingRows(
  exercise,
  workingCount,
  warmupCount,
  parsedReps,
  lastSessionSets,
  initialRows = null,
) {
  if (Array.isArray(initialRows) && initialRows.length === workingCount) {
    return initialRows.map((row) => ({
      weight:
        row?.weight === null || row?.weight === undefined
          ? null
          : normalizeNumberInput(row.weight),
      reps:
        row?.reps === null || row?.reps === undefined
          ? null
          : normalizeNumberInput(row.reps),
      checked: Boolean(row?.checked),
      rpe: row?.rpe ?? null,
    }))
  }

  const guidanceWeight =
    exercise?.load_guidance_weight === null || exercise?.load_guidance_weight === undefined
      ? null
      : normalizeNumberInput(exercise.load_guidance_weight)

  return Array.from({ length: workingCount }, (_, index) => ({
    weight:
      (index === 0 ? guidanceWeight : null) ??
      getGhostWeight(lastSessionSets, [warmupCount + index + 1, index + 1]) ??
      null,
    reps: getTargetReps(parsedReps, index + 1)?.toString() ?? null,
    checked: false,
    rpe: null,
  }))
}

function ExerciseCard({
  exercise,
  initialDraft = null,
  lastSessionSets = null,
  onSetComplete,
  onDraftChange,
  onUseSwap,
  onRememberSwap,
  onOpenSwapOptions,
  phaseColor = '#c9a227',
  submitSignal = 0,
  swapOptions = [],
  swapOptionsLoading = false,
  exerciseNote = '',
  onExerciseNoteChange,
  warmupPrimers = [],
  smartRestEnabled = true,
}) {
  const prefix = formatPrefix(exercise)
  const parsedReps = useMemo(
    () => parseReps(exercise?.rep_notation ?? ''),
    [exercise?.rep_notation],
  )
  const demoEmbedUrl = useMemo(
    () => getYouTubeEmbedUrl(exercise?.video_url ?? ''),
    [exercise?.video_url],
  )
  const hasYouTubeDemo = useMemo(
    () => isYouTubeUrl(exercise?.video_url ?? ''),
    [exercise?.video_url],
  )
  const warmupCount = Number(exercise?.warmup_sets) || 0
  const workingCount = Number(exercise?.working_sets) || 0
  const initialWarmupAnchor = useMemo(
    () =>
      getWarmupAnchor({
        exercise,
        lastSessionSets,
      }),
    [exercise, lastSessionSets],
  )
  const initialWarmupPlan = useMemo(
    () =>
      buildWarmupLadder({
        exercise,
        anchorWeight: initialWarmupAnchor.weight,
        warmupCount,
      }),
    [exercise, initialWarmupAnchor.weight, warmupCount],
  )
  const lastHandledSubmitSignalRef = useRef(submitSignal)
  const [showSwapOptions, setShowSwapOptions] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [workingRows, setWorkingRows] = useState(() =>
    createWorkingRows(
      exercise,
      workingCount,
      warmupCount,
      parsedReps,
      lastSessionSets,
      initialDraft?.workingRows ?? null,
    ),
  )
  const [warmupRows, setWarmupRows] = useState(() =>
    createWarmupRows(
      warmupCount,
      lastSessionSets,
      initialWarmupPlan,
      initialDraft?.warmupRows ?? null,
    ),
  )

  const currentWorkingIndex = workingRows.findIndex((row) => !row.checked)
  const highlightedWorkingIndex =
    currentWorkingIndex === -1 ? workingRows.length - 1 : currentWorkingIndex
  const currentWorkingRow =
    highlightedWorkingIndex >= 0 ? workingRows[highlightedWorkingIndex] : null
  const highlightedWorkingReps =
    currentWorkingRow?.reps !== null && currentWorkingRow?.reps !== undefined
      ? normalizeNumberInput(currentWorkingRow.reps)
      : getTargetReps(parsedReps, Math.max(highlightedWorkingIndex, 0) + 1)?.toString() ?? ''

  function getResolvedWorkingWeight(index) {
    const row = workingRows[index]

    if (row?.weight !== null && row?.weight !== undefined) {
      return normalizeNumberInput(row.weight)
    }

    if (
      index === 0 &&
      exercise?.load_guidance_weight !== null &&
      exercise?.load_guidance_weight !== undefined
    ) {
      return normalizeNumberInput(exercise.load_guidance_weight)
    }

    const ghostWeight = getGhostWeight(lastSessionSets, [warmupCount + index + 1, index + 1])

    if (ghostWeight !== null) {
      return ghostWeight
    }

    if (index > 0) {
      return getResolvedWorkingWeight(index - 1)
    }

    return ''
  }

  function getResolvedWorkingReps(index) {
    const row = workingRows[index]

    if (row?.reps !== null && row?.reps !== undefined) {
      return normalizeNumberInput(row.reps)
    }

    return getTargetReps(parsedReps, index + 1)?.toString() ?? ''
  }

  const warmupAnchor = useMemo(
    () =>
      getWarmupAnchor({
        exercise,
        lastSessionSets,
        firstWorkingWeight: workingRows[0]?.weight ?? null,
      }),
    [exercise, lastSessionSets, workingRows],
  )
  const warmupPlan = useMemo(
    () =>
      buildWarmupLadder({
        exercise,
        anchorWeight: warmupAnchor.weight,
        warmupCount,
      }),
    [exercise, warmupAnchor.weight, warmupCount],
  )
  const currentSetType = warmupRows.some((row) => !row.checked) ? 'warmup' : 'working'
  const smartRestRecommendation = useMemo(
    () =>
      getSmartRestRecommendation({
        exercise,
        setType: currentSetType,
        reps:
          currentSetType === 'working'
            ? highlightedWorkingReps
            : warmupPlan.find((entry) => !warmupRows[entry.set_number - 1]?.checked)?.reps ?? null,
        rpeActual: currentWorkingRow?.rpe ?? null,
        groupId: exercise?.group_id ?? null,
        programRestSeconds: exercise?.rest_seconds ?? null,
        smartRestEnabled,
      }),
    [
      currentSetType,
      currentWorkingRow?.rpe,
      exercise,
      highlightedWorkingReps,
      smartRestEnabled,
      warmupPlan,
      warmupRows,
    ],
  )
  const emitDraftChange = useEffectEvent((nextDraft) => {
    onDraftChange?.(nextDraft)
  })

  useEffect(() => {
    emitDraftChange({
      warmupRows,
      workingRows,
    })
  }, [warmupRows, workingRows])

  function updateWarmupRow(index, field, value) {
    setWarmupRows((currentRows) =>
      currentRows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, [field]: value } : row,
      ),
    )
  }

  function updateWorkingRow(index, field, value) {
    setWorkingRows((currentRows) =>
      currentRows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, [field]: value } : row,
      ),
    )
  }

  function handleWarmupToggle(index) {
    const row = warmupRows[index]

    if (!row) {
      return
    }

    const nextChecked = !row.checked

    updateWarmupRow(index, 'checked', nextChecked)

    if (nextChecked) {
      onSetComplete?.({
        set_number: index + 1,
        weight: parseLoggedWeight(row.weight),
        reps: row.reps === '' ? null : Number(row.reps),
        rpe_actual: null,
        set_type: 'warmup',
      })
    }
  }

  function handleWorkingToggle(index) {
    const row = workingRows[index]

    if (!row) {
      return
    }

    const nextChecked = !row.checked
    const weight = getResolvedWorkingWeight(index)
    const reps = getResolvedWorkingReps(index)

    updateWorkingRow(index, 'checked', nextChecked)

    if (nextChecked) {
      onSetComplete?.({
        set_number: warmupCount + index + 1,
        weight: parseLoggedWeight(weight),
        reps: reps === '' ? null : Number(reps),
        rpe_actual: row.rpe,
        set_type: 'working',
      })
    }
  }

  const handleSubmitNextSet = useEffectEvent(() => {
    const nextWarmupIndex = warmupRows.findIndex((row) => !row.checked)

    if (nextWarmupIndex !== -1) {
      handleWarmupToggle(nextWarmupIndex)
      return
    }

    const nextWorkingIndex = workingRows.findIndex((row) => !row.checked)

    if (nextWorkingIndex !== -1) {
      handleWorkingToggle(nextWorkingIndex)
    }
  })

  useEffect(() => {
    if (submitSignal === lastHandledSubmitSignalRef.current) {
      return
    }

    lastHandledSubmitSignalRef.current = submitSignal
    const timeoutId = window.setTimeout(() => {
      handleSubmitNextSet()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [submitSignal])

  return (
    <article className="rounded-2xl border border-white/[0.04] bg-iron-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Exercise Focus
          </p>
          <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-zinc-100">
            {prefix ? <span className="mr-1.5 text-gold">{prefix}</span> : null}
            {exercise?.name ?? 'Unnamed exercise'}
          </h3>

          <div className="mt-2 flex flex-wrap gap-2">
            {exercise?.muscle ? (
              <span className="soft-pill">
                {exercise.muscle}
              </span>
            ) : null}
            {exercise?.equipment ? (
              <span className="soft-pill">
                {exercise.equipment}
              </span>
            ) : null}
            {exercise?.technique ? (
              <span className="soft-pill border-gold/20 bg-gold/10 text-gold">
                {exercise.technique.replace(/_/g, ' ')}
              </span>
            ) : null}
            {exercise?.preferred_swap ? (
              <span className="soft-pill border-sky/20 bg-sky/10 text-sky">
                Remembered swap
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.05] bg-iron-900 text-zinc-500 transition hover:border-gold/30 hover:text-zinc-200"
            onClick={() =>
              setShowSwapOptions((current) => {
                const nextValue = !current

                if (nextValue) {
                  onOpenSwapOptions?.()
                }

                return nextValue
              })
            }
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
          </button>

          {showSwapOptions ? (
            <div className="absolute right-0 top-14 z-10 min-w-[300px] overflow-hidden rounded-[24px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(17,17,20,0.98),rgba(9,9,11,0.98))] shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
              {swapOptionsLoading ? (
                <div className="px-4 py-4 text-[12px] text-zinc-500">Loading swap options…</div>
              ) : swapOptions.length ? (
                swapOptions.map((option) => (
                  <div
                    key={option.id}
                    className="border-b border-white/[0.05] px-4 py-4 last:border-b-0"
                  >
                    <p className="text-[12px] font-semibold text-zinc-200">{option.name}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{option.swap_reason}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-white/[0.06] bg-black/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-gold/30 hover:text-zinc-100"
                        onClick={() => {
                          onUseSwap?.(option)
                          setShowSwapOptions(false)
                        }}
                      >
                        Use once
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-sky/20 bg-sky/10 px-3 py-1.5 text-[11px] font-medium text-sky transition hover:border-sky/40 hover:text-white"
                        onClick={() => {
                          onRememberSwap?.(option)
                          setShowSwapOptions(false)
                        }}
                      >
                        Remember
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2.5 text-[12px] text-zinc-600">No swap options</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {exercise?.preferred_swap && exercise?.original_exercise_name ? (
        <div className="mt-4 rounded-[22px] border border-sky/20 bg-sky/10 px-4 py-3 text-[12px] text-sky">
          Using {exercise.name} instead of {exercise.original_exercise_name}.
        </div>
      ) : null}

      {exercise?.load_guidance_weight !== null && exercise?.load_guidance_weight !== undefined ? (
        <div className="mt-4 rounded-[22px] border border-gold/15 bg-gold/[0.06] px-4 py-3 text-[12px] text-zinc-300">
          Next-session guidance: {exercise.load_guidance_weight}kg
          {exercise?.load_guidance_action ? ` · ${exercise.load_guidance_action}` : ''}
        </div>
      ) : null}

      {exercise?.coaching_cue ? (
        <details className="mt-4 rounded-lg bg-iron-900/50 px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Coaching Cue
            <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
          </summary>
          <p className="mt-3 text-[12px] italic leading-6 text-zinc-500">
            {exercise.coaching_cue}
          </p>
        </details>
      ) : null}

      {exercise?.video_url ? (
        <section className="mt-4 overflow-hidden rounded-xl border border-white/[0.04] bg-iron-900/60">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-black/20"
            onClick={() => setShowDemo((current) => !current)}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Demo
              </p>
              <p className="mt-1 text-[13px] font-semibold text-zinc-100">
                {hasYouTubeDemo ? 'Watch Exercise Demo' : 'Open Demo Link'}
              </p>
            </div>

            <div className="flex items-center gap-2 text-zinc-500">
              <PlayCircle className="h-4 w-4" strokeWidth={1.8} />
              <ChevronDown
                className={`h-4 w-4 transition ${showDemo ? 'rotate-180' : ''}`}
                strokeWidth={1.8}
              />
            </div>
          </button>

          {showDemo ? (
            <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
              {demoEmbedUrl ? (
                <div className="overflow-hidden rounded-xl border border-white/[0.04] bg-iron-950">
                  <div className="aspect-video">
                    <iframe
                      title={`${exercise?.name ?? 'Exercise'} demo`}
                      src={demoEmbedUrl}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-white/[0.04] bg-iron-950 px-3 py-4 text-[12px] text-zinc-500">
                  This demo link cannot be embedded inline, but you can still open it directly.
                </p>
              )}

              <a
                href={exercise.video_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold text-zinc-400 transition hover:text-zinc-100"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                {hasYouTubeDemo ? 'Open on YouTube' : 'Open Demo Link'}
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-4 rounded-lg border border-white/[0.04] bg-iron-900/50 px-3.5 py-3">
        {lastSessionSets?.length ? (
          <p className="font-mono text-[12px] text-zinc-500">
            <GlossaryTerm term="ghost_data">Last:</GlossaryTerm> {formatGhostData(lastSessionSets)}{' '}
            <span className="ml-1">↑↓</span>
          </p>
        ) : (
          <p className="text-[12px] text-zinc-500">
            <GlossaryTerm term="ghost_data">First time</GlossaryTerm> — no previous data ✨
          </p>
        )}
      </div>

      <section className="mt-4 rounded-xl border border-white/[0.04] bg-iron-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Lift Notes
          </p>
          {exerciseNote ? (
            <span className="rounded-full border border-mint/20 bg-mint/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-mint">
              Saved
            </span>
          ) : null}
        </div>
        <textarea
          value={exerciseNote ?? ''}
          onChange={(event) => onExerciseNoteChange?.(event.target.value)}
          placeholder="Cues, setup reminders, or what made this lift click."
          className="mt-3 min-h-[92px] w-full rounded-xl border border-white/[0.04] bg-iron-950 px-3 py-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
        />
      </section>

      {(warmupCount > 0 || warmupPrimers.length) ? (
        <section className="mt-4 rounded-[24px] border border-gold/15 bg-gold/[0.06] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                Warm-Up Builder
              </p>
              <p className="mt-2 text-[12px] text-zinc-300">
                Ramp anchored to{' '}
                {warmupAnchor.weight !== null && warmupAnchor.weight !== undefined
                  ? `${warmupAnchor.weight}kg`
                  : 'percentages only'}{' '}
                from {formatAnchorSource(warmupAnchor.source)}.
              </p>
            </div>
            <p className="text-[11px] text-zinc-500">
              {warmupCount
                ? `${warmupCount} warm-up set${warmupCount > 1 ? 's' : ''}`
                : 'Primers only'}
            </p>
          </div>

          {warmupPrimers.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {warmupPrimers.map((primer) => (
                <span
                  key={primer}
                  className="rounded-full border border-white/[0.04] bg-iron-950/70 px-3 py-1.5 text-[11px] text-zinc-300"
                >
                  {primer}
                </span>
              ))}
            </div>
          ) : null}

          {warmupPlan.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {warmupPlan.map((entry) => (
                <div
                  key={entry.set_number}
                  className="rounded-xl border border-white/[0.04] bg-iron-950/70 px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    {entry.label}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-zinc-100">
                    {entry.weight !== null && entry.weight !== undefined
                      ? `${entry.weight}kg`
                      : `${entry.percentage}%`}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">{entry.reps} reps</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {warmupCount > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              <GlossaryTerm term="warmup_sets">Warm-Up</GlossaryTerm>
            </p>
          </div>

          <div className="space-y-2">
            {warmupRows.map((row, index) => (
              <SetRow
                key={`warmup-${index + 1}`}
                label={`W${index + 1}`}
                weight={normalizeNumberInput(row.weight)}
                reps={normalizeNumberInput(row.reps)}
                checked={row.checked}
                highlighted={false}
                onWeightChange={(value) => updateWarmupRow(index, 'weight', value)}
                onRepsChange={(value) => updateWarmupRow(index, 'reps', value)}
                onToggle={() => handleWarmupToggle(index)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            <GlossaryTerm term="working_sets">Working Sets</GlossaryTerm>
          </p>
          <p className="text-[12px] text-zinc-500">
            Target: {exercise?.rep_notation ?? '--'}
            {exercise?.rpe || exercise?.rpe_notation || exercise?.rpe_target
              ? ` · RPE ${exercise?.rpe ?? exercise?.rpe_notation ?? exercise?.rpe_target}`
              : ''}
          </p>
        </div>

        <div className="space-y-2">
          {workingRows.map((row, index) => (
            <SetRow
              key={`working-${index + 1}`}
              label={`${index + 1}`}
              weight={getResolvedWorkingWeight(index)}
              reps={getResolvedWorkingReps(index)}
              checked={row.checked}
              highlighted={index === highlightedWorkingIndex}
              onWeightChange={(value) => updateWorkingRow(index, 'weight', value)}
              onRepsChange={(value) => updateWorkingRow(index, 'reps', value)}
              onToggle={() => handleWorkingToggle(index)}
            />
          ))}
        </div>
      </div>

      {smartRestRecommendation?.targetSeconds ? (
        <section className="mt-5 rounded-[24px] border border-white/[0.05] bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                {smartRestRecommendation.label}
              </p>
              <p className="mt-2 text-[14px] font-semibold text-zinc-100">
                {formatRestSeconds(smartRestRecommendation.targetSeconds)}
              </p>
            </div>
            <div className="text-right text-[12px] text-zinc-500">
              <p>Base {formatRestSeconds(smartRestRecommendation.baselineSeconds)}</p>
              <p className="mt-1">
                {smartRestRecommendation.restTargetSource.startsWith('smart')
                  ? 'Adjusted live'
                  : 'No adjustment'}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-6 text-zinc-500">
            {smartRestRecommendation.rationale}
          </p>
        </section>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            <GlossaryTerm term="rpe">RPE</GlossaryTerm>
          </p>
          <p className="text-[12px] text-zinc-500">
            Set {highlightedWorkingIndex >= 0 ? highlightedWorkingIndex + 1 : workingCount}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {RPE_OPTIONS.map((value) => {
            const isSelected =
              highlightedWorkingIndex >= 0 &&
              workingRows[highlightedWorkingIndex]?.rpe === value

            return (
              <button
                key={value}
                type="button"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold transition ${
                  isSelected
                    ? 'border-transparent text-iron-900'
                    : 'border-iron-600 bg-iron-900 text-zinc-500 hover:border-gold/30 hover:text-zinc-100'
                }`}
                style={isSelected ? { backgroundColor: phaseColor } : undefined}
                onClick={() =>
                  highlightedWorkingIndex >= 0
                    ? updateWorkingRow(highlightedWorkingIndex, 'rpe', value)
                    : null
                }
              >
                {value}
              </button>
            )
          })}
        </div>
      </div>
    </article>
  )
}

export default ExerciseCard
