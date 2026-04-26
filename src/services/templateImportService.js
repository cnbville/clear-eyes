import {
  EQUIPMENT_OPTIONS,
  FOCUS_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  TECHNIQUE_OPTIONS,
  formatLabel,
  getFocusColor,
  normalizeExerciseRecord,
  slugify,
} from '../lib/customWorkouts.js'

const IMPORT_VERSION = 1
const DEFAULT_EXERCISE_SETS = 3
const DEFAULT_EXERCISE_REPS = '10-12'
const DEFAULT_EXERCISE_REST = 60
const DEFAULT_EXERCISE_TEMPO = 'CTRL'
const DEFAULT_EXERCISE_RPE = '8'
const TECHNIQUE_VALUES = new Set(TECHNIQUE_OPTIONS.map((option) => option.value))

export const QUICK_TEMPLATE_IMPORT_EXAMPLE = `{
  "version": 1,
  "workouts": [
    {
      "name": "Arm Day Destroyer",
      "focus": "arms",
      "notes": "Optional template note",
      "exercises": [
        {
          "exercise": "Incline Dumbbell Curl",
          "sets": 3,
          "reps": "10-12",
          "rest_seconds": 60,
          "tempo": "CTRL",
          "rpe": "8",
          "notes": "Keep the upper arm still.",
          "muscle_group": "biceps",
          "equipment": "dumbbell"
        },
        {
          "exercise": "Rope Pushdown",
          "sets": 3,
          "reps": "12-15",
          "rest_seconds": 60,
          "rpe": "8",
          "technique": "superset",
          "superset_group": "A",
          "muscle_group": "triceps",
          "equipment": "cable"
        }
      ]
    }
  ]
}`

function normalizeText(value) {
  return `${value ?? ''}`.trim()
}

