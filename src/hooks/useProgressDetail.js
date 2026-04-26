import { useEffect, useState } from 'react'
import { getDemoHistorySessions, isDemoModeEnabled } from '../lib/demoState.js'
import { projectLift } from '../lib/progressEngine.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const DETAIL_LOOKBACK_MONTHS = 6
const DETAIL_SESSION_LIMIT = 60
const DETAIL_SET_LIMIT = 3000
const DETAIL_CACHE_LIMIT = 12
const detailCache = new Map()

function getCachedDetail(cacheKey) {
  if (!cacheKey || !detailCache.has(cacheKey)) {
    return null
  }

  const cachedValue = detailCache.get(cacheKey)
  detailCache.delete(cacheKey)
  detailCache.set(cacheKey, cachedValue)
  return cachedValue
}

function setCachedDetail(cacheKey, detail) {
  if (!cacheKey) {
    return
  }

  if (detailCache.has(cacheKey)) {
    detailCache.delete(cacheKey)
  }

  detailCache.set(cacheKey, detail)

  while (detailCache.size > DETAIL_CACHE_LIMIT) {
    const oldestKey = detailCache.keys().next().value
    detailCache.delete(oldestKey)
  }
}

function getSessionProgramId(session) {
  const programWeeks = Array.isArray(session?.program_days?.program_weeks)
    ? session.program_days.program_weeks[0]
    : session?.program_days?.program_weeks
  const programPhases = Array.isArray(programWeeks?.program_phases)
    ? programWeeks.program_phases[0]
    : programWeeks?.program_phases

  return programPhases?.program_id ?? null
}

function getDetailLookbackDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - DETAIL_LOOKBACK_MONTHS)
  return date.toISOString().slice(0, 10)
}

function buildEmptyDetail() {
  return {
    sessions: [],
    projection: null,
    exerciseName: null,
  }
}

function buildProjection(sessions = []) {
  const history = sessions
    .map((session) => {
      const bestSet = (session?.logged_sets ?? []).reduce((best, set) => {
        const weight = Number(set?.weight) || 0
        const reps = Number(set?.reps) || 0
        const e1RM = weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0

        if (!best || e1RM > best.e1RM) {
          return {
            date: session?.date,
            weight,
            reps,
            e1RM,
          }
        }

        return best
      }, null)

      return bestSet
    })
    .filter(Boolean)

  return history.length ? projectLift(history) : null
}

function normalizeSessions(rows = []) {
  const grouped = rows.reduce((map, row) => {
    const session = Array.isArray(row?.workout_sessions)
      ? row.workout_sessions[0]
      : row?.workout_sessions

    if (!session?.id) {
      return map
    }

    const currentSession = map.get(session.id) ?? {
      id: session.id,
      date: session.date,
      source: session.source ?? 'program',
      phase_number: session.phase_number ?? null,
      week_number: session.week_number ?? null,
      program_day_id: session.program_day_id ?? null,
      logged_sets: [],
    }

    currentSession.logged_sets.push({
      id: row.id,
      session_id: row.session_id,
      exercise_id: row.exercise_id,
      set_number: row.set_number,
      set_type: row.set_type,
      weight: row.weight,
      reps: row.reps,
      rest_prescribed_seconds: row.rest_prescribed_seconds,
      rest_taken_seconds: row.rest_taken_seconds,
      exercises: row.exercises ?? null,
    })

    map.set(session.id, currentSession)
    return map
  }, new Map())

  return Array.from(grouped.values())
    .sort((left, right) => `${right?.date ?? ''}`.localeCompare(`${left?.date ?? ''}`))
    .slice(0, DETAIL_SESSION_LIMIT)
    .map((session) => ({
      ...session,
      logged_sets: [...session.logged_sets].sort(
        (left, right) => (left?.set_number ?? 0) - (right?.set_number ?? 0),
      ),
    }))
    .sort((left, right) => `${left?.date ?? ''}`.localeCompare(`${right?.date ?? ''}`))
}

