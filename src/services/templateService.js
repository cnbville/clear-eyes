import {
  createLocalId,
  getFocusColor,
  normalizeTemplateExerciseRecord,
  prepareTemplateForSave,
} from '../lib/customWorkouts.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const LOCAL_TEMPLATES_KEY = 'iron-custom-templates-v1'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readStoredTemplates() {
  if (!canUseStorage()) {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_TEMPLATES_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredTemplates(templates) {
  if (!canUseStorage()) {
    return templates
  }

  window.localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates))
  return templates
}

function sortTemplates(templates = []) {
  return [...templates].sort(
    (left, right) =>
      `${right.updated_at ?? right.created_at ?? ''}`.localeCompare(
        `${left.updated_at ?? left.created_at ?? ''}`,
      ),
  )
}

function normalizeTemplate(template = {}) {
  const exercises = (template.exercises ?? template.custom_template_exercises ?? [])
    .slice()
    .sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0))
    .map((exercise, index) => normalizeTemplateExerciseRecord(exercise, index))
  const prepared = prepareTemplateForSave({
    ...template,
    exercises,
  })

  return {
    ...template,
    ...prepared,
    id: template.id ?? createLocalId('template'),
    focus_color: template.focus_color ?? getFocusColor(template.focus),
    times_used: Number(template.times_used) || 0,
    last_used_at: template.last_used_at ?? null,
    is_archived: Boolean(template.is_archived),
    created_at: template.created_at ?? new Date().toISOString(),
    updated_at: template.updated_at ?? new Date().toISOString(),
  }
}

function serializeTemplateExercise(exercise, index) {
  const normalized = normalizeTemplateExerciseRecord(exercise, index)

  return {
    exercise_id: normalized.exercise_id,
    order_index: index,
    sets: Number(normalized.sets ?? normalized.working_sets) || 0,
    reps_target: normalized.reps_target ?? normalized.rep_notation ?? '8-12',
    tempo: normalized.tempo ?? null,
    rest_seconds:
      normalized.rest_seconds === null || normalized.rest_seconds === undefined
        ? null
        : Number(normalized.rest_seconds),
    rpe: normalized.rpe ?? null,
    technique: normalized.technique ?? null,
    superset_group: normalized.superset_group ?? null,
    notes: normalized.notes ?? normalized.coaching_cue ?? null,
  }
}

