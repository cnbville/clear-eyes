import { useCallback } from 'react'
import {
  calculateRestDiscipline,
  detectPR,
  detectSessionVolumePr,
  estimateOneRepMax,
  getPrDisplayLabel,
  normalizePrType,
} from '../lib/calculations.js'
import {
  buildProgressSnapshotFromSlots,
  isPhaseResolved,
} from '../lib/adaptiveProgram.js'
import { buildImageId, slugify } from '../lib/customWorkouts.js'
import {
  createDemoPhaseSnapshot,
  completeDemoSession,
  isDemoModeEnabled,
  logDemoSet,
  startDemoSession,
} from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function getNumericValue(value, fallback = 0) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function getOptionalNumericValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function getSessionDurationMinutes(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return null
  }

  return Math.max(
    Math.round((Number(completedAt) - Number(startedAt)) / 1000 / 60),
    0,
  )
}

function getProgramDayCount(program, phase) {
  return (
    getNumericValue(program?.days_per_week, 0) ||
    getNumericValue(phase?.days?.length, 0) ||
    1
  )
}

function buildLiftComparisons(sessions = []) {
  const exerciseSessions = new Map()

  sessions.forEach((session) => {
    ;(session.logged_sets ?? [])
      .filter((set) => set?.set_type === 'working' && getNumericValue(set?.weight, 0) > 0)
      .forEach((set) => {
        const key = set.exercise_id

        if (!key) {
          return
        }

        const sessionEntries = exerciseSessions.get(key) ?? []
        sessionEntries.push({
          sessionDate: session.date,
          exercise_name: set?.exercises?.name ?? 'Exercise',
          weight: getNumericValue(set?.weight, 0),
        })
        exerciseSessions.set(key, sessionEntries)
      })
  })

  return Array.from(exerciseSessions.values())
    .map((entries) => {
      const entriesByDate = entries.reduce((map, entry) => {
        const currentEntries = map.get(entry.sessionDate) ?? []
        currentEntries.push(entry)
        map.set(entry.sessionDate, currentEntries)
        return map
      }, new Map())
      const dates = Array.from(entriesByDate.keys()).sort((left, right) => left.localeCompare(right))

      if (dates.length < 2) {
        return null
      }

      const firstEntries = entriesByDate.get(dates[0]) ?? []
      const lastEntries = entriesByDate.get(dates[dates.length - 1]) ?? []
      const startWeight =
        firstEntries.reduce((sum, entry) => sum + entry.weight, 0) / Math.max(firstEntries.length, 1)
      const endWeight =
        lastEntries.reduce((sum, entry) => sum + entry.weight, 0) / Math.max(lastEntries.length, 1)
      const pctChange = startWeight > 0 ? ((endWeight - startWeight) / startWeight) * 100 : 0

      return {
        exercise_name: firstEntries[0]?.exercise_name ?? lastEntries[0]?.exercise_name ?? 'Exercise',
        start_weight: Math.round(startWeight * 10) / 10,
        end_weight: Math.round(endWeight * 10) / 10,
        pct_change: Math.round(pctChange * 10) / 10,
      }
    })
    .filter(Boolean)
}

async function ensureExerciseId(setData) {
  if (setData?.exercise_id) {
    return {
      success: true,
      exerciseId: setData.exercise_id,
    }
  }

  if (!setData?.exercise_name) {
    return {
      success: false,
      error: 'Missing exercise reference.',
    }
  }

  const { data: existingExercise, error: existingExerciseError } = await supabase
    .from('exercises')
    .select('id')
    .eq('name', setData.exercise_name)
    .limit(1)
    .maybeSingle()

  if (existingExerciseError) {
    return {
      success: false,
      error: existingExerciseError.message,
    }
  }

  if (existingExercise?.id) {
    return {
      success: true,
      exerciseId: existingExercise.id,
    }
  }

  const { data: createdExercise, error: createdExerciseError } = await supabase
    .from('exercises')
    .insert({
      name: setData.exercise_name,
      slug: slugify(setData.exercise_name),
      muscle_group: setData.muscle ?? 'full_body',
      primary_muscle_group: setData.muscle ?? 'other',
      secondary_muscles: [],
      equipment: setData.equipment ?? 'other',
      movement_type: setData.movement_type ?? 'isolation',
      force: setData.force ?? null,
      mechanic: setData.mechanic ?? null,
      instructions: setData.notes ?? null,
      image_id: buildImageId(setData.exercise_name),
      is_custom: true,
    })
    .select('id')
    .single()

  if (createdExerciseError) {
    return {
      success: false,
      error: createdExerciseError.message,
    }
  }

  return {
    success: true,
    exerciseId: createdExercise.id,
  }
}

