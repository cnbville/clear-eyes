import { estimateOneRepMax } from './calculations.js'

const DEFAULT_MILESTONES = [
  40, 50, 60, 70, 80, 90, 100, 110, 120, 125, 130, 140, 150, 160, 175, 180, 200, 220, 225, 250,
]

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

function normalizeDate(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDayDifference(startDate, endDate) {
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
}

function getWeekStart(value) {
  const date = normalizeDate(value)

  if (!date) {
    return null
  }

  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const offset = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + offset)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

function formatWeekKey(value) {
  const weekStart = getWeekStart(value)

  if (!weekStart) {
    return 'unknown'
  }

  return weekStart.toISOString().slice(0, 10)
}

function getWorkingSets(sets = []) {
  return sets.filter((set) => (set?.set_type ?? set?.setType ?? 'working') === 'working')
}

function getExerciseName(setOrExercise) {
  return (
    setOrExercise?.exercise_name ??
    setOrExercise?.name ??
    setOrExercise?.exercise?.name ??
    setOrExercise?.exercises?.name ??
    'Exercise'
  )
}

function getExerciseEquipment(setOrExercise) {
  return (
    setOrExercise?.equipment ??
    setOrExercise?.exercise?.equipment ??
    setOrExercise?.exercises?.equipment ??
    'other'
  )
}

function getPrimaryMuscle(setOrExercise) {
  return (
    setOrExercise?.muscle_group ??
    setOrExercise?.primary_muscle_group ??
    setOrExercise?.muscle ??
    setOrExercise?.exercise?.muscle_group ??
    setOrExercise?.exercise?.primary_muscle_group ??
    setOrExercise?.exercises?.muscle_group ??
    setOrExercise?.exercises?.primary_muscle_group ??
    'other'
  )
}

function getTrendLabel(ratePerWeek, rSquared) {
  if (rSquared < 0.3) {
    return 'insufficient data or inconsistent'
  }

  if (rSquared >= 0.7 && ratePerWeek > 0.5) {
    return 'strong linear progression'
  }

  if (rSquared >= 0.7 && ratePerWeek > 0 && ratePerWeek <= 0.5) {
    return 'steady progression'
  }

  if (ratePerWeek <= 0) {
    return 'plateau or regression — consider program adjustment'
  }

  if (rSquared >= 0.5 && rSquared < 0.7) {
    return 'moderate trend — more data needed'
  }

  return 'progressing'
}

function getRangeLabel(avgSetsPerWeek) {
  if (avgSetsPerWeek < 10) {
    return 'below minimum effective volume'
  }

  if (avgSetsPerWeek <= 14) {
    return 'minimum to moderate — on target for maintenance'
  }

  if (avgSetsPerWeek <= 20) {
    return 'optimal hypertrophy range'
  }

  return 'high volume — ensure adequate recovery'
}

function getRemainingWeeks(progress, program) {
  if (!progress || !program?.phases?.length || !program?.days_per_week) {
    return 0
  }

  const currentPhaseNumber = toNumber(progress.current_phase, 1)
  const currentWeek = toNumber(progress.current_week, 1)
  const currentDay = toNumber(progress.current_day, 1)
  const daysPerWeek = Math.max(toNumber(program.days_per_week, 1), 1)

  const currentPhase = program.phases.find((phase) => phase.phase_number === currentPhaseNumber)

  if (!currentPhase) {
    return 0
  }

  const currentPhaseRemainingSessions =
    Math.max((toNumber(currentPhase.num_weeks, 1) - currentWeek) * daysPerWeek, 0) +
    Math.max(daysPerWeek - currentDay + 1, 0)

  const laterPhaseSessions = (program.phases ?? [])
    .filter((phase) => phase.phase_number > currentPhaseNumber)
    .reduce((sum, phase) => sum + toNumber(phase.num_weeks, 0) * daysPerWeek, 0)

  return round((currentPhaseRemainingSessions + laterPhaseSessions) / daysPerWeek, 1)
}

function buildPhaseSnapshotFromSessions(sessions = [], program = null) {
  const weeksByPhase = new Map(
    (program?.phases ?? []).map((phase) => [phase.phase_number, toNumber(phase.num_weeks, 1)]),
  )

  const grouped = sessions.reduce((map, session) => {
    const phaseNumber = toNumber(session?.phase_number, 0)

    if (!phaseNumber) {
      return map
    }

    const currentSessions = map.get(phaseNumber) ?? []
    currentSessions.push(session)
    map.set(phaseNumber, currentSessions)
    return map
  }, new Map())

  return Array.from(grouped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([phaseNumber, phaseSessions]) => {
      const exerciseMap = new Map()

      phaseSessions
        .sort((left, right) => `${left?.date ?? ''}`.localeCompare(`${right?.date ?? ''}`))
        .forEach((session) => {
          const bestSetsByExercise = new Map()

          getWorkingSets(session?.logged_sets ?? []).forEach((set) => {
            const exerciseName = getExerciseName(set)
            const e1RM = estimateOneRepMax(set?.weight, set?.reps)
            const currentBest = bestSetsByExercise.get(exerciseName)

            if (!currentBest || e1RM > currentBest.e1RM) {
              bestSetsByExercise.set(exerciseName, { e1RM })
            }
          })

          bestSetsByExercise.forEach((bestSet, exerciseName) => {
            const current = exerciseMap.get(exerciseName) ?? {
              start: null,
              end: null,
            }

            if (current.start === null) {
              current.start = bestSet.e1RM
            }

            current.end = bestSet.e1RM
            exerciseMap.set(exerciseName, current)
          })
        })

      return {
        phase_number: phaseNumber,
        num_weeks: weeksByPhase.get(phaseNumber) ?? 1,
        lift_comparisons: Object.fromEntries(exerciseMap.entries()),
      }
    })
}

export function linearRegression(dataPoints) {
  if (!Array.isArray(dataPoints) || dataPoints.length < 3) {
    return null
  }

  const n = dataPoints.length
  const sumX = dataPoints.reduce((sum, point) => sum + toNumber(point?.x), 0)
  const sumY = dataPoints.reduce((sum, point) => sum + toNumber(point?.y), 0)
  const sumXY = dataPoints.reduce(
    (sum, point) => sum + toNumber(point?.x) * toNumber(point?.y),
    0,
  )
  const sumX2 = dataPoints.reduce((sum, point) => sum + toNumber(point?.x) ** 2, 0)
  const denominator = n * sumX2 - sumX ** 2

  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  const yMean = sumY / n

  const ssRes = dataPoints.reduce((sum, point) => {
    const prediction = slope * toNumber(point?.x) + intercept
    return sum + (toNumber(point?.y) - prediction) ** 2
  }, 0)
  const ssTot = dataPoints.reduce((sum, point) => sum + (toNumber(point?.y) - yMean) ** 2, 0)
  const rSquared = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot

  return {
    slope,
    intercept,
    rSquared,
  }
}

export function projectLift(sessions = []) {
  const normalizedSessions = [...sessions]
    .map((session) => ({
      ...session,
      dateObject: normalizeDate(session?.date),
      weight: toNumber(session?.weight),
      reps: toNumber(session?.reps),
    }))
    .filter((session) => session.dateObject && session.weight > 0 && session.reps > 0)
    .sort((left, right) => left.dateObject - right.dateObject)

  if (!normalizedSessions.length) {
    return null
  }

  const firstSessionDate = normalizedSessions[0].dateObject
  const latestSession = normalizedSessions[normalizedSessions.length - 1]
  const dataPoints = normalizedSessions.map((session) => {
    const x = getDayDifference(firstSessionDate, session.dateObject)
    const e1RM = estimateOneRepMax(session.weight, session.reps)

    return {
      x,
      y: e1RM,
      date: session.date,
      e1RM,
      weight: session.weight,
      reps: session.reps,
    }
  })

  const regression = linearRegression(dataPoints)
  const currentE1RM = round(dataPoints[dataPoints.length - 1]?.e1RM ?? 0, 1)

  if (!regression) {
    return {
      currentE1RM,
      ratePerWeek: 0,
      ratePercentPerWeek: 0,
      rSquared: 0,
      slope: 0,
      intercept: currentE1RM,
      dataPoints: dataPoints.map((point) => ({
        date: point.date,
        e1RM: point.e1RM,
        x: point.x,
        y: point.e1RM,
      })),
      predict: () => null,
      forecast: () => currentE1RM,
      trendLabel: 'insufficient data or inconsistent',
      sessionCount: dataPoints.length,
      currentDaysSinceStart: dataPoints[dataPoints.length - 1]?.x ?? 0,
      firstSessionDate,
    }
  }

  const ratePerWeek = round(regression.slope * 7, 2)
  const ratePercentPerWeek = currentE1RM ? round((ratePerWeek / currentE1RM) * 100, 2) : 0
  const currentDaysSinceStart = dataPoints[dataPoints.length - 1]?.x ?? 0

  return {
    currentE1RM,
    ratePerWeek,
    ratePercentPerWeek,
    rSquared: round(regression.rSquared, 3),
    slope: regression.slope,
    intercept: regression.intercept,
    dataPoints: dataPoints.map((point) => ({
      date: point.date,
      e1RM: point.e1RM,
      x: point.x,
      y: point.e1RM,
    })),
    predict(targetWeight) {
      const normalizedTarget = toNumber(targetWeight)

      if (regression.slope <= 0 || normalizedTarget <= 0 || normalizedTarget <= currentE1RM) {
        return null
      }

      const daysNeeded = (normalizedTarget - regression.intercept) / regression.slope

      if (daysNeeded < 0 || daysNeeded < currentDaysSinceStart) {
        return null
      }

      return new Date(firstSessionDate.getTime() + daysNeeded * 86400000)
    },
    forecast(weeksAhead) {
      const futureX = currentDaysSinceStart + toNumber(weeksAhead) * 7
      return round(regression.slope * futureX + regression.intercept, 1)
    },
    trendLabel: getTrendLabel(ratePerWeek, regression.rSquared),
    sessionCount: dataPoints.length,
    currentDaysSinceStart,
    firstSessionDate,
    latestSessionDate: latestSession.dateObject,
  }
}

export function calculatePhaseGrowth(phaseSnapshots = []) {
  const normalizedSnapshots = [...phaseSnapshots]
    .filter((snapshot) => snapshot?.phase_number && snapshot?.lift_comparisons)
    .sort((left, right) => left.phase_number - right.phase_number)

  const exercises = new Map()

  normalizedSnapshots.forEach((snapshot) => {
    Object.entries(snapshot.lift_comparisons ?? {}).forEach(([exercise, values]) => {
      if (!exercise) {
        return
      }

      const currentPhases = exercises.get(exercise) ?? []
      const startWeight = toNumber(values?.start)
      const endWeight = toNumber(values?.end)
      const growthPercent = startWeight
        ? round(((endWeight - startWeight) / startWeight) * 100, 1)
        : 0
      const weeks = Math.max(toNumber(snapshot?.num_weeks ?? snapshot?.numWeeks, 1), 1)

      currentPhases.push({
        phase_number: snapshot.phase_number,
        startWeight,
        endWeight,
        growthPercent,
        growthRatePerWeek: round(growthPercent / weeks, 2),
      })

      exercises.set(exercise, currentPhases)
    })
  })

  return Array.from(exercises.entries()).map(([exercise, phases]) => {
    const previousPhase = phases[phases.length - 2] ?? null
    const currentPhase = phases[phases.length - 1] ?? null

    if (!previousPhase || !currentPhase) {
      return {
        exercise,
        phases,
        isDecelerating: false,
        decelerationLabel: 'first phase — baseline established',
      }
    }

    const previousRate = previousPhase.growthRatePerWeek
    const currentRate = currentPhase.growthRatePerWeek
    const isDecelerating = currentRate < previousRate
    const changeRatio = previousRate === 0 ? 0 : (previousRate - currentRate) / Math.abs(previousRate)

    let decelerationLabel = 'stable progression'

    if (currentRate > previousRate) {
      decelerationLabel = 'accelerating — strong adaptation'
    } else if (changeRatio > 0.2) {
      decelerationLabel = 'natural deceleration (expected for intermediate lifters)'
    }

    return {
      exercise,
      phases,
      isDecelerating,
      decelerationLabel,
    }
  })
}

export function generateProgramForecast(exercises = [], progress = null, program = null) {
  const remainingWeeks = getRemainingWeeks(progress, program)
  const completionDate = new Date(Date.now() + remainingWeeks * 7 * 86400000)

  return exercises
    .filter((exercise) => {
      const isBarbell = getExerciseEquipment(exercise) === 'barbell'
      return isBarbell || Boolean(exercise?.isPrimary)
    })
    .map((exercise) => {
      const projection = exercise?.projection ?? projectLift(exercise?.history ?? [])

      if (!projection || !exercise?.history?.length) {
        return null
      }

      const startWeight = estimateOneRepMax(
        exercise.history[0]?.weight,
        exercise.history[0]?.reps,
      )
      const currentWeight = projection.currentE1RM
      const projectedEndWeight = projection.forecast(remainingWeeks)
      const totalGrowthPercent = startWeight
        ? round(((projectedEndWeight - startWeight) / startWeight) * 100, 1)
        : 0

      return {
        exercise: getExerciseName(exercise),
        exerciseId: exercise?.exerciseId ?? exercise?.id ?? getExerciseName(exercise),
        startWeight: round(startWeight, 1),
        currentWeight,
        projectedEndWeight,
        totalGrowthPercent,
        ratePerWeek: projection.ratePerWeek,
        completionDate,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.currentWeight - left.currentWeight)
}

export function calculateINOL(sets = [], exerciseE1RM) {
  const currentE1RM = toNumber(exerciseE1RM)

  if (!currentE1RM) {
    return {
      totalINOL: 0,
      rating: 'too easy — insufficient stimulus',
    }
  }

  const totalINOL = getWorkingSets(sets).reduce((sum, set) => {
    const intensity = (toNumber(set?.weight) / currentE1RM) * 100
    const denominator = Math.max(1, 100 - intensity)
    return sum + toNumber(set?.reps) / denominator
  }, 0)

  const roundedINOL = round(totalINOL, 2)
  let rating = 'productive zone'

  if (roundedINOL < 0.4) {
    rating = 'too easy — insufficient stimulus'
  } else if (roundedINOL < 1.0) {
    rating = 'productive zone'
  } else if (roundedINOL < 1.5) {
    rating = 'tough but manageable'
  } else if (roundedINOL < 2.0) {
    rating = 'hard — monitor recovery'
  } else {
    rating = 'overreaching — risk of fatigue accumulation'
  }

  return {
    totalINOL: roundedINOL,
    rating,
  }
}

export function calculateWeeklyINOL(sessions = []) {
  const grouped = new Map()

  sessions.forEach((session) => {
    const week = formatWeekKey(session?.date)
    const workingSets = getWorkingSets(session?.logged_sets ?? [])
    const setsByExercise = workingSets.reduce((map, set) => {
      const exerciseId = set?.exercise_id ?? getExerciseName(set)
      const currentSets = map.get(exerciseId) ?? []
      currentSets.push(set)
      map.set(exerciseId, currentSets)
      return map
    }, new Map())

    setsByExercise.forEach((sets, exerciseId) => {
      const bestSet = sets.reduce((best, set) => {
        const e1RM = estimateOneRepMax(set?.weight, set?.reps)
        return !best || e1RM > best.e1RM ? { set, e1RM } : best
      }, null)

      const inol = calculateINOL(sets, bestSet?.e1RM ?? 0)
      const key = `${exerciseId}:${week}`

      grouped.set(key, {
        exerciseId,
        exercise: getExerciseName(sets[0]),
        week,
        totalINOL: inol.totalINOL,
        rating: inol.rating,
      })
    })
  })

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.exercise === right.exercise) {
      return left.week.localeCompare(right.week)
    }

    return left.exercise.localeCompare(right.exercise)
  })
}

