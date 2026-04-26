import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildActiveWorkoutState,
  buildWorkoutSessionSnapshot,
  matchesWorkoutRequest,
  normalizeWorkoutDraftData,
  resolveRecoverableWorkoutCandidates,
  serializeWorkoutPointer,
} from './workoutRecovery.js'

test('buildActiveWorkoutState restores custom workout draft against the captured snapshot', () => {
  const snapshot = buildWorkoutSessionSnapshot({
    source: 'custom',
    templateId: 'template-1',
    templateName: 'Arm Day',
    day: {
      id: 'custom-template-1',
      name: 'Arm Day',
      exercises: [{ id: 'exercise-1', name: 'Curl' }],
    },
  })

  const state = buildActiveWorkoutState({
    session: {
      id: 'session-1',
      source: 'custom',
      template_id: 'template-1',
      started_at: '2026-04-20T08:00:00.000Z',
      session_snapshot: snapshot,
    },
    draft: {
      updated_at: '2026-04-20T08:05:00.000Z',
      draft_data: {
        currentExerciseIndex: 0,
        sessionExercises: [{ id: 'exercise-1', name: 'Curl', working_sets: 3 }],
      },
    },
  })

  assert.equal(state.source, 'custom')
  assert.equal(state.templateId, 'template-1')
  assert.equal(state.templateName, 'Arm Day')
  assert.equal(state.sessionId, 'session-1')
  assert.equal(state.initialDraft.currentExerciseIndex, 0)
  assert.equal(state.day.name, 'Arm Day')
})

test('resolveRecoverableWorkoutCandidates auto-resumes a single session', () => {
  const resolution = resolveRecoverableWorkoutCandidates([
    {
      sessionId: 'session-1',
      source: 'program',
      updatedAt: '2026-04-20T08:05:00.000Z',
    },
  ])

  assert.equal(resolution.kind, 'single')
  assert.equal(resolution.workout.sessionId, 'session-1')
})

test('resolveRecoverableWorkoutCandidates keeps multiple sessions in chooser mode', () => {
  const resolution = resolveRecoverableWorkoutCandidates([
    {
      sessionId: 'session-1',
      source: 'program',
      updatedAt: '2026-04-20T08:05:00.000Z',
    },
    {
      sessionId: 'session-2',
      source: 'custom',
      updatedAt: '2026-04-20T08:04:00.000Z',
    },
  ], 'session-2')

  assert.equal(resolution.kind, 'multiple')
  assert.deepEqual(
    resolution.candidates.map((candidate) => candidate.sessionId),
    ['session-2', 'session-1'],
  )
})

test('matchesWorkoutRequest recognizes the same program slot', () => {
  const candidate = {
    source: 'program',
    slotStateId: 'slot-1',
    day: { id: 'day-1' },
    phaseInfo: { phase_number: 2, week: 3 },
  }

  assert.equal(
    matchesWorkoutRequest(candidate, {
      source: 'program',
      day: { id: 'day-1' },
      phaseInfo: { phase_number: 2, week: 3 },
      slot: { id: 'slot-1' },
    }),
    true,
  )
})

test('matchesWorkoutRequest recognizes the same custom template', () => {
  const candidate = {
    source: 'custom',
    templateId: 'template-1',
    templateName: 'Arm Day',
  }

  assert.equal(
    matchesWorkoutRequest(candidate, {
      source: 'custom',
      templateId: 'template-1',
      templateName: 'Arm Day',
    }),
    true,
  )
})

test('serializeWorkoutPointer stores the minimal resume payload', () => {
  const pointer = serializeWorkoutPointer({
    sessionId: 'session-1',
    source: 'program',
    templateId: null,
  })

  assert.equal(pointer.sessionId, 'session-1')
  assert.equal(pointer.source, 'program')
  assert.equal(pointer.templateId, null)
  assert.equal(typeof pointer.updatedAt, 'string')
})

test('normalizeWorkoutDraftData migrates legacy rest timer fields into anchor-based draft data', () => {
  const now = Date.now()
  const originalNow = Date.now
  Date.now = () => now

  try {
    const normalized = normalizeWorkoutDraftData({
      showRestTimer: true,
      currentRestPrescribed: 120,
      currentRestBaseline: 105,
      currentRestTargetSource: 'smart',
      currentRestRationale: 'Heavy compound set.',
      restElapsedSeconds: 30,
      pendingRestMetrics: {
        rest_prescribed_seconds: 120,
      },
    })

    assert.equal(normalized.restTimer.isVisible, true)
    assert.equal(normalized.restTimer.targetSeconds, 120)
    assert.equal(normalized.restTimer.baselineSeconds, 105)
    assert.equal(normalized.restTimer.targetSource, 'smart')
    assert.equal(normalized.restTimer.rationale, 'Heavy compound set.')
    assert.equal(normalized.restTimer.timerStartedAt, now - 30000)
    assert.deepEqual(normalized.restTimer.pendingMetrics, {
      rest_prescribed_seconds: 120,
    })
  } finally {
    Date.now = originalNow
  }
})
