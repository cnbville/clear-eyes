import { useEffect, useState } from 'react'
import { getNextUnresolvedSlot, getWeekQuotaSummary } from '../lib/adaptiveProgram.js'
import {
  buildPhaseSnapshotFromSessions,
  calculateDOTS,
  calculateINOL,
  calculatePhaseGrowth,
  calculateSFR,
  calculateVolumeTrend,
  calculateWeeklyVolume,
  formatWeekKey,
  generateProgramForecast,
  predictMilestones,
  projectLift,
} from '../lib/progressEngine.js'
import {
  estimateOneRepMax,
  getPrDisplayLabel,
  normalizePrType,
} from '../lib/calculations.js'
import {
  getDemoHistorySessions,
  getDemoLibraryData,
  isDemoModeEnabled,
} from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value, decimals = 1) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function average(values = []) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatSignedRate(value, suffix = '') {
  const numericValue = Number(value) || 0
  const prefix = numericValue > 0 ? '+' : ''
  return `${prefix}${round(numericValue, 2)}${suffix}`
}

function buildExerciseLookup(exercises = []) {
  return exercises.reduce((map, exercise) => {
    const id = exercise?.id ?? exercise?.exercise_id

    if (id) {
      map.set(id, exercise)
    }

    return map
  }, new Map())
}

function getPrimaryExerciseLookup(program) {
  const lookup = new Set()

  ;(program?.phases ?? []).forEach((phase) => {
    ;(phase.days ?? []).forEach((day) => {
      const firstExercise = day?.exercises?.[0]

      if (firstExercise?.exercise_id) {
        lookup.add(firstExercise.exercise_id)
      }

      if (firstExercise?.name) {
        lookup.add(firstExercise.name.toLowerCase())
      }
    })
  })

  return lookup
}

function isCompoundExercise(exercise, primaryLookup) {
  if (!exercise) {
    return false
  }

  const equipment = `${exercise.equipment ?? ''}`.toLowerCase()
  const name = `${exercise.name ?? ''}`.toLowerCase()

  return equipment === 'barbell' || primaryLookup.has(exercise.exerciseId) || primaryLookup.has(name)
}

function getInolRating(value) {
  if (value < 0.4) {
    return 'too easy — insufficient stimulus'
  }

  if (value < 1.0) {
    return 'productive zone'
  }

  if (value < 1.5) {
    return 'tough but manageable'
  }

  if (value < 2.0) {
    return 'hard — monitor recovery'
  }

  return 'overreaching — risk of fatigue accumulation'
}

function buildTotalWeeklyVolume(sessions = []) {
  const grouped = new Map()

  sessions.forEach((session) => {
    const week = formatWeekKey(session?.date)
    const totalVolume = (session?.logged_sets ?? []).reduce((sum, set) => {
      if ((set?.set_type ?? 'working') !== 'working') {
        return sum
      }

      return sum + toNumber(set?.weight) * toNumber(set?.reps)
    }, 0)

    grouped.set(week, (grouped.get(week) ?? 0) + totalVolume)
  })

  return Array.from(grouped.entries())
    .map(([week, totalVolume]) => ({
      week,
      totalVolume: round(totalVolume, 1),
    }))
    .sort((left, right) => left.week.localeCompare(right.week))
}

function buildProjections(sessions = [], program = null) {
  const primaryLookup = getPrimaryExerciseLookup(program)
  const grouped = new Map()

  sessions.forEach((session) => {
    const workingSets = (session?.logged_sets ?? []).filter((set) => (set?.set_type ?? 'working') === 'working')

    const bestSetByExercise = new Map()

    workingSets.forEach((set) => {
      const exerciseId = set?.exercise_id ?? set?.exercises?.id ?? set?.exercise?.id ?? set?.name

      if (!exerciseId) {
        return
      }

      const e1RM = estimateOneRepMax(set?.weight, set?.reps)
      const currentBest = bestSetByExercise.get(exerciseId)

      if (!currentBest || e1RM > currentBest.e1RM) {
        bestSetByExercise.set(exerciseId, {
          exerciseId,
          name:
            set?.exercise_name ??
            set?.exercise?.name ??
            set?.exercises?.name ??
            'Exercise',
          equipment:
            set?.equipment ??
            set?.exercise?.equipment ??
            set?.exercises?.equipment ??
            'other',
          primary_muscle_group:
            set?.muscle_group ??
            set?.primary_muscle_group ??
            set?.exercise?.muscle_group ??
            set?.exercise?.primary_muscle_group ??
            set?.exercises?.muscle_group ??
            set?.exercises?.primary_muscle_group ??
            'other',
          historyPoint: {
            date: session?.date,
            weight: toNumber(set?.weight),
            reps: toNumber(set?.reps),
          },
          e1RM,
        })
      }
    })

    bestSetByExercise.forEach((entry) => {
      const current = grouped.get(entry.exerciseId) ?? {
        exerciseId: entry.exerciseId,
        name: entry.name,
        equipment: entry.equipment,
        primary_muscle_group: entry.primary_muscle_group,
        history: [],
      }

      current.history.push(entry.historyPoint)
      grouped.set(entry.exerciseId, current)
    })
  })

  return Array.from(grouped.values())
    .map((exercise) => {
      const projection = projectLift(exercise.history)

      return {
        ...exercise,
        projection,
        isPrimary: isCompoundExercise(
          {
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            equipment: exercise.equipment,
          },
          primaryLookup,
        ),
      }
    })
    .sort(
      (left, right) =>
        (right.projection?.rSquared ?? 0) - (left.projection?.rSquared ?? 0),
    )
}

