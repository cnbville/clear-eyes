import {
  buildExerciseLookup,
  buildProgramSlotKey,
  flattenProgramSlots,
  getReadinessBand,
} from '../lib/adaptiveProgram.js'
import { buildWorkoutSessionSnapshot, resolvePreferredWorkoutDraft } from '../lib/workoutRecovery.js'
import { isConfigured, supabase } from '../lib/supabase.js'
import {
  clearWorkoutDraft as clearSharedWorkoutDraft,
  markWorkoutSessionAbandoned as markSharedWorkoutSessionAbandoned,
  readLocalWorkoutDraft,
  saveWorkoutDraft as saveSharedWorkoutDraft,
  saveWorkoutSessionSnapshot,
} from './activeWorkoutService.js'

const CLIENT_ID_STORAGE_KEY = 'iron-client-id-v1'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function createLocalId(prefix = 'local') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isResolvedStatus(status) {
  return ['completed_on_time', 'completed_late', 'skipped'].includes(status)
}

function getSlotSeedStatus(slot, currentSequence) {
  if (slot.sequence_order < currentSequence) {
    return 'completed_on_time'
  }

  return 'pending'
}

function getCurrentSequence(program, progress) {
  const slots = flattenProgramSlots(program)

  if (!slots.length) {
    return 1
  }

  const currentPhase = toNumber(progress?.current_phase, 1)
  const currentWeek = toNumber(progress?.current_week, 1)
  const currentDay = toNumber(progress?.current_day, 1)
  const matchedSlot = slots.find(
    (slot) =>
      slot.phase_number === currentPhase &&
      slot.week_number === currentWeek &&
      slot.day_number === currentDay,
  )

  return matchedSlot?.sequence_order ?? 1
}

async function fetchAdaptiveRows(programId) {
  const activeSessionPromise = supabase
    .from('workout_sessions')
    .select(
      `
        id,
        source,
        status,
        started_at,
        program_day_id,
        phase_number,
        week_number,
        template_id,
        session_snapshot,
        program_days!inner (
          id,
          name,
          day_number,
          program_weeks!inner (
            program_phases!inner (
              program_id
            )
          )
        )
      `,
    )
    .eq('source', 'program')
    .eq('status', 'in_progress')
    .eq('program_days.program_weeks.program_phases.program_id', programId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const [
    { data: slotStates, error: slotStatesError },
    { data: substitutionPreferences, error: preferencesError },
    { data: loadGuidance, error: loadGuidanceError },
    { data: readinessLogs, error: readinessLogsError },
    { data: activeSession, error: activeSessionError },
  ] = await Promise.all([
    supabase
      .from('program_slot_states')
      .select(
        'id, program_id, program_day_id, phase_number, week_number, day_number, sequence_order, status, resolved_at, last_session_id',
      )
      .eq('program_id', programId)
      .order('sequence_order', { ascending: true }),
    supabase
      .from('program_exercise_preferences')
      .select(
        'program_id, phase_number, day_number, display_order, original_exercise_id, preferred_exercise_id',
      )
      .eq('program_id', programId),
    supabase
      .from('program_load_guidance')
      .select(
        'program_id, phase_number, day_number, display_order, exercise_id, guidance_action, target_weight, source_session_id',
      )
      .eq('program_id', programId),
    supabase
      .from('readiness_logs')
      .select(
        'id, session_id, program_day_id, phase_number, week_number, day_number, sleep_score, soreness_score, stress_score, energy_score, readiness_score, readiness_band, created_at',
      )
      .eq('program_id', programId)
      .order('created_at', { ascending: false }),
    activeSessionPromise,
  ])

  if (slotStatesError) {
    throw new Error(slotStatesError.message)
  }

  if (preferencesError) {
    throw new Error(preferencesError.message)
  }

  if (loadGuidanceError) {
    throw new Error(loadGuidanceError.message)
  }

  if (readinessLogsError) {
    throw new Error(readinessLogsError.message)
  }

  if (activeSessionError) {
    throw new Error(activeSessionError.message)
  }

  let activeDraft = null

  if (activeSession?.id) {
    const { data: draftRow, error: draftError } = await supabase
      .from('workout_session_drafts')
      .select('session_id, updated_at, updated_by_client_id, draft_data')
      .eq('session_id', activeSession.id)
      .maybeSingle()

    if (draftError) {
      throw new Error(draftError.message)
    }

    activeDraft = draftRow ?? null
  }

  return {
    slotStates: slotStates ?? [],
    substitutionPreferences: substitutionPreferences ?? [],
    loadGuidance: loadGuidance ?? [],
    readinessLogs: readinessLogs ?? [],
    activeSession: activeSession ?? null,
    activeDraft,
  }
}

async function fetchExercisesByIds(ids = []) {
  if (!ids.length) {
    return []
  }

  const { data, error } = await supabase
    .from('exercises')
    .select(
      'id, name, slug, muscle_group, primary_muscle_group, secondary_muscles, secondary_muscle_groups, equipment, movement_type, force, mechanic, instructions, image_id, is_custom, video_url',
    )
    .in('id', ids)

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

export function getAdaptiveClientId() {
  if (!canUseStorage()) {
    return 'server'
  }

  const existingValue = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY)

  if (existingValue) {
    return existingValue
  }

  const nextValue = createLocalId('client')
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextValue)
  return nextValue
}

