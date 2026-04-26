export function buildWorkoutSessionSnapshot({
  source = 'program',
  programId = null,
  day = null,
  phaseInfo = null,
  templateId = null,
  templateName = null,
  slotStateId = null,
  slotStatus = null,
  slotDayNumber = null,
} = {}) {
  return {
    source,
    programId,
    day: day ?? null,
    phaseInfo: phaseInfo ?? null,
    templateId: templateId ?? null,
    templateName: templateName ?? day?.name ?? 'Workout',
    slotStateId: slotStateId ?? null,
    slotStatus: slotStatus ?? null,
    slotDayNumber: slotDayNumber ?? day?.day_number ?? null,
  }
}

export function normalizeWorkoutDraftData(draftData = null) {
  if (!draftData || typeof draftData !== 'object') {
    return draftData ?? null
  }

  const restTimer = draftData.restTimer ?? {}
  const legacyTargetSeconds = Number(draftData.currentRestPrescribed) || 0
  const legacyBaselineSeconds =
    Number(draftData.currentRestBaseline) || legacyTargetSeconds || 0
  const legacyElapsedSeconds = Math.max(Number(draftData.restElapsedSeconds) || 0, 0)
  const explicitStartedAt = Number(restTimer.timerStartedAt)
  const timerStartedAt = Number.isFinite(explicitStartedAt)
    ? explicitStartedAt
    : legacyElapsedSeconds > 0
      ? Date.now() - legacyElapsedSeconds * 1000
      : null
  const targetSeconds = Math.max(
    Number(restTimer.targetSeconds ?? legacyTargetSeconds) || 0,
    0,
  )
  const baselineSeconds = Math.max(
    Number(restTimer.baselineSeconds ?? legacyBaselineSeconds ?? targetSeconds) || 0,
    0,
  )
  const normalizedRestTimer = {
    isVisible: Boolean(restTimer.isVisible ?? draftData.showRestTimer) && targetSeconds > 0,
    targetSeconds,
    baselineSeconds,
    targetSource:
      restTimer.targetSource ??
      draftData.currentRestTargetSource ??
      'program',
    rationale: restTimer.rationale ?? draftData.currentRestRationale ?? '',
    pendingMetrics: restTimer.pendingMetrics ?? draftData.pendingRestMetrics ?? null,
    timerStartedAt,
  }

  return {
    ...draftData,
    showRestTimer: normalizedRestTimer.isVisible,
    currentRestPrescribed: normalizedRestTimer.targetSeconds,
    currentRestBaseline: normalizedRestTimer.baselineSeconds,
    currentRestTargetSource: normalizedRestTimer.targetSource,
    currentRestRationale: normalizedRestTimer.rationale,
    pendingRestMetrics: normalizedRestTimer.pendingMetrics,
    restTimer: normalizedRestTimer,
  }
}

function toSessionTimestamp(value, fallback = Date.now()) {
  if (!value) {
    return fallback
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : fallback
}

function getFallbackPhaseInfo(session, snapshot) {
  if (snapshot?.phaseInfo) {
    return snapshot.phaseInfo
  }

  if ((session?.source ?? snapshot?.source ?? 'program') !== 'program') {
    return null
  }

  return {
    phase_number: session?.phase_number ?? 1,
    week: session?.week_number ?? 1,
    name: `Phase ${session?.phase_number ?? 1}`,
    phaseColor: '#c9a227',
  }
}

export function buildActiveWorkoutState({
  session,
  draft = null,
  readiness = null,
  snapshot = null,
  remoteDraftDetected = false,
} = {}) {
  if (!session) {
    return null
  }

  const resolvedSnapshot = snapshot ?? session?.session_snapshot ?? {}
  const draftData = normalizeWorkoutDraftData(draft?.draft_data ?? null)
  const startedAt =
    draftData?.startedAt ??
    session?.started_at ??
    new Date().toISOString()

  return {
    day: resolvedSnapshot?.day ?? null,
    phaseInfo: getFallbackPhaseInfo(session, resolvedSnapshot),
    source: session?.source ?? resolvedSnapshot?.source ?? 'program',
    programId: resolvedSnapshot?.programId ?? null,
    templateId: session?.template_id ?? resolvedSnapshot?.templateId ?? null,
    templateName:
      resolvedSnapshot?.templateName ??
      resolvedSnapshot?.day?.name ??
      'Workout',
    sessionId: session?.id ?? null,
    sessionStartedAt: toSessionTimestamp(startedAt),
    initialDraft: draftData,
    initialReadiness: readiness ?? draftData?.readiness ?? null,
    remoteDraftDetected,
    slotStateId: resolvedSnapshot?.slotStateId ?? null,
    slotStatus: resolvedSnapshot?.slotStatus ?? 'pending',
    slotDayNumber:
      resolvedSnapshot?.slotDayNumber ??
      resolvedSnapshot?.day?.day_number ??
      null,
    draftUpdatedAt: draft?.updated_at ?? null,
    updatedAt: draft?.updated_at ?? session?.started_at ?? null,
  }
}

export function sortRecoverableWorkoutCandidates(candidates = [], preferredSessionId = null) {
  return [...candidates].sort((left, right) => {
    const leftPreferred = left?.sessionId === preferredSessionId ? 1 : 0
    const rightPreferred = right?.sessionId === preferredSessionId ? 1 : 0

    if (leftPreferred !== rightPreferred) {
      return rightPreferred - leftPreferred
    }

    const leftTime = new Date(left?.updatedAt ?? left?.sessionStartedAt ?? 0).getTime()
    const rightTime = new Date(right?.updatedAt ?? right?.sessionStartedAt ?? 0).getTime()

    return rightTime - leftTime
  })
}

export function resolveRecoverableWorkoutCandidates(candidates = [], preferredSessionId = null) {
  const orderedCandidates = sortRecoverableWorkoutCandidates(candidates, preferredSessionId)

  if (!orderedCandidates.length) {
    return {
      kind: 'none',
      candidates: [],
      workout: null,
    }
  }

  if (orderedCandidates.length === 1) {
    return {
      kind: 'single',
      candidates: orderedCandidates,
      workout: orderedCandidates[0],
    }
  }

  return {
    kind: 'multiple',
    candidates: orderedCandidates,
    workout: null,
  }
}

export function matchesWorkoutRequest(candidate, request = {}) {
  if (!candidate) {
    return false
  }

  const requestedSource = request?.source ?? 'program'

  if ((candidate.source ?? 'program') !== requestedSource) {
    return false
  }

  if (requestedSource === 'custom') {
    if (request?.templateId && candidate?.templateId) {
      return request.templateId === candidate.templateId
    }

    return (request?.templateName ?? request?.day?.name ?? '') === (candidate?.templateName ?? candidate?.day?.name ?? '')
  }

  if (request?.slot?.id && candidate?.slotStateId) {
    return request.slot.id === candidate.slotStateId
  }

  const candidateDayId = candidate?.day?.id ?? null
  const requestedDayId = request?.day?.id ?? null

  return (
    candidateDayId !== null &&
    candidateDayId === requestedDayId &&
    (candidate?.phaseInfo?.phase_number ?? null) === (request?.phaseInfo?.phase_number ?? null) &&
    (candidate?.phaseInfo?.week ?? null) === (request?.phaseInfo?.week ?? null)
  )
}

export function serializeWorkoutPointer(activeWorkout = null) {
  if (!activeWorkout?.sessionId) {
    return null
  }

  return {
    sessionId: activeWorkout.sessionId,
    source: activeWorkout.source ?? 'program',
    templateId: activeWorkout.templateId ?? null,
    updatedAt: new Date().toISOString(),
  }
}