function buildSfrScores(sessions = [], program = null) {
  const latestSession = [...sessions]
    .sort((left, right) => `${right?.date ?? ''}`.localeCompare(`${left?.date ?? ''}`))[0]

  if (!latestSession) {
    return []
  }

  const primaryLookup = getPrimaryExerciseLookup(program)
  const grouped = new Map()

  ;(latestSession.logged_sets ?? [])
    .filter((set) => (set?.set_type ?? 'working') === 'working')
    .forEach((set) => {
      const exerciseId = set?.exercise_id ?? set?.exercises?.id ?? set?.exercise?.id ?? set?.name
      const currentSets = grouped.get(exerciseId) ?? []
      currentSets.push(set)
      grouped.set(exerciseId, currentSets)
    })

  return Array.from(grouped.entries())
    .map(([exerciseId, sets]) => {
      const exerciseMeta = sets[0]

      if (
        !isCompoundExercise(
          {
            exerciseId,
            name:
              exerciseMeta?.exercise_name ??
              exerciseMeta?.exercise?.name ??
              exerciseMeta?.exercises?.name,
            equipment:
              exerciseMeta?.equipment ??
              exerciseMeta?.exercise?.equipment ??
              exerciseMeta?.exercises?.equipment,
          },
          primaryLookup,
        )
      ) {
        return null
      }

      const sfr = calculateSFR(sets)

      if (!sfr) {
        return null
      }

      return {
        exerciseId,
        exercise:
          exerciseMeta?.exercise_name ??
          exerciseMeta?.exercise?.name ??
          exerciseMeta?.exercises?.name ??
          'Exercise',
        ...sfr,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.sfrPercent - left.sfrPercent)
}

function buildDotsHistory(bodyMetrics = [], projections = []) {
  if (!bodyMetrics.length) {
    return null
  }

  const benchmarkHistories = {
    squat: projections.find((projection) => projection.name.toLowerCase().includes('squat'))?.history ?? [],
    bench: projections.find((projection) => projection.name.toLowerCase().includes('bench'))?.history ?? [],
    deadlift:
      projections.find((projection) => projection.name.toLowerCase().includes('deadlift'))?.history ?? [],
  }

  if (!benchmarkHistories.squat.length || !benchmarkHistories.bench.length || !benchmarkHistories.deadlift.length) {
    return null
  }

  return bodyMetrics
    .map((metric) => {
      const metricDate = new Date(metric.date)
      const gender = metric.gender ?? 'male'
      const totalLifted = Object.values(benchmarkHistories).reduce((sum, history) => {
        const latest = [...history]
          .filter((point) => new Date(point.date) <= metricDate)
          .sort((left, right) => `${right.date}`.localeCompare(`${left.date}`))[0]

        return latest ? sum + estimateOneRepMax(latest.weight, latest.reps) : sum
      }, 0)

      if (!totalLifted) {
        return null
      }

      const dots = calculateDOTS(totalLifted, metric.weight_kg, gender)

      if (dots === null) {
        return null
      }

      return {
        date: metric.date,
        bodyweightKg: metric.weight_kg,
        totalLifted: round(totalLifted, 1),
        dots,
      }
    })
    .filter(Boolean)
}

function buildPrBreakdown(personalRecords = []) {
  const grouped = personalRecords.reduce((map, record) => {
    const key = normalizePrType(record?.pr_type)
    const current = map.get(key) ?? {
      prType: key,
      label: getPrDisplayLabel(key),
      count: 0,
      topValue: 0,
      latestAchievedAt: null,
    }

    current.count += 1
    current.topValue = Math.max(current.topValue, toNumber(record?.value, 0))
    current.latestAchievedAt =
      current.latestAchievedAt && current.latestAchievedAt > record?.achieved_at
        ? current.latestAchievedAt
        : record?.achieved_at ?? current.latestAchievedAt
    map.set(key, current)
    return map
  }, new Map())

  return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label))
}

