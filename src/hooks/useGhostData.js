import { useEffect, useState } from 'react'
import {
  DEMO_CHANGE_EVENT,
  getDemoGhostData,
  isDemoModeEnabled,
} from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const ghostDataCache = new Map()

function formatNumber(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return ''
  }

  return Number.isInteger(numericValue) ? `${numericValue}` : `${numericValue}`
}

export function formatGhostData(sets) {
  if (!Array.isArray(sets) || !sets.length) {
    return ''
  }

  const firstWeight = sets[0]?.weight
  const hasUniformWeight =
    firstWeight !== null &&
    firstWeight !== undefined &&
    sets.every((set) => set.weight === firstWeight)

  if (hasUniformWeight) {
    return `${formatNumber(firstWeight)}kg × ${sets
      .map((set) => formatNumber(set.reps))
      .join(', ')}`
  }

  return sets
    .map((set) => `${formatNumber(set.weight)}kg × ${formatNumber(set.reps)}`)
    .join(', ')
}

export function useGhostData(exerciseId, programDayId) {
  const cacheKey = exerciseId ? `${exerciseId}` : null
  const [ghostData, setGhostData] = useState(() =>
    cacheKey ? ghostDataCache.get(cacheKey) ?? null : null,
  )

  useEffect(() => {
    let isCancelled = false

    async function loadGhostData() {
      if (isDemoModeEnabled()) {
        if (!isCancelled) {
          setGhostData(getDemoGhostData(exerciseId, programDayId))
        }

        return
      }

      if (!isConfigured || !exerciseId) {
        if (!isCancelled) {
          setGhostData(null)
        }

        return
      }

      try {
        const { data: latestLoggedSet, error: latestLoggedSetError } = await supabase
          .from('logged_sets')
          .select(
            `
              session_id,
              workout_sessions!inner (
                status
              )
            `,
          )
          .eq('exercise_id', exerciseId)
          .eq('workout_sessions.status', 'completed')
          .order('logged_at', { ascending: false })
          .limit(1)

        if (latestLoggedSetError) {
          throw new Error(latestLoggedSetError.message)
        }

        const latestSessionId = latestLoggedSet?.[0]?.session_id ?? null

        if (!latestSessionId) {
          if (!isCancelled) {
            if (cacheKey) {
              ghostDataCache.set(cacheKey, null)
            }
            setGhostData(null)
          }

          return
        }

        const { data: sessionSets, error: sessionSetsError } = await supabase
          .from('logged_sets')
          .select(
            `
              session_id,
              set_number,
              weight,
              reps
            `,
          )
          .eq('exercise_id', exerciseId)
          .eq('session_id', latestSessionId)
          .order('set_number', { ascending: true })

        if (sessionSetsError) {
          throw new Error(sessionSetsError.message)
        }

        const nextGhostData = sessionSets?.length
          ? sessionSets.map((set) => ({
              set_number: set.set_number,
              weight: set.weight,
              reps: set.reps,
            }))
          : null

        if (!isCancelled) {
          if (cacheKey) {
            ghostDataCache.set(cacheKey, nextGhostData)
          }
          setGhostData(nextGhostData)
        }
      } catch {
        if (!isCancelled) {
          setGhostData(null)
        }
      }
    }

    void loadGhostData()

    return () => {
      isCancelled = true
    }
  }, [cacheKey, exerciseId, programDayId])

  useEffect(() => {
    function handleDemoChange() {
      if (cacheKey) {
        ghostDataCache.delete(cacheKey)
      }
      setGhostData(getDemoGhostData(exerciseId, programDayId))
    }

    window.addEventListener(DEMO_CHANGE_EVENT, handleDemoChange)

    return () => {
      window.removeEventListener(DEMO_CHANGE_EVENT, handleDemoChange)
    }
  }, [cacheKey, exerciseId, programDayId])

  return ghostData
}

export default useGhostData
