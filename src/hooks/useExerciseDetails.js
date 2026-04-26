import { useEffect, useState } from 'react'
import { getDemoLibraryData, isDemoModeEnabled } from '../lib/demoState.js'
import { getExerciseNotesByIds } from '../services/exerciseNoteService.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const exerciseDetailsCache = new Map()

function buildEmptyDetails() {
  return {
    history: [],
    personalRecords: [],
    note: '',
    timesPerformed: 0,
  }
}

function countPerformedSessions(history = []) {
  return new Set(
    history.map((set) => set?.workout_sessions?.id ?? set?.session_id ?? set?.id).filter(Boolean),
  ).size
}

function buildDemoExerciseDetails(exerciseId) {
  const demoData = getDemoLibraryData()
  const history = (demoData.loggedSets ?? []).filter((set) => set?.exercise_id === exerciseId)
  const personalRecords = (demoData.personalRecords ?? []).filter(
    (record) => record?.exercise_id === exerciseId,
  )

  return {
    history,
    personalRecords,
    note: '',
    timesPerformed: countPerformedSessions(history),
  }
}

async function fetchExerciseDetails(exerciseId) {
  if (!exerciseId) {
    return buildEmptyDetails()
  }

  if (exerciseDetailsCache.has(exerciseId)) {
    return exerciseDetailsCache.get(exerciseId)
  }

  if (isDemoModeEnabled()) {
    const demoDetails = buildDemoExerciseDetails(exerciseId)
    exerciseDetailsCache.set(exerciseId, demoDetails)
    return demoDetails
  }

  if (!isConfigured) {
    return buildEmptyDetails()
  }

  const [
    { data: historyRows, error: historyError },
    { data: personalRecordRows, error: personalRecordsError },
    noteRows,
  ] = await Promise.all([
    supabase
      .from('logged_sets')
      .select(
        `
          id,
          session_id,
          exercise_id,
          set_number,
          weight,
          reps,
          logged_at,
          workout_sessions!inner (
            id,
            date
          )
        `,
      )
      .eq('exercise_id', exerciseId)
      .order('logged_at', { ascending: false })
      .limit(12),
    supabase
      .from('personal_records')
      .select('*')
      .eq('exercise_id', exerciseId)
      .order('achieved_at', { ascending: false })
      .limit(12),
    getExerciseNotesByIds([exerciseId]),
  ])

  if (historyError) {
    throw new Error(historyError.message)
  }

  if (personalRecordsError) {
    throw new Error(personalRecordsError.message)
  }

  const details = {
    history: historyRows ?? [],
    personalRecords: personalRecordRows ?? [],
    note: noteRows.get(exerciseId)?.note ?? '',
    timesPerformed: countPerformedSessions(historyRows ?? []),
  }

  exerciseDetailsCache.set(exerciseId, details)
  return details
}

export function clearExerciseDetailsCache(exerciseId = null) {
  if (exerciseId) {
    exerciseDetailsCache.delete(exerciseId)
    return
  }

  exerciseDetailsCache.clear()
}

export function useExerciseDetails(exerciseId, enabled = false) {
  const [state, setState] = useState(() => ({
    ...buildEmptyDetails(),
    loading: Boolean(enabled && exerciseId && !exerciseDetailsCache.has(exerciseId)),
    error: null,
  }))

  useEffect(() => {
    let isCancelled = false

    async function loadDetails() {
      if (!enabled || !exerciseId) {
        if (!isCancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: null,
          }))
        }

        return
      }

      const cachedValue = exerciseDetailsCache.get(exerciseId)

      if (cachedValue) {
        if (!isCancelled) {
          setState({
            ...cachedValue,
            loading: false,
            error: null,
          })
        }

        return
      }

      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }))

      try {
        const details = await fetchExerciseDetails(exerciseId)

        if (!isCancelled) {
          setState({
            ...details,
            loading: false,
            error: null,
          })
        }
      } catch (loadError) {
        if (!isCancelled) {
          setState({
            ...buildEmptyDetails(),
            loading: false,
            error:
              loadError instanceof Error
                ? loadError.message
                : 'Unable to load exercise details.',
          })
        }
      }
    }

    void loadDetails()

    return () => {
      isCancelled = true
    }
  }, [enabled, exerciseId])

  return state
}

export default useExerciseDetails