function buildRecoverySeries(sessions = [], readinessLogs = [], bodyMetrics = []) {
  const readinessBySessionId = new Map(
    (readinessLogs ?? [])
      .filter((entry) => entry?.session_id)
      .map((entry) => [entry.session_id, entry]),
  )
  const bodyMetricByDate = new Map(
    (bodyMetrics ?? []).map((entry) => [entry.date, entry]),
  )

  const sessionSeries = [...(sessions ?? [])]
    .sort((left, right) => `${left?.date ?? ''}`.localeCompare(`${right?.date ?? ''}`))
    .map((session) => {
      const readiness = readinessBySessionId.get(session.id) ?? null
      const bodyMetric = bodyMetricByDate.get(session.date) ?? null

      return {
        sessionId: session.id,
        date: session.date,
        label: session.date,
        phaseNumber: session.phase_number ?? null,
        readinessScore: toNumber(readiness?.readiness_score, null),
        readinessBand: readiness?.readiness_band ?? null,
        bodyweightKg: toNumber(bodyMetric?.weight_kg, null),
        sessionRpe: toNumber(session?.session_rpe, null),
        restDisciplineScore: toNumber(session?.rest_discipline_score, null),
      }
    })

  const weeklyGroups = sessionSeries.reduce((map, entry) => {
    const week = formatWeekKey(entry.date)
    const current = map.get(week) ?? {
      week,
      readinessScores: [],
      bodyweights: [],
      sessionRpes: [],
      restDisciplineScores: [],
    }

    if (Number.isFinite(entry.readinessScore)) {
      current.readinessScores.push(entry.readinessScore)
    }

    if (Number.isFinite(entry.bodyweightKg)) {
      current.bodyweights.push(entry.bodyweightKg)
    }

    if (Number.isFinite(entry.sessionRpe)) {
      current.sessionRpes.push(entry.sessionRpe)
    }

    if (Number.isFinite(entry.restDisciplineScore)) {
      current.restDisciplineScores.push(entry.restDisciplineScore)
    }

    map.set(week, current)
    return map
  }, new Map())

  const weeklySeries = Array.from(weeklyGroups.values())
    .map((entry) => ({
      week: entry.week,
      avgReadinessScore: round(average(entry.readinessScores), 2),
      avgBodyweightKg: round(average(entry.bodyweights), 1),
      avgSessionRpe: round(average(entry.sessionRpes), 1),
      avgRestDiscipline: round(average(entry.restDisciplineScores), 1),
    }))
    .sort((left, right) => left.week.localeCompare(right.week))

  return {
    sessions: sessionSeries,
    weeks: weeklySeries,
  }
}

function buildPhaseTimeline({
  sessions = [],
  phaseSnapshots = [],
  readinessLogs = [],
  bodyMetrics = [],
  program = null,
}) {
  const derivedSnapshots = derivePhaseSnapshots(phaseSnapshots, sessions, program)
  const readinessByPhase = (readinessLogs ?? []).reduce((map, entry) => {
    const key = entry?.phase_number
    const current = map.get(key) ?? []
    current.push(entry)
    map.set(key, current)
    return map
  }, new Map())
  const bodyMetricsByPhase = (bodyMetrics ?? []).reduce((map, entry) => {
    const matchingSession = [...sessions]
      .filter((session) => session.date <= entry.date && session.phase_number)
      .sort((left, right) => `${right.date}`.localeCompare(`${left.date}`))[0]

    if (!matchingSession?.phase_number) {
      return map
    }

    const current = map.get(matchingSession.phase_number) ?? []
    current.push(entry)
    map.set(matchingSession.phase_number, current)
    return map
  }, new Map())

  return derivedSnapshots.map((snapshot) => {
    const phaseNumber = snapshot.phase_number
    const phaseSessions = sessions.filter((session) => session.phase_number === phaseNumber)
    const readinessEntries = readinessByPhase.get(phaseNumber) ?? []
    const bodyweightEntries = bodyMetricsByPhase.get(phaseNumber) ?? []
    const strengthPeak = phaseSessions.reduce((best, session) => {
      const sessionPeak = (session?.logged_sets ?? [])
        .filter((set) => (set?.set_type ?? 'working') === 'working')
        .reduce(
          (maxValue, set) => Math.max(maxValue, estimateOneRepMax(set?.weight, set?.reps)),
          0,
        )

      return Math.max(best, sessionPeak)
    }, 0)

    return {
      phaseNumber,
      label: snapshot?.name ?? `Phase ${phaseNumber}`,
      sessionsCompleted:
        snapshot?.sessions_completed ?? phaseSessions.filter((session) => session.status === 'completed').length,
      totalVolume:
        round(snapshot?.total_volume ?? phaseSessions.reduce((sum, session) => sum + toNumber(session?.total_volume, 0), 0), 1),
      strengthScore: round(strengthPeak, 1),
      recoveryScore: round(average(readinessEntries.map((entry) => toNumber(entry?.readiness_score, NaN)).filter(Number.isFinite)), 2),
      avgReadinessScore: round(average(readinessEntries.map((entry) => toNumber(entry?.readiness_score, NaN)).filter(Number.isFinite)), 2),
      avgSessionRpe: round(average(phaseSessions.map((session) => toNumber(session?.session_rpe, NaN)).filter(Number.isFinite)), 1),
      avgRestDiscipline: round(average(phaseSessions.map((session) => toNumber(session?.rest_discipline_score, NaN)).filter(Number.isFinite)), 1),
      avgBodyweightKg: round(average(bodyweightEntries.map((entry) => toNumber(entry?.weight_kg, NaN)).filter(Number.isFinite)), 1),
    }
  })
}