function buildPersonalRecordRow(prType, setData, sessionId, exerciseId) {
  const weight = getNumericValue(setData?.weight, 0)
  const reps = getNumericValue(setData?.reps, 0)

  let value = weight

  if (prType === 'estimated_1rm') {
    value = estimateOneRepMax(weight, reps)
  } else if (normalizePrType(prType) === 'session_volume') {
    value = getNumericValue(setData?.session_volume, 0)
  }

  return {
    exercise_id: exerciseId,
    pr_type: prType,
    value,
    weight: weight || null,
    reps: reps || null,
    session_id: sessionId,
    achieved_at: getTodayDateString(),
  }
}

function buildPrCard({
  exerciseId,
  prType,
  exerciseName,
  weight = null,
  reps = null,
  value = null,
}) {
  const normalizedType = normalizePrType(prType)
  const resolvedWeight = getOptionalNumericValue(weight)
  const resolvedReps = getOptionalNumericValue(reps)
  let displayValue = `${value ?? '--'}`

  if (normalizedType === 'session_volume') {
    displayValue = `${Math.round(getNumericValue(value, 0))}kg`
  } else if (resolvedWeight !== null && resolvedReps !== null) {
    displayValue = `${resolvedWeight}kg × ${resolvedReps}`
  } else if (resolvedWeight !== null) {
    displayValue = `${resolvedWeight}kg`
  } else if (resolvedReps !== null) {
    displayValue = `${resolvedReps} reps`
  }

  return {
    id: `${exerciseId}-${normalizedType}`,
    title: getPrDisplayLabel(normalizedType),
    subtitle: exerciseName ?? 'Exercise',
    value: displayValue,
    pr_type: normalizedType,
  }
}

