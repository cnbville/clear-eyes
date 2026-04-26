import { getTargetReps, parseReps } from './repParser.js'

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeText(value) {
  return `${value ?? ''}`.trim()
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase()
}

function isResolvedStatus(status) {
  return ['completed_on_time', 'completed_late', 'skipped'].includes(status)
}

export function buildProgramSlotKey({
  phaseNumber,
  weekNumber,
  dayNumber,
}) {
  return `p${phaseNumber ?? 0}-w${weekNumber ?? 0}-d${dayNumber ?? 0}`
}

export function buildExerciseSlotKey({
  phaseNumber,
  dayNumber,
  displayOrder,
}) {
  return `p${phaseNumber ?? 0}-d${dayNumber ?? 0}-x${displayOrder ?? 0}`
}

export function buildGuidanceKey({
  phaseNumber,
  dayNumber,
  displayOrder,
  exerciseId,
}) {
  return `${buildExerciseSlotKey({
    phaseNumber,
    dayNumber,
    displayOrder,
  })}:${exerciseId ?? 'unknown'}`
}

export function buildExerciseLookup(exercises = []) {
  return exercises.reduce((map, exercise) => {
    if (exercise?.id) {
      map.set(exercise.id, exercise)
    }

    if (exercise?.name) {
      map.set(`name:${normalizeName(exercise.name)}`, exercise)
    }

    return map
  }, new Map())
}

export function flattenProgramSlots(program = null) {
  const slots = []

  ;(program?.phases ?? []).forEach((phase) => {
    ;(phase?.weeks ?? []).forEach((week) => {
      ;(week?.days ?? []).forEach((day) => {
        slots.push({
          slot_key: buildProgramSlotKey({
            phaseNumber: phase.phase_number,
            weekNumber: week.week_number,
            dayNumber: day.day_number,
          }),
          program_id: program?.id ?? null,
          program_day_id: day.id,
          phase_number: phase.phase_number,
          phase_name: phase.name ?? `Phase ${phase.phase_number}`,
          week_number: week.week_number,
          day_number: day.day_number,
          day,
          week,
          phase,
          sequence_order: slots.length + 1,
        })
      })
    })
  })

  return slots
}

export function getResolvedSlotStates(slotStates = []) {
  return [...slotStates].sort(
    (left, right) => toNumber(left?.sequence_order, 0) - toNumber(right?.sequence_order, 0),
  )
}

export function getNextUnresolvedSlot(slotStates = []) {
  return getResolvedSlotStates(slotStates).find((slot) =>
    ['pending', 'carried_forward'].includes(slot?.status ?? 'pending'),
  ) ?? null
}

export function getOverdueSlots(slotStates = []) {
  return getResolvedSlotStates(slotStates).filter((slot) => slot?.status === 'carried_forward')
}

export function getRecoveryRecommendation(slotStates = []) {
  const overdueSlots = getOverdueSlots(slotStates)

  if (!overdueSlots.length) {
    return null
  }

  const earliestOverdue = overdueSlots[0]
  const earliestPending = getNextUnresolvedSlot(slotStates)
  const action =
    overdueSlots.length === 1 &&
    toNumber(earliestOverdue?.phase_number, 0) === toNumber(earliestPending?.phase_number, 0)
      ? 'make_up_next'
      : 'skip'

  return {
    overdueSlots,
    action,
    headline:
      action === 'make_up_next'
        ? 'One carried-forward session is waiting.'
        : 'Multiple carried-forward sessions need cleanup.',
    body:
      action === 'make_up_next'
        ? 'Best move: knock out the carried-forward slot next and get back on rhythm.'
        : 'Best move: skip the oldest carried-forward slot and keep the block moving.',
  }
}

export function getWeekQuotaKey(slotOrState = {}) {
  return `p${slotOrState?.phase_number ?? 0}-w${slotOrState?.week_number ?? 0}`
}