function buildAdherenceSummary(program, slotStates = []) {
  if (!slotStates.length) {
    return {
      currentSlot: null,
      weeklyQuota: {
        weeks: [],
        activeWeek: null,
        effectiveTarget: Number(program?.days_per_week) || 0,
        consecutiveQuotaHitWeeks: 0,
      },
      carryovers: 0,
      skippedSlots: 0,
      recoveredLate: 0,
    }
  }

  const currentSlot = getNextUnresolvedSlot(slotStates) ?? slotStates[slotStates.length - 1] ?? null
  const weeklyQuota = getWeekQuotaSummary(slotStates, program?.days_per_week ?? 0, currentSlot)

  return {
    currentSlot,
    weeklyQuota,
    carryovers: slotStates.filter((slot) => slot?.status === 'carried_forward').length,
    skippedSlots: slotStates.filter((slot) => slot?.status === 'skipped').length,
    recoveredLate: slotStates.filter((slot) => slot?.status === 'completed_late').length,
  }
}

function buildReadinessSummary(readinessLogs = []) {
  const recentLogs = [...(readinessLogs ?? [])]
    .sort((left, right) => `${right?.created_at ?? ''}`.localeCompare(`${left?.created_at ?? ''}`))
    .slice(0, 6)

  if (!recentLogs.length) {
    return {
      latestBand: null,
      recentLogs: [],
      averageScore: 0,
      redCount: 0,
      yellowCount: 0,
      greenCount: 0,
    }
  }

  const scores = recentLogs
    .map((entry) => Number(entry?.readiness_score))
    .filter(Number.isFinite)

  return {
    latestBand: recentLogs[0]?.readiness_band ?? null,
    recentLogs,
    averageScore: round(average(scores), 2),
    redCount: recentLogs.filter((entry) => entry?.readiness_band === 'red').length,
    yellowCount: recentLogs.filter((entry) => entry?.readiness_band === 'yellow').length,
    greenCount: recentLogs.filter((entry) => entry?.readiness_band === 'green').length,
  }
}

function buildCoachSummary({
  projectionRows = [],
  volumeAnalysis,
  adherenceSummary,
  readinessSummary,
  dataQuality,
  sessionCount,
}) {
  const improvingLift = [...projectionRows]
    .filter((row) => (row?.projection?.ratePerWeek ?? 0) > 0)
    .sort((left, right) => (right?.projection?.ratePerWeek ?? 0) - (left?.projection?.ratePerWeek ?? 0))[0]
  const stalledLift = [...projectionRows]
    .filter((row) => (row?.projection?.sessionCount ?? 0) >= 3)
    .sort((left, right) => (left?.projection?.ratePerWeek ?? 0) - (right?.projection?.ratePerWeek ?? 0))[0]
  const activeWeek = adherenceSummary?.weeklyQuota?.activeWeek ?? null
  const effectiveTarget = adherenceSummary?.weeklyQuota?.effectiveTarget ?? 0
  const missedQuota = effectiveTarget > 0 && (activeWeek?.completed ?? 0) < effectiveTarget
  const latestReadinessBand = readinessSummary?.latestBand
  const fatigueSignal =
    (volumeAnalysis?.trend?.rateOfChange ?? 0) > 18 ||
    (readinessSummary?.redCount ?? 0) >= 2

  let cause = {
    title: 'Signal still forming',
    body:
      dataQuality === 'limited'
        ? `Need ${Math.max(6 - sessionCount, 0)} more logged sessions for higher-confidence coaching.`
        : 'The current data does not point to a single dominant limiter yet.',
    tone: 'zinc',
  }

  if (missedQuota) {
    cause = {
      title: 'Adherence is the likely bottleneck',
      body: `Program quota is at ${activeWeek?.completed ?? 0}/${effectiveTarget}. Output is probably being limited by missed exposures.`,
      tone: 'gold',
    }
  } else if (latestReadinessBand === 'red' || (readinessSummary?.yellowCount ?? 0) >= 3) {
    cause = {
      title: 'Readiness is suppressing output',
      body: 'Recent check-ins are trending tired or stressed, so conservative performance is expected.',
      tone: 'coral',
    }
  } else if (fatigueSignal) {
    cause = {
      title: 'Fatigue or load accumulation may be rising',
      body: 'Volume is climbing fast and recent readiness is not all green. Keep an eye on recovery discipline.',
      tone: 'sky',
    }
  }

  const nextMove =
    cause.title === 'Adherence is the likely bottleneck'
      ? {
          title: 'Hit the weekly quota before changing the plan',
          body: 'Prioritize completing the remaining program slots cleanly before chasing more load or variety.',
          tone: 'gold',
        }
      : cause.title === 'Readiness is suppressing output'
        ? {
            title: 'Train, but cap ambition',
            body: 'Respect the current prescription, keep RPE honest, and let the next green day earn the push.',
            tone: 'coral',
          }
        : cause.title === 'Fatigue or load accumulation may be rising'
          ? {
              title: 'Keep volume productive, not heroic',
              body: 'Avoid adding extra fatigue this week and watch for persistent red-readiness or rest-discipline slippage.',
              tone: 'sky',
            }
          : {
              title: 'Keep logging quality work',
              body: 'A few more strong sessions will make the coaching layer sharper and the projections more trustworthy.',
              tone: 'zinc',
            }

  return [
    {
      label: 'What’s Improving',
      title: improvingLift
        ? `${improvingLift.name} is climbing`
        : 'No clear winning lift yet',
      body: improvingLift
        ? `${formatSignedRate(improvingLift.projection?.ratePerWeek ?? 0, 'kg/week')} with ${improvingLift.projection?.sessionCount ?? 0} logged exposures.`
        : 'Keep logging consistent working sets to surface the strongest trend.',
      tone: improvingLift ? 'green' : 'zinc',
    },
    {
      label: 'What’s Stalling',
      title: stalledLift
        ? `${stalledLift.name} needs attention`
        : 'No obvious stall detected',
      body: stalledLift
        ? `Trend is ${formatSignedRate(stalledLift.projection?.ratePerWeek ?? 0, 'kg/week')} right now.`
        : 'Nothing is flat enough yet to call a true stall.',
      tone: stalledLift ? 'amber' : 'zinc',
    },
    {
      label: 'Likely Cause',
      ...cause,
    },
    {
      label: 'Next Move',
      ...nextMove,
    },
  ]
}