export function useWorkoutSession({ program, progress, updateProgress }) {
  const startSession = useCallback(async (programDayIdOrOptions, phaseNumber, weekNumber, startedAt) => {
    const options =
      typeof programDayIdOrOptions === 'object' && programDayIdOrOptions !== null
        ? programDayIdOrOptions
        : {
            programDayId: programDayIdOrOptions,
            phaseNumber,
            weekNumber,
            startedAt,
            source: 'program',
            templateId: null,
          }

    if ((options.source ?? 'program') === 'program' && isDemoModeEnabled() && program?.id) {
      return startDemoSession(
        program,
        options.programDayId ?? null,
        options.phaseNumber ?? 1,
        options.weekNumber ?? 1,
        options.startedAt,
      )
    }

    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured.',
      }
    }

    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({
        program_day_id: options.programDayId ?? null,
        phase_number: options.phaseNumber ?? null,
        week_number: options.weekNumber ?? null,
        date: getTodayDateString(),
        started_at: options.startedAt
          ? new Date(Number(options.startedAt)).toISOString()
          : new Date().toISOString(),
        status: 'in_progress',
        source: options.source ?? 'program',
        template_id: options.templateId ?? null,
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
      session: data,
      sessionId: data.id,
    }
  }, [program])

  const logSet = useCallback(async (sessionId, setData) => {
    if ((setData?.source ?? 'program') === 'program' && isDemoModeEnabled() && program?.id) {
      return logDemoSet(program, sessionId, setData)
    }

    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured.',
      }
    }

    const exerciseResult = await ensureExerciseId(setData)

    if (!exerciseResult.success) {
      return exerciseResult
    }

    const exerciseId = exerciseResult.exerciseId
    const weight = getNumericValue(setData?.weight, 0)
    const reps = getNumericValue(setData?.reps, 0)

    const { data: existingRecords, error: existingRecordsError } = await supabase
      .from('personal_records')
      .select('pr_type, value')
      .eq('exercise_id', exerciseId)

    if (existingRecordsError) {
      return {
        success: false,
        error: existingRecordsError.message,
      }
    }

    const detectedPrTypes =
      setData?.set_type === 'working' && weight > 0 && reps > 0
        ? detectPR(weight, reps, existingRecords ?? [])
        : []

    const { data, error } = await supabase
      .from('logged_sets')
      .insert({
        session_id: sessionId,
        prescribed_exercise_id: setData?.prescribed_exercise_id ?? null,
        exercise_id: exerciseId,
        set_number: setData?.set_number,
        set_type: setData?.set_type ?? 'working',
        weight: weight || null,
        reps: reps || null,
        duration_seconds: getOptionalNumericValue(setData?.duration_seconds),
        rpe_actual: getOptionalNumericValue(setData?.rpe_actual),
        rest_prescribed_seconds: getOptionalNumericValue(setData?.rest_prescribed_seconds),
        rest_baseline_seconds: getOptionalNumericValue(setData?.rest_baseline_seconds),
        rest_taken_seconds: getOptionalNumericValue(setData?.rest_taken_seconds),
        rest_target_source: setData?.rest_target_source ?? null,
        is_adhoc: Boolean(setData?.is_adhoc || !setData?.prescribed_exercise_id),
        is_pr: detectedPrTypes.length > 0,
        pr_type: detectedPrTypes.join(', ') || null,
        logged_at: setData?.logged_at ?? new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    if (detectedPrTypes.length) {
      const personalRecordRows = detectedPrTypes.map((prType) =>
        buildPersonalRecordRow(prType, setData, sessionId, exerciseId),
      )

      const { error: personalRecordsError } = await supabase
        .from('personal_records')
        .upsert(personalRecordRows, {
          onConflict: 'exercise_id,pr_type',
        })

      if (personalRecordsError) {
        return {
          success: false,
          error: personalRecordsError.message,
        }
      }
    }

    return {
      success: true,
      data,
      exerciseId,
      prs: detectedPrTypes.map((prType) =>
        buildPrCard({
          exerciseId,
          prType,
          exerciseName: setData?.exercise_name ?? 'Exercise',
          weight,
          reps,
        }),
      ),
    }
  }, [program])

  const completeSession = useCallback(async (sessionId, totals = {}) => {
    if ((totals?.source ?? 'program') === 'program' && isDemoModeEnabled() && program?.id) {
      return completeDemoSession(program, sessionId, totals)
    }

    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured.',
      }
    }

    const workingSetsByExercise = (totals.loggedSets ?? [])
      .filter((set) => (set?.set_type ?? 'working') === 'working')
      .reduce((map, set) => {
        if (!set?.exercise_id) {
          return map
        }

        const currentSets = map.get(set.exercise_id) ?? {
          exerciseName: set?.exercise_name ?? 'Exercise',
          totalVolume: 0,
        }

        currentSets.totalVolume +=
          getNumericValue(set?.weight, 0) * getNumericValue(set?.reps, 0)
        map.set(set.exercise_id, currentSets)
        return map
      }, new Map())

    let sessionVolumePrCards = []

    if (workingSetsByExercise.size) {
      const exerciseIds = Array.from(workingSetsByExercise.keys())
      const { data: sessionVolumeRecords, error: sessionVolumeRecordsError } = await supabase
        .from('personal_records')
        .select('exercise_id, pr_type, value')
        .in('exercise_id', exerciseIds)
        .eq('pr_type', 'session_volume')

      if (sessionVolumeRecordsError) {
        return {
          success: false,
          error: sessionVolumeRecordsError.message,
        }
      }

      const nextSessionVolumeRows = exerciseIds
        .map((exerciseId) => {
          const entry = workingSetsByExercise.get(exerciseId)
          const currentRecord = (sessionVolumeRecords ?? []).find(
            (record) => record.exercise_id === exerciseId,
          )

          if (!detectSessionVolumePr(entry?.totalVolume, currentRecord ? [currentRecord] : [])) {
            return null
          }

          sessionVolumePrCards.push(
            buildPrCard({
              exerciseId,
              prType: 'session_volume',
              exerciseName: entry?.exerciseName,
              value: entry?.totalVolume,
            }),
          )

          return buildPersonalRecordRow(
            'session_volume',
            {
              session_volume: entry?.totalVolume,
            },
            sessionId,
            exerciseId,
          )
        })
        .filter(Boolean)

      if (nextSessionVolumeRows.length) {
        const { error: sessionVolumeUpsertError } = await supabase
          .from('personal_records')
          .upsert(nextSessionVolumeRows, {
            onConflict: 'exercise_id,pr_type',
          })

        if (sessionVolumeUpsertError) {
          return {
            success: false,
            error: sessionVolumeUpsertError.message,
          }
        }
      }
    }

    const payload = {
      completed_at: totals.completedAt
        ? new Date(Number(totals.completedAt)).toISOString()
        : new Date().toISOString(),
      status: 'completed',
      total_volume: getNumericValue(totals.totalVolume, null),
      total_sets: getNumericValue(totals.totalSets, null),
      duration_minutes:
        totals.durationMinutes ??
        getSessionDurationMinutes(totals.startedAt, totals.completedAt),
      rest_discipline_score:
        totals.restDisciplineScore ?? calculateRestDiscipline(totals.loggedSets ?? []),
      prs_hit: getNumericValue(totals.prsHit, 0) + sessionVolumePrCards.length,
      notes: totals.notes ?? null,
      mood_rating: totals.moodRating ?? null,
      session_rpe: totals.sessionRpe ?? null,
    }

    const { data, error } = await supabase
      .from('workout_sessions')
      .update(payload)
      .eq('id', sessionId)
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
      prs: sessionVolumePrCards,
      prsHit: payload.prs_hit,
    }
  }, [program])

  const advanceProgress = useCallback(async (totals = {}) => {
    if (!program || !updateProgress) {
      return {
        success: false,
        error: 'Program progress is unavailable.',
      }
    }

    if (!Array.isArray(totals?.slotStates) || !totals.slotStates.length) {
      return {
        success: false,
        error: 'Adaptive slot state is unavailable.',
      }
    }

    const countSession = !totals?.wasSkipped
    const progressSnapshot = buildProgressSnapshotFromSlots({
      program,
      progress,
      slotStates: totals.slotStates,
      totals,
      countSession,
    })
    const result = await updateProgress(progressSnapshot.nextFields)
    const completedPhase =
      program?.phases?.find((phase) => phase.phase_number === totals?.phaseNumber) ?? null
    const phaseCompleted =
      Boolean(totals?.phaseNumber) &&
      isPhaseResolved(totals.slotStates, totals.phaseNumber)
    const nextPhase = phaseCompleted
      ? program?.phases?.find((phase) => phase.phase_number === totals.phaseNumber + 1) ?? null
      : null

    return {
      ...result,
      xpEarned: countSession
        ? getNumericValue(totals.xpEarned, 0) ||
          100 + getNumericValue(totals.prsHit, 0) * 25
        : 0,
      phaseCompleted,
      completedPhase: phaseCompleted ? completedPhase : null,
      nextPhase,
      nextFields: progressSnapshot.nextFields,
      weeklyQuota: progressSnapshot.weeklyQuota,
    }
  }, [program, progress, updateProgress])

  const createPhaseSnapshot = useCallback(async ({ phase, xpEarned = 0, streakAtCompletion = 0 }) => {
    if (isDemoModeEnabled() && program?.id) {
      return createDemoPhaseSnapshot(program, phase, xpEarned, streakAtCompletion)
    }

    if (!isConfigured) {
      return {
        success: false,
        error: 'Supabase is not configured.',
      }
    }

    if (!program?.id || !phase?.phase_number) {
      return {
        success: false,
        error: 'Phase context is unavailable.',
      }
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('workout_sessions')
      .select(
        `
          id,
          date,
          total_volume,
          prs_hit,
          rest_discipline_score,
          status,
          phase_number,
          program_days!inner (
            program_weeks!inner (
              program_phases!inner (
                program_id
              )
            )
          ),
          logged_sets (
            exercise_id,
            weight,
            set_type,
            exercises (
              name
            )
          )
        `,
      )
      .eq('phase_number', phase.phase_number)
      .eq('status', 'completed')
      .eq('program_days.program_weeks.program_phases.program_id', program.id)
      .order('date', { ascending: true })

    if (sessionsError) {
      return {
        success: false,
        error: sessionsError.message,
      }
    }

    const completedSessions = sessions ?? []
    const totalVolume = completedSessions.reduce(
      (sum, session) => sum + getNumericValue(session?.total_volume, 0),
      0,
    )
    const totalPrs = completedSessions.reduce(
      (sum, session) => sum + getNumericValue(session?.prs_hit, 0),
      0,
    )
    const scoredSessions = completedSessions.filter((session) =>
      Number.isFinite(Number(session?.rest_discipline_score)),
    )
    const averageRestDiscipline = scoredSessions.length
      ? scoredSessions.reduce(
          (sum, session) => sum + getNumericValue(session?.rest_discipline_score, 0),
          0,
        ) / scoredSessions.length
      : 0
    const liftComparisons = buildLiftComparisons(completedSessions)

    const { data, error } = await supabase
      .from('phase_snapshots')
      .upsert(
        {
          program_id: program.id,
          phase_number: phase.phase_number,
          completed_at: new Date().toISOString(),
          sessions_completed: completedSessions.length,
          sessions_total: getProgramDayCount(program, phase) * getNumericValue(phase?.num_weeks, 1),
          total_volume: totalVolume,
          prs_hit: totalPrs,
          avg_rest_discipline: Math.round(averageRestDiscipline * 10) / 10,
          streak_at_completion: streakAtCompletion,
          xp_earned: xpEarned,
          lift_comparisons: liftComparisons,
          phase_baselines: {
            first_week_recorded: completedSessions[0]?.date ?? null,
            last_week_recorded: completedSessions[completedSessions.length - 1]?.date ?? null,
          },
        },
        {
          onConflict: 'program_id,phase_number',
        },
      )
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
      data: {
        ...data,
        name: phase.name,
      },
    }
  }, [program])

  return {
    startSession,
    logSet,
    completeSession,
    advanceProgress,
    createPhaseSnapshot,
  }
}

export default useWorkoutSession
