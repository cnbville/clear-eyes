import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, Plus } from 'lucide-react'
import Kbd from '../components/shared/Kbd.jsx'
import ExerciseCard from '../components/workout/ExerciseCard.jsx'
import RestTimer from '../components/workout/RestTimer.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { useGhostData } from '../hooks/useGhostData.js'
import { getCoachSafeSwapCandidates } from '../hooks/useProgram.js'
import { useRestTimer } from '../hooks/useRestTimer.js'
import {
  buildCoachSafeSwapOptions,
  buildDayWarmupPrimers,
  getReadinessBand,
  getSmartRestRecommendation,
} from '../lib/adaptiveProgram.js'
import { parseRestNotation } from '../lib/calculations.js'
import { getStoredPreferences } from '../lib/preferences.js'
import { getExerciseNotesByIds, saveExerciseNote } from '../services/exerciseNoteService.js'
import {
  persistLocalWorkoutDraft,
  saveWorkoutDraft,
} from '../services/activeWorkoutService.js'
import {
  saveProgramExercisePreference,
  saveReadinessForSession,
} from '../services/programSessionService.js'

function MobilePanel({
  label,
  headline,
  defaultOpen = false,
  children,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section className="rounded-[24px] border border-white/[0.05] bg-iron-900/70 lg:hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
          <p className="mt-1 text-[13px] font-semibold text-zinc-100">{headline}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={1.8}
        />
      </button>
      {isOpen ? <div className="border-t border-white/[0.05] px-4 py-4">{children}</div> : null}
    </section>
  )
}

