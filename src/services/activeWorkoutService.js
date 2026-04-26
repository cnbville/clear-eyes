import {
  buildActiveWorkoutState,
  buildWorkoutSessionSnapshot,
  resolveRecoverableWorkoutCandidates,
  serializeWorkoutPointer,
} from '../lib/workoutRecovery.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const ACTIVE_WORKOUT_POINTER_STORAGE_KEY = 'iron-active-workout-pointer-v1'
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

function getAdaptiveClientId() {
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

function readStoredJson(key) {
  if (!canUseStorage()) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

function writeStoredJson(key, value) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

export function readActiveWorkoutPointer() {
  return readStoredJson(ACTIVE_WORKOUT_POINTER_STORAGE_KEY)
}

export function persistActiveWorkoutPointer(activeWorkout) {
  const pointer = serializeWorkoutPointer(activeWorkout)

  if (!pointer) {
    clearActiveWorkoutPointer()
    return null
  }

  writeStoredJson(ACTIVE_WORKOUT_POINTER_STORAGE_KEY, pointer)
  return pointer
}

export function clearActiveWorkoutPointer() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(ACTIVE_WORKOUT_POINTER_STORAGE_KEY)
}

async function fetchDraftRows(sessionIds = []) {
  if (!sessionIds.length) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('workout_session_drafts')
    .select('*')
    .in('session_id', sessionIds)

  if (error) {
    throw new Error(error.message)
  }

  return new Map((data ?? []).map((row) => [row.session_id, row]))
}

async function fetchReadinessRows(sessionIds = []) {
  if (!sessionIds.length) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('readiness_logs')
    .select('*')
    .in('session_id', sessionIds)

  if (error) {
    throw new Error(error.message)
  }

  return new Map((data ?? []).map((row) => [row.session_id, row]))
}

export async function saveWorkoutSessionSnapshot(sessionId, snapshot) {
  if (!isConfigured || !sessionId) {
    return {
      success: false,
      error: 'Session is unavailable.',
    }
  }

  const { error } = await supabase
    .from('workout_sessions')
    .update({
      session_snapshot: snapshot ?? {},
    })
    .eq('id', sessionId)

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

export async function saveWorkoutDraft({
  sessionId,
  source = 'program',
  programId = null,
  programDayId = null,
  phaseNumber = null,
  weekNumber = null,
  dayNumber = null,
  templateId = null,
  draftData = {},
}) {
  if (!isConfigured || !sessionId) {
    return {
      success: false,
      error: 'Draft session is unavailable.',
    }
  }

  const clientId = getAdaptiveClientId()
  const { error } = await supabase
    .from('workout_session_drafts')
    .upsert(
      {
        session_id: sessionId,
        source,
        program_id: programId ?? null,
        program_day_id: programDayId ?? null,
        phase_number: phaseNumber ?? null,
        week_number: weekNumber ?? null,
        day_number: dayNumber ?? null,
        template_id: templateId ?? null,
        updated_by_client_id: clientId,
        draft_data: draftData ?? {},
      },
      {
        onConflict: 'session_id',
      },
    )

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

export async function clearWorkoutDraft(sessionId) {
  if (!isConfigured || !sessionId) {
    return {
      success: true,
    }
  }

  const { error } = await supabase
    .from('workout_session_drafts')
    .delete()
    .eq('session_id', sessionId)

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

export async function markWorkoutSessionAbandoned(sessionId) {
  if (!isConfigured || !sessionId) {
    return {
      success: false,
      error: 'Session is unavailable.',
    }
  }

  const { error } = await supabase
    .from('workout_sessions')
    .update({
      status: 'abandoned',
    })
    .eq('id', sessionId)

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  return clearWorkoutDraft(sessionId)
}

export async function prepareCustomSession({
  templateId,
  templateName,
  day,
}) {
  if (!isConfigured || !templateId || !day) {
    return {
      success: false,
      error: 'Custom session context is unavailable.',
    }
  }

  const clientId = getAdaptiveClientId()
  const snapshot = buildWorkoutSessionSnapshot({
    source: 'custom',
    templateId,
    templateName,
    day,
  })
  const { data: existingSession, error: existingSessionError } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('source', 'custom')
    .eq('status', 'in_progress')
    .eq('template_id', templateId)
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

  if (!session) {
    const { data: createdSession, error: createdSessionError } = await supabase
      .from('workout_sessions')
      .insert({
        date: new Date().toISOString().slice(0, 10),
        started_at: new Date().toISOString(),
        status: 'in_progress',
        source: 'custom',
        template_id: templateId,
        session_snapshot: snapshot,
      })
      .select('*')
      .single()

    if (createdSessionError) {
      return {
        success: false,
        error: createdSessionError.message,
      }
    }

    session = createdSession
  } else if (!session?.session_snapshot?.day?.exercises?.length) {
    const snapshotResult = await saveWorkoutSessionSnapshot(session.id, snapshot)

    if (!snapshotResult.success) {
      return snapshotResult
    }

    session = {
      ...session,
      session_snapshot: snapshot,
    }
  }

  const { data: draftRow, error: draftError } = await supabase
    .from('workout_session_drafts')
    .select('*')
    .eq('session_id', session.id)
    .maybeSingle()

  if (draftError) {
    return {
      success: false,
      error: draftError.message,
    }
  }

  let resolvedDraft = draftRow

  if (!resolvedDraft) {
    const { data: createdDraft, error: createdDraftError } = await supabase
      .from('workout_session_drafts')
      .insert({
        session_id: session.id,
        source: 'custom',
        template_id: templateId,
        updated_by_client_id: clientId,
        draft_data: {},
      })
      .select('*')
      .single()

    if (createdDraftError) {
      return {
        success: false,
        error: createdDraftError.message,
      }
    }

    resolvedDraft = createdDraft
  }

  return {
    success: true,
    session,
    sessionId: session.id,
    draft: resolvedDraft?.draft_data ?? null,
    draftUpdatedAt: resolvedDraft?.updated_at ?? null,
    remoteDraftDetected:
      Boolean(resolvedDraft?.updated_by_client_id) &&
      resolvedDraft.updated_by_client_id !== clientId,
  }
}

export async function getRecoverableWorkouts(preferredSessionId = null) {
  const resolvedPreferredSessionId =
    preferredSessionId ?? readActiveWorkoutPointer()?.sessionId ?? null

  if (!isConfigured) {
    return resolveRecoverableWorkoutCandidates([], resolvedPreferredSessionId)
  }

  const { data: sessions, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(8)

  if (error) {
    return {
      kind: 'none',
      candidates: [],
      workout: null,
      error: error.message,
    }
  }

  const sessionIds = (sessions ?? []).map((session) => session.id)
  const clientId = getAdaptiveClientId()

  try {
    const [draftRows, readinessRows] = await Promise.all([
      fetchDraftRows(sessionIds),
      fetchReadinessRows(sessionIds),
    ])

    const candidates = (sessions ?? [])
      .map((session) =>
        buildActiveWorkoutState({
          session,
          draft: draftRows.get(session.id) ?? null,
          readiness: readinessRows.get(session.id) ?? null,
          snapshot: session.session_snapshot ?? null,
          remoteDraftDetected:
            Boolean(draftRows.get(session.id)?.updated_by_client_id) &&
            draftRows.get(session.id).updated_by_client_id !== clientId,
        }),
      )
      .filter(Boolean)

    return resolveRecoverableWorkoutCandidates(candidates, resolvedPreferredSessionId)
  } catch (recoveryError) {
    return {
      kind: 'none',
      candidates: [],
      workout: null,
      error: recoveryError instanceof Error ? recoveryError.message : 'Unable to restore workout state.',
    }
  }
}

export default {
  clearActiveWorkoutPointer,
  clearWorkoutDraft,
  getRecoverableWorkouts,
  markWorkoutSessionAbandoned,
  persistActiveWorkoutPointer,
  prepareCustomSession,
  readActiveWorkoutPointer,
  saveWorkoutDraft,
  saveWorkoutSessionSnapshot,
}