export function calculateWeeklyVolume(sessions = []) {
  const grouped = new Map()

  sessions.forEach((session) => {
    const week = formatWeekKey(session?.date)

    getWorkingSets(session?.logged_sets ?? []).forEach((set) => {
      const muscleGroup = getPrimaryMuscle(set)
      const key = `${muscleGroup}:${week}`
      const current = grouped.get(key) ?? {
        muscleGroup,
        week,
        sets: 0,
        volume: 0,
      }

      current.sets += 1
      current.volume += toNumber(set?.weight) * toNumber(set?.reps)
      grouped.set(key, current)
    })
  })

  const byMuscle = Array.from(grouped.values()).reduce((map, entry) => {
    const currentEntries = map.get(entry.muscleGroup) ?? []
    currentEntries.push({
      week: entry.week,
      sets: entry.sets,
      volume: round(entry.volume, 1),
    })
    map.set(entry.muscleGroup, currentEntries)
    return map
  }, new Map())

  return Array.from(byMuscle.entries())
    .map(([muscleGroup, weeklyVolumes]) => {
      const sortedWeeklyVolumes = weeklyVolumes.sort((left, right) => left.week.localeCompare(right.week))
      const avgSetsPerWeek =
        sortedWeeklyVolumes.reduce((sum, item) => sum + item.sets, 0) / sortedWeeklyVolumes.length

      const regression = linearRegression(
        sortedWeeklyVolumes.map((item, index) => ({ x: index, y: item.sets })),
      )
      const slope = regression?.slope ?? 0
      const trend = slope > 0.2 ? 'increasing' : slope < -0.2 ? 'decreasing' : 'stable'

      return {
        muscleGroup,
        weeklyVolumes: sortedWeeklyVolumes,
        avgSetsPerWeek: round(avgSetsPerWeek, 1),
        trend,
        guidance: getRangeLabel(avgSetsPerWeek),
      }
    })
    .sort((left, right) => right.avgSetsPerWeek - left.avgSetsPerWeek)
}