function formatDuration(totalSeconds) {
  const normalizedSeconds = Math.max(Number(totalSeconds) || 0, 0)
  const minutes = Math.floor(normalizedSeconds / 60)
  const seconds = normalizedSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Self-contained ticking component so the 1s setInterval only re-renders the
// elapsed-time display, not the entire ActiveWorkoutPage tree.
function SessionElapsed({ startedAt, className }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const resolvedStart = Number(startedAt) || now
  const elapsedSeconds = Math.max(Math.floor((now - resolvedStart) / 1000), 0)

  return <span className={className}>{formatDuration(elapsedSeconds)}</span>
}

function useMinWidth(minWidth) {
  const getMatches = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }

    return window.matchMedia(`(min-width: ${minWidth}px)`).matches
  }, [minWidth])
  const [matches, setMatches] = useState(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`)
    const handleChange = () => {
      setMatches(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [getMatches, minWidth])

  return matches
}

function getExerciseKey(exercise, index) {
  return (
    exercise?.exercise_slot_key ??
    exercise?.id ??
    exercise?.exercise_id ??
    `${exercise?.name ?? 'exercise'}-${exercise?.display_order ?? index + 1}`
  )
}

function getTotalSetCount(exercise) {
  return (Number(exercise?.warmup_sets) || 0) + (Number(exercise?.working_sets) || 0)
}

function getLoggedSetCount(loggedSets, exerciseKey) {
  return loggedSets.filter((set) => set.exercise_key === exerciseKey).length
}

function hasRemainingSets(exercise, loggedSets, index) {
  return getLoggedSetCount(loggedSets, getExerciseKey(exercise, index)) < getTotalSetCount(exercise)
}

function findNextRemainingExercise(exercises, currentIndex, loggedSets) {
  for (let index = currentIndex + 1; index < exercises.length; index += 1) {
    if (hasRemainingSets(exercises[index], loggedSets, index)) {
      return index
    }
  }

  for (let index = 0; index < currentIndex; index += 1) {
    if (hasRemainingSets(exercises[index], loggedSets, index)) {
      return index
    }
  }

  return -1
}

function findNextRemainingGroupExercise(exercises, groupId, currentIndex, loggedSets) {
  if (!groupId) {
    return -1
  }

  for (let index = currentIndex + 1; index < exercises.length; index += 1) {
    if (
      exercises[index]?.group_id === groupId &&
      hasRemainingSets(exercises[index], loggedSets, index)
    ) {
      return index
    }
  }

  return -1
}

function findFirstRemainingGroupExercise(exercises, groupId, loggedSets) {
  if (!groupId) {
    return -1
  }

  for (let index = 0; index < exercises.length; index += 1) {
    if (
      exercises[index]?.group_id === groupId &&
      hasRemainingSets(exercises[index], loggedSets, index)
    ) {
      return index
    }
  }

  return -1
}

function createAdHocExercise(existingExercises) {
  const adHocCount = existingExercises.filter((exercise) => exercise?.is_adhoc).length + 1

  return {
    id: `adhoc-${Date.now()}-${adHocCount}`,
    exercise_id: null,
    name: `Ad Hoc Exercise ${adHocCount}`,
    warmup_sets: 0,
    working_sets: 3,
    rep_notation: '8-12',
    rest_notation: '~1-2 min',
    rest_seconds: 90,
    group_id: null,
    group_order: null,
    substitution_1: null,
    substitution_2: null,
    coaching_cue: null,
    equipment: 'other',
    muscle: 'other',
    display_order: existingExercises.length + 1,
    is_adhoc: true,
  }
}

function mergeSwapIntoExercise(exercise, swapOption, isRemembered = false) {
  if (!exercise || !swapOption) {
    return exercise
  }

  return {
    ...exercise,
    exercise_id: swapOption.id,
    name: swapOption.name ?? exercise.name,
    muscle:
      swapOption.muscle_group ??
      swapOption.primary_muscle_group ??
      swapOption.muscle ??
      exercise.muscle,
    muscle_group:
      swapOption.muscle_group ??
      swapOption.primary_muscle_group ??
      swapOption.muscle ??
      exercise.muscle_group,
    equipment: swapOption.equipment ?? exercise.equipment,
    movement_type: swapOption.movement_type ?? exercise.movement_type,
    force: swapOption.force ?? exercise.force,
    mechanic: swapOption.mechanic ?? exercise.mechanic,
    image_id: swapOption.image_id ?? exercise.image_id,
    video_url: swapOption.video_url ?? exercise.video_url,
    instructions: swapOption.instructions ?? exercise.instructions,
    original_exercise_id:
      exercise.original_exercise_id ?? exercise.effective_exercise_id ?? exercise.exercise_id,
    original_exercise_name: exercise.original_exercise_name ?? exercise.effective_exercise_name ?? exercise.name,
    effective_exercise_id: swapOption.id,
    effective_exercise_name: swapOption.name ?? exercise.name,
    preferred_swap: isRemembered ? swapOption : null,
    load_guidance_action: null,
    load_guidance_weight: null,
  }
}

function getInitialReadinessScores(readiness, draftReadinessForm = null) {
  if (draftReadinessForm) {
    return {
      sleep: `${draftReadinessForm.sleep ?? ''}`,
      soreness: `${draftReadinessForm.soreness ?? ''}`,
      stress: `${draftReadinessForm.stress ?? ''}`,
      energy: `${draftReadinessForm.energy ?? ''}`,
    }
  }

  if (!readiness) {
    return {
      sleep: '',
      soreness: '',
      stress: '',
      energy: '',
    }
  }

  return {
    sleep: `${readiness.sleep_score ?? ''}`,
    soreness: `${readiness.soreness_score ?? ''}`,
    stress: `${readiness.stress_score ?? ''}`,
    energy: `${readiness.energy_score ?? ''}`,
  }
}

function normalizeReadinessState(readiness = null) {
  if (!readiness) {
    return null
  }

  if (readiness?.guidance) {
    return readiness
  }

  if (
    readiness?.sleep_score &&
    readiness?.soreness_score &&
    readiness?.stress_score &&
    readiness?.energy_score
  ) {
    return {
      ...readiness,
      ...getReadinessBand({
        sleep: readiness.sleep_score,
        soreness: readiness.soreness_score,
        stress: readiness.stress_score,
        energy: readiness.energy_score,
      }),
    }
  }

  return readiness
}

function getInitialRestTimerState(initialDraft = null) {
  const restTimer = initialDraft?.restTimer ?? {}
  const targetSeconds = Math.max(
    Number(restTimer.targetSeconds ?? initialDraft?.currentRestPrescribed) || 0,
    0,
  )
  const baselineSeconds = Math.max(
    Number(restTimer.baselineSeconds ?? initialDraft?.currentRestBaseline ?? targetSeconds) || 0,
    0,
  )

  const normalizedTimerStartedAt = Number(restTimer.timerStartedAt)

  return {
    isVisible: Boolean(restTimer.isVisible ?? initialDraft?.showRestTimer) && targetSeconds > 0,
    targetSeconds,
    baselineSeconds,
    targetSource:
      restTimer.targetSource ??
      initialDraft?.currentRestTargetSource ??
      'program',
    rationale: restTimer.rationale ?? initialDraft?.currentRestRationale ?? '',
    timerStartedAt:
      Number.isFinite(normalizedTimerStartedAt) && normalizedTimerStartedAt > 0
        ? normalizedTimerStartedAt
        : null,
    pendingMetrics: restTimer.pendingMetrics ?? initialDraft?.pendingRestMetrics ?? null,
  }
}

function ReadinessButtonRow({ label, value, onChange, invert = false }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-zinc-300">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((score) => {
          const isSelected = Number(value) === score

          return (
            <button
              key={`${label}-${score}`}
              type="button"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-semibold transition ${
                isSelected
                  ? 'border-transparent bg-gold text-iron-900'
                  : 'border-iron-600 bg-iron-900 text-zinc-500 hover:border-gold/30 hover:text-zinc-100'
              }`}
              onClick={() => onChange(`${score}`)}
              title={invert ? 'Higher means worse' : 'Higher means better'}
            >
              {score}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ActiveWorkoutPage({
  day,
  phaseInfo,
  source = 'program',
  templateId = null,
  templateName = null,
  sessionId = null,
  sessionStartedAt = null,
  initialDraft = null,
  initialReadiness = null,
  remoteDraftDetected = false,
  programId = null,
  onFinish,
}) {
  const [sessionDay] = useState(() => day ?? null)
  const [sessionPhaseInfo] = useState(() => phaseInfo ?? null)
  const initialRestTimerState = useMemo(
    () => getInitialRestTimerState(initialDraft),
    [initialDraft],
  )
  const [sessionExercises, setSessionExercises] = useState(
    () => initialDraft?.sessionExercises ?? sessionDay?.exercises ?? [],
  )
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(
    () => Math.max(Number(initialDraft?.currentExerciseIndex) || 0, 0),
  )
  const [loggedSets, setLoggedSets] = useState(() => initialDraft?.loggedSets ?? [])
  const [exerciseDrafts, setExerciseDrafts] = useState(() => initialDraft?.exerciseDrafts ?? {})
  const [readiness, setReadiness] = useState(() =>
    normalizeReadinessState(initialReadiness ?? initialDraft?.readiness ?? null),
  )
  const [readinessScores, setReadinessScores] = useState(() =>
    getInitialReadinessScores(initialReadiness, initialDraft?.readinessForm ?? null),
  )
  const [readinessSaving, setReadinessSaving] = useState(false)
  const [draftMessage, setDraftMessage] = useState(() => {
    if (remoteDraftDetected) {
      return 'A newer draft from another device was restored.'
    }

    if (initialDraft) {
      return 'In-progress session restored.'
    }

    return ''
  })
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState(initialDraft?.lastSavedAt ?? null)
  const [showRestTimer, setShowRestTimer] = useState(initialRestTimerState.isVisible)
  const [currentRestPrescribed, setCurrentRestPrescribed] = useState(
    initialRestTimerState.targetSeconds,
  )
  const [currentRestBaseline, setCurrentRestBaseline] = useState(
    initialRestTimerState.baselineSeconds,
  )
  const [currentRestTargetSource, setCurrentRestTargetSource] = useState(
    initialRestTimerState.targetSource,
  )
  const [currentRestRationale, setCurrentRestRationale] = useState(
    initialRestTimerState.rationale,
  )
  const [pendingRestMetrics, setPendingRestMetrics] = useState(
    initialRestTimerState.pendingMetrics,
  )
  const [exerciseNotes, setExerciseNotes] = useState({})
  const [swapOptionsByExerciseKey, setSwapOptionsByExerciseKey] = useState({})
  const [swapOptionsLoadingByExerciseKey, setSwapOptionsLoadingByExerciseKey] = useState({})
  const [fallbackSessionStartedAt] = useState(() => Date.now())
  const [submitSignal, setSubmitSignal] = useState(0)
  const noteSaveTimeoutsRef = useRef(new Map())
  const hasInitializedDraftPersistenceRef = useRef(false)
  const sessionPreferences = useMemo(() => getStoredPreferences(), [])
  const isDesktopWorkoutLayout = useMinWidth(1024)
  const showDesktopRail = useMinWidth(1280)
  const {
    seconds,
    getSeconds,
    isRunning,
    start,
    resume,
    setTarget,
    reset,
    timerStartedAt,
  } = useRestTimer()

  const effectiveSessionStartedAt = useMemo(
    () => Number(sessionStartedAt ?? initialDraft?.startedAt ?? fallbackSessionStartedAt),
    [fallbackSessionStartedAt, initialDraft?.startedAt, sessionStartedAt],
  )
  const totalExercises = sessionExercises.length
  const safeExerciseIndex =
    currentExerciseIndex >= totalExercises ? Math.max(totalExercises - 1, 0) : currentExerciseIndex
  const currentExercise = sessionExercises[safeExerciseIndex] ?? null
  const currentExerciseKey = getExerciseKey(currentExercise, safeExerciseIndex)
  const currentExerciseId =
    currentExercise?.effective_exercise_id ?? currentExercise?.exercise_id ?? null
  const lastSessionSets = useGhostData(currentExerciseId, sessionDay?.id ?? null)
  const currentExerciseLoggedCount = getLoggedSetCount(loggedSets, currentExerciseKey)
  const currentExerciseTotalSets = getTotalSetCount(currentExercise)
  const currentSetOrdinal = currentExerciseTotalSets
    ? Math.min(currentExerciseLoggedCount + 1, currentExerciseTotalSets)
    : 0
  const swapOptions = swapOptionsByExerciseKey[currentExerciseKey] ?? []
  const swapOptionsLoading = Boolean(swapOptionsLoadingByExerciseKey[currentExerciseKey])
  const allExercisesComplete = useMemo(
    () =>
      sessionExercises.every((exercise, index) => !hasRemainingSets(exercise, loggedSets, index)),
    [loggedSets, sessionExercises],
  )
  const completedExerciseCount = useMemo(
    () =>
      sessionExercises.filter(
        (exercise, index) => !hasRemainingSets(exercise, loggedSets, index),
      ).length,
    [loggedSets, sessionExercises],
  )
  const smartRestEnabled = sessionPreferences.smartRestEnabled !== false
  const warmupPrimers = useMemo(() => buildDayWarmupPrimers(sessionDay), [sessionDay])
  const bottomPaddingClassName = 'pb-[10.75rem] pt-24 sm:px-6 lg:px-8 lg:pb-10 lg:pt-28'

  useEffect(() => {
    if (!initialRestTimerState.isVisible || !initialRestTimerState.targetSeconds) {
      return
    }

    resume(
      initialRestTimerState.targetSeconds,
      0,
      initialRestTimerState.timerStartedAt,
    )
  }, [
    initialRestTimerState.isVisible,
    initialRestTimerState.targetSeconds,
    initialRestTimerState.timerStartedAt,
    resume,
  ])

  const loadSwapOptions = useCallback(async (exercise = currentExercise, exerciseKey = currentExerciseKey) => {
    if (!exercise || !exerciseKey) {
      return
    }

    if (swapOptionsByExerciseKey[exerciseKey] || swapOptionsLoadingByExerciseKey[exerciseKey]) {
      return
    }

    setSwapOptionsLoadingByExerciseKey((current) => ({
      ...current,
      [exerciseKey]: true,
    }))

    const fallbackOptions = buildCoachSafeSwapOptions(exercise, sessionExercises, 20)

    try {
      const nextOptions = await getCoachSafeSwapCandidates(exercise, sessionExercises, 20)

      setSwapOptionsByExerciseKey((current) => ({
        ...current,
        [exerciseKey]: nextOptions?.length ? nextOptions : fallbackOptions,
      }))
    } catch {
      setSwapOptionsByExerciseKey((current) => ({
        ...current,
        [exerciseKey]: fallbackOptions,
      }))
    } finally {
      setSwapOptionsLoadingByExerciseKey((current) => ({
        ...current,
        [exerciseKey]: false,
      }))
    }
  }, [
    currentExercise,
    currentExerciseKey,
    sessionExercises,
    swapOptionsByExerciseKey,
    swapOptionsLoadingByExerciseKey,
  ])

  useEffect(() => {
    let isCancelled = false

    async function loadExerciseNotes() {
      const exerciseIds = Array.from(
        new Set(
          (sessionExercises ?? [])
            .map((exercise) => exercise?.effective_exercise_id ?? exercise?.exercise_id)
            .filter(Boolean),
        ),
      )

      if (!exerciseIds.length) {
        if (!isCancelled) {
          setExerciseNotes({})
        }
        return
      }

      try {
        const noteRows = await getExerciseNotesByIds(exerciseIds)

        if (!isCancelled) {
          setExerciseNotes((current) => {
            const next = { ...current }

            exerciseIds.forEach((exerciseId) => {
              next[exerciseId] = noteRows.get(exerciseId)?.note ?? next[exerciseId] ?? ''
            })

            return next
          })
        }
      } catch {
        if (!isCancelled) {
          setExerciseNotes((current) => current)
        }
      }
    }

    void loadExerciseNotes()

    return () => {
      isCancelled = true
    }
  }, [sessionExercises])

  useEffect(() => {
    const noteSaveTimeouts = noteSaveTimeoutsRef.current

    return () => {
      noteSaveTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      noteSaveTimeouts.clear()
    }
  }, [])

  const buildDraftPayload = useCallback(
    () => ({
      currentExerciseIndex: safeExerciseIndex,
      exerciseDrafts,
      loggedSets,
      sessionExercises,
      restTimer: {
        isVisible: showRestTimer,
        targetSeconds: currentRestPrescribed,
        baselineSeconds: currentRestBaseline,
        targetSource: currentRestTargetSource,
        rationale: currentRestRationale,
        timerStartedAt: showRestTimer && isRunning ? timerStartedAt : null,
        pendingMetrics: pendingRestMetrics,
      },
      readiness,
      readinessForm: readinessScores,
      startedAt: effectiveSessionStartedAt,
    }),
    [
      currentRestBaseline,
      currentRestPrescribed,
      currentRestRationale,
      currentRestTargetSource,
      effectiveSessionStartedAt,
      exerciseDrafts,
      isRunning,
      loggedSets,
      pendingRestMetrics,
      readiness,
      readinessScores,
      safeExerciseIndex,
      sessionExercises,
      showRestTimer,
      timerStartedAt,
    ],
  )

  useEffect(() => {
    if (!sessionId) {
      return undefined
    }

    if (!hasInitializedDraftPersistenceRef.current) {
      hasInitializedDraftPersistenceRef.current = true
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      persistLocalWorkoutDraft(sessionId, buildDraftPayload())
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [buildDraftPayload, sessionId])

  useEffect(() => {
    if (!sessionId || !hasInitializedDraftPersistenceRef.current) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const draftPayload = buildDraftPayload()
        const result = await saveWorkoutDraft({
          sessionId,
          source,
          programId: source === 'program' ? programId : null,
          programDayId: sessionDay?.id ?? null,
          phaseNumber: source === 'program' ? sessionPhaseInfo?.phase_number ?? null : null,
          weekNumber: source === 'program' ? sessionPhaseInfo?.week ?? null : null,
          dayNumber: sessionDay?.day_number ?? null,
          templateId,
          draftData: draftPayload,
        })

        if (result.success) {
          setLastDraftSavedAt(new Date().toISOString())
        }
      })()
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    buildDraftPayload,
    programId,
    sessionId,
    sessionDay?.day_number,
    sessionDay?.id,
    sessionPhaseInfo?.phase_number,
    sessionPhaseInfo?.week,
    source,
    templateId,
  ])

  useEffect(() => {
    if (!sessionId) {
      return undefined
    }

    const flushLocalDraft = () => {
      persistLocalWorkoutDraft(sessionId, buildDraftPayload())
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalDraft()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushLocalDraft)
    window.addEventListener('beforeunload', flushLocalDraft)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushLocalDraft)
      window.removeEventListener('beforeunload', flushLocalDraft)
    }
  }, [buildDraftPayload, sessionId])

  function dismissRestTimer({ preserve = false } = {}) {
    if (preserve && showRestTimer && currentRestPrescribed > 0) {
      setPendingRestMetrics({
        rest_prescribed_seconds: currentRestPrescribed,
        rest_baseline_seconds: currentRestBaseline || currentRestPrescribed,
        rest_taken_seconds: getSeconds(),
        rest_target_source: currentRestTargetSource ?? 'program',
      })
    } else if (!preserve) {
      setPendingRestMetrics(null)
    }

    setShowRestTimer(false)
    setCurrentRestPrescribed(0)
    setCurrentRestBaseline(0)
    setCurrentRestTargetSource('program')
    setCurrentRestRationale('')
    reset()
  }

  function beginRest(restRecommendation) {
    const fallbackRestSeconds = currentExercise ? getExerciseRestSeconds(currentExercise) : null
    const normalizedRestSeconds = Math.max(
      Number(
        restRecommendation?.targetSeconds ??
          restRecommendation ??
          fallbackRestSeconds ??
          60,
      ) || 0,
      0,
    )

    if (!normalizedRestSeconds) {
      dismissRestTimer()
      return
    }

    setPendingRestMetrics(null)
    setCurrentRestBaseline(
      Number(restRecommendation?.baselineSeconds) ||
        fallbackRestSeconds ||
        normalizedRestSeconds,
    )
    setCurrentRestPrescribed(normalizedRestSeconds)
    setCurrentRestTargetSource(restRecommendation?.restTargetSource ?? 'program')
    setCurrentRestRationale(restRecommendation?.rationale ?? '')
    setShowRestTimer(true)
    start(normalizedRestSeconds)
  }

  function getExerciseRestSeconds(exercise) {
    if (
      exercise?.rest_seconds !== null &&
      exercise?.rest_seconds !== undefined &&
      exercise?.rest_seconds !== '' &&
      Number.isFinite(Number(exercise.rest_seconds))
    ) {
      return Math.max(Number(exercise.rest_seconds), 0)
    }

    return parseRestNotation(exercise?.rest_notation ?? '')
  }

  function getRestRecommendation(exercise, setData = null) {
    const baseRestSeconds = getExerciseRestSeconds(exercise)

    return getSmartRestRecommendation({
      exercise,
      setType: setData?.set_type ?? 'working',
      reps: setData?.reps ?? null,
      rpeActual: setData?.rpe_actual ?? null,
      groupId: exercise?.group_id ?? null,
      programRestSeconds: baseRestSeconds,
      smartRestEnabled,
    })
  }

  function handleAdjustRest(deltaSeconds) {
    const nextPrescribedSeconds = Math.max(currentRestPrescribed + deltaSeconds, 0)
    setCurrentRestPrescribed(nextPrescribedSeconds)
    setCurrentRestTargetSource('manual')
    setCurrentRestRationale('Adjusted manually for this session.')
    setTarget(nextPrescribedSeconds)
  }

  function handleToggleRestTimer() {
    if (showRestTimer) {
      dismissRestTimer({ preserve: true })
      return
    }

    if (!currentExercise) {
      return
    }

    beginRest(getRestRecommendation(currentExercise))
  }

  function handleFinishWorkout() {
    onFinish?.({
      loggedSets,
      startedAt: effectiveSessionStartedAt,
      completedAt: Date.now(),
      source,
      templateId,
      sessionId,
      readiness,
      day: {
        ...(sessionDay ?? {}),
        exercises: sessionExercises,
      },
    })
  }

  function handleAdvanceExercise() {
    dismissRestTimer({ preserve: true })

    if (!sessionExercises.length) {
      return
    }

    const nextRemainingIndex = findNextRemainingExercise(
      sessionExercises,
      safeExerciseIndex,
      loggedSets,
    )

    if (nextRemainingIndex !== -1) {
      setCurrentExerciseIndex(nextRemainingIndex)
      return
    }

    setCurrentExerciseIndex((currentIndex) =>
      Math.min(currentIndex + 1, Math.max(sessionExercises.length - 1, 0)),
    )
  }

  function handleAddExercise() {
    dismissRestTimer({ preserve: true })

    setSessionExercises((currentExercises) => {
      const nextExercises = [...currentExercises, createAdHocExercise(currentExercises)]
      setCurrentExerciseIndex(nextExercises.length - 1)
      return nextExercises
    })
  }

  function handleSetComplete(setData) {
    if (!currentExercise) {
      return
    }

    const restMetrics =
      pendingRestMetrics ??
      (showRestTimer && currentRestPrescribed > 0
        ? {
            rest_prescribed_seconds: currentRestPrescribed,
            rest_taken_seconds: getSeconds(),
          }
        : null)

    dismissRestTimer()
    setPendingRestMetrics(null)

    const enrichedSet = {
      ...setData,
      exercise_key: currentExerciseKey,
      exercise_id: currentExercise.exercise_id ?? null,
      prescribed_exercise_id:
        (source ?? 'program') === 'program' ? currentExercise.id ?? null : null,
      exercise_name: currentExercise.name ?? 'Exercise',
      equipment: currentExercise.equipment ?? 'other',
      muscle: currentExercise.muscle ?? 'other',
      movement_type: currentExercise.movement_type ?? 'isolation',
      force: currentExercise.force ?? null,
      mechanic: currentExercise.mechanic ?? null,
      notes: currentExercise.notes ?? currentExercise.coaching_cue ?? null,
      is_adhoc: Boolean(currentExercise.is_adhoc),
      program_day_id: sessionDay?.id ?? null,
      source,
      template_id: templateId,
      logged_at: new Date().toISOString(),
      ...(restMetrics ?? {}),
    }
    const nextLoggedSets = [...loggedSets, enrichedSet]
    const currentGroupId = currentExercise.group_id ?? null
    const currentRestRecommendation = getRestRecommendation(currentExercise, setData)

    setLoggedSets(nextLoggedSets)

    if (currentGroupId) {
      const nextGroupIndex = findNextRemainingGroupExercise(
        sessionExercises,
        currentGroupId,
        safeExerciseIndex,
        nextLoggedSets,
      )

      if (nextGroupIndex !== -1) {
        setCurrentExerciseIndex(nextGroupIndex)
        return
      }

      const firstRemainingGroupIndex = findFirstRemainingGroupExercise(
        sessionExercises,
        currentGroupId,
        nextLoggedSets,
      )

      if (firstRemainingGroupIndex !== -1) {
        setCurrentExerciseIndex(firstRemainingGroupIndex)
        beginRest(currentRestRecommendation)
        return
      }
    } else if (hasRemainingSets(currentExercise, nextLoggedSets, safeExerciseIndex)) {
      beginRest(currentRestRecommendation)
      return
    }

    const nextRemainingIndex = findNextRemainingExercise(
      sessionExercises,
      safeExerciseIndex,
      nextLoggedSets,
    )

    if (nextRemainingIndex !== -1) {
      setCurrentExerciseIndex(nextRemainingIndex)
    }
  }

  async function handleSaveReadiness() {
    if (
      !programId ||
      !sessionId ||
      !sessionDay?.id ||
      !sessionPhaseInfo?.phase_number ||
      !sessionPhaseInfo?.week ||
      !readinessScores.sleep ||
      !readinessScores.soreness ||
      !readinessScores.stress ||
      !readinessScores.energy
    ) {
      return
    }

    setReadinessSaving(true)
    const result = await saveReadinessForSession({
      programId,
      sessionId,
      slot: {
        program_day_id: sessionDay.id,
        phase_number: sessionPhaseInfo.phase_number,
        week_number: sessionPhaseInfo.week,
        day_number: sessionDay.day_number ?? null,
      },
      scores: readinessScores,
    })
    setReadinessSaving(false)

    if (result.success) {
      setReadiness({
        ...result.data,
        guidance: result.readiness.guidance,
      })
      setDraftMessage('')
    }
  }

  function handleSkipReadiness() {
    setReadiness({
      readiness_band: 'skipped',
      guidance: 'Readiness check skipped for this session.',
    })
  }

  const handleDraftChangeForExercise = useCallback((exerciseKey, draft) => {
    if (!exerciseKey) {
      return
    }

    setExerciseDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[exerciseKey]

      if (
        currentDraft?.warmupRows === draft?.warmupRows &&
        currentDraft?.workingRows === draft?.workingRows
      ) {
        return currentDrafts
      }

      return {
        ...currentDrafts,
        [exerciseKey]: draft,
      }
    })
  }, [])

  function handleExerciseNoteChange(exerciseId, note) {
    if (!exerciseId) {
      return
    }

    setExerciseNotes((current) => ({
      ...current,
      [exerciseId]: note,
    }))

    const currentTimeoutId = noteSaveTimeoutsRef.current.get(exerciseId)

    if (currentTimeoutId) {
      window.clearTimeout(currentTimeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      void saveExerciseNote({
        exerciseId,
        note,
        lastSessionId: sessionId ?? null,
      })
      noteSaveTimeoutsRef.current.delete(exerciseId)
    }, 450)

    noteSaveTimeoutsRef.current.set(exerciseId, timeoutId)
  }

  function handleApplySwap(option, remember = false) {
    if (!currentExercise) {
      return
    }

    setSessionExercises((currentExercises) =>
      currentExercises.map((exercise, index) =>
        index === safeExerciseIndex
          ? mergeSwapIntoExercise(exercise, option, remember)
          : exercise,
      ),
    )
  }

  async function handleRememberSwap(option) {
    if (!currentExercise || !programId || source !== 'program') {
      handleApplySwap(option, false)
      return
    }

    const result = await saveProgramExercisePreference({
      programId,
      phaseNumber: sessionPhaseInfo?.phase_number ?? null,
      dayNumber: sessionDay?.day_number ?? currentExercise?.day_number ?? null,
      displayOrder: currentExercise?.display_order ?? null,
      originalExerciseId:
        currentExercise?.original_exercise_id ?? currentExercise?.exercise_id ?? null,
      preferredExerciseId: option.id,
    })

    handleApplySwap(option, result.success)

    if (result.success) {
      setDraftMessage('Remembered this swap for future exposures of the slot.')
    }
  }

  const footerActions = [
    {
      action: () => setSubmitSignal((currentValue) => currentValue + 1),
      allowInInput: true,
      disabled: !currentExercise || allExercisesComplete,
      displayShortcut: '↵',
      id: 'workout-log-set',
      label: 'Log Set',
      shortcut: 'Enter',
    },
    {
      action: handleToggleRestTimer,
      allowInInput: true,
      disabled: !currentExercise,
      displayShortcut: 'Space',
      id: 'workout-rest-timer',
      label: 'Rest Timer',
      shortcut: 'Space',
    },
    {
      action: allExercisesComplete ? handleFinishWorkout : handleAdvanceExercise,
      disabled: !sessionExercises.length,
      displayShortcut: '⌘N',
      id: 'workout-next-exercise',
      label: allExercisesComplete ? 'Finish Workout' : 'Next Exercise',
      shortcut: 'Mod+N',
    },
    {
      action: handleFinishWorkout,
      displayShortcut: 'Esc',
      id: 'workout-end',
      label: 'End',
      shortcut: 'Escape',
    },
  ]
  const breadcrumbSegments = useMemo(
    () => [
      'IRON',
      'Session',
      currentExercise?.name ?? sessionDay?.name ?? 'Workout',
      currentExerciseTotalSets ? `Set ${currentSetOrdinal} of ${currentExerciseTotalSets}` : 'Overview',
    ],
    [
      currentExercise?.name,
      currentExerciseTotalSets,
      currentSetOrdinal,
      sessionDay?.name,
    ],
  )

  useInteractionContext('active-workout', {
    breadcrumbSegments,
    footerActions,
  })

  const mobileActionLabel = allExercisesComplete ? 'Finish Workout' : 'Next Exercise'
  const mobileRestLabel = showRestTimer ? 'Skip Rest' : 'Rest Timer'

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,9,11,0.95),rgba(9,9,11,0.78))] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 text-[13px] font-semibold text-zinc-400 transition hover:text-zinc-100"
              onClick={handleFinishWorkout}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              <span>End</span>
              <Kbd className="hidden lg:inline-flex">Esc</Kbd>
            </button>

            <p className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-zinc-100">
              {source === 'custom' ? templateName ?? sessionDay?.name ?? 'Custom Workout' : sessionDay?.name ?? 'Workout'}
            </p>

            <p className="shrink-0 font-mono text-[12px] text-zinc-500">
              {totalExercises ? safeExerciseIndex + 1 : 0}/{totalExercises}
            </p>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[12px] text-zinc-500">
              {source === 'custom'
                ? 'Custom Session'
                : `Phase ${sessionPhaseInfo?.phase_number ?? 1} · Wk${sessionPhaseInfo?.week ?? 1}`}
            </p>
            <p className="font-mono text-[12px] text-zinc-400">
              <SessionElapsed startedAt={effectiveSessionStartedAt} />
            </p>
          </div>
        </div>
      </div>

      <section className={`mx-auto w-full max-w-[1500px] px-4 ${bottomPaddingClassName}`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {draftMessage ? (
              <div className="rounded-[24px] border border-sky/20 bg-sky/10 px-4 py-3 text-[13px] text-zinc-200">
                {draftMessage}
              </div>
            ) : null}

            {lastDraftSavedAt && source === 'program' ? (
              <div className="rounded-[24px] border border-white/[0.05] bg-iron-900/70 px-4 py-3 text-[12px] text-zinc-500">
                Draft synced · {new Date(lastDraftSavedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            ) : null}

            {source === 'program' && !readiness ? (
              !isDesktopWorkoutLayout ? (
                <MobilePanel
                  label="Readiness"
                  headline="Quick check-in before you train"
                  defaultOpen
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ReadinessButtonRow
                      label="Sleep"
                      value={readinessScores.sleep}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, sleep: value }))
                      }
                    />
                    <ReadinessButtonRow
                      label="Energy"
                      value={readinessScores.energy}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, energy: value }))
                      }
                    />
                    <ReadinessButtonRow
                      label="Soreness"
                      value={readinessScores.soreness}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, soreness: value }))
                      }
                      invert
                    />
                    <ReadinessButtonRow
                      label="Stress"
                      value={readinessScores.stress}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, stress: value }))
                      }
                      invert
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="min-h-[44px] rounded-2xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleSaveReadiness()}
                      disabled={
                        readinessSaving ||
                        !readinessScores.sleep ||
                        !readinessScores.soreness ||
                        !readinessScores.stress ||
                        !readinessScores.energy
                      }
                    >
                      Save Check-In
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-2xl border border-white/[0.06] bg-iron-900/70 px-4 py-3 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30 hover:text-zinc-100"
                      onClick={handleSkipReadiness}
                    >
                      Skip For Today
                    </button>
                  </div>
                </MobilePanel>
              ) : (
                <section className="rounded-[28px] border border-gold/15 bg-gold/[0.06] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                    Readiness Check
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-300">
                    Quick check-in before you train. This is advisory only and will not rewrite the day.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <ReadinessButtonRow
                      label="Sleep"
                      value={readinessScores.sleep}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, sleep: value }))
                      }
                    />
                    <ReadinessButtonRow
                      label="Energy"
                      value={readinessScores.energy}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, energy: value }))
                      }
                    />
                    <ReadinessButtonRow
                      label="Soreness"
                      value={readinessScores.soreness}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, soreness: value }))
                      }
                      invert
                    />
                    <ReadinessButtonRow
                      label="Stress"
                      value={readinessScores.stress}
                      onChange={(value) =>
                        setReadinessScores((current) => ({ ...current, stress: value }))
                      }
                      invert
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-2xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleSaveReadiness()}
                      disabled={
                        readinessSaving ||
                        !readinessScores.sleep ||
                        !readinessScores.soreness ||
                        !readinessScores.stress ||
                        !readinessScores.energy
                      }
                    >
                      Save Check-In
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-white/[0.06] bg-iron-900/70 px-4 py-3 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30 hover:text-zinc-100"
                      onClick={handleSkipReadiness}
                    >
                      Skip For Today
                    </button>
                  </div>
                </section>
              )
            ) : null}

            {source === 'program' && readiness?.guidance ? (
              !isDesktopWorkoutLayout ? (
                <MobilePanel
                  label="Readiness"
                  headline={
                    readiness?.readiness_band === 'skipped'
                      ? 'Readiness skipped'
                      : `Readiness ${readiness?.readiness_band ?? 'unknown'}`
                  }
                >
                  <div
                    className={`rounded-[20px] border p-4 text-[13px] leading-6 ${
                      readiness?.readiness_band === 'green'
                        ? 'border-mint/20 bg-mint/[0.08] text-zinc-200'
                        : readiness?.readiness_band === 'yellow'
                          ? 'border-gold/20 bg-gold/[0.08] text-zinc-200'
                          : readiness?.readiness_band === 'red'
                            ? 'border-coral/20 bg-coral/[0.08] text-zinc-200'
                            : 'border-white/[0.04] bg-iron-900/60 text-zinc-300'
                    }`}
                  >
                    {readiness.guidance}
                  </div>
                </MobilePanel>
              ) : (
                <section
                  className={`rounded-[28px] border p-5 text-[13px] leading-6 ${
                    readiness?.readiness_band === 'green'
                      ? 'border-mint/20 bg-mint/[0.08] text-zinc-200'
                      : readiness?.readiness_band === 'yellow'
                        ? 'border-gold/20 bg-gold/[0.08] text-zinc-200'
                        : readiness?.readiness_band === 'red'
                          ? 'border-coral/20 bg-coral/[0.08] text-zinc-200'
                          : 'border-white/[0.04] bg-iron-900/60 text-zinc-300'
                  }`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
                    {readiness?.readiness_band === 'skipped'
                      ? 'Readiness Skipped'
                      : `Readiness · ${readiness?.readiness_band ?? 'unknown'}`}
                  </p>
                  <p className="mt-2">{readiness.guidance}</p>
                </section>
              )
            ) : null}

            {!isDesktopWorkoutLayout ? (
              <MobilePanel
                label="Session"
                headline={`${completedExerciseCount}/${totalExercises || 0} exercises complete`}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Elapsed</p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      <SessionElapsed startedAt={effectiveSessionStartedAt} />
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Logged</p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      {loggedSets.length}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {sessionExercises.map((exercise, index) => {
                    const exerciseKey = getExerciseKey(exercise, index)
                    const completedSets = getLoggedSetCount(loggedSets, exerciseKey)
                    const totalSets = getTotalSetCount(exercise)
                    const isActive = index === safeExerciseIndex
                    const isComplete = totalSets > 0 && completedSets >= totalSets

                    return (
                      <button
                        key={exerciseKey}
                        type="button"
                        className={`min-h-[52px] w-full rounded-[20px] border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-gold/30 bg-gold/[0.08]'
                            : isComplete
                              ? 'border-mint/20 bg-mint/[0.08]'
                              : 'border-white/[0.04] bg-iron-950/60'
                        }`}
                        onClick={() => {
                          dismissRestTimer({ preserve: true })
                          setCurrentExerciseIndex(index)
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-semibold text-zinc-100">
                              {exercise?.name}
                            </p>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {completedSets}/{totalSets || 0} sets logged
                            </p>
                          </div>
                          <span className="font-mono text-[12px] text-zinc-500">{index + 1}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </MobilePanel>
            ) : null}

            {currentExercise ? (
              <ExerciseCard
                key={currentExerciseKey}
                exercise={currentExercise}
                initialDraft={exerciseDrafts[currentExerciseKey] ?? null}
                lastSessionSets={lastSessionSets}
                onSetComplete={handleSetComplete}
                onDraftChange={(draft) => handleDraftChangeForExercise(currentExerciseKey, draft)}
                onUseSwap={(option) => handleApplySwap(option, false)}
                onRememberSwap={(option) => void handleRememberSwap(option)}
                onOpenSwapOptions={() => void loadSwapOptions(currentExercise, currentExerciseKey)}
                phaseColor={sessionPhaseInfo?.phaseColor ?? '#c9a227'}
                submitSignal={submitSignal}
                swapOptions={swapOptions}
                swapOptionsLoading={swapOptionsLoading}
                exerciseNote={exerciseNotes[currentExerciseId] ?? ''}
                onExerciseNoteChange={(note) =>
                  void handleExerciseNoteChange(currentExerciseId, note)
                }
                warmupPrimers={warmupPrimers}
                smartRestEnabled={smartRestEnabled}
              />
            ) : (
              <div className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-6 text-center">
                <p className="text-[15px] font-semibold text-zinc-200">
                  No exercises in this session.
                </p>
                <p className="mt-2 text-[13px] text-zinc-500">
                  Add an exercise from the session rail or end the workout.
                </p>
              </div>
            )}

            {showRestTimer ? (
              <RestTimer
                prescribedSeconds={currentRestPrescribed}
                baselineSeconds={currentRestBaseline || currentRestPrescribed}
                label={currentRestTargetSource?.startsWith('smart') ? 'Smart Rest' : 'Rest'}
                targetSource={currentRestTargetSource}
                rationale={currentRestRationale}
                isRunning={isRunning}
                elapsed={seconds}
                timerStartedAt={timerStartedAt}
                phaseColor={sessionPhaseInfo?.phaseColor ?? '#c9a227'}
                onSkip={() => dismissRestTimer({ preserve: true })}
                onAdjust={handleAdjustRest}
              />
            ) : null}

            {allExercisesComplete && sessionExercises.length ? (
              <button
                type="button"
                className="hidden w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition hover:bg-gold-light lg:inline-flex"
                onClick={handleFinishWorkout}
              >
                <span>Finish Workout</span>
                <Kbd className="border-black/10 bg-black/10 text-iron-900">Esc</Kbd>
              </button>
            ) : null}
          </div>

          {showDesktopRail ? (
          <aside>
            <div className="sticky top-28 space-y-4">
              <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  Session Telemetry
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Elapsed</p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      <SessionElapsed startedAt={effectiveSessionStartedAt} />
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Logged</p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      {loggedSets.length}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      Complete
                    </p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      {completedExerciseCount}/{totalExercises}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Phase</p>
                    <p className="mt-2 font-mono text-[22px] font-bold text-zinc-50">
                      P{sessionPhaseInfo?.phase_number ?? 1}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-3 text-[13px] font-semibold text-zinc-300 transition hover:border-gold/30 hover:text-zinc-50"
                    onClick={handleAddExercise}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.8} />
                    Add Exercise
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-3 text-[13px] font-semibold text-zinc-300 transition hover:border-gold/30 hover:text-zinc-50"
                    onClick={handleToggleRestTimer}
                    disabled={!currentExercise}
                  >
                    <span>{showRestTimer ? 'Skip Rest' : 'Rest Timer'}</span>
                    <Kbd className="border-white/[0.08] bg-white/[0.04] text-zinc-300">
                      Space
                    </Kbd>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-3 text-[13px] font-extrabold text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={allExercisesComplete ? handleFinishWorkout : handleAdvanceExercise}
                    disabled={!sessionExercises.length}
                  >
                    <span>{allExercisesComplete ? 'Finish Workout' : 'Next Exercise'}</span>
                    <Kbd className="border-black/10 bg-black/10 text-iron-900">⌘N</Kbd>
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  Workout Queue
                </p>

                <div className="mt-4 space-y-2.5">
                  {sessionExercises.map((exercise, index) => {
                    const exerciseKey = getExerciseKey(exercise, index)
                    const completedSets = getLoggedSetCount(loggedSets, exerciseKey)
                    const totalSets = getTotalSetCount(exercise)
                    const isActive = index === safeExerciseIndex
                    const isComplete = totalSets > 0 && completedSets >= totalSets

                    return (
                      <button
                        key={exerciseKey}
                        type="button"
                        className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-gold/30 bg-gold/[0.08]'
                            : isComplete
                              ? 'border-mint/20 bg-mint/[0.08]'
                              : 'border-white/[0.04] bg-iron-950/60 hover:border-white/[0.08]'
                        }`}
                        onClick={() => {
                          dismissRestTimer({ preserve: true })
                          setCurrentExerciseIndex(index)
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-zinc-100">
                              {exercise.name}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                              {exercise.group_id ? `${exercise.group_id}${exercise.group_order ?? ''} · ` : ''}
                              {exercise.rep_notation ?? '--'}
                            </p>
                          </div>
                          <p className="shrink-0 font-mono text-[12px] text-zinc-500">
                            {completedSets}/{totalSets}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          </aside>
          ) : null}
        </div>
      </section>

      {!isDesktopWorkoutLayout ? (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.05] bg-iron-900/95 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-lg grid-cols-2 gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3">
          <button
            type="button"
            className="min-h-[48px] rounded-xl border border-white/[0.05] bg-iron-800 px-4 py-3 text-[13px] font-semibold text-zinc-100 transition hover:border-gold/30"
            onClick={() => setSubmitSignal((currentValue) => currentValue + 1)}
            disabled={!currentExercise || allExercisesComplete}
          >
            Log Set
          </button>

          <button
            type="button"
            className="min-h-[48px] rounded-xl border border-white/[0.05] bg-iron-800 px-4 py-3 text-[13px] font-semibold text-zinc-100 transition hover:border-gold/30"
            onClick={handleToggleRestTimer}
            disabled={!currentExercise}
          >
            {mobileRestLabel}
          </button>

          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-iron-800 px-4 py-3 text-[13px] font-semibold text-zinc-100 transition hover:border-gold/30"
            onClick={handleAddExercise}
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            Add Exercise
          </button>

          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-[13px] font-extrabold text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
            onClick={allExercisesComplete ? handleFinishWorkout : handleAdvanceExercise}
            disabled={!sessionExercises.length}
          >
            <span>{mobileActionLabel}</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
      ) : null}
    </>
  )
}

export default ActiveWorkoutPage
