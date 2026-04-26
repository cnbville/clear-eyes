import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildGuidanceKey,
  buildExerciseSlotKey,
  buildProgramSlotKey,
  flattenProgramSlots,
  getNextUnresolvedSlot,
  getOverdueSlots,
  getRecoveryRecommendation,
  getResolvedSlotStates,
  getWeekQuotaSummary,
  resolveProgramDay,
  buildCoachSafeSwapOptions,
} from '../lib/adaptiveProgram.js'
import { ensureDemoState, isDemoModeEnabled } from '../lib/demoState.js'
import { getProgramAdaptiveContext } from '../services/programSessionService.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const SWAP_CANDIDATE_LIMIT = 20
const SWAP_QUERY_LIMIT = 80

function createEmptyWeeklyQuota(daysPerWeek = 0) {
  return {
    weeks: [],
    activeWeek: null,
    effectiveTarget: Number(daysPerWeek) || 0,
    consecutiveQuotaHitWeeks: 0,
  }
}

function createEmptyRuntimeState(daysPerWeek = 0) {
  return {
    currentSlot: null,
    overdueSlots: [],
    recoveryRecommendation: null,
    activeSession: null,
    weeklyQuota: createEmptyWeeklyQuota(daysPerWeek),
    resolvedSlotStates: [],
    preferenceLookup: new Map(),
    loadGuidanceLookup: new Map(),
  }
}