export async function ensureProgramSlotStates(program, progress) {
  if (!isConfigured || !program?.id) {
    return []
  }

  const programSlots = flattenProgramSlots(program)

  if (!programSlots.length) {
    return []
  }

  const { data: existingSlotStates, error } = await supabase
    .from('program_slot_states')
    .select(
      'id, program_id, program_day_id, phase_number, week_number, day_number, sequence_order, status, resolved_at, last_session_id',
    )
    .eq('program_id', program.id)
    .order('sequence_order', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const currentSequence = getCurrentSequence(program, progress)
  const existingByKey = new Map(
    (existingSlotStates ?? []).map((slotState) => [
      buildProgramSlotKey({
        phaseNumber: slotState.phase_number,
        weekNumber: slotState.week_number,
        dayNumber: slotState.day_number,
      }),
      slotState,
    ]),
  )
  const rowsToInsert = programSlots
    .filter((slot) => !existingByKey.has(slot.slot_key))
    .map((slot) => ({
      program_id: program.id,
      program_day_id: slot.program_day_id,
      phase_number: slot.phase_number,
      week_number: slot.week_number,
      day_number: slot.day_number,
      sequence_order: slot.sequence_order,
      status:
        existingByKey.size === 0
          ? getSlotSeedStatus(slot, currentSequence)
          : 'pending',
      resolved_at:
        existingByKey.size === 0 && slot.sequence_order < currentSequence
          ? new Date().toISOString()
          : null,
    }))

  if (rowsToInsert.length) {
    const { error: insertError } = await supabase
      .from('program_slot_states')
      .insert(rowsToInsert)

    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const refreshed = await supabase
    .from('program_slot_states')
    .select(
      'id, program_id, program_day_id, phase_number, week_number, day_number, sequence_order, status, resolved_at, last_session_id',
    )
    .eq('program_id', program.id)
    .order('sequence_order', { ascending: true })

  if (refreshed.error) {
    throw new Error(refreshed.error.message)
  }

  return refreshed.data ?? []
}

export async function getProgramAdaptiveContext(program, progress) {
  if (!isConfigured || !program?.id) {
    return {
      slotStates: [],
      substitutionPreferences: [],
      loadGuidance: [],
      readinessLogs: [],
      activeSession: null,
      activeDraft: null,
      preferredExerciseLookup: new Map(),
    }
  }

  await ensureProgramSlotStates(program, progress)
  const adaptiveRows = await fetchAdaptiveRows(program.id)
  const preferredExerciseIds = Array.from(
    new Set(
      adaptiveRows.substitutionPreferences
        .map((entry) => entry.preferred_exercise_id)
        .filter(Boolean),
    ),
  )
  const preferredExercises = await fetchExercisesByIds(preferredExerciseIds)

  return {
    ...adaptiveRows,
    preferredExerciseLookup: buildExerciseLookup(preferredExercises),
  }
}

export async function prepareProgramSession({
  program,
  slot,
}) {
  if (!isConfigured || !program?.id || !slot?.program_day_id) {
    return {
      success: false,
      error: 'Program session context is unavailable.',
    }
  }

  const clientId = getAdaptiveClientId()
  const { data: existingSession, error: existingSessionError } = await supabase
    .from('workout_sessions')
    .select(
      'id, source, status, started_at, program_day_id, phase_number, week_number, session_snapshot',
    )
    .eq('source', 'program')
    .eq('status', 'in_progress')
    .eq('program_day_id', slot.program_day_id)
    .eq('phase_number', slot.phase_number)
    .eq('week_number', slot.week_number)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSessionError) {
    return {
      success: false,
      error: existingSessionError.message,
    }
  }

  let session = existingSession
  const sessionSnapshot = buildWorkoutSessionSnapshot({
    source: 'program',
    programId: program.id,
    day: slot.day ?? null,
    phaseInfo: {
      phase_number: slot.phase_number,
      week: slot.week_number,
      name: slot.phase_name ?? `Phase ${slot.phase_number}`,
      phaseColor: '#c9a227',
    },
    templateName: slot.day?.name ?? 'Workout',
    slotStateId: slot.id ?? null,
    slotStatus: slot.status ?? 'pending',
    slotDayNumber: slot.day_number ?? slot.day?.day_number ?? null,
  })

  if (!session) {
    const { data: createdSession, error: createdSessionError } = await supabase
      .from('workout_sessions')
      .insert({
        program_day_id: slot.program_day_id,
        phase_number: slot.phase_number,
        week_number: slot.week_number,
        date: new Date().toISOString().slice(0, 10),
        started_at: new Date().toISOString(),
        status: 'in_progress',
        source: 'program',
        session_snapshot: sessionSnapshot,
      })
      .select(
        'id, source, status, started_at, program_day_id, phase_number, week_number, session_snapshot',
      )
      .single()

    if (createdSessionError) {
      return {
        success: false,
        error: createdSessionError.message,
      }
    }

    session = createdSession
  }

  if (!session?.session_snapshot?.day?.exercises?.length) {
    const snapshotResult = await saveWorkoutSessionSnapshot(session.id, sessionSnapshot)

    if (!snapshotResult.success) {
      return snapshotResult
    }

    session = {
      ...session,
      session_snapshot: sessionSnapshot,
    }
  }

  const [
    { data: draftRow, error: draftError },
    { data: readinessRow, error: readinessError },
  ] = await Promise.all([
    supabase
      .from('workout_session_drafts')
      .select('session_id, updated_at, updated_by_client_id, draft_data')
      .eq('session_id', session.id)
      .maybeSingle(),
    supabase
      .from('readiness_logs')
      .select(
        'session_id, sleep_score, soreness_score, stress_score, energy_score, readiness_score, readiness_band',
      )
      .eq('session_id', session.id)
      .maybeSingle(),
  ])

  if (draftError) {
    return {
      success: false,
      error: draftError.message,
    }
  }

  if (readinessError) {
    return {
      success: false,
      error: readinessError.message,
    }
  }

  if (!draftRow) {
    const { error: seedDraftError } = await supabase
      .from('workout_session_drafts')
      .insert({
        session_id: session.id,
        source: 'program',
        program_id: program.id,
        program_day_id: slot.program_day_id,
        phase_number: slot.phase_number,
        week_number: slot.week_number,
        day_number: slot.day_number,
        updated_by_client_id: clientId,
        draft_data: {},
      })

    if (seedDraftError) {
      return {
        success: false,
        error: seedDraftError.message,
      }
    }
  }

  const resolvedDraft = resolvePreferredWorkoutDraft(
    draftRow,
    readLocalWorkoutDraft(session.id),
  )

  return {
    success: true,
    session,
    sessionId: session.id,
    draft: resolvedDraft.draftData ?? null,
    draftUpdatedAt: resolvedDraft.updatedAt ?? null,
    remoteDraftDetected:
      Boolean(draftRow?.updated_by_client_id) && draftRow.updated_by_client_id !== clientId,
    readiness: readinessRow ?? null,
  }
}

export async function saveProgramDraft({
  sessionId,
  programId,
  programDayId,
  phaseNumber,
  weekNumber,
  dayNumber,
  draftData,
}) {
  if (!isConfigured || !sessionId) {
    return {
      success: false,
      error: 'Draft session is unavailable.',
    }
  }

  return saveSharedWorkoutDraft({
    sessionId,
    source: 'program',
    programId,
    programDayId,
    phaseNumber,
    weekNumber,
    dayNumber,
    draftData,
  })
}

export async function clearProgramDraft(sessionId) {
  return clearSharedWorkoutDraft(sessionId)
}

export async function markProgramSessionAbandoned(sessionId) {
  return markSharedWorkoutSessionAbandoned(sessionId)
}

export async function saveReadinessForSession({
  programId,
  sessionId,
  slot,
  scores,
}) {
  if (!isConfigured || !programId || !sessionId || !slot) {
    return {
      success: false,
      error: 'Readiness context is unavailable.',
    }
  }

  const readiness = getReadinessBand(scores)
  const { data, error } = await supabase
    .from('readiness_logs')
    .upsert(
      {
        program_id: programId,
        session_id: sessionId,
        program_day_id: slot.program_day_id,
        phase_number: slot.phase_number,
        week_number: slot.week_number,
        day_number: slot.day_number,
        sleep_score: toNumber(scores?.sleep, null),
        soreness_score: toNumber(scores?.soreness, null),
        stress_score: toNumber(scores?.stress, null),
        energy_score: toNumber(scores?.energy, null),
        readiness_score: readiness.readiness_score,
        readiness_band: readiness.readiness_band,
      },
      {
        onConflict: 'session_id',
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
    data,
    readiness,
  }
}

export async function saveProgramExercisePreference({
  programId,
  phaseNumber,
  dayNumber,
  displayOrder,
  originalExerciseId,
  preferredExerciseId,
}) {
  if (!isConfigured || !programId || !phaseNumber || !dayNumber || !displayOrder) {
    return {
      success: false,
      error: 'Preference context is unavailable.',
    }
  }

  const { data, error } = await supabase
    .from('program_exercise_preferences')
    .upsert(
      {
        program_id: programId,
        phase_number: phaseNumber,
        day_number: dayNumber,
        display_order: displayOrder,
        original_exercise_id: originalExerciseId ?? null,
        preferred_exercise_id: preferredExerciseId ?? null,
      },
      {
        onConflict: 'program_id,phase_number,day_number,display_order',
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
    data,
  }
}

export async function saveProgramLoadGuidance({
  programId,
  phaseNumber,
  dayNumber,
  displayOrder,
  exerciseId,
  guidanceAction,
  targetWeight,
  sourceSessionId,
}) {
  if (!isConfigured || !programId || !phaseNumber || !dayNumber || !displayOrder || !exerciseId) {
    return {
      success: false,
      error: 'Load guidance context is unavailable.',
    }
  }

  const { data, error } = await supabase
    .from('program_load_guidance')
    .upsert(
      {
        program_id: programId,
        phase_number: phaseNumber,
        day_number: dayNumber,
        display_order: displayOrder,
        exercise_id: exerciseId,
        guidance_action: guidanceAction,
        target_weight: targetWeight ?? null,
        source_session_id: sourceSessionId ?? null,
      },
      {
        onConflict: 'program_id,phase_number,day_number,display_order,exercise_id',
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
    data,
  }
}

export async function updateProgramSlotState({
  slotStateId,
  status,
  sessionId,
}) {
  if (!isConfigured || !slotStateId) {
    return {
      success: false,
      error: 'Slot state is unavailable.',
    }
  }

  const { data, error } = await supabase
    .from('program_slot_states')
    .update({
      status,
      last_session_id: sessionId ?? null,
      resolved_at: isResolvedStatus(status) ? new Date().toISOString() : null,
    })
    .eq('id', slotStateId)
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

export async function createSkippedProgramSession({
  slot,
}) {
  if (!isConfigured || !slot?.program_day_id) {
    return {
      success: false,
      error: 'Skipped session context is unavailable.',
    }
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({
      program_day_id: slot.program_day_id,
      phase_number: slot.phase_number,
      week_number: slot.week_number,
      date: new Date().toISOString().slice(0, 10),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'skipped',
      source: 'program',
      total_volume: 0,
      total_sets: 0,
      duration_minutes: 0,
      prs_hit: 0,
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

export async function getRecentSlotExposureHistory(program, {
  phaseNumber,
  dayNumber,
  exerciseId,
  limit = 2,
}) {
  if (!isConfigured || !program?.id || !phaseNumber || !dayNumber || !exerciseId) {
    return []
  }

  const matchingDayIds = flattenProgramSlots(program)
    .filter(
      (slot) =>
        slot.phase_number === phaseNumber &&
        slot.day_number === dayNumber,
    )
    .map((slot) => slot.program_day_id)

  if (!matchingDayIds.length) {
    return []
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('workout_sessions')
    .select('id, date, program_day_id')
    .eq('source', 'program')
    .eq('status', 'completed')
    .in('program_day_id', matchingDayIds)
    .order('date', { ascending: false })
    .limit(limit)

  if (sessionsError) {
    return []
  }

  const sessionIds = (sessions ?? []).map((session) => session.id)

  if (!sessionIds.length) {
    return []
  }

  const { data: loggedSets, error: loggedSetsError } = await supabase
    .from('logged_sets')
    .select('session_id, set_type, reps, rpe_actual')
    .eq('exercise_id', exerciseId)
    .in('session_id', sessionIds)

  if (loggedSetsError) {
    return []
  }

  const setsBySessionId = (loggedSets ?? []).reduce((map, set) => {
    const currentSets = map.get(set.session_id) ?? []
    currentSets.push(set)
    map.set(set.session_id, currentSets)
    return map
  }, new Map())

  return (sessions ?? []).map((session) => ({
    ...session,
    logged_sets: setsBySessionId.get(session.id) ?? [],
  }))
}

export default {
  clearProgramDraft,
  createSkippedProgramSession,
  ensureProgramSlotStates,
  getAdaptiveClientId,
  getProgramAdaptiveContext,
  getRecentSlotExposureHistory,
  markProgramSessionAbandoned,
  prepareProgramSession,
  saveProgramDraft,
  saveProgramExercisePreference,
  saveProgramLoadGuidance,
  saveReadinessForSession,
  updateProgramSlotState,
}