async function fetchTemplateExercises(templateId) {
  const { data, error } = await supabase
    .from('custom_template_exercises')
    .select('*, exercises (*)')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

async function fetchTemplateRow(templateId) {
  const { data, error } = await supabase
    .from('custom_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getTemplates(includeArchived = false) {
  if (!isConfigured) {
    return sortTemplates(readStoredTemplates().map((template) => normalizeTemplate(template))).filter(
      (template) => includeArchived || !template.is_archived,
    )
  }

  const { data, error } = await supabase
    .from('custom_templates')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .map((template) => normalizeTemplate(template))
    .filter((template) => includeArchived || !template.is_archived)
}

export async function getTemplateById(id) {
  if (!id) {
    return null
  }

  if (!isConfigured) {
    const template = readStoredTemplates().find((entry) => entry.id === id)
    return template ? normalizeTemplate(template) : null
  }

  const template = await fetchTemplateRow(id)

  if (!template) {
    return null
  }

  const exercises = await fetchTemplateExercises(id)

  return normalizeTemplate({
    ...template,
    exercises,
  })
}

export async function createTemplate(data = {}) {
  const prepared = normalizeTemplate({
    ...data,
    id: createLocalId('template'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    times_used: 0,
    last_used_at: null,
    is_archived: false,
  })

  if (!prepared.name?.trim()) {
    return {
      success: false,
      error: 'Template name is required.',
    }
  }

  if (!prepared.focus) {
    return {
      success: false,
      error: 'Template focus is required.',
    }
  }

  if (!prepared.exercises.length) {
    return {
      success: false,
      error: 'Add at least one exercise before saving.',
    }
  }

  if (!isConfigured) {
    const templates = readStoredTemplates()
    writeStoredTemplates(sortTemplates([...templates, prepared]))

    return {
      success: true,
      data: prepared,
    }
  }

  const { data: templateRow, error: templateError } = await supabase
    .from('custom_templates')
    .insert({
      name: prepared.name,
      focus: prepared.focus,
      focus_color: prepared.focus_color,
      estimated_duration: prepared.estimated_duration,
      total_sets: prepared.total_sets,
      notes: prepared.notes ?? null,
      times_used: 0,
      last_used_at: null,
      is_archived: false,
      created_at: prepared.created_at,
      updated_at: prepared.updated_at,
    })
    .select('*')
    .single()

  if (templateError) {
    return {
      success: false,
      error: templateError.message,
    }
  }

  const exerciseRows = prepared.exercises.map((exercise, index) => ({
    template_id: templateRow.id,
    ...serializeTemplateExercise(exercise, index),
  }))

  const { error: exerciseError } = await supabase
    .from('custom_template_exercises')
    .insert(exerciseRows)

  if (exerciseError) {
    return {
      success: false,
      error: exerciseError.message,
    }
  }

  return {
    success: true,
    data: await getTemplateById(templateRow.id),
  }
}

export async function updateTemplate(id, data = {}) {
  if (!id) {
    return {
      success: false,
      error: 'Template id is required.',
    }
  }

  const prepared = normalizeTemplate({
    ...data,
    id,
    updated_at: new Date().toISOString(),
  })

  if (!isConfigured) {
    const templates = readStoredTemplates()
    const nextTemplates = templates.map((template) =>
      template.id === id
        ? {
            ...template,
            ...prepared,
          }
        : template,
    )
    writeStoredTemplates(sortTemplates(nextTemplates))

    return {
      success: true,
      data: normalizeTemplate(nextTemplates.find((template) => template.id === id)),
    }
  }

  const { error: templateError } = await supabase
    .from('custom_templates')
    .update({
      name: prepared.name,
      focus: prepared.focus,
      focus_color: prepared.focus_color,
      estimated_duration: prepared.estimated_duration,
      total_sets: prepared.total_sets,
      notes: prepared.notes ?? null,
      updated_at: prepared.updated_at,
    })
    .eq('id', id)

  if (templateError) {
    return {
      success: false,
      error: templateError.message,
    }
  }

  const { error: deleteError } = await supabase
    .from('custom_template_exercises')
    .delete()
    .eq('template_id', id)

  if (deleteError) {
    return {
      success: false,
      error: deleteError.message,
    }
  }

  const exerciseRows = prepared.exercises.map((exercise, index) => ({
    template_id: id,
    ...serializeTemplateExercise(exercise, index),
  }))

  const { error: exerciseError } = await supabase
    .from('custom_template_exercises')
    .insert(exerciseRows)

  if (exerciseError) {
    return {
      success: false,
      error: exerciseError.message,
    }
  }

  return {
    success: true,
    data: await getTemplateById(id),
  }
}

export async function deleteTemplate(id) {
  if (!id) {
    return {
      success: false,
      error: 'Template id is required.',
    }
  }

  if (!isConfigured) {
    const templates = readStoredTemplates()
    const nextTemplates = templates.map((template) =>
      template.id === id
        ? {
            ...template,
            is_archived: true,
            updated_at: new Date().toISOString(),
          }
        : template,
    )
    writeStoredTemplates(nextTemplates)

    return {
      success: true,
    }
  }

  const { error } = await supabase
    .from('custom_templates')
    .update({
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  return {
    success: true,
  }
}

export async function duplicateTemplate(id) {
  const template = await getTemplateById(id)

  if (!template) {
    return {
      success: false,
      error: 'Template not found.',
    }
  }

  return createTemplate({
    ...template,
    name: `${template.name} (Copy)`,
    times_used: 0,
    last_used_at: null,
    is_archived: false,
  })
}

export async function recordTemplateUsage(id) {
  if (!id) {
    return {
      success: false,
      error: 'Template id is required.',
    }
  }

  const timestamp = new Date().toISOString()

  if (!isConfigured) {
    const templates = readStoredTemplates()
    const nextTemplates = templates.map((template) =>
      template.id === id
        ? {
            ...template,
            times_used: (Number(template.times_used) || 0) + 1,
            last_used_at: timestamp,
            updated_at: timestamp,
          }
        : template,
    )
    writeStoredTemplates(nextTemplates)

    return {
      success: true,
      data: normalizeTemplate(nextTemplates.find((template) => template.id === id)),
    }
  }

  const template = await fetchTemplateRow(id)

  if (!template) {
    return {
      success: false,
      error: 'Template not found.',
    }
  }

  const { data, error } = await supabase
    .from('custom_templates')
    .update({
      times_used: (Number(template.times_used) || 0) + 1,
      last_used_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', id)
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
    data: normalizeTemplate(data),
  }
}

export default {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  recordTemplateUsage,
}
