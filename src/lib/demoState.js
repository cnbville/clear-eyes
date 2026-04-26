import {
  calculateRestDiscipline,
  calculateVolume,
  detectPR,
  estimateOneRepMax,
  getPhaseColor,
  parseRestNotation,
} from './calculations.js'
import { getTargetReps, parseReps } from './repParser.js'

const DEMO_ENABLED_KEY = 'iron-demo-enabled'
const DEMO_STATE_KEY = 'iron-demo-state-v1'
const DEMO_PURGED_KEY = 'iron-demo-purged-v1'
const DEMO_STATE_VERSION = 1
const DEMO_CHANGE_EVENT = 'iron:demo-data-changed'

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function makeId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function slugify(value) {
  return `${value ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function readStoredState() {
  if (!canUseBrowserStorage()) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(DEMO_STATE_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

function writeStoredState(state) {
  if (!canUseBrowserStorage()) {
    return state
  }

  window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(DEMO_CHANGE_EVENT))
  return state
}

function roundToSingleDecimal(value) {
  return Math.round(Number(value) * 10) / 10
}

function getProgramSignature(program) {
  return JSON.stringify({
    id: program?.id ?? null,
    days_per_week: program?.days_per_week ?? 0,
    phases: (program?.phases ?? []).map((phase) => ({
      phase_number: phase.phase_number,
      num_weeks: phase.num_weeks,
      days: (phase.days ?? []).map((day) => ({
        id: day.id,
        day_number: day.day_number,
        exercise_count: day.exercises?.length ?? 0,
      })),
    })),
  })
}

function getDemoTarget(program) {
  const sortedPhases = [...(program?.phases ?? [])].sort(
    (left, right) => left.phase_number - right.phase_number,
  )

  const targetPhase =
    sortedPhases.find((phase) => phase.phase_number === 2) ??
    sortedPhases[0] ??
    null

  if (!targetPhase) {
    return {
      current_phase: 1,
      current_week: 1,
      current_day: 1,
      phase: null,
    }
  }

  return {
    current_phase: targetPhase.phase_number,
    current_week: Math.min(2, Math.max(targetPhase.num_weeks ?? 1, 1)),
    current_day: Math.min(program?.days_per_week ?? targetPhase.days?.length ?? 1, 3),
    phase: targetPhase,
  }
}

function getUniqueExercises(program) {
  const exerciseMap = new Map()

  ;(program?.phases ?? []).forEach((phase) => {
    ;(phase.days ?? []).forEach((day) => {
      ;(day.exercises ?? []).forEach((exercise) => {
        const exerciseId = exercise.exercise_id ?? exercise.id ?? `local-${slugify(exercise.name)}`

        if (!exerciseMap.has(exerciseId)) {
          exerciseMap.set(exerciseId, {
            id: exerciseId,
            name: exercise.name ?? 'Exercise',
            primary_muscle_group: exercise.muscle ?? 'other',
            equipment: exercise.equipment ?? 'other',
            video_url: exercise.video_url ?? null,
            is_custom: Boolean(exercise.is_custom),
          })
        }
      })
    })
  })

  return Array.from(exerciseMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

function buildCompletedSchedule(program, target) {
  const entries = []
  const sortedPhases = [...(program?.phases ?? [])].sort(
    (left, right) => left.phase_number - right.phase_number,
  )
  const daysPerWeek = program?.days_per_week ?? target.phase?.days?.length ?? 1

  sortedPhases.forEach((phase) => {
    if (phase.phase_number > target.current_phase) {
      return
    }

    const isCurrentPhase = phase.phase_number === target.current_phase
    const phaseWeeks = isCurrentPhase ? target.current_week : phase.num_weeks
    const lastWeekInPhase = Math.max(phaseWeeks, 0)

    for (let weekNumber = 1; weekNumber <= lastWeekInPhase; weekNumber += 1) {
      const isCurrentWeek = isCurrentPhase && weekNumber === target.current_week
      const daysCompleted = isCurrentWeek ? Math.max(target.current_day - 1, 0) : daysPerWeek

      for (let dayNumber = 1; dayNumber <= daysCompleted; dayNumber += 1) {
        const day =
          phase.days?.find((candidateDay) => candidateDay.day_number === dayNumber) ??
          phase.days?.[dayNumber - 1] ??
          phase.days?.[0] ??
          null

        if (!day) {
          continue
        }

        entries.push({
          phase_number: phase.phase_number,
          week_number: weekNumber,
          day_number: dayNumber,
          day,
        })
      }
    }
  })

  return entries
}

function buildTrainingDates(totalSessions) {
  const dates = []
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)

  while (dates.length < totalSessions) {
    const dayOfWeek = cursor.getDay()

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.unshift(formatDate(cursor))
    }

    cursor.setDate(cursor.getDate() - 1)
  }

  return dates
}

function getExerciseBaseWeight(exercise) {
  const name = `${exercise?.name ?? ''}`.toLowerCase()
  const equipment = `${exercise?.equipment ?? ''}`.toLowerCase()

  if (
    !name ||
    equipment === 'bodyweight' ||
    name.includes('plank') ||
    name.includes('hold') ||
    name.includes('hanging leg') ||
    name.includes('ab wheel') ||
    name.includes('crunch')
  ) {
    return 0
  }

  if (name.includes('deadlift')) return 135
  if (name.includes('squat') || name.includes('hack squat')) return 105
  if (name.includes('leg press')) return 180
  if (name.includes('bench')) return 82.5
  if (name.includes('row')) return 68
  if (name.includes('rdl')) return 112.5
  if (name.includes('hip thrust')) return 130
  if (name.includes('pull-up') || name.includes('chin-up')) return 10
  if (name.includes('lat pulldown')) return 58
  if (name.includes('shoulder press') || name.includes('overhead press')) return 46
  if (name.includes('lunge') || name.includes('split squat')) return 24
  if (name.includes('curl')) return 18
  if (name.includes('triceps') || name.includes('pushdown')) return 25
  if (name.includes('fly') || name.includes('lateral raise') || name.includes('rear delt')) return 12
  if (name.includes('leg extension')) return 60
  if (name.includes('leg curl') || name.includes('hamstring curl')) return 45
  if (name.includes('calf')) return 90

  if (equipment === 'barbell') return 72.5
  if (equipment === 'machine') return 50
  if (equipment === 'cable') return 27.5
  if (equipment === 'dumbbell') return 22

  return 35
}

function getWeightStep(baseWeight) {
  if (baseWeight >= 120) return 5
  if (baseWeight >= 60) return 2.5
  if (baseWeight >= 20) return 1.25
  if (baseWeight > 0) return 0.5
  return 0
}

function resolveWorkingReps(exercise, setNumber, occurrenceIndex) {
  const parsed = parseReps(exercise?.rep_notation ?? '')

  if (!parsed) {
    return 8
  }

  if (parsed.type === 'amrap') {
    return 12 + (occurrenceIndex % 4)
  }

  if (parsed.type === 'isometric') {
    return null
  }

  const targetReps = getTargetReps(parsed, setNumber)

  if (targetReps === null || targetReps === undefined) {
    return 8
  }

  const adjustment = occurrenceIndex % 3 === 0 ? -1 : 0
  return Math.max(targetReps + adjustment, 1)
}

function buildSetRowsForExercise(exercise, occurrenceIndex, sessionId, sessionDate, dayId) {
  const sets = []
  const warmupSets = Number(exercise?.warmup_sets) || 0
  const workingSets = Number(exercise?.working_sets) || 0
  const baseWeight = getExerciseBaseWeight(exercise)
  const step = getWeightStep(baseWeight)
  const phaseBoost = step * 2 * Math.max((exercise?.phase_number ?? 1) - 1, 0)
  const progressionBoost = step * Math.floor(occurrenceIndex / 2)
  const workingWeight = roundToSingleDecimal(Math.max(baseWeight + phaseBoost + progressionBoost, 0))
  const restSeconds =
    Number.isFinite(Number(exercise?.rest_seconds)) && exercise?.rest_seconds !== null
      ? Number(exercise.rest_seconds)
      : parseRestNotation(exercise?.rest_notation ?? '') ?? 90

  for (let index = 0; index < warmupSets; index += 1) {
    const factor = [0.45, 0.6, 0.72, 0.8][index] ?? 0.82
    const weight = workingWeight ? roundToSingleDecimal(workingWeight * factor) : null

    sets.push({
      id: makeId('demo-set'),
      session_id: sessionId,
      prescribed_exercise_id: exercise.id ?? null,
      exercise_id: exercise.exercise_id ?? exercise.id ?? `local-${slugify(exercise.name)}`,
      exercise_name: exercise.name ?? 'Exercise',
      program_day_id: dayId,
      set_number: index + 1,
      set_type: 'warmup',
      weight,
      reps: workingWeight ? 6 + (warmupSets - index) : null,
      rpe_actual: null,
      rest_prescribed_seconds: 45,
      rest_taken_seconds: 40 + index * 10,
      is_adhoc: Boolean(exercise?.is_adhoc),
      is_pr: false,
      pr_type: null,
      logged_at: `${sessionDate}T10:${String(5 + index).padStart(2, '0')}:00.000Z`,
    })
  }

  for (let index = 0; index < workingSets; index += 1) {
    const reps = resolveWorkingReps(exercise, index + 1, occurrenceIndex)
    const weightDrop = step && index > 1 ? step : 0
    const weight = workingWeight ? roundToSingleDecimal(Math.max(workingWeight - weightDrop, 0)) : null
    const takenMultiplier = 0.86 + ((occurrenceIndex + index) % 4) * 0.08
    const restTakenSeconds = restSeconds
      ? Math.round(restSeconds * takenMultiplier)
      : 0

    sets.push({
      id: makeId('demo-set'),
      session_id: sessionId,
      prescribed_exercise_id: exercise.id ?? null,
      exercise_id: exercise.exercise_id ?? exercise.id ?? `local-${slugify(exercise.name)}`,
      exercise_name: exercise.name ?? 'Exercise',
      program_day_id: dayId,
      set_number: warmupSets + index + 1,
      set_type: 'working',
      weight,
      reps,
      duration_seconds: null,
      rpe_actual: clampNumber(7 + ((occurrenceIndex + index) % 3) * 0.5, 6, 9.5),
      rest_prescribed_seconds: restSeconds,
      rest_taken_seconds: restTakenSeconds,
      is_adhoc: Boolean(exercise?.is_adhoc),
      is_pr: false,
      pr_type: null,
      logged_at: `${sessionDate}T10:${String(20 + index * 6).padStart(2, '0')}:00.000Z`,
    })
  }

  return sets
}

function buildSessionNotes(entry) {
  if (entry.phase_number === 1) {
    return 'Moved smoothly and kept rest pretty disciplined.'
  }

  if (entry.phase_number === 2) {
    return 'Heavier exposure. Top sets felt sharp.'
  }

  return 'Strong session.'
}

function applyPersonalRecords(sessions) {
  const recordMap = new Map()

  sessions.forEach((session) => {
    let prsHit = 0

    session.logged_sets.forEach((set) => {
      const weight = Number(set.weight)
      const reps = Number(set.reps)

      if (set.set_type !== 'working' || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps <= 0) {
        return
      }

      const existingRecords = Array.from(recordMap.values())
        .filter((record) => record.exercise_id === set.exercise_id)
        .map((record) => ({
          pr_type: record.pr_type,
          value: record.value,
        }))

      const prTypes = detectPR(weight, reps, existingRecords)

      if (!prTypes.length) {
        return
      }

      set.is_pr = true
      set.pr_type = prTypes.join(', ')
      prsHit += prTypes.length

      prTypes.forEach((prType) => {
        const value = prType === 'estimated_1rm' ? estimateOneRepMax(weight, reps) : weight
        recordMap.set(`${set.exercise_id}-${prType}`, {
          id: `${set.exercise_id}-${prType}`,
          exercise_id: set.exercise_id,
          pr_type: prType,
          value,
          weight,
          reps,
          session_id: session.id,
          achieved_at: session.date,
        })
      })
    })

    session.prs_hit = prsHit
  })

  return Array.from(recordMap.values()).sort((left, right) =>
    `${right.achieved_at}`.localeCompare(`${left.achieved_at}`),
  )
}

function buildLiftComparisons(sessions = []) {
  const exerciseSessions = new Map()

  sessions.forEach((session) => {
    session.logged_sets
      .filter((set) => set?.set_type === 'working' && Number(set?.weight) > 0)
      .forEach((set) => {
        const key = set.exercise_id
        const currentEntries = exerciseSessions.get(key) ?? []
        currentEntries.push({
          date: session.date,
          exercise_name: set.exercise_name ?? 'Exercise',
          weight: Number(set.weight) || 0,
        })
        exerciseSessions.set(key, currentEntries)
      })
  })

  return Array.from(exerciseSessions.values())
    .map((entries) => {
      const byDate = entries.reduce((map, entry) => {
        const currentEntries = map.get(entry.date) ?? []
        currentEntries.push(entry)
        map.set(entry.date, currentEntries)
        return map
      }, new Map())
      const dates = Array.from(byDate.keys()).sort((left, right) => left.localeCompare(right))

      if (dates.length < 2) {
        return null
      }

      const startEntries = byDate.get(dates[0]) ?? []
      const endEntries = byDate.get(dates[dates.length - 1]) ?? []
      const startWeight =
        startEntries.reduce((sum, entry) => sum + entry.weight, 0) / Math.max(startEntries.length, 1)
      const endWeight =
        endEntries.reduce((sum, entry) => sum + entry.weight, 0) / Math.max(endEntries.length, 1)
      const pctChange = startWeight > 0 ? ((endWeight - startWeight) / startWeight) * 100 : 0

      return {
        exercise_name: startEntries[0]?.exercise_name ?? endEntries[0]?.exercise_name ?? 'Exercise',
        start_weight: roundToSingleDecimal(startWeight),
        end_weight: roundToSingleDecimal(endWeight),
        pct_change: roundToSingleDecimal(pctChange),
      }
    })
    .filter(Boolean)
}

function buildPhaseSnapshots(program, sessions, target, totalXp) {
  const completedPhases = (program?.phases ?? []).filter(
    (phase) => phase.phase_number < target.current_phase,
  )

  return completedPhases.map((phase) => {
    const phaseSessions = sessions.filter(
      (session) => session.phase_number === phase.phase_number && session.status === 'completed',
    )
    const averageRestDiscipline = phaseSessions.length
      ? phaseSessions.reduce(
          (sum, session) => sum + (Number(session.rest_discipline_score) || 0),
          0,
        ) / phaseSessions.length
      : 0
    const sessionsTotal = (program?.days_per_week ?? phase.days?.length ?? 1) * (phase.num_weeks ?? 1)

    return {
      id: makeId('demo-phase-snapshot'),
      program_id: program.id,
      phase_number: phase.phase_number,
      name: phase.name,
      completed_at: `${phaseSessions[phaseSessions.length - 1]?.date ?? formatDate(new Date())}T18:00:00.000Z`,
      sessions_completed: phaseSessions.length,
      sessions_total: sessionsTotal,
      total_volume: roundToSingleDecimal(
        phaseSessions.reduce((sum, session) => sum + (Number(session.total_volume) || 0), 0),
      ),
      prs_hit: phaseSessions.reduce((sum, session) => sum + (Number(session.prs_hit) || 0), 0),
      avg_rest_discipline: roundToSingleDecimal(averageRestDiscipline),
      streak_at_completion: Math.min(phaseSessions.length, 9),
      xp_earned: Math.round(totalXp * (phaseSessions.length / Math.max(sessions.length, 1))),
      lift_comparisons: buildLiftComparisons(phaseSessions),
      phase_baselines: {
        color: getPhaseColor(phase.phase_number),
      },
    }
  })
}

function buildSeedState(program) {
  const target = getDemoTarget(program)
  const exerciseCatalog = getUniqueExercises(program)
  const scheduleEntries = buildCompletedSchedule(program, target)
  const dates = buildTrainingDates(scheduleEntries.length)
  const exerciseOccurrences = new Map()

  const sessions = scheduleEntries.map((entry, index) => {
    const date = dates[index]
    const sessionId = makeId('demo-session')
    const loggedSets = []

    ;(entry.day?.exercises ?? []).forEach((exercise) => {
      const exerciseId = exercise.exercise_id ?? exercise.id ?? `local-${slugify(exercise.name)}`
      const occurrenceIndex = exerciseOccurrences.get(exerciseId) ?? 0

      exerciseOccurrences.set(exerciseId, occurrenceIndex + 1)

      const setRows = buildSetRowsForExercise(
        {
          ...exercise,
          phase_number: entry.phase_number,
        },
        occurrenceIndex,
        sessionId,
        date,
        entry.day?.id ?? null,
      )

      loggedSets.push(...setRows)
    })

    const totalVolume = roundToSingleDecimal(calculateVolume(loggedSets))
    const restDisciplineScore = roundToSingleDecimal(calculateRestDiscipline(loggedSets))

    return {
      id: sessionId,
      program_id: program.id,
      date,
      status: 'completed',
      phase_number: entry.phase_number,
      week_number: entry.week_number,
      program_day_id: entry.day?.id ?? null,
      duration_minutes: 54 + (index % 4) * 6,
      total_volume: totalVolume,
      total_sets: loggedSets.length,
      rest_discipline_score: restDisciplineScore,
      prs_hit: 0,
      notes: buildSessionNotes(entry),
      mood_rating: clampNumber(3 + (index % 3), 1, 5),
      session_rpe: clampNumber(7 + (index % 4), 1, 10),
      started_at: `${date}T10:00:00.000Z`,
      completed_at: `${date}T11:10:00.000Z`,
      program_days: {
        name: entry.day?.name ?? 'Workout',
        day_number: entry.day?.day_number ?? entry.day_number,
      },
      logged_sets: loggedSets,
    }
  })

  const personalRecords = applyPersonalRecords(sessions)
  const totalPrs = sessions.reduce((sum, session) => sum + (session.prs_hit ?? 0), 0)
  const totalVolumeLifetime = sessions.reduce(
    (sum, session) => sum + (Number(session.total_volume) || 0),
    0,
  )
  const totalXp = sessions.length * 110 + totalPrs * 20
  const weeklyCompleted = Math.max(target.current_day - 1, 0)
  const currentWeekSessions = sessions.slice(-Math.max(weeklyCompleted, 1))
  const weekStartDate = currentWeekSessions[0]?.date ?? sessions[sessions.length - 1]?.date ?? formatDate(new Date())

  return {
    version: DEMO_STATE_VERSION,
    programId: program.id,
    programSignature: getProgramSignature(program),
    exerciseCatalog,
    progress: {
      id: makeId('demo-progress'),
      program_id: program.id,
      current_phase: target.current_phase,
      current_week: target.current_week,
      current_day: target.current_day,
      session_streak: 6,
      longest_streak: 12,
      streak_shields_remaining: 2,
      streak_shields_reset_at: sessions[sessions.length - 1]?.date ?? formatDate(new Date()),
      weekly_target: program?.days_per_week ?? target.phase?.days?.length ?? 5,
      weekly_completed: weeklyCompleted,
      week_start_date: weekStartDate,
      total_sessions: sessions.length,
      total_volume_lifetime: roundToSingleDecimal(totalVolumeLifetime),
      total_prs: totalPrs,
      total_xp: totalXp,
      level: Math.max(1, Math.floor(totalXp / 500) + 1),
      last_workout_date: sessions[sessions.length - 1]?.date ?? null,
      updated_at: new Date().toISOString(),
    },
    sessions,
    personalRecords,
    phaseSnapshots: buildPhaseSnapshots(program, sessions, target, totalXp),
  }
}

function upsertPersonalRecord(records, row) {
  const existingIndex = records.findIndex(
    (record) => record.exercise_id === row.exercise_id && record.pr_type === row.pr_type,
  )

  if (existingIndex === -1) {
    records.push(row)
    return
  }

  records[existingIndex] = row
}

function sortSessionsDescending(sessions) {
  return [...sessions].sort((left, right) => `${right.date}`.localeCompare(`${left.date}`))
}

function getActiveState(program) {
  if (!isDemoModeEnabled()) {
    return null
  }

  return ensureDemoState(program)
}

export function isDemoModeEnabled() {
  if (!canUseBrowserStorage()) {
    return false
  }

  if (window.localStorage.getItem(DEMO_PURGED_KEY) !== 'true') {
    window.localStorage.setItem(DEMO_ENABLED_KEY, 'false')
    window.localStorage.removeItem(DEMO_STATE_KEY)
    window.localStorage.setItem(DEMO_PURGED_KEY, 'true')
  }

  const storedValue = window.localStorage.getItem(DEMO_ENABLED_KEY)

  if (storedValue === null) {
    return false
  }

  return storedValue === 'true'
}

export function ensureDemoState(program) {
  if (!canUseBrowserStorage() || !program?.id || !isDemoModeEnabled()) {
    return null
  }

  const currentState = readStoredState()
  const nextSignature = getProgramSignature(program)

  if (
    currentState?.version === DEMO_STATE_VERSION &&
    currentState?.programId === program.id &&
    currentState?.programSignature === nextSignature
  ) {
    return currentState
  }

  const seededState = buildSeedState(program)
  return writeStoredState(seededState)
}

export function clearDemoState() {
  if (!canUseBrowserStorage()) {
    return
  }

  window.localStorage.setItem(DEMO_ENABLED_KEY, 'false')
  window.localStorage.removeItem(DEMO_STATE_KEY)
  window.dispatchEvent(new CustomEvent(DEMO_CHANGE_EVENT))
}

export function readDemoProgress(program) {
  return getActiveState(program)?.progress ?? null
}

export function updateDemoProgress(program, fields) {
  const state = getActiveState(program)

  if (!state) {
    return {
      success: false,
      error: 'Demo state is unavailable.',
    }
  }

  const nextState = {
    ...state,
    progress: {
      ...state.progress,
      ...fields,
      updated_at: new Date().toISOString(),
    },
  }

  writeStoredState(nextState)

  return {
    success: true,
    data: nextState.progress,
  }
}

export function getDemoRecentSessions(programId, limit = 5) {
  const state = readStoredState()

  if (!state || state.programId !== programId || !isDemoModeEnabled()) {
    return []
  }

  return sortSessionsDescending(
    state.sessions.filter((session) => session.program_id === programId),
  ).slice(0, limit)
}

export function getDemoHistorySessions(programId) {
  const state = readStoredState()

  if (!state || state.programId !== programId || !isDemoModeEnabled()) {
    return []
  }

  return sortSessionsDescending(
    state.sessions.filter((session) => session.program_id === programId),
  )
}

export function getDemoExerciseCatalog() {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled()) {
    return []
  }

  return [...(state.exerciseCatalog ?? [])].sort((left, right) =>
    `${left.name}`.localeCompare(`${right.name}`),
  )
}

export function getDemoExerciseSeries(exerciseId) {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled()) {
    return {
      loggedSets: [],
      personalRecords: [],
    }
  }

  const loggedSets = sortSessionsDescending(state.sessions)
    .flatMap((session) =>
      (session.logged_sets ?? [])
        .filter(
          (set) =>
            set.exercise_id === exerciseId &&
            set.set_type === 'working',
        )
        .map((set) => ({
          id: set.id,
          weight: set.weight,
          reps: set.reps,
          set_type: set.set_type,
          workout_sessions: {
            id: session.id,
            date: session.date,
          },
        })),
    )
    .reverse()

    return {
      loggedSets,
      personalRecords: [...(state.personalRecords ?? [])]
        .filter((record) => record.exercise_id === exerciseId)
        .sort((left, right) => `${right.achieved_at}`.localeCompare(`${left.achieved_at}`)),
    }
}

export function getDemoLibraryData() {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled()) {
    return {
      exercises: [],
      loggedSets: [],
      personalRecords: [],
    }
  }

  return {
    exercises: [...(state.exerciseCatalog ?? [])].sort((left, right) =>
      `${left.name}`.localeCompare(`${right.name}`),
    ),
    loggedSets: sortSessionsDescending(state.sessions).flatMap((session) =>
      (session.logged_sets ?? []).map((set) => ({
        id: set.id,
        exercise_id: set.exercise_id,
        set_number: set.set_number,
        weight: set.weight,
        reps: set.reps,
        workout_sessions: {
          id: session.id,
          date: session.date,
        },
      })),
    ),
    personalRecords: [...(state.personalRecords ?? [])],
  }
}

export function createDemoExercise({ name, muscle, equipment, videoUrl }) {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled()) {
    return {
      success: false,
      error: 'Demo state is unavailable.',
    }
  }

  const normalizedName = `${name ?? ''}`.trim()

  if (!normalizedName) {
    return {
      success: false,
      error: 'Exercise name is required.',
    }
  }

  const existingExercise = state.exerciseCatalog.find(
    (exercise) => exercise.name.toLowerCase() === normalizedName.toLowerCase(),
  )

  if (existingExercise) {
    return {
      success: true,
      data: existingExercise,
    }
  }

  const exercise = {
    id: `local-${slugify(normalizedName)}-${Date.now()}`,
    name: normalizedName,
    primary_muscle_group: `${muscle ?? ''}`.trim() || 'other',
    equipment: `${equipment ?? ''}`.trim() || 'other',
    video_url: `${videoUrl ?? ''}`.trim() || null,
    is_custom: true,
  }

  writeStoredState({
    ...state,
    exerciseCatalog: [...state.exerciseCatalog, exercise],
  })

  return {
    success: true,
    data: exercise,
  }
}

export function getDemoGhostData(exerciseId, programDayId) {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled() || !exerciseId || !programDayId) {
    return null
  }

  const session = sortSessionsDescending(state.sessions).find(
    (candidateSession) =>
      candidateSession.program_day_id === programDayId &&
      candidateSession.status === 'completed' &&
      (candidateSession.logged_sets ?? []).some((set) => set.exercise_id === exerciseId),
  )

  if (!session) {
    return null
  }

  const matchingSets = (session.logged_sets ?? [])
    .filter((set) => set.exercise_id === exerciseId)
    .map((set) => ({
      set_number: set.set_number,
      weight: set.weight,
      reps: set.reps,
    }))

  return matchingSets.length ? matchingSets : null
}

function ensureExerciseCatalogEntry(state, setData) {
  const exerciseId =
    setData?.exercise_id ??
    `local-${slugify(setData?.exercise_name ?? 'exercise')}`

  if (
    !state.exerciseCatalog.some((exercise) => exercise.id === exerciseId) &&
    setData?.exercise_name
  ) {
    state.exerciseCatalog.push({
      id: exerciseId,
      name: setData.exercise_name,
      primary_muscle_group: setData.muscle ?? 'other',
      equipment: setData.equipment ?? 'other',
      video_url: null,
      is_custom: true,
    })
  }

  return exerciseId
}

export function startDemoSession(program, programDayId, phaseNumber, weekNumber, startedAt) {
  const state = getActiveState(program)

  if (!state) {
    return {
      success: false,
      error: 'Demo state is unavailable.',
    }
  }

  const dayLookup = (program?.phases ?? [])
    .flatMap((phase) => phase.days ?? [])
    .find((day) => day.id === programDayId)

  const session = {
    id: makeId('demo-session'),
    program_id: program.id,
    date: formatDate(new Date()),
    status: 'in_progress',
    phase_number: phaseNumber,
    week_number: weekNumber,
    program_day_id: programDayId,
    started_at: startedAt ? new Date(Number(startedAt)).toISOString() : new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    total_volume: 0,
    total_sets: 0,
    rest_discipline_score: 0,
    prs_hit: 0,
    notes: null,
    mood_rating: null,
    session_rpe: null,
    program_days: {
      name: dayLookup?.name ?? 'Workout',
      day_number: dayLookup?.day_number ?? 1,
    },
    logged_sets: [],
  }

  const nextState = {
    ...state,
    sessions: [...state.sessions, session],
  }

  writeStoredState(nextState)

  return {
    success: true,
    session,
    sessionId: session.id,
  }
}

export function logDemoSet(program, sessionId, setData) {
  const state = getActiveState(program)

  if (!state) {
    return {
      success: false,
      error: 'Demo state is unavailable.',
    }
  }

  const nextState = {
    ...state,
    exerciseCatalog: [...state.exerciseCatalog],
    personalRecords: [...state.personalRecords],
    sessions: state.sessions.map((session) => ({ ...session, logged_sets: [...session.logged_sets] })),
  }
  const session = nextState.sessions.find((candidateSession) => candidateSession.id === sessionId)

  if (!session) {
    return {
      success: false,
      error: 'Session not found.',
    }
  }

  const exerciseId = ensureExerciseCatalogEntry(nextState, setData)
  const weight = Number(setData?.weight)
  const reps = Number(setData?.reps)
  const existingRecords = nextState.personalRecords
    .filter((record) => record.exercise_id === exerciseId)
    .map((record) => ({
      pr_type: record.pr_type,
      value: record.value,
    }))
  const detectedPrTypes =
    setData?.set_type === 'working' && Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0
      ? detectPR(weight, reps, existingRecords)
      : []
  const row = {
    id: makeId('demo-set'),
    session_id: sessionId,
    prescribed_exercise_id: setData?.prescribed_exercise_id ?? null,
    exercise_id: exerciseId,
    exercise_name: setData?.exercise_name ?? 'Exercise',
    set_number: setData?.set_number ?? session.logged_sets.length + 1,
    set_type: setData?.set_type ?? 'working',
    weight: Number.isFinite(weight) ? weight : null,
    reps: Number.isFinite(reps) ? reps : null,
    duration_seconds: Number.isFinite(Number(setData?.duration_seconds)) ? Number(setData.duration_seconds) : null,
    rpe_actual: Number.isFinite(Number(setData?.rpe_actual)) ? Number(setData.rpe_actual) : null,
    rest_prescribed_seconds:
      Number.isFinite(Number(setData?.rest_prescribed_seconds))
        ? Number(setData.rest_prescribed_seconds)
        : null,
    rest_taken_seconds:
      Number.isFinite(Number(setData?.rest_taken_seconds))
        ? Number(setData.rest_taken_seconds)
        : null,
    is_adhoc: Boolean(setData?.is_adhoc || !setData?.prescribed_exercise_id),
    is_pr: detectedPrTypes.length > 0,
    pr_type: detectedPrTypes.join(', ') || null,
    logged_at: setData?.logged_at ?? new Date().toISOString(),
  }

  session.logged_sets.push(row)

  detectedPrTypes.forEach((prType) => {
    upsertPersonalRecord(nextState.personalRecords, {
      id: `${exerciseId}-${prType}`,
      exercise_id: exerciseId,
      pr_type: prType,
      value: prType === 'estimated_1rm' ? estimateOneRepMax(weight, reps) : weight,
      weight,
      reps,
      session_id: sessionId,
      achieved_at: session.date,
    })
  })

  writeStoredState(nextState)

  return {
    success: true,
    data: row,
    exerciseId,
    prs: detectedPrTypes.map((prType) => ({
      id: `${exerciseId}-${prType}`,
      title: prType,
      subtitle: setData?.exercise_name ?? 'Exercise',
      value: weight && reps ? `${weight}kg × ${reps}` : weight ? `${weight}kg` : `${reps} reps`,
      pr_type: prType,
    })),
  }
}

export function completeDemoSession(program, sessionId, totals = {}) {
  const state = getActiveState(program)

  if (!state) {
    return {
      success: false,
      error: 'Demo state is unavailable.',
    }
  }

  const nextState = {
    ...state,
    sessions: state.sessions.map((session) => ({ ...session })),
  }
  const session = nextState.sessions.find((candidateSession) => candidateSession.id === sessionId)

  if (!session) {
    return {
      success: false,
      error: 'Session not found.',
    }
  }

  session.completed_at = totals.completedAt
    ? new Date(Number(totals.completedAt)).toISOString()
    : new Date().toISOString()
  session.status = 'completed'
  session.total_volume = totals.totalVolume ?? calculateVolume(session.logged_sets ?? [])
  session.total_sets = totals.totalSets ?? session.logged_sets.length
  session.duration_minutes = totals.durationMinutes ?? 0
  session.rest_discipline_score =
    totals.restDisciplineScore ?? calculateRestDiscipline(session.logged_sets ?? [])
  session.prs_hit = totals.prsHit ?? 0
  session.notes = totals.notes ?? session.notes
  session.mood_rating = totals.moodRating ?? session.mood_rating
  session.session_rpe = totals.sessionRpe ?? session.session_rpe

  writeStoredState(nextState)

  return {
    success: true,
    data: session,
  }
}

export function createDemoPhaseSnapshot(program, phase, xpEarned = 0, streakAtCompletion = 0) {
  const state = getActiveState(program)

  if (!state || !phase?.phase_number) {
    return {
      success: false,
      error: 'Phase context is unavailable.',
    }
  }

  const sessions = state.sessions.filter(
    (session) => session.phase_number === phase.phase_number && session.status === 'completed',
  )
  const averageRestDiscipline = sessions.length
    ? sessions.reduce(
        (sum, session) => sum + (Number(session.rest_discipline_score) || 0),
        0,
      ) / sessions.length
    : 0
  const data = {
    id: makeId('demo-phase-snapshot'),
    program_id: program.id,
    phase_number: phase.phase_number,
    name: phase.name,
    completed_at: new Date().toISOString(),
    sessions_completed: sessions.length,
    sessions_total: (program?.days_per_week ?? phase.days?.length ?? 1) * (phase.num_weeks ?? 1),
    total_volume: roundToSingleDecimal(
      sessions.reduce((sum, session) => sum + (Number(session.total_volume) || 0), 0),
    ),
    prs_hit: sessions.reduce((sum, session) => sum + (Number(session.prs_hit) || 0), 0),
    avg_rest_discipline: roundToSingleDecimal(averageRestDiscipline),
    streak_at_completion: streakAtCompletion,
    xp_earned: xpEarned,
    lift_comparisons: buildLiftComparisons(sessions),
    phase_baselines: {
      color: getPhaseColor(phase.phase_number),
    },
  }

  const nextState = {
    ...state,
    phaseSnapshots: [
      ...(state.phaseSnapshots ?? []).filter(
        (snapshot) => snapshot.phase_number !== phase.phase_number,
      ),
      data,
    ],
  }

  writeStoredState(nextState)

  return {
    success: true,
    data,
  }
}

export function getDemoPhaseSnapshot(phaseNumber) {
  const state = readStoredState()

  if (!state || !isDemoModeEnabled()) {
    return null
  }

  return (state.phaseSnapshots ?? []).find((snapshot) => snapshot.phase_number === phaseNumber) ?? null
}

export { DEMO_CHANGE_EVENT }