export function getWeekQuotaSummary(slotStates = [], weeklyTarget = 0, currentSlot = null) {
  const grouped = getResolvedSlotStates(slotStates).reduce((map, slot) => {
    const key = getWeekQuotaKey(slot)
    const current = map.get(key) ?? {
      key,
      phase_number: slot?.phase_number ?? 0,
      week_number: slot?.week_number ?? 0,
      total: 0,
      completed: 0,
      skipped: 0,
      carried_forward: 0,
      pending: 0,
    }

    current.total += 1

    if (slot?.status === 'skipped') {
      current.skipped += 1
    } else if (slot?.status === 'completed_on_time' || slot?.status === 'completed_late') {
      current.completed += 1
    } else if (slot?.status === 'carried_forward') {
      current.carried_forward += 1
    } else {
      current.pending += 1
    }

    map.set(key, current)
    return map
  }, new Map())

  const weeks = Array.from(grouped.values()).sort(
    (left, right) =>
      toNumber(left.phase_number, 0) - toNumber(right.phase_number, 0) ||
      toNumber(left.week_number, 0) - toNumber(right.week_number, 0),
  )
  const activeWeekKey = currentSlot ? getWeekQuotaKey(currentSlot) : weeks[weeks.length - 1]?.key ?? null
  const activeWeek = weeks.find((week) => week.key === activeWeekKey) ?? weeks[weeks.length - 1] ?? null
  const effectiveTarget =
    Math.max(toNumber(weeklyTarget, 0), 0) || Math.max(toNumber(activeWeek?.total, 0), 0)

  let consecutiveQuotaHitWeeks = 0

  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    if (weeks[index].completed >= effectiveTarget) {
      consecutiveQuotaHitWeeks += 1
      continue
    }

    break
  }

  return {
    weeks,
    activeWeek,
    effectiveTarget,
    consecutiveQuotaHitWeeks,
  }
}