async function fetchProgramSummary(programId = null) {
  let query = supabase.from('programs').select('id, name, author, days_per_week')

  if (programId) {
    query = query.eq('id', programId)
  } else {
    query = query.eq('is_active', true).order('created_at', { ascending: false }).limit(1)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ?? null
}

async function fetchProgramProgress(programId) {
  const { data, error } = await supabase
    .from('user_progress')
    .select('current_phase, current_week, current_day')
    .eq('program_id', programId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ?? null
}

function mapExerciseRow(row) {
  return {
    id: row.id,
    exercise_id: row.exercise_id,
    display_order: row.display_order,
    warmup_sets: row.warmup_sets,
    working_sets: row.working_sets,
    rep_notation: row.rep_notation,
    rep_min: row.rep_min,
    rep_max: row.rep_max,
    rpe_target: row.rpe_target,
    rpe_notation: row.rpe_notation,
    rest_seconds: row.rest_seconds,
    rest_notation: row.rest_notation,
    group_id: row.group_id,
    group_type: row.group_type,
    group_order: row.group_order,
    substitution_1: row.substitution_1,
    substitution_2: row.substitution_2,
    coaching_cue: row.coaching_cue,
    name: row.exercises?.name ?? null,
    slug: row.exercises?.slug ?? null,
    equipment: row.exercises?.equipment ?? 'other',
    muscle: row.exercises?.muscle_group ?? row.exercises?.primary_muscle_group ?? 'other',
    muscle_group: row.exercises?.muscle_group ?? row.exercises?.primary_muscle_group ?? 'other',
    secondary_muscle_groups:
      row.exercises?.secondary_muscles ?? row.exercises?.secondary_muscle_groups ?? [],
    movement_type: row.exercises?.movement_type ?? 'isolation',
    force: row.exercises?.force ?? null,
    mechanic: row.exercises?.mechanic ?? null,
    instructions: row.exercises?.instructions ?? null,
    image_id: row.exercises?.image_id ?? null,
    is_custom: row.exercises?.is_custom ?? false,
    video_url: row.exercises?.video_url ?? null,
  }
}

async function fetchProgramStructure(programId, activeProgram = null) {
  const resolvedProgram = activeProgram ?? (await fetchProgramSummary(programId))

  if (!resolvedProgram?.id) {
    return null
  }

  const { data: phases, error: phasesError } = await supabase
    .from('program_phases')
    .select('id, phase_number, name, description, num_weeks')
    .eq('program_id', resolvedProgram.id)
    .order('phase_number', { ascending: true })

  if (phasesError) {
    throw new Error(phasesError.message)
  }

  const phaseIds = (phases ?? []).map((phase) => phase.id)

  if (!phaseIds.length) {
    return {
      ...resolvedProgram,
      phases: [],
    }
  }

  const { data: weeks, error: weeksError } = await supabase
    .from('program_weeks')
    .select('id, phase_id, week_number, global_week_number, label')
    .in('phase_id', phaseIds)
    .order('global_week_number', { ascending: true })

  if (weeksError) {
    throw new Error(weeksError.message)
  }

  const weekIds = (weeks ?? []).map((week) => week.id)
  const { data: days, error: daysError } = weekIds.length
    ? await supabase
        .from('program_days')
        .select('id, week_id, day_number, name, day_type, rest_note')
        .in('week_id', weekIds)
        .order('day_number', { ascending: true })
    : { data: [], error: null }

  if (daysError) {
    throw new Error(daysError.message)
  }

  const dayIds = (days ?? []).map((day) => day.id)
  const { data: prescribedExercises, error: prescribedExercisesError } = dayIds.length
    ? await supabase
        .from('prescribed_exercises')
        .select(
          `
            id,
            day_id,
            exercise_id,
            display_order,
            warmup_sets,
            working_sets,
            rep_notation,
            rep_min,
            rep_max,
            rpe_target,
            rpe_notation,
            rest_seconds,
            rest_notation,
            group_id,
            group_type,
            group_order,
            substitution_1,
            substitution_2,
            coaching_cue,
            exercises (
              id,
              name,
              slug,
              muscle_group,
              primary_muscle_group,
              secondary_muscles,
              secondary_muscle_groups,
              equipment,
              movement_type,
              force,
              mechanic,
              instructions,
              image_id,
              is_custom,
              video_url
            )
          `,
        )
        .in('day_id', dayIds)
        .order('display_order', { ascending: true })
    : { data: [], error: null }

  if (prescribedExercisesError) {
    throw new Error(prescribedExercisesError.message)
  }

  const exercisesByDayId = (prescribedExercises ?? []).reduce((map, row) => {
    const currentExercises = map.get(row.day_id) ?? []
    currentExercises.push(mapExerciseRow(row))
    map.set(row.day_id, currentExercises)
    return map
  }, new Map())

  const daysByWeekId = (days ?? []).reduce((map, day) => {
    const currentDays = map.get(day.week_id) ?? []
    currentDays.push({
      id: day.id,
      day_number: day.day_number,
      name: day.name,
      day_type: day.day_type,
      rest_note: day.rest_note,
      exercises: (exercisesByDayId.get(day.id) ?? []).map((exercise) => ({
        ...exercise,
        day_number: day.day_number,
      })),
    })
    map.set(day.week_id, currentDays)
    return map
  }, new Map())

  const weeksByPhaseId = (weeks ?? []).reduce((map, week) => {
    const currentWeeks = map.get(week.phase_id) ?? []
    currentWeeks.push({
      id: week.id,
      week_number: week.week_number,
      global_week_number: week.global_week_number,
      label: week.label ?? `Week ${week.week_number}`,
      days: daysByWeekId.get(week.id) ?? [],
    })
    map.set(week.phase_id, currentWeeks)
    return map
  }, new Map())

  return {
    ...resolvedProgram,
    phases: (phases ?? []).map((phase) => {
      const phaseWeeks = (weeksByPhaseId.get(phase.id) ?? []).sort(
        (left, right) => left.week_number - right.week_number,
      )

      return {
        id: phase.id,
        phase_number: phase.phase_number,
        name: phase.name,
        description: phase.description,
        num_weeks: phase.num_weeks,
        days: phaseWeeks[0]?.days ?? [],
        weeks: phaseWeeks,
      }
    }),
  }
}

function buildProgramExerciseCatalog(program) {
  const catalog = new Map()

  flattenProgramSlots(program).forEach((slot) => {
    ;(slot?.day?.exercises ?? []).forEach((exercise) => {
      const exerciseId = exercise?.exercise_id ?? exercise?.id

      if (!exerciseId || catalog.has(exerciseId)) {
        return
      }

      catalog.set(exerciseId, {
        id: exerciseId,
        exercise_id: exerciseId,
        name: exercise?.name ?? null,
        slug: exercise?.slug ?? null,
        muscle_group: exercise?.muscle_group ?? exercise?.muscle ?? 'other',
        primary_muscle_group: exercise?.muscle_group ?? exercise?.muscle ?? 'other',
        secondary_muscles: exercise?.secondary_muscle_groups ?? [],
        equipment: exercise?.equipment ?? 'other',
        movement_type: exercise?.movement_type ?? 'isolation',
        force: exercise?.force ?? null,
        mechanic: exercise?.mechanic ?? null,
        instructions: exercise?.instructions ?? null,
        image_id: exercise?.image_id ?? null,
        is_custom: exercise?.is_custom ?? false,
        video_url: exercise?.video_url ?? null,
      })
    })
  })

  return Array.from(catalog.values())
}

function buildAdaptiveLookups(adaptiveContext, exerciseCatalog = []) {
  const programLookup = new Map(
    exerciseCatalog.flatMap((exercise) => {
      const keys = []
      const id = exercise?.id ?? exercise?.exercise_id

      if (id) {
        keys.push([id, exercise])
      }

      if (exercise?.name) {
        keys.push([`name:${`${exercise.name}`.trim().toLowerCase()}`, exercise])
      }

      return keys
    }),
  )

  const preferredExerciseLookup = new Map(
    Array.from(adaptiveContext?.preferredExerciseLookup?.entries?.() ?? []),
  )
  preferredExerciseLookup.forEach((exercise, key) => {
    programLookup.set(key, exercise)

    if (exercise?.name) {
      programLookup.set(`name:${`${exercise.name}`.trim().toLowerCase()}`, exercise)
    }
  })

  const preferenceLookup = new Map(
    (adaptiveContext?.substitutionPreferences ?? []).map((entry) => [
      buildExerciseSlotKey({
        phaseNumber: entry.phase_number,
        dayNumber: entry.day_number,
        displayOrder: entry.display_order,
      }),
      entry,
    ]),
  )
  const loadGuidanceLookup = new Map(
    (adaptiveContext?.loadGuidance ?? []).map((entry) => [
      buildGuidanceKey({
        phaseNumber: entry.phase_number,
        dayNumber: entry.day_number,
        displayOrder: entry.display_order,
        exerciseId: entry.exercise_id,
      }),
      entry,
    ]),
  )

  return {
    exerciseLookup: programLookup,
    preferenceLookup,
    loadGuidanceLookup,
  }
}

function resolveAdaptiveSlotState(
  slotState,
  slotDefinitionByKey,
  preferenceLookup,
  exerciseLookup,
  loadGuidanceLookup,
) {
  if (!slotState) {
    return null
  }

  const slotKey =
    buildProgramSlotKey({
      phaseNumber: slotState.phase_number,
      weekNumber: slotState.week_number,
      dayNumber: slotState.day_number,
    })
  const definition = slotDefinitionByKey.get(slotKey)

  return {
    ...slotState,
    day: resolveProgramDay(
      definition?.day ?? null,
      slotState.phase_number,
      preferenceLookup,
      exerciseLookup,
      loadGuidanceLookup,
    ),
    week: definition?.week ?? null,
    phase: definition?.phase ?? null,
    phase_name: definition?.phase_name ?? `Phase ${slotState.phase_number}`,
    slot_key: definition?.slot_key ?? slotKey,
  }
}

function attachAdaptiveState(program, adaptiveContext, programExerciseCatalog) {
  const programSlots = flattenProgramSlots(program)
  const {
    exerciseLookup,
    preferenceLookup,
    loadGuidanceLookup,
  } = buildAdaptiveLookups(adaptiveContext, programExerciseCatalog)
  const slotDefinitionByKey = new Map(programSlots.map((slot) => [slot.slot_key, slot]))
  const mergedSlotStates = getResolvedSlotStates(
    (adaptiveContext?.slotStates ?? []).map((slotState) => ({
      ...slotState,
      slot_key: buildProgramSlotKey({
        phaseNumber: slotState.phase_number,
        weekNumber: slotState.week_number,
        dayNumber: slotState.day_number,
      }),
      phase_name: slotDefinitionByKey.get(
        buildProgramSlotKey({
          phaseNumber: slotState.phase_number,
          weekNumber: slotState.week_number,
          dayNumber: slotState.day_number,
        }),
      )?.phase_name ?? `Phase ${slotState.phase_number}`,
    })),
  )
  const currentSlot =
    resolveAdaptiveSlotState(
      getNextUnresolvedSlot(mergedSlotStates) ??
        mergedSlotStates[mergedSlotStates.length - 1] ??
        null,
      slotDefinitionByKey,
      preferenceLookup,
      exerciseLookup,
      loadGuidanceLookup,
    )
  const overdueSlots = getOverdueSlots(mergedSlotStates).map((slot) =>
    resolveAdaptiveSlotState(
      slot,
      slotDefinitionByKey,
      preferenceLookup,
      exerciseLookup,
      loadGuidanceLookup,
    ),
  )
  const recoveryRecommendation = getRecoveryRecommendation(mergedSlotStates)
  const weeklyQuota = getWeekQuotaSummary(
    mergedSlotStates,
    program?.days_per_week,
    currentSlot,
  )
  const activeSessionRow = adaptiveContext?.activeSession ?? null
  const activeSlot =
    activeSessionRow
      ? resolveAdaptiveSlotState(
          mergedSlotStates.find(
            (slot) =>
              slot?.program_day_id === activeSessionRow.program_day_id &&
              slot?.phase_number === activeSessionRow.phase_number &&
              slot?.week_number === activeSessionRow.week_number,
          ) ?? null,
          slotDefinitionByKey,
          preferenceLookup,
          exerciseLookup,
          loadGuidanceLookup,
        )
      : null

  return {
    activeSession: activeSessionRow
      ? {
          ...activeSessionRow,
          slot: activeSlot,
          day: activeSlot?.day ?? null,
          draftUpdatedAt: adaptiveContext?.activeDraft?.updated_at ?? null,
        }
      : null,
    currentSlot,
    overdueSlots,
    preferenceLookup,
    loadGuidanceLookup,
    recoveryRecommendation,
    resolvedSlotStates: mergedSlotStates,
    weeklyQuota,
  }
}

async function fetchSwapExerciseRows(baseExercise, limit = SWAP_CANDIDATE_LIMIT) {
  const importedNames = [baseExercise?.substitution_1, baseExercise?.substitution_2]
    .map((value) => `${value ?? ''}`.trim())
    .filter(Boolean)
  const muscleGroup =
    baseExercise?.muscle_group ?? baseExercise?.primary_muscle_group ?? baseExercise?.muscle ?? null

  const importedPromise = importedNames.length
    ? supabase
        .from('exercises')
        .select('*')
        .in('name', importedNames)
    : Promise.resolve({ data: [], error: null })

  const generatedPromise = muscleGroup
    ? supabase
        .from('exercises')
        .select('*')
        .or(`muscle_group.eq.${muscleGroup},primary_muscle_group.eq.${muscleGroup}`)
        .order('name', { ascending: true })
        .limit(Math.max(limit * 3, SWAP_QUERY_LIMIT))
    : supabase
        .from('exercises')
        .select('*')
        .order('name', { ascending: true })
        .limit(Math.max(limit * 3, SWAP_QUERY_LIMIT))

  const [
    { data: importedRows, error: importedError },
    { data: generatedRows, error: generatedError },
  ] = await Promise.all([importedPromise, generatedPromise])

  if (importedError) {
    throw new Error(importedError.message)
  }

  if (generatedError) {
    throw new Error(generatedError.message)
  }

  const deduped = new Map()

  ;[...(importedRows ?? []), ...(generatedRows ?? [])].forEach((row) => {
    if (row?.id && !deduped.has(row.id)) {
      deduped.set(row.id, row)
    }
  })

  return Array.from(deduped.values())
}

export function useProgramSummary(programId = null) {
  const [program, setProgram] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isCancelled = false

    async function loadSummary() {
      if (!isConfigured) {
        if (!isCancelled) {
          setProgram(null)
          setError('Supabase is not configured.')
          setLoading(false)
        }

        return
      }

      setLoading(true)
      setError(null)

      try {
        const nextProgram = await fetchProgramSummary(programId)

        if (!isCancelled) {
          setProgram(nextProgram)
          setLoading(false)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setProgram(null)
          setError(loadError instanceof Error ? loadError.message : 'Failed to load program.')
          setLoading(false)
        }
      }
    }

    void loadSummary()

    return () => {
      isCancelled = true
    }
  }, [programId, reloadToken])

  return {
    program,
    loading,
    error,
    refetch: () => setReloadToken((current) => current + 1),
  }
}