export function calculateVolumeTrend(weeklyVolumes = []) {
  const regression = linearRegression(
    weeklyVolumes.map((entry, index) => ({
      x: index,
      y: toNumber(entry?.totalVolume),
    })),
  )

  if (!regression) {
    return {
      rateOfChange: 0,
      label: 'volume stable',
    }
  }

  const baseline = toNumber(weeklyVolumes[weeklyVolumes.length - 1]?.totalVolume) || 1
  const rateOfChange = round((regression.slope * 4 * 100) / baseline, 1)

  if (rateOfChange > 5) {
    return {
      rateOfChange,
      label: 'work capacity increasing',
    }
  }

  if (rateOfChange >= 0) {
    return {
      rateOfChange,
      label: 'volume stable',
    }
  }

  return {
    rateOfChange,
    label: 'volume declining — check adherence or recovery',
  }
}

export function calculateDOTS(totalLifted, bodyweightKg, gender) {
  const total = toNumber(totalLifted)
  const bodyweight = toNumber(bodyweightKg)

  if (!total || !bodyweight) {
    return null
  }

  const coefficients =
    gender === 'female'
      ? {
          a: -57.96288,
          b: 13.6175032,
          c: -0.1126655495,
          d: 0.0005158568,
          e: -0.0000010706,
        }
      : {
          a: -307.75076,
          b: 24.0900756,
          c: -0.1918759221,
          d: 0.0007391293,
          e: -0.000001093,
        }

  const denominator =
    coefficients.a +
    coefficients.b * bodyweight +
    coefficients.c * bodyweight ** 2 +
    coefficients.d * bodyweight ** 3 +
    coefficients.e * bodyweight ** 4

  if (!denominator) {
    return null
  }

  return round(total * (500 / denominator), 2)
}

