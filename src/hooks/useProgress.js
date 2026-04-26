import { useEffect, useState } from 'react'
import {
  DEMO_CHANGE_EVENT,
  isDemoModeEnabled,
  readDemoProgress,
  updateDemoProgress,
} from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

async function fetchActiveProgramId() {
  const { data, error } = await supabase
    .from('programs')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data?.id ?? null
}

export function useProgress(program = null) {
  const programId = program?.id ?? null
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isCancelled = false

    async function loadProgress() {
      if (isDemoModeEnabled() && programId) {
        if (!isCancelled) {
          setProgress(readDemoProgress(program))
          setLoading(false)
        }

        return
      }

      if (!isConfigured) {
        if (!isCancelled) {
          setProgress(null)
          setLoading(false)
        }

        return
      }

      setLoading(true)

      try {
        const activeProgramId = programId ?? (await fetchActiveProgramId())

        if (!activeProgramId) {
          if (!isCancelled) {
            setProgress(null)
            setLoading(false)
          }

          return
        }

        const { data, error } = await supabase
          .from('user_progress')
          .select('*')
          .eq('program_id', activeProgramId)
          .limit(1)
          .maybeSingle()

        if (error) {
          throw new Error(error.message)
        }

        if (!isCancelled) {
          setProgress(data ?? null)
          setLoading(false)
        }
      } catch {
        if (!isCancelled) {
          setProgress(null)
          setLoading(false)
        }
      }
    }

    void loadProgress()

    return () => {
      isCancelled = true
    }
  }, [program, programId, reloadToken])

  useEffect(() => {
    function handleProgramChanged() {
      setReloadToken((current) => current + 1)
    }

    window.addEventListener('iron:program-changed', handleProgramChanged)
    window.addEventListener(DEMO_CHANGE_EVENT, handleProgramChanged)

    return () => {
      window.removeEventListener('iron:program-changed', handleProgramChanged)
      window.removeEventListener(DEMO_CHANGE_EVENT, handleProgramChanged)
    }
  }, [])

  async function updateProgress(fields) {
    if (isDemoModeEnabled() && program?.id) {
      setLoading(true)
      const result = updateDemoProgress(program, fields)
      setProgress(result.data ?? null)
      setLoading(false)
      return result
    }

    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured.',
      }
    }

    setLoading(true)

    try {
      const activeProgramId = program?.id ?? (await fetchActiveProgramId())

      if (!activeProgramId) {
        setLoading(false)
        return {
          success: false,
          error: 'No active program found.',
        }
      }

      const currentProgress =
        progress?.id
          ? progress
          : await (async () => {
              const { data, error } = await supabase
                .from('user_progress')
                .select('*')
                .eq('program_id', activeProgramId)
                .limit(1)
                .maybeSingle()

              if (error) {
                throw new Error(error.message)
              }

              return data ?? null
            })()

      if (currentProgress?.id) {
        const { data, error } = await supabase
          .from('user_progress')
          .update({
            ...fields,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentProgress.id)
          .select('*')
          .single()

        if (error) {
          throw new Error(error.message)
        }

        setProgress(data)
        setLoading(false)

        return {
          success: true,
          data,
        }
      }

      const { data, error } = await supabase
        .from('user_progress')
        .insert({
          program_id: activeProgramId,
          ...fields,
        })
        .select('*')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setProgress(data)
      setLoading(false)

      return {
        success: true,
        data,
      }
    } catch (updateError) {
      setLoading(false)

      return {
        success: false,
        error:
          updateError instanceof Error
            ? updateError.message
            : 'Failed to update progress.',
      }
    }
  }

  return {
    progress,
    updateProgress,
    loading,
    refetch: () => setReloadToken((current) => current + 1),
  }
}

export default useProgress