async function fetchSupabaseDetail(programId, selectedExerciseId, sourceFilter) {
  const lookbackDate = getDetailLookbackDate()
  const { data, error } = await supabase
    .from('logged_sets')
    .select(
      `
        id,
        session_id,
        exercise_id,
        set_number,
        set_type,
        weight,
        reps,
        rest_prescribed_seconds,
        rest_taken_seconds,
        exercises (
          id,
          name,
          equipment,
          muscle_group,
          primary_muscle_group
        ),
        workout_sessions!inner (
          id,
          date,
          source,
          status,
          phase_number,
          week_number,
          program_day_id,
          program_days (
            program_weeks (
              program_phases (
                program_id
              )
            )
          )
        )
      `,
    )
    .eq('exercise_id', selectedExerciseId)
    .eq('workout_sessions.status', 'completed')
    .gte('workout_sessions.date', lookbackDate)
    .order('logged_at', { ascending: false })
    .limit(DETAIL_SET_LIMIT)

  if (error) {
    throw new Error(error.message)
  }

  const filteredRows = (data ?? []).filter((row) => {
    const session = Array.isArray(row?.workout_sessions) ? row.workout_sessions[0] : row?.workout_sessions

    if (!session) {
      return false
    }

    if (sourceFilter !== 'all' && (session?.source ?? 'program') !== sourceFilter) {
      return false
    }

    if ((session?.source ?? 'program') === 'custom') {
      return true
    }

    return getSessionProgramId(session) === programId
  })

  const sessions = normalizeSessions(filteredRows)

  return {
    sessions,
    projection: buildProjection(sessions),
    exerciseName:
      filteredRows[0]?.exercises?.name ??
      sessions[0]?.logged_sets?.[0]?.exercises?.name ??
      null,
  }
}

function fetchLocalDetail(programId, selectedExerciseId, sourceFilter) {
  const sessions = getDemoHistorySessions(programId)
    .filter((session) => sourceFilter === 'all' || (session?.source ?? 'program') === sourceFilter)
    .map((session) => ({
      ...session,
      logged_sets: (session?.logged_sets ?? []).filter(
        (set) => set?.exercise_id === selectedExerciseId,
      ),
    }))
    .filter((session) => session.logged_sets.length)
    .slice(-DETAIL_SESSION_LIMIT)

  return {
    sessions,
    projection: buildProjection(sessions),
    exerciseName:
      sessions[0]?.logged_sets?.[0]?.exercise_name ??
      sessions[0]?.logged_sets?.[0]?.exercises?.name ??
      null,
  }
}

export function useProgressDetail(programId, selectedExerciseId, sourceFilter = 'all') {
  const [state, setState] = useState({
    ...buildEmptyDetail(),
    loading: false,
    error: null,
  })

  useEffect(() => {
    let isCancelled = false

    async function loadDetail() {
      if (!programId || !selectedExerciseId) {
        if (!isCancelled) {
          setState({
            ...buildEmptyDetail(),
            loading: false,
            error: null,
          })
        }

        return
      }

      const cacheKey = `${programId}:${selectedExerciseId}:${sourceFilter}`
      const cachedValue = getCachedDetail(cacheKey)

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
        const detail = isConfigured
          ? await fetchSupabaseDetail(programId, selectedExerciseId, sourceFilter)
          : isDemoModeEnabled()
            ? fetchLocalDetail(programId, selectedExerciseId, sourceFilter)
            : buildEmptyDetail()

        setCachedDetail(cacheKey, detail)

        if (!isCancelled) {
          setState({
            ...detail,
            loading: false,
            error: null,
          })
        }
      } catch (loadError) {
        if (!isCancelled) {
          setState({
            ...buildEmptyDetail(),
            loading: false,
            error:
              loadError instanceof Error
                ? loadError.message
                : 'Unable to load focus-lift detail.',
          })
        }
      }
    }

    void loadDetail()

    return () => {
      isCancelled = true
    }
  }, [programId, selectedExerciseId, sourceFilter])

  return state
}

export default useProgressDetail
