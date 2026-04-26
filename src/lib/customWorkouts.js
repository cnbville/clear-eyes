export const FOCUS_COLOR_MAP = {
  arms: '#4da6ff',
  chest: '#ff6b6b',
  back: '#5cdb5c',
  shoulders: '#82b1ff',
  legs: '#ff8c42',
  push: '#ff6b6b',
  pull: '#5cdb5c',
  upper: '#4da6ff',
  lower: '#ff8c42',
  full_body: '#D4A843',
  custom: '#999999',
}

export const MUSCLE_COLOR_MAP = {
  biceps: '#4da6ff',
  triceps: '#82b1ff',
  chest: '#ff6b6b',
  back: '#5cdb5c',
  shoulders: '#8fb8ff',
  quads: '#ff8c42',
  hamstrings: '#ffb26b',
  glutes: '#f59f6f',
  calves: '#ffd166',
  forearms: '#9a7cff',
  core: '#56cfe1',
  full_body: '#D4A843',
}

export const FOCUS_OPTIONS = [
  'arms',
  'chest',
  'back',
  'shoulders',
  'legs',
  'push',
  'pull',
  'upper',
  'lower',
  'full_body',
  'custom',
]

export const MUSCLE_GROUP_OPTIONS = [
  'biceps',
  'triceps',
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'forearms',
  'core',
  'full_body',
]

export const EQUIPMENT_OPTIONS = [
  'dumbbell',
  'barbell',
  'ez_bar',
  'cable',
  'bodyweight',
  'bench',
]

export const TECHNIQUE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'dropset', label: 'Dropset' },
  { value: 'triple_drop', label: 'Triple Drop' },
  { value: 'mechanical_drop', label: 'Mechanical Drop' },
  { value: 'superset', label: 'Superset' },
  { value: 'twenty_ones', label: "21's" },
  { value: 'finisher', label: 'Finisher' },
]

export const SUPERSET_GROUP_OPTIONS = ['A', 'B', 'C', 'D']

export const SOURCE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'program', label: 'Program' },
  { value: 'custom', label: 'Custom' },
]

