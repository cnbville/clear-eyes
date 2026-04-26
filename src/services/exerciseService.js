import { EXERCISE_SEED } from '../data/exerciseSeed.js'
import {
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  createLocalId,
  normalizeExerciseRecord,
  buildImageId,
  slugify,
} from '../lib/customWorkouts.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const LOCAL_CUSTOM_EXERCISES_KEY = 'iron-custom-exercises-v1'
const IMPORT_SCHEMA_VERSION = 1
const MOVEMENT_TYPE_OPTIONS = ['compound', 'isolation']
const FORCE_OPTIONS = ['push', 'pull', 'static']
const MECHANIC_OPTIONS = ['free_weight', 'cable', 'bodyweight']

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readStoredCustomExercises() {
  if (!canUseStorage()) {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_CUSTOM_EXERCISES_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    return Array.isArray(parsed) ? parsed.map((row) => normalizeExerciseRecord(row)) : []
  } catch {
    return []
  }
}

function writeStoredCustomExercises(exercises) {
  if (!canUseStorage()) {
    return exercises
  }

  window.localStorage.setItem(LOCAL_CUSTOM_EXERCISES_KEY, JSON.stringify(exercises))
  return exercises
}

function getLocalExerciseCatalog() {
  const seededExercises = EXERCISE_SEED.map((row) =>
    normalizeExerciseRecord({
      ...row,
      id: `seed-${row.slug}`,
      is_custom: false,
    }),
  )
  const customExercises = readStoredCustomExercises()

  return [...seededExercises, ...customExercises]
}

function applyFilters(exercises, filters = {}) {
  const searchValue = `${filters.search ?? ''}`.trim().toLowerCase()

  return exercises.filter((exercise) => {
    if (filters.muscle_group && filters.muscle_group !== 'all') {
      if (exercise.muscle_group !== filters.muscle_group) {
        return false
      }
    }

    if (filters.equipment && filters.equipment !== 'all') {
      if (exercise.equipment !== filters.equipment) {
        return false
      }
    }

    if (searchValue) {
      return `${exercise.name ?? ''}`.toLowerCase().includes(searchValue)
    }

    return true
  })
}

function normalizeText(value) {
  return `${value ?? ''}`.trim()
}

function normalizeOptionalText(value) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeEnumValue(value, allowedValues = []) {
  const normalizedValue = normalizeText(value).toLowerCase()

  if (!normalizedValue) {
    return null
  }

  return allowedValues.includes(normalizedValue) ? normalizedValue : null
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry).toLowerCase())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => normalizeText(entry).toLowerCase())
      .filter(Boolean)
  }

  return []
}

function createNameKey(value) {
  return slugify(value)
}

function buildCreatePayload(data = {}) {
  const name = `${data.name ?? ''}`.trim()
  const movementType = data.movement_type ?? 'isolation'
  const equipment = data.equipment
  const slug = normalizeText(data.slug) || slugify(name)

  return normalizeExerciseRecord({
    id: data.id ?? createLocalId('exercise'),
    name,
    slug,
    muscle_group: data.muscle_group,
    secondary_muscles: data.secondary_muscles ?? [],
    equipment,
    movement_type: movementType,
    force: data.force ?? (movementType === 'compound' ? 'push' : 'pull'),
    mechanic:
      data.mechanic ??
      (equipment === 'cable'
        ? 'cable'
        : equipment === 'bodyweight'
          ? 'bodyweight'
          : 'free_weight'),
    instructions: data.instructions ?? 'Move under control and own the end range.',
    video_url: normalizeOptionalText(data.video_url ?? data.videoUrl),
    image_id: data.image_id ?? buildImageId(name),
    is_custom: true,
  })
}

function buildInsertRow(payload) {
  return {
    name: payload.name,
    slug: payload.slug,
    muscle_group: payload.muscle_group,
    secondary_muscles: payload.secondary_muscles,
    equipment: payload.equipment,
    movement_type: payload.movement_type,
    force: payload.force,
    mechanic: payload.mechanic,
    instructions: payload.instructions,
    image_id: payload.image_id,
    video_url: payload.video_url ?? null,
    is_custom: true,
    primary_muscle_group: payload.muscle_group,
    secondary_muscle_groups: payload.secondary_muscles,
  }
}