export function calculateSFR(sessionSets = []) {
  const workingSets = getWorkingSets(sessionSets).sort(
    (left, right) => toNumber(left?.set_number, 0) - toNumber(right?.set_number, 0),
  )

  if (workingSets.length < 2) {
    return null
  }

  const firstSet = workingSets[0]
  const lastSet = workingSets[workingSets.length - 1]
  const e1RMFirst = estimateOneRepMax(firstSet?.weight, firstSet?.reps)
  const e1RMLast = estimateOneRepMax(lastSet?.weight, lastSet?.reps)

  if (!e1RMFirst) {
    return null
  }

  const sfr = round(((e1RMFirst - e1RMLast) / e1RMFirst) * 100, 1)
  let rating = 'excellent — minimal fatigue accumulation'

  if (sfr < 5) {
    rating = 'excellent — minimal fatigue accumulation'
  } else if (sfr < 10) {
    rating = 'normal — expected intra-session fatigue'
  } else if (sfr < 20) {
    rating = 'moderate — consider longer rest periods'
  } else {
    rating = 'high fatigue — rest periods or volume may need adjustment'
  }

  return {
    sfrPercent: sfr,
    rating,
  }
}

export function predictMilestones(
  exerciseName,
  currentE1RM,
  ratePerWeek,
  slope,
  customMilestones = [],
) {
  const current = toNumber(currentE1RM)
  const weeklyRate = toNumber(ratePerWeek)

  if (!exerciseName || current <= 0 || weeklyRate <= 0 || toNumber(slope) <= 0) {
    return []
  }

  const milestones = Array.from(new Set([...DEFAULT_MILESTONES, ...customMilestones]))
    .filter((milestone) => milestone > current && milestone <= current * 2)
    .sort((left, right) => left - right)

  return milestones
    .map((milestone) => {
      const weeksAway = (milestone - current) / weeklyRate

      if (weeksAway < 0) {
        return null
      }

      return {
        milestone,
        predictedDate: new Date(Date.now() + weeksAway * 7 * 86400000),
        weeksAway: round(weeksAway, 1),
      }
    })
    .filter(Boolean)
}

export {
  buildPhaseSnapshotFromSessions,
  formatWeekKey,
}