function derivePhaseSnapshots(phaseSnapshots = [], sessions = [], program = null) {
  if (phaseSnapshots.length) {
    const weeksByPhase = new Map(
      (program?.phases ?? []).map((phase) => [phase.phase_number, phase.num_weeks]),
    )

    return phaseSnapshots.map((snapshot) => ({
      ...snapshot,
      num_weeks: snapshot?.num_weeks ?? weeksByPhase.get(snapshot.phase_number) ?? 1,
    }))
  }

  return buildPhaseSnapshotFromSessions(sessions, program)
}

function createProjectionReport({
  sessions = [],
  phaseSnapshots = [],
  bodyMetrics = [],
  slotStates = [],
  readinessLogs = [],
  personalRecords = [],
  progress,
  program,
  isSampleData = false,
}) {
  const projectionsList = buildProjections(sessions, program)
  const projections = new Map(projectionsList.map((projection) => [projection.exerciseId, projection.projection]))
  const milestones = new Map(
    projectionsList.map((projection) => [
      projection.exerciseId,
      predictMilestones(
        projection.name,
        projection.projection?.currentE1RM ?? 0,
        projection.projection?.ratePerWeek ?? 0,
        projection.projection?.slope ?? 0,
      ),
    ]),
  )

  const enrichedSnapshots = derivePhaseSnapshots(phaseSnapshots, sessions, program)
  const phaseGrowth = calculatePhaseGrowth(enrichedSnapshots)
  const programForecast = generateProgramForecast(projectionsList, progress, program)
  const perMuscleGroup = calculateWeeklyVolume(sessions)
  const totalWeeklyVolume = buildTotalWeeklyVolume(sessions)
  const volumeTrend = calculateVolumeTrend(totalWeeklyVolume)
  const sfrScores = buildSfrScores(sessions, program)

  const primaryLookup = getPrimaryExerciseLookup(program)
  const sessionInolScores = sessions.flatMap((session) => {
    const grouped = new Map()

    ;(session.logged_sets ?? [])
      .filter((set) => (set?.set_type ?? 'working') === 'working')
      .forEach((set) => {
        const exerciseId = set?.exercise_id ?? set?.exercises?.id ?? set?.exercise?.id ?? set?.name
        const currentSets = grouped.get(exerciseId) ?? []
        currentSets.push(set)
        grouped.set(exerciseId, currentSets)
      })

    return Array.from(grouped.entries())
      .map(([exerciseId, sets]) => {
        const set = sets[0]
        const exercise = {
          exerciseId,
          name:
            set?.exercise_name ??
            set?.exercise?.name ??
            set?.exercises?.name ??
            'Exercise',
          equipment:
            set?.equipment ??
            set?.exercise?.equipment ??
            set?.exercises?.equipment ??
            'other',
        }

        if (!isCompoundExercise(exercise, primaryLookup)) {
          return null
        }

        const bestE1RM = sets.reduce(
          (best, currentSet) =>
            Math.max(best, estimateOneRepMax(currentSet?.weight, currentSet?.reps)),
          0,
        )

        return calculateINOL(sets, bestE1RM).totalINOL
      })
      .filter(Boolean)
  })

  const avgSessionINOL = sessionInolScores.length
    ? round(sessionInolScores.reduce((sum, value) => sum + value, 0) / sessionInolScores.length, 2)
    : 0

  const dotsHistory = buildDotsHistory(bodyMetrics, projectionsList)
  const recoverySeries = buildRecoverySeries(sessions, readinessLogs, bodyMetrics)
  const phaseTimeline = buildPhaseTimeline({
    sessions,
    phaseSnapshots,
    readinessLogs,
    bodyMetrics,
    program,
  })
  const prBreakdown = buildPrBreakdown(personalRecords)
  const uniqueWeeks = new Set(sessions.map((session) => formatWeekKey(session?.date))).size
  const sessionCount = sessions.length

  let dataQuality = 'limited'

  if (sessionCount >= 12) {
    dataQuality = 'strong'
  } else if (sessionCount >= 6) {
    dataQuality = 'moderate'
  }

  const adherenceSummary = buildAdherenceSummary(program, slotStates)
  const readinessSummary = buildReadinessSummary(readinessLogs)
  const coachSummary = buildCoachSummary({
    projectionRows: projectionsList,
    volumeAnalysis: {
      perMuscleGroup,
      trend: volumeTrend,
      totalWeeklyVolume,
    },
    adherenceSummary,
    readinessSummary,
    dataQuality,
    sessionCount,
  })

  return {
    sessions,
    projections,
    projectionRows: projectionsList,
    programForecast,
    phaseGrowth,
    volumeAnalysis: {
      perMuscleGroup,
      trend: volumeTrend,
      totalWeeklyVolume,
    },
    avgSessionINOL,
    inolRating: getInolRating(avgSessionINOL),
    dotsHistory,
    sfrScores,
    milestones,
    dataQuality,
    sessionCount,
    weekCount: uniqueWeeks,
    isSampleData,
    source: isSampleData ? 'sample' : 'real',
    adherenceSummary,
    readinessSummary,
    coachSummary,
    prBreakdown,
    recoverySeries,
    phaseTimeline,
    longTermLenses: {
      Strength: phaseTimeline.map((entry) => ({
        label: entry.label,
        value: entry.strengthScore,
      })),
      Workload: phaseTimeline.map((entry) => ({
        label: entry.label,
        value: entry.totalVolume,
      })),
      Recovery: phaseTimeline.map((entry) => ({
        label: entry.label,
        value: entry.avgReadinessScore,
      })),
    },
  }
}

