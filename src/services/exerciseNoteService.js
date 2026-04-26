import { isConfigured, supabase } from '../lib/supabase.js'

export async function getExerciseNotesByIds(exerciseIds = []) {
  if (!isConfigured || !exerciseIds.length) {
    return new Map()
  }

  const uniqueIds = Array.from(new Set(exerciseIds.filter(Boolean)))

  if (!uniqueIds.length) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('exercise_notes')
    .select('*')
    .in('exercise_id', uniqueIds)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).reduce((map, row) => {
    if (row?.exercise_id) {
      map.set(row.exercise_id, row)
    }

    return map
  }, new Map())
}

export async function saveExerciseNote({
  exerciseId,
  note,
  lastSessionId = null,
}) {
  if (!isConfigured || !exerciseId) {
    return {
      success: false,
      error: 'Exercise note context is unavailable.',
    }
  }

  const trimmedNote = `${note ?? ''}`.trim()
  const payload = {
    exercise_id: exerciseId,
    note: trimmedNote || null,
    last_session_id: lastSessionId ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('exercise_notes')
    .upsert(payload, {
      onConflict: 'exercise_id',
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
    data,
  }
}
