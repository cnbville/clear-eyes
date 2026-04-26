import { useEffect, useState } from 'react'
import { getNextUnresolvedSlot, getWeekQuotaSummary } from '../lib/adaptiveProgram.js'
import {
  buildPhaseSnapshotFromSessions,
  formatWeekKey,
} from '../lib/progressEngine.js'
import {
  getPrDisplayLabel,
  normalizePrType,
} from '../lib/calculations.js'
import {
  getDemoHistorySessions,
  getDemoLibraryData,
  isDemoModeEnabled,
} from '../lib/demoState.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const REPORT_LOOKBACK_MONTHS = 6
const REPORT_SESSION_LIMIT = 120
const REPORT_READINESS_LIMIT = 180
const REPORT_PR_LIMIT = 240
const REPORT_BODY_METRIC_LIMIT = 240

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

function getReportLookbackDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - REPORT_LOOKBACK_MONTHS)
  return date.toISOString().slice(0, 10)
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

function filterSessionsBySource(sessions = [], sourceFilter = 'all') {
  if (sourceFilter === 'all') {
    return sessions
  }

  return sessions.filter((session) => (session?.source ?? 'program') === sourceFilter)
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
  const bodyMetricByDate = new Map((bodyMetrics ?? []).map((entry) => [entry.date, entry]))

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

function buildPhaseTimeline({ sessions = [], phaseSnapshots = [], readinessLogs = [], bodyMetrics = [], program = null }) {
  const phaseNames = new Map((program?.phases ?? []).map((phase) => [phase.phase_number, phase?.name ?? `Phase ${phase.phase_number}`]))
  const derivedSnapshots = phaseSnapshots.length ? phaseSnapshots : buildPhaseSnapshotFromSessions(sessions, program)
  const readinessByPhase = (readinessLogs ?? []).reduce((map, entry) => {
    const key = entry?.phase_number

    if (!key) {
      return map
    }

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
  const fallbackPhaseNumbers = Array.from(
    new Set(sessions.map((session) => session?.phase_number).filter(Boolean)),
  ).sort((left, right) => left - right)
  const snapshotRows = derivedSnapshots.length
    ? derivedSnapshots
    : fallbackPhaseNumbers.map((phaseNumber) => ({
        phase_number: phaseNumber,
        name: phaseNames.get(phaseNumber) ?? `Phase ${phaseNumber}`,
        lift_comparisons: {},
      }))

  return snapshotRows.map((snapshot) => {
    const phaseNumber = snapshot.phase_number
    const phaseSessions = sessions.filter((session) => session.phase_number === phaseNumber)
    const readinessEntries = readinessByPhase.get(phaseNumber) ?? []
    const bodyweightEntries = bodyMetricsByPhase.get(phaseNumber) ?? []
    const strengthScore = Math.max(
      0,
      ...Object.values(snapshot?.lift_comparisons ?? {}).map((entry) => toNumber(entry?.end, 0)),
    )

    return {
      phaseNumber,
      label: snapshot?.name ?? phaseNames.get(phaseNumber) ?? `Phase ${phaseNumber}`,
      sessionsCompleted: phaseSessions.filter((session) => session.status === 'completed').length,
      totalVolume: round(phaseSessions.reduce((sum, session) => sum + toNumber(session?.total_volume, 0), 0), 1),
      strengthScore: round(strengthScore, 1),
      recoveryScore: round(
        average(
          readinessEntries
            .map((entry) => toNumber(entry?.readiness_score, NaN))
            .filter(Number.isFinite),
        ),
        2,
      ),
      avgReadinessScore: round(
        average(
          readinessEntries
            .map((entry) => toNumber(entry?.readiness_score, NaN))
            .filter(Number.isFinite),
        ),
        2,
      ),
      avgSessionRpe: round(
        average(phaseSessions.map((session) => toNumber(session?.session_rpe, NaN)).filter(Number.isFinite)),
        1,
      ),
      avgRestDiscipline: round(
        average(
          phaseSessions
            .map((session) => toNumber(session?.rest_discipline_score, NaN))
            .filter(Number.isFinite),
        ),
        1,
      ),
      avgBodyweightKg: round(
        average(bodyweightEntries.map((entry) => toNumber(entry?.weight_kg, NaN)).filter(Number.isFinite)),
        1,
      ),
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

function buildWeeklyVolumeSeries(sessions = []) {
  const grouped = sessions.reduce((map, session) => {
    const week = formatWeekKey(session?.date)
    map.set(week, (map.get(week) ?? 0) + toNumber(session?.total_volume, 0))
    return map
  }, new Map())

  return Array.from(grouped.entries())
    .map(([week, totalVolume]) => ({
      week,
      totalVolume: round(totalVolume, 1),
    }))
    .sort((left, right) => left.week.localeCompare(right.week))
}

function buildVolumeTrend(weeklyVolume = []) {
  if (weeklyVolume.length < 2) {
    return {
      rateOfChange: 0,
      label: 'volume still forming',
    }
  }

  const first = weeklyVolume[0]?.totalVolume ?? 0
  const last = weeklyVolume[weeklyVolume.length - 1]?.totalVolume ?? 0
  const rateOfChange = first > 0 ? ((last - first) / first) * 100 : 0

  if (rateOfChange > 12) {
    return {
      rateOfChange: round(rateOfChange, 2),
      label: 'weekly volume increasing',
    }
  }

  if (rateOfChange < -8) {
    return {
      rateOfChange: round(rateOfChange, 2),
      label: 'weekly volume trending down',
    }
  }

  return {
    rateOfChange: round(rateOfChange, 2),
    label: 'weekly volume stable',
  }
}

function buildCoachSummary({ adherenceSummary, readinessSummary, volumeTrend, dataQuality, sessionCount }) {
  const activeWeek = adherenceSummary?.weeklyQuota?.activeWeek ?? null
  const effectiveTarget = adherenceSummary?.weeklyQuota?.effectiveTarget ?? 0
  const missedQuota = effectiveTarget > 0 && (activeWeek?.completed ?? 0) < effectiveTarget
  const latestReadinessBand = readinessSummary?.latestBand

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
  } else if ((volumeTrend?.rateOfChange ?? 0) > 18) {
    cause = {
      title: 'Fatigue or load accumulation may be rising',
      body: 'Weekly volume is climbing quickly. Keep the work productive, not heroic.',
      tone: 'sky',
    }
  }

  const nextMove =
    cause.title === 'Adherence is the likely bottleneck'
      ? {
          title: 'Hit the weekly quota before changing the plan',
          body: 'Prioritize completing the remaining program slots cleanly before adding more load or variety.',
          tone: 'gold',
        }
      : cause.title === 'Readiness is suppressing output'
        ? {
            title: 'Train, but cap ambition',
            body: 'Respect the current prescription, keep RPE honest, and let the next green day earn the push.',
            tone: 'coral',
          }
        : {
            title: 'Keep stacking clean sessions',
            body: 'The summary layer stays light on purpose. Use a focus-lift drill-down when you want deeper analysis.',
            tone: 'zinc',
          }

  return [
    {
      label: 'Output',
      title:
        (volumeTrend?.rateOfChange ?? 0) >= 0
          ? 'Training output is holding up'
          : 'Output dipped in the recent window',
      body: `${formatSignedRate(volumeTrend?.rateOfChange ?? 0, '%')} across the default 6-month window.`,
      tone: (volumeTrend?.rateOfChange ?? 0) >= 0 ? 'green' : 'amber',
    },
    {
      label: 'Adherence',
      title: effectiveTarget ? `${activeWeek?.completed ?? 0}/${effectiveTarget} slots resolved this week` : 'Weekly quota not established',
      body: missedQuota
        ? 'Program exposures are behind target right now.'
        : 'Program exposure is on track or close to it.',
      tone: missedQuota ? 'amber' : 'green',
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

function buildSummaryReport({ sessions = [], phaseSnapshots = [], bodyMetrics = [], slotStates = [], readinessLogs = [], personalRecords = [], program, sourceFilter, isSampleData = false, error = null }) {
  const filteredSessions = filterSessionsBySource(sessions, sourceFilter)
  const weeklyVolume = buildWeeklyVolumeSeries(filteredSessions)
  const volumeTrend = buildVolumeTrend(weeklyVolume)
  const phaseTimeline = buildPhaseTimeline({
    sessions: filteredSessions,
    phaseSnapshots,
    readinessLogs,
    bodyMetrics,
    program,
  })
  const uniqueWeeks = new Set(filteredSessions.map((session) => formatWeekKey(session?.date))).size
  const sessionCount = filteredSessions.length
  const dataQuality =
    sessionCount >= 12 ? 'strong' : sessionCount >= 6 ? 'moderate' : 'limited'
  const adherenceSummary = buildAdherenceSummary(program, slotStates)
  const readinessSummary = buildReadinessSummary(readinessLogs)

  return {
    sessions: filteredSessions,
    sessionCount,
    weekCount: uniqueWeeks,
    dataQuality,
    error,
    isSampleData,
    source: isSampleData ? 'sample' : 'real',
    prBreakdown: buildPrBreakdown(personalRecords),
    readinessSummary,
    adherenceSummary,
    recoverySeries: buildRecoverySeries(filteredSessions, readinessLogs, bodyMetrics),
    phaseTimeline,
    longTermLenses: {
      Strength: phaseTimeline.map((entry) => ({ label: entry.label, value: entry.strengthScore })),
      Workload: phaseTimeline.map((entry) => ({ label: entry.label, value: entry.totalVolume })),
      Recovery: phaseTimeline.map((entry) => ({ label: entry.label, value: entry.avgReadinessScore })),
    },
    volumeTrend,
    coachSummary: buildCoachSummary({
      adherenceSummary,
      readinessSummary,
      volumeTrend,
      dataQuality,
      sessionCount,
    }),
  }
}

function createEmptySummaryReport(error = null) {
  return {
    sessions: [],
    sessionCount: 0,
    weekCount: 0,
    dataQuality: 'limited',
    error,
    isSampleData: false,
    source: 'real',
    prBreakdown: [],
    readinessSummary: {
      latestBand: null,
      recentLogs: [],
      averageScore: 0,
      redCount: 0,
      yellowCount: 0,
      greenCount: 0,
    },
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
    volumeTrend: {
      rateOfChange: 0,
      label: 'volume still forming',
    },
    coachSummary: [],
  }
}

async function fetchSupabaseSummaryData(programId) {
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
          session_rpe,
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

  return {
    sessions,
    phaseSnapshots: phaseSnapshots ?? [],
    bodyMetrics: bodyMetrics ?? [],
    slotStates: slotStates ?? [],
    readinessLogs: readinessLogs ?? [],
    personalRecords: personalRecords ?? [],
  }
}

function fetchLocalSummaryData(programId) {
  const sessions = getDemoHistorySessions(programId).map((session) => ({
    ...session,
    logged_sets: undefined,
  }))
  const libraryData = getDemoLibraryData()

  return {
    sessions,
    phaseSnapshots: [],
    bodyMetrics: [],
    slotStates: [],
    readinessLogs: [],
    personalRecords: libraryData.personalRecords ?? [],
  }
}

export function useProgressSummary(program, progress, sourceFilter = 'all') {
  const [report, setReport] = useState({
    ...createEmptySummaryReport(),
    loading: true,
  })

  useEffect(() => {
    let isCancelled = false

    async function loadReport() {
      if (!program?.id) {
        if (!isCancelled) {
          setReport({
            ...createEmptySummaryReport(),
            loading: false,
          })
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
        let isSampleData = false

        if (isConfigured) {
          data = await fetchSupabaseSummaryData(program.id)
        } else if (isDemoModeEnabled()) {
          data = fetchLocalSummaryData(program.id)
          isSampleData = true
        }

        if (!data) {
          throw new Error('Unable to generate the progress summary.')
        }

        if (!isCancelled) {
          setReport({
            ...buildSummaryReport({
              sessions: data.sessions,
              phaseSnapshots: data.phaseSnapshots,
              bodyMetrics: data.bodyMetrics,
              slotStates: data.slotStates,
              readinessLogs: data.readinessLogs,
              personalRecords: data.personalRecords,
              program,
              progress,
              sourceFilter,
              isSampleData,
            }),
            loading: false,
          })
        }
      } catch (loadError) {
        if (!isCancelled) {
          setReport({
            ...createEmptySummaryReport(
              loadError instanceof Error
                ? loadError.message
                : 'Unable to generate the progress summary.',
            ),
            loading: false,
          })
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

export default useProgressSummary