export function isPhaseResolved(slotStates = [], phaseNumber) {
  const phaseSlots = slotStates.filter((slot) => slot?.phase_number === phaseNumber)

  if (!phaseSlots.length) {
    return false
  }

  return phaseSlots.every((slot) => isResolvedStatus(slot?.status))
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

export function buildProgressSnapshotFromSlots({
  program,
  progress,
  slotStates,
  totals = {},
  countSession = true,
}) {
  const nextSlot = getNextUnresolvedSlot(slotStates)
  const fallbackSlot = getResolvedSlotStates(slotStates)[slotStates.length - 1] ?? null
  const activeSlot = nextSlot ?? fallbackSlot
  const weeklyQuota = getWeekQuotaSummary(
    slotStates,
    program?.days_per_week ?? 0,
    activeSlot,
  )
  const currentProgress = progress ?? {}
  const xpEarned =
    toNumber(totals?.xpEarned, 0) || (countSession ? 100 + toNumber(totals?.prsHit, 0) * 25 : 0)
  const totalXp = toNumber(currentProgress.total_xp, 0) + xpEarned

  return {
    nextSlot: activeSlot,
    nextFields: {
      current_phase: activeSlot?.phase_number ?? toNumber(currentProgress.current_phase, 1),
      current_week: activeSlot?.week_number ?? toNumber(currentProgress.current_week, 1),
      current_day: activeSlot?.day_number ?? toNumber(currentProgress.current_day, 1),
      session_streak:
        countSession
          ? toNumber(currentProgress.session_streak, 0) + 1
          : toNumber(currentProgress.session_streak, 0),
      longest_streak:
        countSession
          ? Math.max(
              toNumber(currentProgress.longest_streak, 0),
              toNumber(currentProgress.session_streak, 0) + 1,
            )
          : toNumber(currentProgress.longest_streak, 0),
      weekly_target:
        Math.max(toNumber(weeklyQuota.effectiveTarget, 0), 0) ||
        Math.max(toNumber(program?.days_per_week, 0), 1),
      weekly_completed: toNumber(weeklyQuota.activeWeek?.completed, 0),
      week_start_date: weeklyQuota.activeWeek
        ? getTodayDateString()
        : currentProgress.week_start_date ?? getTodayDateString(),
      total_sessions:
        toNumber(currentProgress.total_sessions, 0) + (countSession ? 1 : 0),
      total_volume_lifetime:
        toNumber(currentProgress.total_volume_lifetime, 0) +
        (countSession ? toNumber(totals?.totalVolume, 0) : 0),
      total_prs:
        toNumber(currentProgress.total_prs, 0) +
        (countSession ? toNumber(totals?.prsHit, 0) : 0),
      total_xp: totalXp,
      level: Math.max(1, Math.floor(totalXp / 500) + 1),
      last_workout_date: countSession
        ? getTodayDateString()
        : currentProgress.last_workout_date ?? null,
      updated_at: new Date().toISOString(),
    },
    weeklyQuota,
  }
}

export function getReadinessBand(scores = {}) {
  const sleep = toNumber(scores.sleep, 0)
  const soreness = toNumber(scores.soreness, 0)
  const stress = toNumber(scores.stress, 0)
  const energy = toNumber(scores.energy, 0)
  const normalizedScore = (sleep + energy + (6 - soreness) + (6 - stress)) / 4

  if (normalizedScore >= 4) {
    return {
      readiness_score: Math.round(normalizedScore * 100) / 100,
      readiness_band: 'green',
      guidance: 'Train as written. If the bar is moving well, own the top end of the prescription.',
    }
  }

  if (normalizedScore >= 2.75) {
    return {
      readiness_score: Math.round(normalizedScore * 100) / 100,
      readiness_band: 'yellow',
      guidance: 'Keep load conservative, cap effort, and respect rest discipline today.',
    }
  }

  return {
    readiness_score: Math.round(normalizedScore * 100) / 100,
    readiness_band: 'red',
    guidance: 'Minimum-effective work wins today. Keep form crisp and do not chase fatigue.',
  }
}

function getCompatibleEquipmentGroup(equipment) {
  const normalizedEquipment = normalizeText(equipment)

  if (['barbell', 'ez_bar'].includes(normalizedEquipment)) {
    return 'barbell'
  }

  if (['dumbbell', 'cable', 'machine'].includes(normalizedEquipment)) {
    return 'implement'
  }

  if (['bodyweight', 'bench'].includes(normalizedEquipment)) {
    return 'bodyweight'
  }

  return normalizedEquipment || 'other'
}

function isCompoundMovement(exercise = {}) {
  const normalizedMovementType = normalizeText(exercise?.movement_type)
  const equipmentGroup = getCompatibleEquipmentGroup(exercise?.equipment)

  return (
    normalizedMovementType === 'compound' ||
    equipmentGroup === 'barbell' ||
    ['pull_up', 'chin_up'].some((token) =>
      normalizeName(exercise?.name).includes(token),
    )
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getSwapScore(baseExercise, candidate) {
  let score = 0

  if (
    normalizeText(candidate?.muscle_group || candidate?.primary_muscle_group || candidate?.muscle) ===
    normalizeText(baseExercise?.muscle_group || baseExercise?.muscle)
  ) {
    score += 5
  }

  if (normalizeText(candidate?.movement_type) === normalizeText(baseExercise?.movement_type)) {
    score += 4
  }

  if (
    getCompatibleEquipmentGroup(candidate?.equipment) ===
    getCompatibleEquipmentGroup(baseExercise?.equipment)
  ) {
    score += 3
  }

  if (normalizeText(candidate?.force) && normalizeText(candidate?.force) === normalizeText(baseExercise?.force)) {
    score += 2
  }

  if (
    normalizeText(candidate?.mechanic) &&
    normalizeText(candidate?.mechanic) === normalizeText(baseExercise?.mechanic)
  ) {
    score += 1
  }

  return score
}

function resolveImportedSwapCandidate(option, exerciseLookup) {
  if (!option) {
    return null
  }

  return exerciseLookup.get(`name:${normalizeName(option)}`) ?? null
}

export function buildCoachSafeSwapOptions(baseExercise, exerciseCatalog = [], limit = 5) {
  if (!baseExercise) {
    return []
  }

  const exerciseLookup = buildExerciseLookup(exerciseCatalog)
  const seenIds = new Set([baseExercise?.id, baseExercise?.exercise_id].filter(Boolean))
  const ranked = []
  const pushCandidate = (candidate, source, score, reason) => {
    if (!candidate?.id || seenIds.has(candidate.id)) {
      return
    }

    seenIds.add(candidate.id)
    ranked.push({
      ...candidate,
      swap_source: source,
      swap_score: score,
      swap_reason: reason,
    })
  }

  const importedSwaps = [baseExercise?.substitution_1, baseExercise?.substitution_2]
    .map((option, index) => ({
      exercise: resolveImportedSwapCandidate(option, exerciseLookup),
      index,
    }))
    .filter((entry) => entry.exercise)

  importedSwaps.forEach((entry) => {
    pushCandidate(
      entry.exercise,
      'imported',
      100 - entry.index,
      'Imported substitution option',
    )
  })

  exerciseCatalog
    .filter((candidate) => candidate?.id && candidate.id !== baseExercise?.exercise_id && candidate.id !== baseExercise?.id)
    .map((candidate) => ({
      candidate,
      score: getSwapScore(baseExercise, candidate),
    }))
    .filter((entry) => entry.score >= 7)
    .sort((left, right) => right.score - left.score || `${left.candidate.name}`.localeCompare(`${right.candidate.name}`))
    .slice(0, limit * 2)
    .forEach((entry) => {
      const reason =
        entry.score >= 9
          ? 'Same muscle, movement, and compatible equipment'
          : entry.score >= 8
            ? 'Same muscle focus with a similar execution pattern'
            : 'Coach-safe fallback for the same intent'

      pushCandidate(entry.candidate, 'generated', entry.score, reason)
    })

  return ranked.slice(0, limit)
}

const MUSCLE_PRIMERS = {
  chest: ['2 minutes of band pull-aparts', '10 scap push-ups', '8 controlled push-ups'],
  back: ['8 dead hangs or scap pulls', '12 band rows', '8 thoracic extensions'],
  lats: ['8 straight-arm pulldowns', '10 band rows', '10 active hangs'],
  shoulders: ['12 band dislocates', '10 Y-raises', '8 slow empty-hand presses'],
  quads: ['10 bodyweight squats', '8 split squat rocks each side', '10 terminal knee extensions'],
  hamstrings: ['10 hip hinges', '8 glute bridge marches', '8 single-leg RDL reaches'],
  glutes: ['10 glute bridges', '8 lateral lunges', '12 band walks'],
  posterior_chain: ['10 hip hinges', '8 bird dogs each side', '8 glute bridge marches'],
  biceps: ['12 light curls', '10 band rows', '10 wrist rotations'],
  triceps: ['12 band pushdowns', '10 close-grip push-ups', '8 overhead extensions'],
  calves: ['15 ankle rocks', '20 calf raises', '10 pogo hops'],
  core: ['8 dead bugs each side', '20s hollow hold', '20s side plank each side'],
}

function getPrimerPoolForExercise(exercise = {}) {
  const keys = [
    normalizeName(exercise?.muscle_group),
    normalizeName(exercise?.primary_muscle_group),
    normalizeName(exercise?.muscle),
  ].filter(Boolean)

  for (const key of keys) {
    if (MUSCLE_PRIMERS[key]) {
      return MUSCLE_PRIMERS[key]
    }
  }

  if (isCompoundMovement(exercise)) {
    return ['5 empty-rep rehearsals', '8 bracing breaths', '8 tempo pattern reps']
  }

  return ['8 rehearsal reps', '20s joint prep', '10 light activation reps']
}

export function buildDayWarmupPrimers(day = null, limit = 3) {
  const uniquePrimers = []
  const seen = new Set()
  const primaryExercises = (day?.exercises ?? []).slice(0, 3)

  primaryExercises.forEach((exercise) => {
    getPrimerPoolForExercise(exercise).forEach((primer) => {
      if (!seen.has(primer) && uniquePrimers.length < limit) {
        seen.add(primer)
        uniquePrimers.push(primer)
      }
    })
  })

  return uniquePrimers.slice(0, limit)
}

export function buildWarmupLadder({
  exercise,
  anchorWeight = null,
  warmupCount = 0,
}) {
  const normalizedCount = Math.max(Number(warmupCount) || 0, 0)

  if (!normalizedCount) {
    return []
  }

  const templatesByCount = {
    1: [
      { percentage: 0.55, reps: 8 },
    ],
    2: [
      { percentage: 0.45, reps: 8 },
      { percentage: 0.65, reps: 5 },
    ],
    3: [
      { percentage: 0.4, reps: 8 },
      { percentage: 0.6, reps: 5 },
      { percentage: 0.75, reps: 3 },
    ],
    4: [
      { percentage: 0.35, reps: 8 },
      { percentage: 0.5, reps: 5 },
      { percentage: 0.65, reps: 4 },
      { percentage: 0.8, reps: 2 },
    ],
  }
  const anchor = Number(anchorWeight)
  const step = getLoadAdjustmentStep(exercise)
  const templates =
    templatesByCount[normalizedCount] ??
    Array.from({ length: normalizedCount }, (_, index) => ({
      percentage: 0.4 + index * 0.15,
      reps: Math.max(8 - index * 2, 1),
    }))

  return templates.map((template, index) => {
    const prescribedWeight =
      Number.isFinite(anchor) && anchor > 0
        ? Math.max(Math.round((anchor * template.percentage) / step) * step, step)
        : null

    return {
      set_number: index + 1,
      label: `W${index + 1}`,
      percentage: Math.round(template.percentage * 100),
      reps: template.reps,
      weight: prescribedWeight,
    }
  })
}

export function getWarmupAnchor({
  exercise,
  lastSessionSets = [],
  firstWorkingWeight = null,
}) {
  if (exercise?.load_guidance_weight !== null && exercise?.load_guidance_weight !== undefined) {
    return {
      weight: Number(exercise.load_guidance_weight),
      source: 'load_guidance',
    }
  }

  const lastWorkingSet = [...(lastSessionSets ?? [])]
    .filter((set) => (set?.set_type ?? 'working') === 'working')
    .sort((left, right) => Number(right?.set_number ?? 0) - Number(left?.set_number ?? 0))[0]

  if (lastWorkingSet?.weight !== null && lastWorkingSet?.weight !== undefined) {
    return {
      weight: Number(lastWorkingSet.weight),
      source: 'last_completed',
    }
  }

  if (firstWorkingWeight !== null && firstWorkingWeight !== undefined && `${firstWorkingWeight}` !== '') {
    const parsedWeight = Number(firstWorkingWeight)

    if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
      return {
        weight: parsedWeight,
        source: 'current_input',
      }
    }
  }

  return {
    weight: null,
    source: 'percentage_only',
  }
}

function getRestHeuristic(exercise = {}, setType = 'working') {
  if (setType === 'warmup') {
    return 60
  }

  if (isCompoundMovement(exercise) && getCompatibleEquipmentGroup(exercise?.equipment) === 'barbell') {
    return 180
  }

  if (isCompoundMovement(exercise) && ['implement', 'bodyweight'].includes(getCompatibleEquipmentGroup(exercise?.equipment))) {
    return 120
  }

  return 60
}

export function getSmartRestRecommendation({
  exercise,
  setType = 'working',
  reps = null,
  rpeActual = null,
  groupId = null,
  programRestSeconds = null,
  smartRestEnabled = true,
}) {
  const explicitProgramRest = Number(programRestSeconds)
  const baselineSeconds =
    Number.isFinite(explicitProgramRest) && explicitProgramRest > 0
      ? explicitProgramRest
      : getRestHeuristic(exercise, setType)
  const baselineSource =
    Number.isFinite(explicitProgramRest) && explicitProgramRest > 0 ? 'program' : 'heuristic'

  if (!smartRestEnabled) {
    return {
      baselineSeconds,
      targetSeconds: baselineSeconds,
      restTargetSource: baselineSource,
      label: 'Base Rest',
      rationale:
        baselineSource === 'program'
          ? 'Using the imported program rest as written.'
          : 'Using the default rest band for this exercise type.',
    }
  }

  let targetSeconds = baselineSeconds
  const normalizedReps = Number(reps)
  const normalizedRpe = Number(rpeActual)

  if (setType === 'warmup') {
    targetSeconds = clamp(baselineSeconds, 45, 75)
  } else {
    if (Number.isFinite(normalizedReps) && normalizedReps > 0) {
      if (normalizedReps <= 5) {
        targetSeconds += 30
      } else if (normalizedReps >= 12) {
        targetSeconds -= 15
      }
    }

    if (Number.isFinite(normalizedRpe) && normalizedRpe >= 9) {
      targetSeconds += 30
    } else if (Number.isFinite(normalizedRpe) && normalizedRpe <= 6.5) {
      targetSeconds -= 15
    }
  }

  if (groupId) {
    targetSeconds = clamp(targetSeconds, baselineSeconds - 15, baselineSeconds + 15)
  }

  const targetSource =
    targetSeconds === baselineSeconds
      ? baselineSource
      : baselineSource === 'program'
        ? 'smart_program'
        : 'smart_heuristic'

  return {
    baselineSeconds,
    targetSeconds: Math.max(Math.round(targetSeconds), 0),
    restTargetSource: targetSource,
    label: targetSource.startsWith('smart') ? 'Smart Rest' : 'Base Rest',
    rationale:
      targetSource.startsWith('smart')
        ? 'Adjusted for exercise demand, reps, and effort.'
        : baselineSource === 'program'
          ? 'Using the imported program rest as written.'
          : 'Using the default rest band for this exercise type.',
  }
}

function mergeExerciseIdentity(baseExercise, preferredExercise) {
  if (!preferredExercise) {
    return {
      ...baseExercise,
      original_exercise_id: baseExercise?.exercise_id ?? baseExercise?.id ?? null,
      effective_exercise_id: baseExercise?.exercise_id ?? baseExercise?.id ?? null,
      effective_exercise_name: baseExercise?.name ?? 'Exercise',
      preferred_swap: null,
    }
  }

  return {
    ...baseExercise,
    exercise_id: preferredExercise.id,
    name: preferredExercise.name ?? baseExercise?.name,
    muscle: preferredExercise.muscle_group ?? preferredExercise.primary_muscle_group ?? preferredExercise.muscle ?? baseExercise?.muscle,
    muscle_group:
      preferredExercise.muscle_group ??
      preferredExercise.primary_muscle_group ??
      preferredExercise.muscle ??
      baseExercise?.muscle_group,
    equipment: preferredExercise.equipment ?? baseExercise?.equipment,
    movement_type: preferredExercise.movement_type ?? baseExercise?.movement_type,
    force: preferredExercise.force ?? baseExercise?.force,
    mechanic: preferredExercise.mechanic ?? baseExercise?.mechanic,
    instructions: preferredExercise.instructions ?? baseExercise?.instructions,
    image_id: preferredExercise.image_id ?? baseExercise?.image_id,
    video_url: preferredExercise.video_url ?? baseExercise?.video_url,
    original_exercise_id: baseExercise?.exercise_id ?? baseExercise?.id ?? null,
    effective_exercise_id: preferredExercise.id,
    effective_exercise_name: preferredExercise.name ?? baseExercise?.name ?? 'Exercise',
    preferred_swap: preferredExercise,
  }
}

export function resolveEffectiveExercise({
  exercise,
  phaseNumber,
  preferenceLookup,
  exerciseLookup,
  loadGuidanceLookup,
}) {
  const exerciseSlotKey = buildExerciseSlotKey({
    phaseNumber,
    dayNumber: exercise?.day_number,
    displayOrder: exercise?.display_order,
  })
  const preference = preferenceLookup?.get(exerciseSlotKey) ?? null
  const preferredExercise = preference?.preferred_exercise_id
    ? exerciseLookup?.get(preference.preferred_exercise_id) ?? null
    : null
  const resolvedExercise = mergeExerciseIdentity(exercise, preferredExercise)
  const guidanceKey = buildGuidanceKey({
    phaseNumber,
    dayNumber: exercise?.day_number,
    displayOrder: exercise?.display_order,
    exerciseId: resolvedExercise?.effective_exercise_id ?? resolvedExercise?.exercise_id,
  })
  const loadGuidance = loadGuidanceLookup?.get(guidanceKey) ?? null

  return {
    ...resolvedExercise,
    exercise_slot_key: exerciseSlotKey,
    load_guidance_action: loadGuidance?.guidance_action ?? null,
    load_guidance_weight:
      loadGuidance?.target_weight === null || loadGuidance?.target_weight === undefined
        ? null
        : Number(loadGuidance.target_weight),
  }
}

export function resolveProgramDay(day = null, phaseNumber, preferenceLookup, exerciseLookup, loadGuidanceLookup) {
  if (!day) {
    return null
  }

  return {
    ...day,
    exercises: (day.exercises ?? []).map((exercise) =>
      resolveEffectiveExercise({
        exercise: {
          ...exercise,
          day_number: day.day_number,
        },
        phaseNumber,
        preferenceLookup,
        exerciseLookup,
        loadGuidanceLookup,
      }),
    ),
  }
}

export function getLoadAdjustmentStep(exercise = {}) {
  const equipment = normalizeText(exercise?.equipment)

  if (equipment === 'barbell' || equipment === 'ez_bar') {
    return 2.5
  }

  if (equipment === 'dumbbell') {
    return 2
  }

  if (equipment === 'cable' || equipment === 'machine') {
    return 2.5
  }

  return 1
}

function getTargetThresholds(repNotation, setCount) {
  const parsed = parseReps(repNotation)

  return Array.from({ length: setCount }, (_, index) => {
    const setNumber = index + 1

    if (!parsed) {
      return {
        top: null,
        floor: null,
      }
    }

    if (parsed.type === 'range') {
      return {
        top: parsed.max,
        floor: parsed.min,
      }
    }

    const target = getTargetReps(parsed, setNumber)

    return {
      top: target,
      floor: target,
    }
  })
}

export function buildProgressionSuggestion({
  exercise,
  phaseNumber,
  dayNumber,
  readinessBand,
  workingSets = [],
  previousUnderperformanceCount = 0,
}) {
  const eligibleSets = (workingSets ?? []).filter((set) => (set?.set_type ?? 'working') === 'working')

  if (!exercise || !eligibleSets.length) {
    return null
  }

  const thresholds = getTargetThresholds(exercise?.rep_notation, eligibleSets.length)

  if (!thresholds.some((threshold) => threshold.top !== null || threshold.floor !== null)) {
    return null
  }

  const averageRpe =
    eligibleSets
      .map((set) => toNumber(set?.rpe_actual, NaN))
      .filter(Number.isFinite)
      .reduce((sum, value, _, values) => sum + value / values.length, 0) || 0
  const maxWeight = Math.max(...eligibleSets.map((set) => toNumber(set?.weight, 0)), 0)
  const hitTopAcrossSets = eligibleSets.every((set, index) => {
    const target = thresholds[index]?.top
    return target !== null && toNumber(set?.reps, 0) >= target
  })
  const metFloorAcrossSets = eligibleSets.every((set, index) => {
    const target = thresholds[index]?.floor
    return target !== null && toNumber(set?.reps, 0) >= target
  })
  const underperformed = eligibleSets.some((set, index) => {
    const target = thresholds[index]?.floor
    return target !== null && toNumber(set?.reps, 0) < target
  })
  const adjustmentStep = getLoadAdjustmentStep(exercise)
  const slot = {
    phaseNumber,
    dayNumber,
    displayOrder: exercise?.display_order,
    exerciseId: exercise?.effective_exercise_id ?? exercise?.exercise_id,
  }

  if (hitTopAcrossSets && averageRpe <= 9.25) {
    return {
      ...slot,
      guidance_action: 'increase',
      target_weight: Math.max(maxWeight + adjustmentStep, adjustmentStep),
      reason: 'All working sets owned the top end of the prescription with acceptable effort.',
    }
  }

  if (
    underperformed &&
    previousUnderperformanceCount >= 1 &&
    readinessBand !== 'red' &&
    maxWeight > adjustmentStep
  ) {
    return {
      ...slot,
      guidance_action: 'reduce',
      target_weight: Math.max(maxWeight - adjustmentStep, adjustmentStep),
      reason: 'Underperformance repeated across exposures without a red-readiness explanation.',
    }
  }

  if (metFloorAcrossSets) {
    return {
      ...slot,
      guidance_action: 'hold',
      target_weight: maxWeight || null,
      reason: 'The target was met, but there is not enough signal to push load yet.',
    }
  }

  return null
}