async function getExerciseCatalogSnapshot() {
  if (!isConfigured) {
    return getLocalExerciseCatalog()
  }

  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return getLocalExerciseCatalog()
  }

  return (data ?? []).map((row) => normalizeExerciseRecord(row))
}

function validateImportedExercise(row, index) {
  const rowNumber = index + 1

  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return {
      valid: false,
      error: 'Each exercise entry must be a JSON object.',
      rowNumber,
      name: null,
    }
  }

  const name = normalizeText(row.name)
  const muscleGroup = normalizeEnumValue(
    row.muscle_group ?? row.primary_muscle_group ?? row.muscle,
    MUSCLE_GROUP_OPTIONS,
  )
  const equipment = normalizeEnumValue(row.equipment, EQUIPMENT_OPTIONS)
  const movementType =
    normalizeEnumValue(row.movement_type, MOVEMENT_TYPE_OPTIONS) ?? 'isolation'
  const force = normalizeEnumValue(row.force, FORCE_OPTIONS)
  const mechanic = normalizeEnumValue(row.mechanic, MECHANIC_OPTIONS)
  const secondaryMuscles = normalizeStringArray(
    row.secondary_muscles ?? row.secondary_muscle_groups ?? row.secondaryMuscles,
  )
  const invalidSecondaryMuscles = secondaryMuscles.filter(
    (value) => !MUSCLE_GROUP_OPTIONS.includes(value),
  )

  if (!name) {
    return {
      valid: false,
      error: 'Name is required.',
      rowNumber,
      name: null,
    }
  }

  if (!muscleGroup) {
    return {
      valid: false,
      error: `Muscle group must be one of: ${MUSCLE_GROUP_OPTIONS.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  if (!equipment) {
    return {
      valid: false,
      error: `Equipment must be one of: ${EQUIPMENT_OPTIONS.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  if (row.movement_type && !normalizeEnumValue(row.movement_type, MOVEMENT_TYPE_OPTIONS)) {
    return {
      valid: false,
      error: `Movement type must be one of: ${MOVEMENT_TYPE_OPTIONS.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  if (row.force && !force) {
    return {
      valid: false,
      error: `Force must be one of: ${FORCE_OPTIONS.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  if (row.mechanic && !mechanic) {
    return {
      valid: false,
      error: `Mechanic must be one of: ${MECHANIC_OPTIONS.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  if (invalidSecondaryMuscles.length) {
    return {
      valid: false,
      error: `Secondary muscles contain unsupported values: ${invalidSecondaryMuscles.join(', ')}.`,
      rowNumber,
      name,
    }
  }

  const payload = buildCreatePayload({
    ...row,
    name,
    slug: normalizeText(row.slug) || undefined,
    muscle_group: muscleGroup,
    secondary_muscles: Array.from(new Set(secondaryMuscles)),
    equipment,
    movement_type: movementType,
    force,
    mechanic,
    instructions:
      normalizeOptionalText(row.instructions ?? row.coaching_cue) ??
      'Move under control and own the end range.',
    video_url: normalizeOptionalText(row.video_url ?? row.videoUrl),
    image_id: normalizeOptionalText(row.image_id) ?? undefined,
  })

  return {
    valid: true,
    rowNumber,
    payload,
    slugKey: payload.slug,
    nameKey: createNameKey(payload.name),
  }
}

export function parseExerciseImportJson(rawText = '') {
  const input = normalizeText(rawText)

  if (!input) {
    return {
      success: false,
      error: 'Import file is empty.',
    }
  }

  let parsedValue

  try {
    parsedValue = JSON.parse(input)
  } catch {
    return {
      success: false,
      error: 'File is not valid JSON.',
    }
  }

  const payloadRoot = Array.isArray(parsedValue) ? { exercises: parsedValue } : parsedValue

  if (!payloadRoot || typeof payloadRoot !== 'object' || Array.isArray(payloadRoot)) {
    return {
      success: false,
      error: 'Import JSON must be an object with an exercises array.',
    }
  }

  if (
    payloadRoot.version !== undefined &&
    Number(payloadRoot.version) !== IMPORT_SCHEMA_VERSION
  ) {
    return {
      success: false,
      error: `Unsupported exercise import version. Expected ${IMPORT_SCHEMA_VERSION}.`,
    }
  }

  if (!Array.isArray(payloadRoot.exercises)) {
    return {
      success: false,
      error: 'Import JSON must include an exercises array.',
    }
  }

  const validRows = []
  const invalidRows = []
  const seenSlugs = new Set()
  const seenNameKeys = new Set()
  const duplicateRows = []

  payloadRoot.exercises.forEach((row, index) => {
    const validation = validateImportedExercise(row, index)

    if (!validation.valid) {
      invalidRows.push(validation)
      return
    }

    if (seenSlugs.has(validation.slugKey) || seenNameKeys.has(validation.nameKey)) {
      duplicateRows.push({
        rowNumber: validation.rowNumber,
        name: validation.payload.name,
        slug: validation.payload.slug,
        reason: 'Duplicate entry inside import file.',
      })
      return
    }

    seenSlugs.add(validation.slugKey)
    seenNameKeys.add(validation.nameKey)
    validRows.push(validation)
  })

  return {
    success: true,
    data: {
      version: Number(payloadRoot.version) || IMPORT_SCHEMA_VERSION,
      source: normalizeOptionalText(payloadRoot.source),
      totalRows: payloadRoot.exercises.length,
      validRows,
      invalidRows,
      duplicateRows,
    },
  }
}

export async function importExercisesFromJsonText(rawText = '') {
  const parsedImport = parseExerciseImportJson(rawText)

  if (!parsedImport.success) {
    return parsedImport
  }

  const catalog = await getExerciseCatalogSnapshot()
  const existingBySlug = new Map()
  const existingByName = new Map()

  catalog.forEach((exercise) => {
    const slugKey = normalizeText(exercise.slug)
    const nameKey = createNameKey(exercise.name)

    if (slugKey) {
      existingBySlug.set(slugKey, exercise)
    }

    if (nameKey) {
      existingByName.set(nameKey, exercise)
    }
  })

  const duplicateRows = [...parsedImport.data.duplicateRows]
  const rowsToInsert = []

  parsedImport.data.validRows.forEach((entry) => {
    const existingExercise =
      existingBySlug.get(entry.slugKey) ?? existingByName.get(entry.nameKey) ?? null

    if (existingExercise) {
      duplicateRows.push({
        rowNumber: entry.rowNumber,
        name: entry.payload.name,
        slug: entry.payload.slug,
        reason: `Already exists as "${existingExercise.name}".`,
      })
      return
    }

    rowsToInsert.push(entry.payload)
  })

  if (!rowsToInsert.length) {
    return {
      success: true,
      data: {
        source: parsedImport.data.source,
        version: parsedImport.data.version,
        totalRows: parsedImport.data.totalRows,
        insertedCount: 0,
        duplicateCount: duplicateRows.length,
        invalidCount: parsedImport.data.invalidRows.length,
        inserted: [],
        duplicateRows,
        invalidRows: parsedImport.data.invalidRows,
      },
    }
  }

  if (!isConfigured) {
    const existingExercises = readStoredCustomExercises()
    const storedExercises = [...existingExercises, ...rowsToInsert]
    writeStoredCustomExercises(storedExercises)

    return {
      success: true,
      data: {
        source: parsedImport.data.source,
        version: parsedImport.data.version,
        totalRows: parsedImport.data.totalRows,
        insertedCount: rowsToInsert.length,
        duplicateCount: duplicateRows.length,
        invalidCount: parsedImport.data.invalidRows.length,
        inserted: rowsToInsert,
        duplicateRows,
        invalidRows: parsedImport.data.invalidRows,
      },
    }
  }

  const { data, error } = await supabase
    .from('exercises')
    .insert(rowsToInsert.map((row) => buildInsertRow(row)))
    .select('*')

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  return {
    success: true,
    data: {
      source: parsedImport.data.source,
      version: parsedImport.data.version,
      totalRows: parsedImport.data.totalRows,
      insertedCount: data?.length ?? 0,
      duplicateCount: duplicateRows.length,
      invalidCount: parsedImport.data.invalidRows.length,
      inserted: (data ?? []).map((row) => normalizeExerciseRecord(row)),
      duplicateRows,
      invalidRows: parsedImport.data.invalidRows,
    },
  }
}

export async function seedExercises() {
  if (!isConfigured) {
    return {
      success: true,
      data: getLocalExerciseCatalog(),
    }
  }

  const { data, error } = await supabase
    .from('exercises')
    .upsert(EXERCISE_SEED, { onConflict: 'slug' })
    .select('*')

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  return {
    success: true,
    data: (data ?? []).map((row) => normalizeExerciseRecord(row)),
  }
}

export async function getExercises(filters = {}) {
  if (!isConfigured) {
    return applyFilters(getLocalExerciseCatalog(), filters)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  let query = supabase.from('exercises').select('*').order('name', { ascending: true })

  if (filters.muscle_group && filters.muscle_group !== 'all') {
    query = query.or(
      `muscle_group.eq.${filters.muscle_group},primary_muscle_group.eq.${filters.muscle_group}`,
    )
  }

  if (filters.equipment && filters.equipment !== 'all') {
    query = query.eq('equipment', filters.equipment)
  }

  if (filters.search) {
    query = query.ilike('name', `%${filters.search.trim()}%`)
  }

  const { data, error } = await query

  if (error) {
    return applyFilters(getLocalExerciseCatalog(), filters)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  return (data ?? []).map((row) => normalizeExerciseRecord(row))
}

export async function getExerciseById(id) {
  if (!id) {
    return null
  }

  if (!isConfigured) {
    return getLocalExerciseCatalog().find((exercise) => exercise.id === id) ?? null
  }

  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return getLocalExerciseCatalog().find((exercise) => exercise.id === id) ?? null
  }

  return data ? normalizeExerciseRecord(data) : null
}

export async function createCustomExercise(data = {}) {
  const payload = buildCreatePayload(data)

  if (!payload.name || !payload.muscle_group || !payload.equipment) {
    return {
      success: false,
      error: 'Name, muscle group, and equipment are required.',
    }
  }

  if (!isConfigured) {
    const existingExercises = getLocalExerciseCatalog()
    const storedCustomExercises = readStoredCustomExercises()

    if (
      existingExercises.some(
        (exercise) => exercise.slug === payload.slug || exercise.name.toLowerCase() === payload.name.toLowerCase(),
      )
    ) {
      return {
        success: false,
        error: 'An exercise with that name already exists.',
      }
    }

    writeStoredCustomExercises([...storedCustomExercises, payload])

    return {
      success: true,
      data: payload,
    }
  }

  const { data: insertedExercise, error } = await supabase
    .from('exercises')
    .insert({
      name: payload.name,
      slug: payload.slug,
      muscle_group: payload.muscle_group,
      secondary_muscles: payload.secondary_muscles,
      equipment: payload.equipment,
      movement_type: payload.movement_type,
      force: payload.force,
      mechanic: payload.mechanic,
      instructions: payload.instructions,
      image_id: payload.image_id,
      is_custom: true,
      primary_muscle_group: payload.muscle_group,
      secondary_muscle_groups: payload.secondary_muscles,
    })
    .select('*')
    .single()

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  return {
    success: true,
    data: normalizeExerciseRecord(insertedExercise),
  }
}

export default {
  parseExerciseImportJson,
  importExercisesFromJsonText,
  seedExercises,
  getExercises,
  getExerciseById,
  createCustomExercise,
}