function filterSessionsBySource(sessions = [], sourceFilter = 'all') {
  if (sourceFilter === 'all') {
    return sessions
  }

  return sessions.filter((session) => (session?.source ?? 'program') === sourceFilter)
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

// Bound the progress-report dataset. 18 months is enough for every chart,
// projection, and trend the UI renders; loading every session ever logged
// (plus every set ever performed) pushes the browser into multi-GB territory
// for long-term users.
const REPORT_LOOKBACK_MONTHS = 18
const REPORT_SESSION_LIMIT = 500
const REPORT_LOGGED_SET_LIMIT = 20000
const REPORT_READINESS_LIMIT = 400
const REPORT_PR_LIMIT = 400
const REPORT_BODY_METRIC_LIMIT = 1000

function getReportLookbackDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - REPORT_LOOKBACK_MONTHS)
  return date.toISOString().slice(0, 10)
}

async function fetchSupabaseReportData(programId) {
  const lookbackDate = getReportLookbackDate()
  const [
    { data: sessionsData, error: sessionsError },
    { data: phaseSnapshots, error: phaseSnapshotsError },
    { data: bodyMetrics, error: bodyMetricsError },
    { data: slotStates, error: slotStatesError },
    { data: readinessLogs, error: readinessLogsError },
    { data: personalRecords, error: personalRecordsError },
  ] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select(
        `
          id,
          date,
          phase_number,
          week_number,
          program_day_id,
          source,
          template_id,
          status,
          total_volume,
          total_sets,
          duration_minutes,
          rest_discipline_score,
          prs_hit,
          program_days (
            id,
            name,
            day_number,
            program_weeks (
              program_phases (
                program_id
              )
            )
          ),
          custom_templates (
            id,
            name
          )
        `,
      )
      .eq('status', 'completed')
      .gte('date', lookbackDate)
      .order('date', { ascending: true })
      .limit(REPORT_SESSION_LIMIT),
    supabase
      .from('phase_snapshots')
      .select('*')
      .eq('program_id', programId)
      .order('phase_number', { ascending: true }),
    supabase
      .from('body_metrics')
      .select('*')
      .gte('date', lookbackDate)
      .order('date', { ascending: true })
      .limit(REPORT_BODY_METRIC_LIMIT),
    supabase
      .from('program_slot_states')
      .select('*')
      .eq('program_id', programId)
      .order('sequence_order', { ascending: true }),
    supabase
      .from('readiness_logs')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
      .limit(REPORT_READINESS_LIMIT),
    supabase
      .from('personal_records')
      .select('*')
      .order('achieved_at', { ascending: false })
      .limit(REPORT_PR_LIMIT),
  ])

  if (sessionsError) {
    throw new Error(sessionsError.message)
  }

  if (phaseSnapshotsError) {
    throw new Error(phaseSnapshotsError.message)
  }

  if (bodyMetricsError) {
    throw new Error(bodyMetricsError.message)
  }

  if (slotStatesError) {
    throw new Error(slotStatesError.message)
  }

  if (readinessLogsError) {
    throw new Error(readinessLogsError.message)
  }

  if (personalRecordsError) {
    throw new Error(personalRecordsError.message)
  }

  const sessions = (sessionsData ?? []).filter((session) => {
    if ((session?.source ?? 'program') === 'custom') {
      return true
    }

    return getSessionProgramId(session) === programId
  })

  if (!sessions.length) {
    return {
      sessions: [],
      phaseSnapshots: phaseSnapshots ?? [],
      bodyMetrics: bodyMetrics ?? [],
      slotStates: slotStates ?? [],
      readinessLogs: readinessLogs ?? [],
      personalRecords: personalRecords ?? [],
    }
  }

  const sessionIds = sessions.map((session) => session.id)
  const { data: loggedSets, error: loggedSetsError } = await supabase
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
        )
      `,
    )
    .in('session_id', sessionIds)
    .order('set_number', { ascending: true })
    .limit(REPORT_LOGGED_SET_LIMIT)

  if (loggedSetsError) {
    throw new Error(loggedSetsError.message)
  }

  const setsBySession = (loggedSets ?? []).reduce((map, set) => {
    const currentSets = map.get(set.session_id) ?? []
    currentSets.push(set)
    map.set(set.session_id, currentSets)
    return map
  }, new Map())

  return {
    sessions: sessions.map((session) => ({
      ...session,
      source: session.source ?? 'program',
      template_name: session.custom_templates?.name ?? null,
      logged_sets: setsBySession.get(session.id) ?? [],
    })),
    phaseSnapshots: phaseSnapshots ?? [],
    bodyMetrics: bodyMetrics ?? [],
    slotStates: slotStates ?? [],
    readinessLogs: readinessLogs ?? [],
    personalRecords: personalRecords ?? [],
  }
}

function fetchLocalReportData(programId) {
  const sessions = getDemoHistorySessions(programId)
  const libraryData = getDemoLibraryData()
  const exerciseLookup = buildExerciseLookup(libraryData.exercises)

  return {
    sessions: sessions.map((session) => ({
      ...session,
      source: session.source ?? 'program',
      template_name: session.template_name ?? null,
      logged_sets: (session.logged_sets ?? []).map((set) => ({
        ...set,
        exercises: exerciseLookup.get(set.exercise_id) ?? null,
      })),
    })),
    phaseSnapshots: [],
    bodyMetrics: [],
    slotStates: [],
    readinessLogs: [],
    personalRecords: libraryData.personalRecords ?? [],
  }
}

export function generateSampleData(program) {
  const startDate = new Date('2026-01-05T00:00:00')
  const weeklyDates = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index * 7)
    return date.toISOString().slice(0, 10)
  })

  const lifts = [
    {
      exercise_id: 'sample-bench',
      name: 'Bench Press',
      equipment: 'barbell',
      primary_muscle_group: 'chest',
      workingSets: [
        [70, 5],
        [70, 6],
        [72.5, 5],
        [72.5, 6],
        [75, 5],
        [75, 5],
        [77.5, 4],
        [77.5, 5],
        [80, 4],
        [80, 5],
      ],
    },
    {
      exercise_id: 'sample-squat',
      name: 'Squat',
      equipment: 'barbell',
      primary_muscle_group: 'quads',
      workingSets: [
        [90, 5],
        [92.5, 5],
        [92.5, 6],
        [95, 5],
        [97.5, 5],
        [97.5, 6],
        [100, 5],
        [102.5, 4],
        [102.5, 5],
        [105, 5],
      ],
    },
    {
      exercise_id: 'sample-deadlift',
      name: 'Deadlift',
      equipment: 'barbell',
      primary_muscle_group: 'posterior_chain',
      workingSets: [
        [110, 5],
        [112.5, 5],
        [112.5, 6],
        [115, 5],
        [117.5, 5],
        [117.5, 6],
        [120, 4],
        [120, 5],
        [122.5, 4],
        [125, 4],
      ],
    },
  ]

  const phaseBoundaries = [4, 8]
  const sessions = weeklyDates.map((date, index) => {
    const phaseNumber = index < phaseBoundaries[0] ? 1 : index < phaseBoundaries[1] ? 2 : 3

    return {
      id: `sample-session-${index + 1}`,
      date,
      phase_number: phaseNumber,
      week_number: index + 1,
      status: 'completed',
      total_volume: 0,
      total_sets: lifts.length * 3,
      duration_minutes: 75 + (index % 3) * 5,
      rest_discipline_score: 88 - (index % 3) * 2,
      prs_hit: index >= 2 ? 1 : 0,
      program_days: {
        name: 'Projection Session',
        day_number: 1,
      },
      logged_sets: lifts.flatMap((lift) => {
        const [weight, reps] = lift.workingSets[index]

        return [
          {
            id: `${lift.exercise_id}-${index + 1}-1`,
            session_id: `sample-session-${index + 1}`,
            exercise_id: lift.exercise_id,
            set_number: 1,
            set_type: 'working',
            weight,
            reps,
            rest_prescribed_seconds: 180,
            rest_taken_seconds: 175 + (index % 4) * 5,
            exercises: {
              id: lift.exercise_id,
              name: lift.name,
              equipment: lift.equipment,
              primary_muscle_group: lift.primary_muscle_group,
            },
          },
          {
            id: `${lift.exercise_id}-${index + 1}-2`,
            session_id: `sample-session-${index + 1}`,
            exercise_id: lift.exercise_id,
            set_number: 2,
            set_type: 'working',
            weight: Math.max(weight - 2.5, 20),
            reps: reps + 1,
            rest_prescribed_seconds: 180,
            rest_taken_seconds: 180 + (index % 2) * 5,
            exercises: {
              id: lift.exercise_id,
              name: lift.name,
              equipment: lift.equipment,
              primary_muscle_group: lift.primary_muscle_group,
            },
          },
          {
            id: `${lift.exercise_id}-${index + 1}-3`,
            session_id: `sample-session-${index + 1}`,
            exercise_id: lift.exercise_id,
            set_number: 3,
            set_type: 'working',
            weight: Math.max(weight - 5, 20),
            reps: reps + 2,
            rest_prescribed_seconds: 180,
            rest_taken_seconds: 185 + (index % 3) * 5,
            exercises: {
              id: lift.exercise_id,
              name: lift.name,
              equipment: lift.equipment,
              primary_muscle_group: lift.primary_muscle_group,
            },
          },
        ]
      }),
    }
  })

  sessions.forEach((session) => {
    session.total_volume = round(
      session.logged_sets.reduce((sum, set) => sum + set.weight * set.reps, 0),
      1,
    )
  })

  const phaseSnapshots = buildPhaseSnapshotFromSessions(sessions, program)
  const bodyMetrics = weeklyDates.map((date, index) => ({
    id: `sample-body-${index + 1}`,
    date,
    weight_kg: round(74 + index * 0.15, 1),
    gender: 'male',
  }))

  return {
    sessions,
    phaseSnapshots,
    bodyMetrics,
  }
}

function createEmptyReport(error = null) {
  return {
    sessions: [],
    projections: new Map(),
    projectionRows: [],
    programForecast: [],
    phaseGrowth: [],
    volumeAnalysis: {
      perMuscleGroup: [],
      trend: { rateOfChange: 0, label: 'volume stable' },
      totalWeeklyVolume: [],
    },
    avgSessionINOL: 0,
    inolRating: 'productive zone',
    dotsHistory: null,
    sfrScores: [],
    milestones: new Map(),
    dataQuality: 'limited',
    sessionCount: 0,
    weekCount: 0,
    isSampleData: false,
    source: 'real',
    loading: false,
    error,
    adherenceSummary: {
      currentSlot: null,
      weeklyQuota: {
        weeks: [],
        activeWeek: null,
        effectiveTarget: 0,
        consecutiveQuotaHitWeeks: 0,
      },
      carryovers: 0,
      skippedSlots: 0,
      recoveredLate: 0,
    },
    readinessSummary: {
      latestBand: null,
      recentLogs: [],
      averageScore: 0,
      redCount: 0,
      yellowCount: 0,
      greenCount: 0,
    },
    coachSummary: [],
    prBreakdown: [],
    recoverySeries: {
      sessions: [],
      weeks: [],
    },
    phaseTimeline: [],
    longTermLenses: {
      Strength: [],
      Workload: [],
      Recovery: [],
    },
  }
}

export function useProgressReport(program, progress, sourceFilter = 'all') {
  const [report, setReport] = useState({
    ...createEmptyReport(),
    loading: true,
  })

  useEffect(() => {
    let isCancelled = false

    async function loadReport() {
        if (!program?.id) {
          if (!isCancelled) {
            setReport(createEmptyReport())
          }

          return
      }

      setReport((current) => ({
        ...current,
        loading: true,
        error: null,
      }))

      try {
        let data = null

        if (isConfigured) {
          data = await fetchSupabaseReportData(program.id)

          if ((data.sessions ?? []).length) {
            if (!isCancelled) {
              const filteredSessions = filterSessionsBySource(data.sessions, sourceFilter)

              setReport({
                ...createProjectionReport({
                  sessions: filteredSessions,
                  phaseSnapshots: data.phaseSnapshots,
                  bodyMetrics: data.bodyMetrics,
                  slotStates: data.slotStates,
                  readinessLogs: data.readinessLogs,
                  personalRecords: data.personalRecords,
                  progress,
                  program,
                  isSampleData: false,
                }),
                loading: false,
                error: null,
              })
            }

            return
          }
        }

        if (!isConfigured && isDemoModeEnabled()) {
          data = fetchLocalReportData(program.id)

          if ((data.sessions ?? []).length) {
            if (!isCancelled) {
              const filteredSessions = filterSessionsBySource(data.sessions, sourceFilter)

              setReport({
                ...createProjectionReport({
                  sessions: filteredSessions,
                  phaseSnapshots: data.phaseSnapshots,
                  bodyMetrics: data.bodyMetrics,
                  slotStates: data.slotStates,
                  readinessLogs: data.readinessLogs,
                  personalRecords: data.personalRecords,
                  progress,
                  program,
                  isSampleData: false,
                }),
                loading: false,
                error: null,
              })
            }

            return
          }
        }

        if (!isCancelled) {
          setReport(createEmptyReport())
        }
      } catch (loadError) {
        const fallbackData = !isConfigured && isDemoModeEnabled() ? fetchLocalReportData(program.id) : null

        if (!isCancelled) {
          if (fallbackData?.sessions?.length) {
            const filteredSessions = filterSessionsBySource(fallbackData.sessions, sourceFilter)

            setReport({
              ...createProjectionReport({
                sessions: filteredSessions,
                phaseSnapshots: fallbackData.phaseSnapshots,
                bodyMetrics: fallbackData.bodyMetrics,
                slotStates: fallbackData.slotStates,
                readinessLogs: fallbackData.readinessLogs,
                personalRecords: fallbackData.personalRecords,
                progress,
                program,
                isSampleData: false,
              }),
              loading: false,
              error:
                loadError instanceof Error
                  ? loadError.message
                  : 'Unable to generate the progress report.',
            })
          } else {
            setReport(
              createEmptyReport(
                loadError instanceof Error
                  ? loadError.message
                  : 'Unable to generate the progress report.',
              ),
            )
          }
        }
      }
    }

    void loadReport()

    return () => {
      isCancelled = true
    }
  }, [program, progress, sourceFilter])

  return report
}

export default useProgressReport
