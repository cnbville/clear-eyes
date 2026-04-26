const AMRAP_PATTERN = /^amrap$/i
const FAIL_PATTERN = /^fail$/i
const HOLD_PATTERN = /^(?<seconds>\d+)\s*s\s+hold$/i
const VARIABLE_PATTERN = /^\s*\d+(?:\s*,\s*\d+)+\s*$/
const RANGE_PATTERN = /^(?<min>\d+)\s*-\s*(?<max>\d+)$/
const FIXED_PATTERN = /^(?<value>\d+)$/
const PLUS_PATTERN = /^\s*\d+(?:\s*\+\s*\d+)+\s*$/

export function parseReps(notation) {
  if (typeof notation !== 'string') {
    return null
  }

  const value = notation.trim()

  if (!value) {
    return null
  }

  if (AMRAP_PATTERN.test(value) || FAIL_PATTERN.test(value)) {
    return { type: 'amrap' }
  }

  const holdMatch = value.match(HOLD_PATTERN)

  if (holdMatch?.groups?.seconds) {
    return {
      type: 'isometric',
      seconds: Number(holdMatch.groups.seconds),
    }
  }

  if (VARIABLE_PATTERN.test(value)) {
    return {
      type: 'variable',
      perSet: value.split(',').map((part) => Number(part.trim())),
    }
  }

  if (PLUS_PATTERN.test(value)) {
    const parts = value.split('+').map((part) => Number(part.trim()))

    if (parts.length === 2 && parts[0] !== parts[1]) {
      return {
        type: 'dropset',
        main: parts[0],
        drop: parts[1],
      }
    }

    return {
      type: 'compound',
      parts,
    }
  }

  const rangeMatch = value.match(RANGE_PATTERN)

  if (rangeMatch?.groups) {
    return {
      type: 'range',
      min: Number(rangeMatch.groups.min),
      max: Number(rangeMatch.groups.max),
    }
  }

  const fixedMatch = value.match(FIXED_PATTERN)

  if (fixedMatch?.groups?.value) {
    return {
      type: 'fixed',
      value: Number(fixedMatch.groups.value),
    }
  }

  return null
}

export function getTargetReps(parsed, setNumber = 1) {
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const normalizedSetNumber = Math.max(Number(setNumber) || 1, 1)

  switch (parsed.type) {
    case 'range':
      return Math.floor((parsed.min + parsed.max) / 2)
    case 'fixed':
      return parsed.value
    case 'variable':
      return parsed.perSet[normalizedSetNumber - 1] ?? null
    case 'amrap':
    case 'isometric':
      return null
    case 'dropset':
      return normalizedSetNumber === 1 ? parsed.main : parsed.drop
    case 'compound':
      return parsed.parts[normalizedSetNumber - 1] ?? null
    default:
      return null
  }
}