function normalizeOptionalText(value) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizePositiveInteger(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function normalizeTechnique(value) {
  const normalizedValue = normalizeText(value).toLowerCase()
  return TECHNIQUE_VALUES.has(normalizedValue) ? normalizedValue : ''
}

function normalizeFocus(value) {
  const normalizedValue = normalizeText(value).toLowerCase()
  return FOCUS_OPTIONS.includes(normalizedValue) ? normalizedValue : 'custom'
}

function normalizeMuscleGroup(value) {
  const normalizedValue = normalizeText(value).toLowerCase()
  return MUSCLE_GROUP_OPTIONS.includes(normalizedValue) ? normalizedValue : ''
}

function normalizeEquipment(value) {
  const normalizedValue = normalizeText(value).toLowerCase()
  return EQUIPMENT_OPTIONS.includes(normalizedValue) ? normalizedValue : ''
}

function buildCatalogLookups(exercises = []) {
  const byId = new Map()
  const bySlug = new Map()
  const byName = new Map()

  exercises.forEach((row) => {
    const exercise = normalizeExerciseRecord(row)

    if (exercise?.id) {
      byId.set(exercise.id, exercise)
    }

    if (exercise?.slug) {
      bySlug.set(exercise.slug, exercise)
    }

    if (exercise?.name) {
      byName.set(exercise.name.toLowerCase(), exercise)
    }
  })

  return {
    byId,
    bySlug,
    byName,
  }
}

function scoreExerciseMatch(exercise, normalizedQuery, queryTokens) {
  const name = `${exercise?.name ?? ''}`.toLowerCase()
  const slug = `${exercise?.slug ?? slugify(exercise?.name)}`.toLowerCase()

  if (!name) {
    return -1
  }

  if (name === normalizedQuery || slug === normalizedQuery) {
    return 100
  }

  if (name.startsWith(normalizedQuery) || slug.startsWith(normalizedQuery)) {
    return 75
  }

  if (name.includes(normalizedQuery) || slug.includes(normalizedQuery)) {
    return 60
  }

  const overlap = queryTokens.filter((token) => name.includes(token) || slug.includes(token)).length

  if (!overlap) {
    return -1
  }

  return overlap * 10
}

export function searchExerciseLibrary(exercises = [], query = '', limit = 8) {
  const normalizedQuery = normalizeText(query).toLowerCase()

  if (!normalizedQuery) {
    return []
  }

  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean)

  return exercises
    .map((exercise) => ({
      exercise,
      score: scoreExerciseMatch(exercise, normalizedQuery, queryTokens),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return `${left.exercise?.name ?? ''}`.localeCompare(`${right.exercise?.name ?? ''}`)
    })
    .slice(0, limit)
    .map((entry) => entry.exercise)
}

function findExactExerciseMatch(entry, catalogLookups) {
  const explicitId = normalizeOptionalText(entry.exercise_id)
  const explicitSlug = normalizeOptionalText(entry.exercise_slug ?? entry.slug)
  const exerciseName = normalizeText(entry.exercise)

  if (explicitId && catalogLookups.byId.has(explicitId)) {
    return catalogLookups.byId.get(explicitId)
  }

  if (explicitSlug && catalogLookups.bySlug.has(explicitSlug)) {
    return catalogLookups.bySlug.get(explicitSlug)
  }

  if (exerciseName && catalogLookups.byName.has(exerciseName.toLowerCase())) {
    return catalogLookups.byName.get(exerciseName.toLowerCase())
  }

  const normalizedSlug = slugify(exerciseName)

  if (normalizedSlug && catalogLookups.bySlug.has(normalizedSlug)) {
    return catalogLookups.bySlug.get(normalizedSlug)
  }

  return null
}

function normalizeExerciseImportRow(row = {}, workoutName = 'Workout', index = 0) {
  const exerciseName = normalizeText(row.exercise ?? row.exercise_name ?? row.name)

  if (!exerciseName) {
    throw new Error(`Exercise ${index + 1} in ${workoutName} is missing "exercise".`)
  }

  const technique = normalizeTechnique(row.technique)

  return {
    id: `import-exercise-${slugify(workoutName)}-${index + 1}`,
    exercise: exerciseName,
    exercise_id: normalizeOptionalText(row.exercise_id),
    exercise_slug: normalizeOptionalText(row.exercise_slug ?? row.slug),
    sets: normalizePositiveInteger(row.sets ?? row.working_sets, DEFAULT_EXERCISE_SETS),
    reps_target: normalizeOptionalText(row.reps ?? row.reps_target ?? row.rep_notation) ?? DEFAULT_EXERCISE_REPS,
    tempo: normalizeOptionalText(row.tempo) ?? DEFAULT_EXERCISE_TEMPO,
    rest_seconds: normalizePositiveInteger(row.rest_seconds, DEFAULT_EXERCISE_REST),
    rpe: normalizeOptionalText(row.rpe ?? row.rpe_notation) ?? DEFAULT_EXERCISE_RPE,
    technique,
    superset_group:
      technique === 'superset'
        ? normalizeOptionalText(row.superset_group ?? row.group_id)
        : null,
    notes: normalizeOptionalText(row.notes),
    muscle_group: normalizeMuscleGroup(row.muscle_group ?? row.primary_muscle_group ?? row.muscle),
    equipment: normalizeEquipment(row.equipment),
  }
}

function normalizeWorkoutImportRow(row = {}, index = 0) {
  const name = normalizeText(row.name)

  if (!name) {
    throw new Error(`Workout ${index + 1} is missing "name".`)
  }

  if (!Array.isArray(row.exercises) || !row.exercises.length) {
    throw new Error(`${name} must include a non-empty "exercises" array.`)
  }

  const focus = normalizeFocus(row.focus)

  return {
    id: `import-workout-${index + 1}`,
    name,
    focus,
    focus_color: getFocusColor(focus),
    notes: normalizeOptionalText(row.notes),
    exercises: row.exercises.map((exercise, exerciseIndex) =>
      normalizeExerciseImportRow(exercise, name, exerciseIndex),
    ),
  }
}

export function parseQuickTemplateImport(rawText = '') {
  const input = normalizeText(rawText)

  if (!input) {
    return {
      success: false,
      error: 'Paste workout JSON to import.',
    }
  }

  let parsedValue

  try {
    parsedValue = JSON.parse(input)
  } catch {
    return {
      success: false,
      error: 'Import must be valid JSON.',
    }
  }

  const payloadRoot = Array.isArray(parsedValue) ? { workouts: parsedValue } : parsedValue

  if (!payloadRoot || typeof payloadRoot !== 'object' || Array.isArray(payloadRoot)) {
    return {
      success: false,
      error: 'Import JSON must be an object with a workouts array.',
    }
  }

  if (
    payloadRoot.version !== undefined &&
    Number(payloadRoot.version) !== IMPORT_VERSION
  ) {
    return {
      success: false,
      error: `Unsupported import version. Expected ${IMPORT_VERSION}.`,
    }
  }

  if (!Array.isArray(payloadRoot.workouts) || !payloadRoot.workouts.length) {
    return {
      success: false,
      error: 'Import JSON must include a non-empty workouts array.',
    }
  }

  try {
    const workouts = payloadRoot.workouts.map((row, index) => normalizeWorkoutImportRow(row, index))

    return {
      success: true,
      data: {
        version: Number(payloadRoot.version) || IMPORT_VERSION,
        workouts,
      },
    }
  } catch (parseError) {
    return {
      success: false,
      error: parseError instanceof Error ? parseError.message : 'Unable to parse workout import.',
    }
  }
}

export function analyzeQuickTemplateImport(rawText = '', exerciseCatalog = []) {
  const parsedImport = parseQuickTemplateImport(rawText)

  if (!parsedImport.success) {
    return parsedImport
  }

  const normalizedCatalog = exerciseCatalog.map((exercise) => normalizeExerciseRecord(exercise))
  const catalogLookups = buildCatalogLookups(normalizedCatalog)
  const unresolvedByKey = new Map()
  let recognizedExerciseCount = 0

  const workouts = parsedImport.data.workouts.map((workout, workoutIndex) => ({
    ...workout,
    exercises: workout.exercises.map((exercise, exerciseIndex) => {
      const exactMatch = findExactExerciseMatch(exercise, catalogLookups)

      if (exactMatch) {
        recognizedExerciseCount += 1
        return {
          ...exercise,
          resolvedExercise: exactMatch,
          unresolvedKey: null,
        }
      }

      const unresolvedKey = slugify(exercise.exercise)
      const current = unresolvedByKey.get(unresolvedKey) ?? {
        key: unresolvedKey,
        name: exercise.exercise,
        muscle_group: exercise.muscle_group,
        equipment: exercise.equipment,
        occurrences: [],
        suggestions: searchExerciseLibrary(normalizedCatalog, exercise.exercise, 6),
      }

      current.occurrences.push({
        workoutIndex,
        workoutName: workout.name,
        exerciseIndex,
      })
      unresolvedByKey.set(unresolvedKey, current)

      return {
        ...exercise,
        resolvedExercise: null,
        unresolvedKey,
      }
    }),
  }))

  return {
    success: true,
    data: {
      version: parsedImport.data.version,
      workouts,
      unresolvedExercises: Array.from(unresolvedByKey.values()),
      recognizedExerciseCount,
      totalExerciseCount: workouts.reduce((sum, workout) => sum + workout.exercises.length, 0),
    },
  }
}

export function buildTemplatePayloadFromImportWorkout(workout, resolutionLookup = new Map()) {
  return {
    name: workout.name,
    focus: workout.focus ?? 'custom',
    focus_color: getFocusColor(workout.focus ?? 'custom'),
    notes: workout.notes ?? null,
    exercises: (workout.exercises ?? []).map((exercise, index) => {
      const resolvedExercise =
        exercise.resolvedExercise ??
        (exercise.unresolvedKey ? resolutionLookup.get(exercise.unresolvedKey) ?? null : null)

      if (!resolvedExercise?.id) {
        throw new Error(`Exercise "${exercise.exercise}" still needs a library match.`)
      }

      const normalizedExercise = normalizeExerciseRecord(resolvedExercise)

      return {
        ...normalizedExercise,
        exercise_id: normalizedExercise.id,
        sets: exercise.sets,
        working_sets: exercise.sets,
        reps_target: exercise.reps_target,
        rep_notation: exercise.reps_target,
        tempo: exercise.tempo ?? DEFAULT_EXERCISE_TEMPO,
        rest_seconds: exercise.rest_seconds ?? DEFAULT_EXERCISE_REST,
        rpe: exercise.rpe ?? DEFAULT_EXERCISE_RPE,
        technique: exercise.technique ?? '',
        superset_group: exercise.superset_group ?? null,
        notes: exercise.notes ?? null,
        order_index: index,
      }
    }),
  }
}

export function getQuickTemplateImportHelp() {
  return {
    version: IMPORT_VERSION,
    focusOptions: FOCUS_OPTIONS.map((value) => ({
      value,
      label: formatLabel(value),
    })),
    muscleGroups: MUSCLE_GROUP_OPTIONS.map((value) => ({
      value,
      label: formatLabel(value),
    })),
    equipmentOptions: EQUIPMENT_OPTIONS.map((value) => ({
      value,
      label: formatLabel(value),
    })),
  }
}

export default {
  QUICK_TEMPLATE_IMPORT_EXAMPLE,
  analyzeQuickTemplateImport,
  buildTemplatePayloadFromImportWorkout,
  getQuickTemplateImportHelp,
  parseQuickTemplateImport,
  searchExerciseLibrary,
}
