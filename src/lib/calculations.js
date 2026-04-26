function roundToSingleDecimal(value) {
  return Math.round(value * 10) / 10
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

export function estimateOneRepMax(weight, reps) {
  const normalizedWeight = toNumber(weight)
  const normalizedReps = toNumber(reps)

  if (normalizedWeight <= 0 || normalizedReps <= 0) {
    return 0
  }

  if (normalizedReps === 1) {
    return roundToSingleDecimal(normalizedWeight)
  }

  if (normalizedReps <= 10) {
    return roundToSingleDecimal(normalizedWeight * (36 / (37 - normalizedReps)))
  }

  return roundToSingleDecimal(normalizedWeight * (1 + normalizedReps / 30))
}

export function buildRepMaxPrType(reps) {
  return `rep_max_${Math.max(Number(reps) || 0, 0)}`
}

export function normalizePrType(prType) {
  const value = `${prType ?? ''}`.trim().toLowerCase()
  const legacyMatch = value.match(/^(\d+)_rep_max$/)

  if (legacyMatch) {
    return buildRepMaxPrType(legacyMatch[1])
  }

  return value
}

export function getPrDisplayLabel(prType) {
  const normalizedType = normalizePrType(prType)
  const repMatch = normalizedType.match(/^rep_max_(\d+)$/)

  if (repMatch) {
    return `${repMatch[1]}RM`
  }

  if (normalizedType === 'heaviest_weight') {
    return 'Heaviest Weight'
  }

  if (normalizedType === 'estimated_1rm') {
    return 'Estimated 1RM'
  }

  if (normalizedType === 'session_volume') {
    return 'Session Volume'
  }

  return normalizedType
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function calculateVolume(sets = []) {
  return sets.reduce((total, set) => {
    if (set?.set_type === 'warmup' || set?.setType === 'warmup' || set?.isWarmup) {
      return total
    }

    return total + toNumber(set?.weight) * toNumber(set?.reps)
  }, 0)
}

export function calculateRestDiscipline(sets = []) {
  const scoredSets = sets.filter((set) => {
    const prescribed = toNumber(
      set?.rest_prescribed_seconds ?? set?.restPrescribedSeconds,
      NaN,
    )
    const actual = toNumber(set?.rest_taken_seconds ?? set?.restTakenSeconds, NaN)

    return Number.isFinite(prescribed) && Number.isFinite(actual)
  })

  if (!scoredSets.length) {
    return 0
  }

  const totalScore = scoredSets.reduce((sum, set) => {
    const prescribed = toNumber(
      set?.rest_prescribed_seconds ?? set?.restPrescribedSeconds,
    )
    const actual = toNumber(set?.rest_taken_seconds ?? set?.restTakenSeconds)

    if (prescribed === 0 && actual === 0) {
      return sum + 1
    }

    return sum + prescribed / Math.max(prescribed, actual)
  }, 0)

  return roundToSingleDecimal((totalScore / scoredSets.length) * 100)
}

export function detectPR(newWeight, newReps, existingRecords = []) {
  const weight = toNumber(newWeight)
  const reps = toNumber(newReps)
  const estimatedOneRepMax = estimateOneRepMax(weight, reps)

  const recordMap = existingRecords.reduce((map, record) => {
    if (record?.pr_type) {
      map.set(
        normalizePrType(record.pr_type),
        toNumber(record.value, Number.NEGATIVE_INFINITY),
      )
    }

    return map
  }, new Map())

  const newPrTypes = []

  if (weight > (recordMap.get('heaviest_weight') ?? Number.NEGATIVE_INFINITY)) {
    newPrTypes.push('heaviest_weight')
  }

  if (estimatedOneRepMax > (recordMap.get('estimated_1rm') ?? Number.NEGATIVE_INFINITY)) {
    newPrTypes.push('estimated_1rm')
  }

  if (reps > 0) {
    const repKey = buildRepMaxPrType(reps)

    if (weight > (recordMap.get(repKey) ?? Number.NEGATIVE_INFINITY)) {
      newPrTypes.push(repKey)
    }
  }

  return newPrTypes
}

export function detectSessionVolumePr(sessionVolume, existingRecords = []) {
  const normalizedVolume = toNumber(sessionVolume)

  if (normalizedVolume <= 0) {
    return false
  }

  const currentRecord = existingRecords.find(
    (record) => normalizePrType(record?.pr_type) === 'session_volume',
  )

  return normalizedVolume > toNumber(currentRecord?.value, Number.NEGATIVE_INFINITY)
}

export function getPhaseColor(n) {
  const phaseNumber = Number(n)

  switch (phaseNumber) {
    case 1:
      return '#c9a227'
    case 2:
      return '#3b82f6'
    case 3:
      return '#dc2626'
    case 4:
      return '#8b5cf6'
    case 5:
      return '#06b6d4'
    default:
      return '#52525b'
  }
}

export function parseRestNotation(restStr) {
  if (typeof restStr !== 'string') {
    return null
  }

  const trimmedValue = restStr.trim()

  if (!trimmedValue) {
    return null
  }

  const match = trimmedValue.match(
    /^~?\s*(?<start>\d+(?:\.\d+)?)\s*(?:-\s*(?<end>\d+(?:\.\d+)?))?\s*min$/i,
  )

  if (!match?.groups?.start) {
    return null
  }

  const start = Number(match.groups.start)
  const end = match.groups.end ? Number(match.groups.end) : start
  const midpointMinutes = (start + end) / 2

  return Math.round(midpointMinutes * 60)
}