export function slugify(value) {
  return `${value ?? ''}`
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildImageId(name) {
  return `${name ?? ''}`
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function createLocalId(prefix = 'local') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function formatLabel(value) {
  return `${value ?? ''}`
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function getFocusColor(focus) {
  return FOCUS_COLOR_MAP[focus] ?? FOCUS_COLOR_MAP.custom
}

export function getMuscleColor(muscleGroup) {
  return MUSCLE_COLOR_MAP[muscleGroup] ?? '#999999'
}

export function getTechniqueLabel(value) {
  return TECHNIQUE_OPTIONS.find((option) => option.value === value)?.label ?? formatLabel(value)
}

export function normalizeExerciseRecord(row = {}) {
  const muscleGroup =
    row.muscle_group ??
    row.primary_muscle_group ??
    row.muscle ??
    row.primaryMuscleGroup ??
    'full_body'
  const secondaryMuscles =
    row.secondary_muscles ??
    row.secondary_muscle_groups ??
    row.secondaryMuscles ??
    []

  return {
    ...row,
    id: row.id ?? row.exercise_id ?? `seed-${row.slug ?? slugify(row.name)}`,
    slug: row.slug ?? slugify(row.name),
    muscle_group: muscleGroup,
    muscle: muscleGroup,
    secondary_muscles: Array.isArray(secondaryMuscles) ? secondaryMuscles : [],
    equipment: row.equipment ?? 'bodyweight',
    movement_type: row.movement_type ?? 'isolation',
    force: row.force ?? null,
    mechanic: row.mechanic ?? null,
    instructions: row.instructions ?? row.coaching_cue ?? null,
    image_id: row.image_id ?? buildImageId(row.name),
    is_custom: Boolean(row.is_custom),
  }
}

export function normalizeTemplateExerciseRecord(row = {}, index = 0) {
  const exercise = normalizeExerciseRecord(row.exercise ?? row.exercises ?? row)
  const workingSets = Number(row.sets ?? row.working_sets ?? 0)
  const technique = row.technique ?? null
  const supersetGroup = technique === 'superset' ? row.superset_group ?? row.group_id ?? null : null

  return {
    ...exercise,
    id: row.id ?? createLocalId('template-exercise'),
    template_exercise_id: row.id ?? null,
    template_id: row.template_id ?? null,
    exercise_id: row.exercise_id ?? exercise.id,
    order_index: Number(row.order_index ?? index),
    display_order: Number(row.order_index ?? index + 1),
    sets: workingSets,
    working_sets: workingSets,
    warmup_sets: Number(row.warmup_sets ?? 0),
    reps_target: row.reps_target ?? row.rep_notation ?? '8-12',
    rep_notation: row.reps_target ?? row.rep_notation ?? '8-12',
    tempo: row.tempo ?? null,
    rest_seconds:
      row.rest_seconds === null || row.rest_seconds === undefined || row.rest_seconds === ''
        ? null
        : Number(row.rest_seconds),
    rest_notation:
      row.rest_seconds === null || row.rest_seconds === undefined || row.rest_seconds === ''
        ? null
        : `${Number(row.rest_seconds)}s`,
    rpe: row.rpe ?? row.rpe_notation ?? null,
    rpe_notation: row.rpe ?? row.rpe_notation ?? null,
    technique,
    superset_group: supersetGroup,
    group_id: supersetGroup,
    group_type: supersetGroup ? 'superset' : null,
    notes: row.notes ?? null,
    coaching_cue: row.notes ?? exercise.instructions ?? null,
  }
}

export function calculateTemplateTotals(exercises = []) {
  const totalSets = exercises.reduce(
    (sum, exercise) => sum + Math.max(Number(exercise?.sets ?? exercise?.working_sets) || 0, 0),
    0,
  )
  const estimatedMinutes = exercises.reduce((sum, exercise) => {
    const sets = Math.max(Number(exercise?.sets ?? exercise?.working_sets) || 0, 0)
    const restSeconds = Math.max(Number(exercise?.rest_seconds) || 0, 0)
    return sum + sets * 0.75 + (sets * restSeconds) / 60
  }, 0)

  return {
    totalSets,
    estimatedDuration: Math.max(Math.round(estimatedMinutes), totalSets ? 10 : 0),
  }
}

export function prepareTemplateForSave(template = {}) {
  const exercises = (template.exercises ?? [])
    .map((exercise, index) => normalizeTemplateExerciseRecord(exercise, index))
    .map((exercise, index) => ({
      ...exercise,
      order_index: index,
    }))
  const totals = calculateTemplateTotals(exercises)

  return {
    ...template,
    focus: template.focus ?? 'custom',
    focus_color: template.focus_color ?? getFocusColor(template.focus ?? 'custom'),
    estimated_duration: totals.estimatedDuration,
    total_sets: totals.totalSets,
    exercises,
  }
}

export function groupExercisesByMuscle(exercises = []) {
  const groups = new Map()

  exercises.forEach((exercise, index) => {
    const normalizedExercise = normalizeTemplateExerciseRecord(exercise, index)
    const key = normalizedExercise.muscle_group ?? 'full_body'
    const currentGroup = groups.get(key) ?? {
      muscleGroup: key,
      label: formatLabel(key),
      color: getMuscleColor(key),
      totalSets: 0,
      exercises: [],
    }

    currentGroup.exercises.push(normalizedExercise)
    currentGroup.totalSets += Number(normalizedExercise.sets ?? normalizedExercise.working_sets) || 0
    groups.set(key, currentGroup)
  })

  return Array.from(groups.values())
}

export function formatRelativeTime(value) {
  if (!value) {
    return 'Never used'
  }

  const target = new Date(value)

  if (Number.isNaN(target.getTime())) {
    return 'Never used'
  }

  const minutes = Math.round((target.getTime() - Date.now()) / 60000)
  const absoluteMinutes = Math.abs(minutes)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (absoluteMinutes < 60) {
    return formatter.format(Math.round(minutes), 'minute')
  }

  if (absoluteMinutes < 1440) {
    return formatter.format(Math.round(minutes / 60), 'hour')
  }

  if (absoluteMinutes < 10080) {
    return formatter.format(Math.round(minutes / 1440), 'day')
  }

  if (absoluteMinutes < 43200) {
    return formatter.format(Math.round(minutes / 10080), 'week')
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(target)
}