export function useProgramRuntime(programId = null, options = {}) {
  const enabled = options?.enabled !== false
  const [program, setProgram] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && programId))
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [adaptiveState, setAdaptiveState] = useState(() => createEmptyRuntimeState())
  const swapCandidateCacheRef = useRef(new Map())

  useEffect(() => {
    let isCancelled = false

    async function loadRuntime() {
      if (!enabled || !isConfigured || !programId) {
        if (!isCancelled) {
          setProgram(null)
          setError(!enabled ? null : isConfigured ? null : 'Supabase is not configured.')
          setLoading(false)
          setAdaptiveState(createEmptyRuntimeState())
          swapCandidateCacheRef.current.clear()
        }

        return
      }

      setLoading(true)
      setError(null)

      try {
        const [resolvedProgram, activeProgress] = await Promise.all([
          fetchProgramStructure(programId),
          fetchProgramProgress(programId),
        ])

        if (!resolvedProgram) {
          if (!isCancelled) {
            setProgram(null)
            setLoading(false)
            setAdaptiveState(createEmptyRuntimeState())
            swapCandidateCacheRef.current.clear()
          }

          return
        }

        const adaptiveContext = await getProgramAdaptiveContext(resolvedProgram, activeProgress)
        const programExerciseCatalog = buildProgramExerciseCatalog(resolvedProgram)

        if (!isCancelled) {
          if (isDemoModeEnabled()) {
            ensureDemoState(resolvedProgram)
          }

          setProgram(resolvedProgram)
          setAdaptiveState(attachAdaptiveState(resolvedProgram, adaptiveContext, programExerciseCatalog))
          setLoading(false)
          swapCandidateCacheRef.current.clear()
        }
      } catch (loadError) {
        if (!isCancelled) {
          setProgram(null)
          setError(loadError instanceof Error ? loadError.message : 'Failed to load program runtime.')
          setLoading(false)
          setAdaptiveState(createEmptyRuntimeState())
          swapCandidateCacheRef.current.clear()
        }
      }
    }

    void loadRuntime()

    return () => {
      isCancelled = true
    }
  }, [enabled, programId, reloadToken])

  const programExerciseCatalog = useMemo(() => buildProgramExerciseCatalog(program), [program])

  const getSwapCandidates = useCallback(
    async (baseExercise, limit = SWAP_CANDIDATE_LIMIT) => {
      if (!baseExercise) {
        return []
      }

      const cacheKey = `${baseExercise?.exercise_id ?? baseExercise?.id ?? baseExercise?.name ?? 'exercise'}:${limit}`
      const cachedValue = swapCandidateCacheRef.current.get(cacheKey)

      if (cachedValue) {
        return cachedValue
      }

      const localFallback = buildCoachSafeSwapOptions(baseExercise, programExerciseCatalog, limit)

      if (!isConfigured) {
        swapCandidateCacheRef.current.set(cacheKey, localFallback)
        return localFallback
      }

      try {
        const fetchedCandidates = await fetchSwapExerciseRows(baseExercise, limit)
        const mergedCatalog = [...programExerciseCatalog, ...fetchedCandidates]
        const resolvedOptions = buildCoachSafeSwapOptions(baseExercise, mergedCatalog, limit)
        swapCandidateCacheRef.current.set(cacheKey, resolvedOptions)
        return resolvedOptions
      } catch {
        swapCandidateCacheRef.current.set(cacheKey, localFallback)
        return localFallback
      }
    },
    [programExerciseCatalog],
  )

  return {
    program,
    loading,
    error,
    refetch: () => setReloadToken((current) => current + 1),
    currentSlot: adaptiveState.currentSlot,
    activeSession: adaptiveState.activeSession,
    overdueSlots: adaptiveState.overdueSlots,
    recoveryRecommendation: adaptiveState.recoveryRecommendation,
    weeklyQuota: adaptiveState.weeklyQuota,
    slotStates: adaptiveState.resolvedSlotStates,
    preferenceLookup: adaptiveState.preferenceLookup,
    loadGuidanceLookup: adaptiveState.loadGuidanceLookup,
    getSwapCandidates,
  }
}

export function useProgram(programId = null) {
  return useProgramRuntime(programId)
}

export default useProgram
